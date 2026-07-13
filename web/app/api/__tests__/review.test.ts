// Human-in-the-loop review queue + decision → seller trust feedback.
import { describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/db/types";

const sessionUser: User = {
  id: "admin1", auth0Sub: "a", email: "a@x.com", name: "Admin", role: "admin", createdAt: "",
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

import { GET as QUEUE } from "@/app/api/review/queue/route";
import { POST as DECIDE } from "@/app/api/review/[id]/decision/route";
import { repoReady } from "@/lib/db";

const decide = (id: string, body: unknown) =>
  DECIDE(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });

describe("review queue + decision", () => {
  it("queue returns the two seeded pending reviews with context", async () => {
    const res = await QUEUE();
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.length).toBe(2);
    expect(items[0].checks.length).toBeGreaterThan(0);
    expect(items[0].listing).toBeTruthy();
  });

  it("approve flips the listing live/verified and writes a trust event", async () => {
    const repo = await repoReady();
    const pending = await repo.listPendingReviews();
    const review = pending[0];
    const sellerBefore = (await repo.getListing(review.listingId))!;
    const seller = (await repo.getSeller(sellerBefore.sellerId))!;
    const eventsBefore = (await repo.listTrustEvents(seller.id)).length;

    const res = await decide(review.id, { decision: "approved", note: "Verified manually." });
    expect(res.status).toBe(200);

    const listing = await repo.getListing(review.listingId);
    expect(listing?.status).toBe("live");
    expect(listing?.verified).toBe(true);
    const after = await repo.getSeller(seller.id);
    expect(after!.trustScore).toBe(Math.min(100, seller.trustScore + 5));
    expect((await repo.listTrustEvents(seller.id)).length).toBe(eventsBefore + 1);
  });

  it("second decision on a decided review → 409", async () => {
    const repo = await repoReady();
    const pending = await repo.listPendingReviews();
    const review = pending[0];
    expect((await decide(review.id, { decision: "rejected", note: "n" })).status).toBe(200);
    expect((await decide(review.id, { decision: "approved", note: "n" })).status).toBe(409);
  });

  it("non-admin → 403", async () => {
    sessionUser.role = "seller";
    expect((await QUEUE()).status).toBe(403);
    sessionUser.role = "admin";
  });
});
