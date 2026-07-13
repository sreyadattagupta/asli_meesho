import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/db/types";

const sessionUser: User = {
  id: "u-challenge", auth0Sub: "test|c", email: "s@x.com", name: "S", role: "seller", createdAt: "",
};

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, getSessionUser: vi.fn(async () => sessionUser) };
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

async function makeListing(): Promise<string> {
  const repo = await repoReady();
  const seller = await repo.createSeller({
    name: "S", shopName: "S", trustScore: 40, trustBand: "low",
    kycStatus: "pending", isNew: true, passes: 0, fails: 0,
  });
  const l = await repo.createListing({
    sellerId: seller.id, title: "Tee", description: "", price: 100, category: "kurtis",
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
