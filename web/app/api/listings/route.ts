import { requireRole, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { listingCreateSchema } from "@/lib/validation";
import { fail, ok } from "@/lib/api";

/** Create a listing draft — the seller flow's entry point. */
export async function POST(req: Request) {
  try {
    const user = await requireRole("seller");
    const parsed = listingCreateSchema.safeParse(await req.json());
    if (!parsed.success) return fail(400, "invalid_body", "Title (3–120), integer price (1–100000) and a valid category are required.");
    const repo = await repoReady();
    const listing = await repo.createListing({
      sellerId: user.sellerId!,
      title: parsed.data.title,
      description: parsed.data.description ?? "",
      price: parsed.data.price,
      category: parsed.data.category,
      status: "draft",
      flowStep: "upload",
      verified: false,
      rankBoost: 0,
    });
    await repo.appendAudit({ listingId: listing.id, actor: user.id, event: "listing_created", data: {} });
    return ok({ listingId: listing.id, flowStep: listing.flowStep });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
