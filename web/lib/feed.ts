// Marketplace feed assembly — shared by GET /api/listings and the /shop server page.
import { repoReady } from "@/lib/db";
import type { TrustBand } from "@/lib/db/types";

export interface FeedItem {
  id: string; title: string; price: number; category: string;
  verified: boolean; imageUrl: string; rating: number; ratingCount: number;
  sellerBand: TrustBand;
}

/** Deterministic pseudo-rating 3.8–4.9 from the listing id — stable across refetches. */
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
  return Promise.all(
    listings.map(async (l) => {
      const [images, seller] = await Promise.all([
        repo.listImages(l.id),
        repo.getSeller(l.sellerId),
      ]);
      return {
        id: l.id, title: l.title, price: l.price, category: l.category,
        verified: l.verified,
        imageUrl: images.find((i) => i.kind === "catalog")?.url ?? "/mock/kurtis-1.svg",
        ...seededRating(l.id),
        sellerBand: seller?.trustBand ?? "low",
      };
    }),
  );
}
