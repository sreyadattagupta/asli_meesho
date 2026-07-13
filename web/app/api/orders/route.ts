import { requireRole, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { orderCreateSchema } from "@/lib/validation";
import { fail, ok } from "@/lib/api";

/** Mock checkout (labelled simulated — no real money). Creates the order + arms the promise. */
export async function POST(req: Request) {
  try {
    const user = await requireRole("buyer");
    const parsed = orderCreateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(400, "invalid_body", "Listing, payment method and a full address (6-digit pincode) are required.");
    }
    const repo = await repoReady();
    const listing = await repo.getListing(parsed.data.listingId);
    if (!listing || listing.status !== "live") return fail(404, "not_found", "Listing not found or not live.");

    const order = await repo.createOrder({
      listingId: listing.id,
      buyerUserId: user.id,
      address: parsed.data.address,
      paymentMethod: parsed.data.paymentMethod,
      status: "placed",
    });
    // Link the go-live frozen promise to this order so Promise Keeper checks the right delivery.
    const promise = await repo.getPromiseByListing(listing.id);
    if (promise) await repo.upsertPromise({ ...promise, orderId: order.id });
    await repo.appendAudit({
      listingId: listing.id, actor: user.id, event: "order_placed",
      data: { orderId: order.id, paymentMethod: order.paymentMethod },
    });
    return ok({ orderId: order.id });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
