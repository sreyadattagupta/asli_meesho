// Marketplace feed assembly — shared by GET /api/listings and the /shop server page.
import { repoReady } from "@/lib/db";
import type { TrustBand } from "@/lib/db/types";

export interface FeedItem {
  id: string; title: string; price: number; category: string;
  verified: boolean; imageUrl: string; rating: number; ratingCount: number;
  sellerBand: TrustBand;
}

/**
 * SIMULATED rating — there is no buyer-review data in this system.
 *
 * Derived from the listing id so it is at least stable across refetches rather than flickering. It
 * is NOT a real rating: nobody rated these listings, and the `reviews` table is the Trust & Safety
 * queue, not product reviews. Every surface that renders this MUST label it `simulated`
 * (invariant #9) — an invented 4.8 next to a genuinely measured size chart would poison the one
 * thing on the page that is real.
 */
function seededRating(id: string): { rating: number; ratingCount: number } {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { rating: Math.round((3.8 + (h % 12) / 10) * 10) / 10, ratingCount: 40 + (h % 900) };
}

/**
 * Live listings only, verified-first then rankBoost (simulated PRISM-style boost —
 * ordering comes from Repo.listListings). filter="verified" narrows to verified.
 */
export async function buildFeed(filter?: string | null): Promise<FeedItem[]> {
  const repo = await repoReady();
  const listings = await repo.listListings({
    status: "live",
    verified: filter === "verified" ? true : undefined,
  });
  if (listings.length === 0) return [];

  // THREE queries total, never 1 + 2N. Per-listing listImages/getSeller meant ~35 round-trips for 18
  // listings, and listImages pulls the inline base64 `url` — 60-90s against Supabase in production.
  const [imageMeta, sellers] = await Promise.all([
    repo.listImageMeta(listings.map((l) => l.id)),
    repo.listSellers(),
  ]);
  const catalogByListing = new Map<string, string>();
  for (const m of imageMeta) {
    if (m.kind === "catalog" && !catalogByListing.has(m.listingId)) catalogByListing.set(m.listingId, m.id);
  }
  const bandBySeller = new Map(sellers.map((s) => [s.id, s.trustBand]));

  return listings.map((l) => {
    const imageId = catalogByListing.get(l.id);
    return {
      id: l.id, title: l.title, price: l.price, category: l.category,
      verified: l.verified,
      // Reference the image, never inline it: /api/images/:id streams the bytes (or redirects to a
      // static path) so the browser lazy-loads and caches them instead of the feed carrying ~1 MB
      // of base64 per card.
      imageUrl: imageId ? `/api/images/${imageId}` : "/mock/kurtis-1.svg",
      ...seededRating(l.id),
      sellerBand: bandBySeller.get(l.sellerId) ?? "low",
    };
  });
}
