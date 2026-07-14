import { requireRole, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import type { AuthenticityCheck, Listing, ProductImage, Review, Seller } from "@/lib/db/types";
import type { Agent1Evidence } from "@/lib/agent1Client";

export interface ReviewQueueItem {
  review: Review;
  listing: Listing | null;
  seller: Seller | null;
  checks: AuthenticityCheck[];
  images: ProductImage[];
  // Agent 1 reverse-search evidence (from the reverse_image_checked audit entry, if any).
  evidence: Agent1Evidence[];
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
        const [seller, checks, images, audit] = await Promise.all([
          listing ? repo.getSeller(listing.sellerId) : Promise.resolve(null),
          repo.listChecks(review.listingId),
          repo.listImages(review.listingId),
          repo.listAudit(review.listingId),
        ]);
        const lastTrigger = audit.filter((a) => a.event === "reverse_image_checked").at(-1);
        const evidence = (lastTrigger?.data?.evidence as Agent1Evidence[] | undefined) ?? [];
        return { review, listing, seller, checks, images, evidence };
      }),
    );
    return ok<{ items: ReviewQueueItem[] }>({ items });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
