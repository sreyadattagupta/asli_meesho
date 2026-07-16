import { requireRole, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { buildOverview } from "@/features/seller/overview";

/**
 * Seller analytics for the CALLER — never for an id supplied by the client.
 *
 * The sellerId comes from the session, so a seller cannot read another shop's numbers by changing a
 * query param. That is the whole contract of a multi-tenant portal, so it is enforced here rather
 * than trusted to the UI.
 */
export async function GET() {
  try {
    const user = await requireRole("seller");
    if (!user.sellerId) return fail(409, "no_seller", "Finish onboarding to open the seller portal.");

    const repo = await repoReady();
    const seller = await repo.getSeller(user.sellerId);
    if (!seller) return fail(404, "no_seller", "Seller record not found.");

    const listings = await repo.listListings({ sellerId: user.sellerId });

    // Orders are stored per listing; join them to this seller's listings and price each from its
    // listing, so revenue reflects real orders rather than a headline figure.
    const priceById = new Map(listings.map((l) => [l.id, l.price]));
    const orders = (await Promise.all(listings.map((l) => repo.listOrdersByListing(l.id))))
      .flat()
      .map((order) => ({ order, price: priceById.get(order.listingId) ?? 0 }));

    return ok(buildOverview(seller, listings, orders));
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
