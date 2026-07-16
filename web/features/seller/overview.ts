// Seller analytics — pure aggregation over the seller's own rows.
//
// Kept free of I/O so it can be unit-tested against fixtures: the route fetches, this counts. Every
// number is derived from real listing/order state — nothing here is a fixed demo figure.
import type { Listing, Order, Seller } from "@/lib/db/types";

export interface SellerOverview {
  listings: { total: number; active: number; pending: number; approved: number; rejected: number };
  orders: { count: number; revenue: number };
  trust: { score: number; band: Seller["trustBand"]; passes: number; fails: number };
  kycStatus: Seller["kycStatus"];
  /** Revenue per day, oldest → newest, for the dashboard chart. */
  revenueSeries: { day: string; value: number }[];
}

/**
 * `pending` counts listings still moving through the flow or waiting on a reviewer — the seller's
 * "what needs me" number. `approved` is the live+verified set; `rejected` is blocked. A listing that
 * is live but unverified is active without being approved, so the buckets deliberately overlap.
 */
export function buildOverview(
  seller: Seller,
  listings: Listing[],
  orders: { order: Order; price: number }[],
  days = 7,
  now = Date.now(),
): SellerOverview {
  const active = listings.filter((l) => l.status === "live").length;
  const approved = listings.filter((l) => l.status === "live" && l.verified).length;
  const rejected = listings.filter((l) => l.status === "blocked").length;
  const pending = listings.filter((l) => l.status === "draft" || l.status === "escalated").length;

  const revenue = orders.reduce((sum, o) => sum + o.price, 0);

  // Bucket by local day so the chart matches the dates a seller sees elsewhere in the UI.
  const series: { day: string; value: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    const value = orders
      .filter((o) => o.order.placedAt.slice(0, 10) === key)
      .reduce((sum, o) => sum + o.price, 0);
    series.push({ day: key, value });
  }

  return {
    listings: { total: listings.length, active, pending, approved, rejected },
    orders: { count: orders.length, revenue },
    trust: { score: seller.trustScore, band: seller.trustBand, passes: seller.passes, fails: seller.fails },
    kycStatus: seller.kycStatus,
    revenueSeries: series,
  };
}
