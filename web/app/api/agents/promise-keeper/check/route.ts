import { z } from "zod";
import { requireRole, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { fail } from "@/lib/api";

// Agent 4 — Promise Keeper. Contract locked (PromiseVerdict); the pure engine lands in
// Phase 5 (lib/engines/promiseKeeper.ts). Until then this returns a clean 503 the card
// renders as a retryable state — never a dead end.
export async function POST(req: Request) {
  try {
    const user = await requireRole("buyer");
    const parsed = z.object({ orderId: z.string().min(1) }).safeParse(await req.json());
    if (!parsed.success) return fail(400, "invalid_body", "orderId is required.");
    const repo = await repoReady();
    const order = await repo.getOrder(parsed.data.orderId);
    if (!order || order.buyerUserId !== user.id) return fail(404, "not_found", "Order not found.");
    if (order.status !== "delivered") return fail(409, "not_delivered", "Promise check runs after delivery.");
    return fail(503, "engine_pending", "Promise engine not yet enabled.");
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
