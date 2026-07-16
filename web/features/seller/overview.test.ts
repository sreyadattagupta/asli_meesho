import { describe, it, expect } from "vitest";
import { buildOverview } from "./overview";
import type { Listing, Order, Seller } from "@/lib/db/types";

const seller: Seller = {
  id: "s1", name: "Priya", shopName: "Priya's Studio", trustScore: 82, trustBand: "high", // 0-100, matching lib/engines/trust.ts
  kycStatus: "verified", isNew: false, passes: 7, fails: 1, createdAt: "2026-01-01T00:00:00.000Z",
};

const listing = (over: Partial<Listing>): Listing => ({
  id: crypto.randomUUID(), sellerId: "s1", title: "t", description: "", price: 499,
  category: "kurtis", status: "live", flowStep: "live", verified: true, rankBoost: 0,
  createdAt: "2026-07-01T00:00:00.000Z", ...over,
});

const order = (placedAt: string, price: number) => ({
  order: {
    id: crypto.randomUUID(), listingId: "l1", buyerUserId: "b1", address: {},
    paymentMethod: "cod" as const, status: "delivered" as const, placedAt,
  } satisfies Order,
  price,
});

describe("buildOverview", () => {
  it("buckets listings by real status, not a fixed demo number", () => {
    const o = buildOverview(seller, [
      listing({ status: "live", verified: true }),
      listing({ status: "live", verified: false }), // active but not approved
      listing({ status: "draft" }),
      listing({ status: "escalated" }),
      listing({ status: "blocked" }),
    ], []);
    expect(o.listings.total).toBe(5);
    expect(o.listings.active).toBe(2);
    expect(o.listings.approved).toBe(1);
    expect(o.listings.pending).toBe(2); // draft + escalated
    expect(o.listings.rejected).toBe(1);
  });

  it("sums revenue from real orders", () => {
    const o = buildOverview(seller, [], [order("2026-07-17T10:00:00.000Z", 499), order("2026-07-17T11:00:00.000Z", 349)]);
    expect(o.orders.count).toBe(2);
    expect(o.orders.revenue).toBe(848);
  });

  it("returns an empty-but-shaped series for a seller with no orders", () => {
    // A new seller must render a chart, not crash or show a fake trend.
    const o = buildOverview(seller, [], [], 7);
    expect(o.revenueSeries).toHaveLength(7);
    expect(o.revenueSeries.every((p) => p.value === 0)).toBe(true);
    expect(o.orders.revenue).toBe(0);
  });

  it("places each order's revenue on its own day, oldest first", () => {
    const now = Date.parse("2026-07-17T12:00:00.000Z");
    const o = buildOverview(seller, [], [
      order("2026-07-17T09:00:00.000Z", 100),
      order("2026-07-15T09:00:00.000Z", 250),
    ], 3, now);
    expect(o.revenueSeries.map((p) => p.day)).toEqual(["2026-07-15", "2026-07-16", "2026-07-17"]);
    expect(o.revenueSeries.map((p) => p.value)).toEqual([250, 0, 100]);
  });

  it("carries the seller's real trust record", () => {
    const o = buildOverview(seller, [], []);
    expect(o.trust).toEqual({ score: 82, band: "high", passes: 7, fails: 1 });
    expect(o.kycStatus).toBe("verified");
  });
});
