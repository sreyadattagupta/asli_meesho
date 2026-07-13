import { requireRole, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { fail, ok } from "@/lib/api";

/** Order + tracking bundle — buyers see only their own orders (others 404, not 403). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole("buyer");
    const { id } = await params;
    const repo = await repoReady();
    const order = await repo.getOrder(id);
    if (!order || order.buyerUserId !== user.id) return fail(404, "not_found", "Order not found.");
    const [listing, images, promise] = await Promise.all([
      repo.getListing(order.listingId),
      repo.listImages(order.listingId),
      repo.getPromiseByListing(order.listingId),
    ]);
    return ok({
      order, listing,
      imageUrl: images.find((i) => i.kind === "catalog")?.url ?? null,
      promise,
    });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
