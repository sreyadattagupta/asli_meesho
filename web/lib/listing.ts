// Listing detail bundle — shared by GET /api/listings/:id and the /shop/:id server page.
import { repoReady } from "@/lib/db";
import type {
  AuthenticityCheck, Listing, ProductImage, SizeMeasurement, TrustBand,
} from "@/lib/db/types";

export interface ListingBundle {
  listing: Listing;
  images: ProductImage[];
  checks: AuthenticityCheck[];
  measurement: SizeMeasurement | null;
  trustScore: number;
  trustBand: TrustBand;
  promiseArmed: boolean;
}

export async function getListingBundle(id: string): Promise<ListingBundle | null> {
  const repo = await repoReady();
  const listing = await repo.getListing(id);
  if (!listing) return null;
  const [images, checks, measurement, seller, promise] = await Promise.all([
    repo.listImages(id),
    repo.listChecks(id),
    repo.getMeasurement(id),
    repo.getSeller(listing.sellerId),
    repo.getPromiseByListing(id),
  ]);
  return {
    listing, images, checks, measurement,
    trustScore: seller?.trustScore ?? 0,
    trustBand: seller?.trustBand ?? "low",
    promiseArmed: promise !== null || listing.verified, // frozen at go-live for verified listings
  };
}
