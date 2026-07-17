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
import { POST as CONTINUE_UNVERIFIED } from "@/app/api/asli/continue-unverified/route";
import { POST as PUBLISH } from "@/app/api/listings/[id]/publish/route";
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

  it("wrong-item attempt RE_CHALLENGEs (retry) — never a hard block", async () => {
    const { listing } = await newSellerListing();
    const repo = await repoReady();
    // A different product is a mismatch → the seller re-captures; the listing is NOT blocked.
    await repo.addCheck({
      listingId: listing.id, agent: "possession",
      payload: { same_item: false, code_visible: false, matchCount: 5 },
      confidence: 0.1, action: "recorded", requiredConfidence: 0, reason: "different product",
    });
    const decision = await (await json(ANALYZE, { listingId: listing.id })).json();
    expect(decision.action).toBe("RE_CHALLENGE");
    expect(decision.nextStep).toBe("challenge");
    expect((await repo.getListing(listing.id))!.status).not.toBe("blocked");
  });

  it("mismatch past the retry budget ⇒ ESCALATE_HUMAN (human review, never blocked)", async () => {
    const { listing } = await newSellerListing();
    const repo = await repoReady();
    for (let i = 0; i <= MAX_ATTEMPTS + 3; i++) {
      await repo.addCheck({
        listingId: listing.id, agent: "possession",
        payload: { same_item: true, code_visible: false, matchCount: 3 },
        confidence: 0.6, action: "recorded", requiredConfidence: 0, reason: "code unclear",
      });
    }
    const decision = await (await json(ANALYZE, { listingId: listing.id })).json();
    expect(decision.action).toBe("ESCALATE_HUMAN");
    expect((await repo.getListing(listing.id))!.status).toBe("escalated");
  });

  it("continue-anyway records unverified possession + a pending review, and publishes UNVERIFIED", async () => {
    const { listing } = await newSellerListing();
    const repo = await repoReady();
    // Give it a title so the publish completeness gate isn't what we're testing.
    await repo.updateListing(listing.id, { title: "Continued Kurti" });

    // Seller hits "Continue anyway" after the challenge kept failing.
    const cr = await json(CONTINUE_UNVERIFIED, { listingId: listing.id });
    expect(cr.status).toBe(200);
    const checks = await repo.listChecks(listing.id);
    const cont = checks.find((c) => c.agent === "possession" && c.payload["user_continued"]);
    expect(cont).toBeTruthy();
    expect((await repo.listPendingReviews()).some((r) => r.listingId === listing.id)).toBe(true);

    // It can now publish — but LIVE and NOT verified (no badge, no rank boost).
    const pub = await PUBLISH(
      new Request("http://x", { method: "POST", body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: listing.id }) },
    );
    expect(pub.status).toBe(200);
    const after = (await repo.getListing(listing.id))!;
    expect(after.status).toBe("live");
    expect(after.verified).toBe(false); // ✓ Asli Verified still means real possession
    expect(after.rankBoost).toBe(0);
  });

  it("publish with NO possession (neither passed nor continued) is refused", async () => {
    const { listing } = await newSellerListing();
    const repo = await repoReady();
    await repo.updateListing(listing.id, { title: "Untried Kurti" });
    const pub = await PUBLISH(
      new Request("http://x", { method: "POST", body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: listing.id }) },
    );
    expect(pub.status).toBe(409);
    expect((await pub.json()).error.code).toBe("not_verified");
  });

  it("a passing possession still publishes VERIFIED", async () => {
    const { listing } = await newSellerListing();
    const repo = await repoReady();
    await repo.updateListing(listing.id, { title: "Verified Kurti" });
    await repo.addCheck({
      listingId: listing.id, agent: "possession",
      payload: { passed: true, same_item: true, code_visible: true },
      confidence: 0.9, action: "AUTO_APPROVE", requiredConfidence: 0.78, reason: "match",
    });
    const pub = await PUBLISH(
      new Request("http://x", { method: "POST", body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: listing.id }) },
    );
    expect(pub.status).toBe(200);
    const after = (await repo.getListing(listing.id))!;
    expect(after.verified).toBe(true);
    expect(after.rankBoost).toBe(1);
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
