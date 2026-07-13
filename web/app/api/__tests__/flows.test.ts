// End-to-end agentic flows over the real route handlers (InMemoryRepo + MockProvider).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role, User } from "@/lib/db/types";

const session: User = {
  id: "", auth0Sub: "", email: "u@x.com", name: "U", role: "seller", sellerId: "", createdAt: "",
};
const as = (role: Role) => { session.role = role; };

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    getSessionUser: vi.fn(async () => session),
    requireRole: vi.fn(async (role: string) => {
      if (session.role !== role) throw new actual.HttpError(403, "forbidden", `Requires ${role} role.`);
      return session;
    }),
  };
});

import { GET as ISSUE_CODE, POST as VERIFY } from "@/app/api/challenge/route";
import { POST as ANALYZE } from "@/app/api/asli/analyze/route";
import { POST as CREATE_ORDER } from "@/app/api/orders/route";
import { POST as ADVANCE } from "@/app/api/orders/[id]/advance/route";
import { POST as PROMISE_CHECK } from "@/app/api/agents/promise-keeper/check/route";
import { repoReady } from "@/lib/db";
import { resetRateLimiter } from "@/lib/rateLimit";
import { MAX_ATTEMPTS } from "@/lib/orchestrator";

const json = (fn: (r: Request) => Promise<Response>, body: unknown) =>
  fn(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));

async function newSellerListing(isNew = true) {
  const repo = await repoReady();
  const seller = await repo.createSeller({
    name: "Flow", shopName: "Flow Shop", trustScore: 40, trustBand: "low",
    kycStatus: "pending", isNew, passes: 0, fails: 0,
  });
  session.sellerId = seller.id;
  const listing = await repo.createListing({
    sellerId: seller.id, title: "Test Kurti", description: "", price: 349, category: "kurtis",
    status: "draft", flowStep: "upload", verified: false, rankBoost: 0,
  });
  return { seller, listing };
}

describe("agentic flows", () => {
  beforeEach(() => { resetRateLimiter(); as("seller"); });

  it("honest: challenge (distinct live) → AUTO_APPROVE", async () => {
    const { listing } = await newSellerListing();
    const { code } = await (await ISSUE_CODE()).json();
    const form = new FormData();
    form.append("catalog", new Blob([new Uint8Array(100)], { type: "image/jpeg" }), "c.jpg");
    form.append("live", new Blob([new Uint8Array(220)], { type: "image/jpeg" }), "l.jpg"); // distinct ⇒ mock passes
    form.append("code", code);
    form.append("listingId", listing.id);
    const vr = await VERIFY(new Request("http://x", { method: "POST", body: form }));
    expect(vr.status).toBe(200);
    const decision = await (await json(ANALYZE, { listingId: listing.id })).json();
    expect(decision.action).toBe("AUTO_APPROVE");
  });

  it("thief: wrong-item signal → BLOCK + listing blocked", async () => {
    const { listing } = await newSellerListing();
    const repo = await repoReady();
    await repo.addCheck({
      listingId: listing.id, agent: "possession",
      payload: { same_item: false, code_visible: false, matchCount: 5 },
      confidence: 0.1, action: "recorded", requiredConfidence: 0, reason: "different product",
    });
    const decision = await (await json(ANALYZE, { listingId: listing.id })).json();
    expect(decision.action).toBe("BLOCK");
    expect((await repo.getListing(listing.id))!.status).toBe("blocked");
  });

  it("escalate: out of retries → review row created", async () => {
    const { listing } = await newSellerListing();
    const repo = await repoReady();
    for (let i = 0; i <= MAX_ATTEMPTS; i++) {
      await repo.addCheck({
        listingId: listing.id, agent: "possession",
        payload: { same_item: true, code_visible: false, matchCount: 3 },
        confidence: 0.6, action: "recorded", requiredConfidence: 0, reason: "code unclear",
      });
    }
    const decision = await (await json(ANALYZE, { listingId: listing.id })).json();
    expect(decision.action).toBe("ESCALATE_HUMAN");
    expect((await repo.listPendingReviews()).some((r) => r.listingId === listing.id)).toBe(true);
  });

  it("commerce: order → advance×2 → Promise Keeper verdict persisted", async () => {
    const repo = await repoReady();
    const live = await repo.listListings({ status: "live", verified: true });
    const listingId = live[0].id;
    as("buyer");
    session.id = "buyer-flow";
    const { orderId } = await (await json(CREATE_ORDER, {
      listingId, paymentMethod: "cod",
      address: { name: "B", line1: "1 St", city: "Pune", pincode: "411001" },
    })).json();
    const withId = (id: string) => ({ params: Promise.resolve({ id }) });
    await ADVANCE(new Request("http://x", { method: "POST" }), withId(orderId));
    await ADVANCE(new Request("http://x", { method: "POST" }), withId(orderId));
    const verdict = await (await json(PROMISE_CHECK, { orderId })).json();
    expect(typeof verdict.promiseKept).toBe("boolean");
    const order = await repo.getOrder(orderId);
    const promise = await repo.getPromiseByListing(order!.listingId);
    expect(promise?.checkedAt).toBeTruthy();
  });
});
