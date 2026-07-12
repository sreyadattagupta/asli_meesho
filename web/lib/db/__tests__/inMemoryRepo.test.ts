import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryRepo } from "../inMemoryRepo";

describe("InMemoryRepo challenges (invariant #3)", () => {
  let repo: InMemoryRepo;
  beforeEach(() => { repo = new InMemoryRepo(); });

  it("claims a fresh code exactly once", async () => {
    await repo.issueChallenge("AX42", 300);
    const first = await repo.claimChallenge("AX42", "listing-1");
    const second = await repo.claimChallenge("AX42", "listing-2");
    expect(first?.listingId).toBe("listing-1");
    expect(second).toBeNull(); // single-use
  });

  it("rejects expired codes", async () => {
    vi.useFakeTimers();
    await repo.issueChallenge("OLD1", 300);
    vi.advanceTimersByTime(301_000);
    expect(await repo.claimChallenge("OLD1", "l")).toBeNull();
    vi.useRealTimers();
  });

  it("rejects unknown codes", async () => {
    expect(await repo.claimChallenge("NOPE", "l")).toBeNull();
  });
});

describe("InMemoryRepo orders", () => {
  it("advances placed→shipped→delivered and stops", async () => {
    const repo = new InMemoryRepo();
    const o = await repo.createOrder({
      listingId: "l1", buyerUserId: "u1", address: { city: "Pune" },
      paymentMethod: "cod", status: "placed",
    });
    expect((await repo.advanceOrder(o.id)).status).toBe("shipped");
    expect((await repo.advanceOrder(o.id)).status).toBe("delivered");
    const done = await repo.advanceOrder(o.id);
    expect(done.status).toBe("delivered"); // idempotent
    expect(done.deliveredAt).toBeTruthy();
  });
});

describe("InMemoryRepo listings feed", () => {
  it("filters by verified", async () => {
    const repo = new InMemoryRepo();
    const s = await repo.createSeller({ name: "A", shopName: "A", trustScore: 50, trustBand: "medium", kycStatus: "verified", isNew: false, passes: 0, fails: 0 });
    await repo.createListing({ sellerId: s.id, title: "t1", description: "", price: 100, category: "sarees", status: "live", flowStep: "live", verified: true, rankBoost: 1 });
    await repo.createListing({ sellerId: s.id, title: "t2", description: "", price: 100, category: "sarees", status: "live", flowStep: "live", verified: false, rankBoost: 0 });
    expect((await repo.listListings({ verified: true })).map(l => l.title)).toEqual(["t1"]);
  });
});
