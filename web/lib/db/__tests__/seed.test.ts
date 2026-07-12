import { describe, expect, it } from "vitest";
import { InMemoryRepo } from "../inMemoryRepo";
import { seedRepo } from "../seed";

describe("seedRepo", () => {
  it("populates every screen's data and is idempotent", async () => {
    const repo = new InMemoryRepo();
    await seedRepo(repo);
    await seedRepo(repo); // second run must not duplicate
    const listings = await repo.listListings();
    expect(listings.length).toBeGreaterThanOrEqual(16);
    expect(new Set(listings.map(l => l.category)).size).toBeGreaterThanOrEqual(4);
    expect((await repo.listPendingReviews()).length).toBe(2);
    expect(listings.some(l => l.verified)).toBe(true);
  });
});
