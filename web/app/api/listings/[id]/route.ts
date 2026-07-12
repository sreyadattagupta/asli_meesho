import { repoReady } from "@/lib/db";
import { fail, ok } from "@/lib/api";

/** Listing bundle: listing + images + agent checks + measurement + seller trust. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const repo = await repoReady();
    const listing = await repo.getListing(id);
    if (!listing) return fail(404, "not_found", "Listing not found.");
    const [images, checks, measurement, seller] = await Promise.all([
      repo.listImages(id),
      repo.listChecks(id),
      repo.getMeasurement(id),
      repo.getSeller(listing.sellerId),
    ]);
    return ok({
      listing, images, checks, measurement,
      trustScore: seller?.trustScore ?? 0,
      trustBand: seller?.trustBand ?? "low",
    });
  } catch {
    return fail(500, "internal", "Something went wrong.");
  }
}
