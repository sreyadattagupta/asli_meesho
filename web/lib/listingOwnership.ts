// Ownership guard for the agent write-paths (/api/sizing, /api/challenge).
//
// Both routes accept a `listingId` from the form and then write images, measurements, checks and
// audit entries against it. Without this check any caller could name someone else's listing and
// overwrite their size chart or attach a live photo to their shop — and the seller portal's
// "Re-run AI checks" link puts that id straight in the URL bar.
//
// Only enforced when a listingId is supplied: the signed-out local demo runs the agents with no
// server-side draft, writes nothing, and must keep working.
import { requireRole, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import type { Listing } from "@/lib/db/types";

/**
 * Resolve a listing the caller is allowed to write to.
 *
 * Throws 404 (not 403) when another seller owns it — a 403 confirms the id exists, which turns this
 * into an id oracle for the whole catalogue.
 */
export async function assertOwnedListing(listingId: string): Promise<Listing> {
  const user = await requireRole("seller");
  const repo = await repoReady();
  const listing = await repo.getListing(listingId);
  if (!listing || listing.sellerId !== user.sellerId) {
    throw new HttpError(404, "not_found", "Listing not found.");
  }
  return listing;
}
