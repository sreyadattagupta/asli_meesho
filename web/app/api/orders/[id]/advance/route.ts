import { requireRole, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { fail, ok } from "@/lib/api";

/** Demo fast-forward (labelled simulated): placed→shipped→delivered, idempotent at delivered. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole("buyer");
    const { id } = await params;
    const repo = await repoReady();
    const order = await repo.getOrder(id);
    if (!order || order.buyerUserId !== user.id) return fail(404, "not_found", "Order not found.");
    const advanced = await repo.advanceOrder(id);
    if (advanced.status !== order.status) {
      await repo.appendAudit({
        listingId: order.listingId, actor: user.id, event: "order_advanced",
        data: { orderId: id, status: advanced.status, simulated: true },
      });
    }
    return ok({ order: advanced });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
