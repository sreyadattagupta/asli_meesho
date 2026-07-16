import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/db/types";

// The route writes the live photo + check against a listing, so it now requires the caller to be a
// seller who OWNS that listing. The session therefore needs a sellerId, and requireRole must be
// mocked alongside getSessionUser — requireRole closes over the real getSessionUser, which reaches
// for cookies() and throws outside a request context.
const SELLER_ID = "seller-challenge";
const sessionUser: User = {
  id: "u-challenge", auth0Sub: "test|c", email: "s@x.com", name: "S", role: "seller",
  sellerId: SELLER_ID, createdAt: "",
};

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    getSessionUser: vi.fn(async () => sessionUser),
    requireRole: vi.fn(async (role: string) => {
      if (sessionUser.role !== role) throw new actual.HttpError(403, "forbidden", `Requires ${role} role.`);
      return sessionUser;
    }),
  };
});

vi.mock("@/lib/vlmClient", () => ({
  vlmMatch: vi.fn(async () => ({
    same_item: true, code_visible: true, confidence: 0.95, reason: "match", passed: true,
  })),
}));

import { GET, POST } from "@/app/api/challenge/route";
import { resetRateLimiter } from "@/lib/rateLimit";
import { repoReady } from "@/lib/db";

function verifyReq(code: string, listingId?: string): Request {
  const form = new FormData();
  form.append("catalog", new Blob(["cat"], { type: "image/jpeg" }), "c.jpg");
  form.append("live", new Blob(["live"], { type: "image/jpeg" }), "l.jpg");
  form.append("code", code);
  if (listingId) form.append("listingId", listingId);
  form.append("matchCount", "4");
  return new Request("http://x/api/challenge", { method: "POST", body: form });
}

/** A listing owned by the signed-in seller (`sellerId` must match, or the route 404s by design). */
async function makeListing(sellerId: string = SELLER_ID): Promise<string> {
  const repo = await repoReady();
  const l = await repo.createListing({
    sellerId, title: "Tee", description: "", price: 100, category: "kurtis",
    status: "draft", flowStep: "challenge", verified: false, rankBoost: 0,
  });
  return l.id;
}

describe("challenge routes (invariant #3)", () => {
  beforeEach(() => resetRateLimiter());

  it("GET issues a persisted, claimable code", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const c = await res.json();
    expect(c.code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    expect(c.expiresAt).toBeGreaterThan(c.issuedAt);
  });

  it("verifies once, then 409s on reuse", async () => {
    const listingId = await makeListing();
    const { code } = await (await GET()).json();
    const first = await POST(verifyReq(code, listingId));
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.passed).toBe(true);
    const second = await POST(verifyReq(code, listingId));
    expect(second.status).toBe(409);
    expect((await second.json()).error.code).toBe("code_used_or_expired");
  });

  it("404s when the listing belongs to another seller, without burning the code", async () => {
    // Ownership is proven BEFORE the single-use claim: otherwise a stranger naming someone else's
    // listing would spend that seller's code on the way to being rejected.
    const theirs = await makeListing("someone-else");
    const { code } = await (await GET()).json();
    const res = await POST(verifyReq(code, theirs));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");

    // the code must still be claimable by its rightful owner
    const mine = await makeListing();
    const ok = await POST(verifyReq(code, mine));
    expect(ok.status).toBe(200);
  });

  it("409s on an expired code", async () => {
    const listingId = await makeListing();
    const repo = await repoReady();
    await repo.issueChallenge("ZZZZ", -1);
    const res = await POST(verifyReq("ZZZZ", listingId));
    expect(res.status).toBe(409);
  });

  it("rate-limits the 6th issue in a minute", async () => {
    for (let i = 0; i < 5; i++) expect((await GET()).status).toBe(200);
    const sixth = await GET();
    expect(sixth.status).toBe(429);
    expect((await sixth.json()).error.code).toBe("rate_limited");
  });
});
