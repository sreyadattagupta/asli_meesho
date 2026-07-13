import { requireRole, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import type { AuthenticityCheck, Listing, ProductImage, Review, Seller } from "@/lib/db/types";

export interface ReviewQueueItem {
  review: Review;
  listing: Listing | null;
  seller: Seller | null;
  checks: AuthenticityCheck[];
  images: ProductImage[];
}

/** Human-in-the-loop queue: every pending ESCALATE_HUMAN listing with full agent context. */
export async function GET() {
  try {
    await requireRole("admin");
    const repo = await repoReady();
    const pending = await repo.listPendingReviews();
    const items = await Promise.all(
      pending.map(async (review): Promise<ReviewQueueItem> => {
        const listing = await repo.getListing(review.listingId);
        const [seller, checks, images] = await Promise.all([
          listing ? repo.getSeller(listing.sellerId) : Promise.resolve(null),
          repo.listChecks(review.listingId),
          repo.listImages(review.listingId),
        ]);
        return { review, listing, seller, checks, images };
      }),
    );
    return ok<{ items: ReviewQueueItem[] }>({ items });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
