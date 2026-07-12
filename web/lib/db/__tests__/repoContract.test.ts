// Backend-agnostic Repo contract — every suite runs against InMemoryRepo always,
// and against SupabaseRepo when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set.
import { describe, expect, it } from "vitest";
import { InMemoryRepo } from "../inMemoryRepo";
import { SupabaseRepo } from "../supabaseRepo";
import type { Repo } from "../repo";
import type { Seller, User } from "../types";

/** Random short code — challenges.code is a PK, and Supabase state persists across runs. */
function freshCode(): string {
  return `T-${crypto.randomUUID().slice(0, 8)}`;
}

/** Real rows for FK-constrained tests (Supabase enforces listing/buyer FKs on orders). */
async function fixtures(repo: Repo): Promise<{ seller: Seller; buyer: User }> {
  const seller = await repo.createSeller({
    name: "Contract Seller", shopName: "Contract Shop", trustScore: 50,
    trustBand: "medium", kycStatus: "verified", isNew: false, passes: 0, fails: 0,
  });
  const buyer = await repo.createUser({
    auth0Sub: `test|${crypto.randomUUID()}`, email: "contract@test.local",
    name: "Contract Buyer", role: "buyer",
  });
  return { seller, buyer };
}

function repoContract(name: string, make: () => Repo): void {
  describe(`${name} challenges (invariant #3)`, () => {
    it("claims a fresh code exactly once", async () => {
      const repo = make();
      const code = freshCode();
      await repo.issueChallenge(code, 300);
      const first = await repo.claimChallenge(code, crypto.randomUUID());
      const second = await repo.claimChallenge(code, crypto.randomUUID());
      expect(first).not.toBeNull();
      expect(first?.usedAt).toBeTruthy();
      expect(second).toBeNull(); // single-use
    });

    it("rejects expired codes", async () => {
      const repo = make();
      const code = freshCode();
      await repo.issueChallenge(code, -1); // already expired at issue
      expect(await repo.claimChallenge(code, crypto.randomUUID())).toBeNull();
    });

    it("rejects unknown codes", async () => {
      const repo = make();
      expect(await repo.claimChallenge(freshCode(), crypto.randomUUID())).toBeNull();
    });
  });

  describe(`${name} orders`, () => {
    it("advances placed→shipped→delivered and stops", async () => {
      const repo = make();
      const { seller, buyer } = await fixtures(repo);
      const listing = await repo.createListing({
        sellerId: seller.id, title: "Contract tee", description: "", price: 199,
        category: "kurtis", status: "live", flowStep: "live", verified: true, rankBoost: 1,
      });
      const o = await repo.createOrder({
        listingId: listing.id, buyerUserId: buyer.id, address: { city: "Pune" },
        paymentMethod: "cod", status: "placed",
      });
      expect((await repo.advanceOrder(o.id)).status).toBe("shipped");
      expect((await repo.advanceOrder(o.id)).status).toBe("delivered");
      const done = await repo.advanceOrder(o.id);
      expect(done.status).toBe("delivered"); // idempotent
      expect(done.deliveredAt).toBeTruthy();
    });
  });

  describe(`${name} listings feed`, () => {
    it("filters by verified within a seller", async () => {
      const repo = make();
      const { seller } = await fixtures(repo);
      await repo.createListing({
        sellerId: seller.id, title: "verified-item", description: "", price: 100,
        category: "sarees", status: "live", flowStep: "live", verified: true, rankBoost: 1,
      });
      await repo.createListing({
        sellerId: seller.id, title: "plain-item", description: "", price: 100,
        category: "sarees", status: "live", flowStep: "live", verified: false, rankBoost: 0,
      });
      const feed = await repo.listListings({ verified: true, sellerId: seller.id });
      expect(feed.map((l) => l.title)).toEqual(["verified-item"]);
    });
  });

  describe(`${name} reviews`, () => {
    it("decides a pending review once, then throws", async () => {
      const repo = make();
      const { seller, buyer } = await fixtures(repo);
      const listing = await repo.createListing({
        sellerId: seller.id, title: "escalated", description: "", price: 250,
        category: "jewellery", status: "escalated", flowStep: "review", verified: false, rankBoost: 0,
      });
      const review = await repo.createReview({ listingId: listing.id, status: "pending" });
      const decided = await repo.decideReview(review.id, "approved", "looks genuine", buyer.id);
      expect(decided.status).toBe("approved");
      expect(decided.decidedAt).toBeTruthy();
      await expect(repo.decideReview(review.id, "rejected", "again", buyer.id)).rejects.toThrow();
    });
  });
}

repoContract("InMemoryRepo", () => new InMemoryRepo());

const hasSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
describe.skipIf(!hasSupabase)("SupabaseRepo (live)", () => {
  repoContract("SupabaseRepo", () => new SupabaseRepo());
});
