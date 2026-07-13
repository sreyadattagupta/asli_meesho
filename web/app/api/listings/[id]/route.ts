import { fail, ok } from "@/lib/api";
import { getListingBundle } from "@/lib/listing";

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
