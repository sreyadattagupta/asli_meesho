import { fail, ok } from "@/lib/api";
import { getListingBundle } from "@/lib/listing";
import { requireRole, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { listingUpdateSchema } from "@/lib/validation";

/** Listing bundle: listing + images + agent checks + measurement + seller trust. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const bundle = await getListingBundle(id);
    if (!bundle) return fail(404, "not_found", "Listing not found.");
    return ok(bundle);
  } catch {
    return fail(500, "internal", "Something went wrong.");
  }
}

/**
 * Load a listing and prove the caller owns it.
 *
 * Returns 404 rather than 403 when another seller owns it: a 403 would confirm the id exists, which
 * lets someone enumerate the catalogue's internal ids. The seller either owns it or, as far as this
 * endpoint is concerned, it isn't there.
 */
async function ownedListing(id: string) {
  const user = await requireRole("seller");
  const repo = await repoReady();
  const listing = await repo.getListing(id);
  if (!listing || listing.sellerId !== user.sellerId) {
    throw new HttpError(404, "not_found", "Listing not found.");
  }
  return { user, repo, listing };
}

/** Seller edits their own listing. Verification state is NOT editable here — agents own that. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { repo, user, listing } = await ownedListing(id);
    const parsed = listingUpdateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(400, "invalid_body", "Check the title, price, category or status and retry.");
    }

    // A seller may publish/unpublish their own listing, but only the agents can mark it verified —
    // letting a PATCH set `verified` would hand out the ✓ badge for free and void the whole premise.
    const patch = parsed.data;
    const updated = await repo.updateListing(id, patch);
    await repo.appendAudit({
      listingId: id, actor: user.id, event: "listing_updated",
      data: { changed: Object.keys(patch), from: { status: listing.status, price: listing.price } },
    });
    return ok(updated);
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}

/**
 * Seller removes their own listing — by archiving, not deleting.
 *
 * Eight tables reference listings(id) without cascade, two of them orders and the append-only
 * audit_log. A hard delete would either fail on the FK or erase a buyer's purchase history and the
 * decision trail that makes the ✓ badge auditable. Archiving drops it out of the marketplace feed
 * (which selects status='live') and the seller's list, while every reference stays valid.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { repo, user, listing } = await ownedListing(id);
    if (listing.status === "archived") return ok({ archived: true }); // idempotent

    const updated = await repo.updateListing(id, { status: "archived" });
    await repo.appendAudit({
      listingId: id, actor: user.id, event: "listing_archived",
      data: { from: listing.status, verified: listing.verified },
    });
    return ok({ archived: true, listing: updated });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
