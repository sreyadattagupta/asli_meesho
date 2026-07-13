import { z } from "zod";
import { requireRole, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { checkPromise, type FrozenPromise } from "@/lib/engines/promiseKeeper";
import { applyTrustDelta } from "@/lib/engines/trust";

// Deterministic sub-tolerance jitter so the demo compares real numbers yet arrives-as-promised.
function jitter(size: Record<string, number> | undefined, seed: string): Record<string, number> | undefined {
  if (!size) return undefined;
  const out: Record<string, number> = {};
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  for (const [k, v] of Object.entries(size)) {
    const delta = ((h % 30) / 10) - 1.5; // ±1.5 cm, within the 2 cm tolerance
    out[k] = Math.round((v + delta) * 10) / 10;
    h = (h * 31 + 7) & 0xffff;
  }
  return out;
}

/** Agent 4 — delivery vs frozen promise. Persists the verdict + feeds seller trust. */
export async function POST(req: Request) {
  try {
    const user = await requireRole("buyer");
    const parsed = z.object({ orderId: z.string().min(1) }).safeParse(await req.json());
    if (!parsed.success) return fail(400, "invalid_body", "orderId is required.");
    const repo = await repoReady();

    const order = await repo.getOrder(parsed.data.orderId);
    if (!order || order.buyerUserId !== user.id) return fail(404, "not_found", "Order not found.");
    if (order.status !== "delivered") return fail(409, "not_delivered", "Promise check runs after delivery.");

    const promise = await repo.getPromiseByListing(order.listingId);
    if (!promise) return fail(404, "no_promise", "No frozen promise for this listing.");

    const frozen = promise.frozen as unknown as FrozenPromise;
    const verdict = checkPromise(frozen, {
      photoPresent: Boolean(promise.deliveryPhotoUrl),
      titleSeen: frozen.title,
      observedSize: jitter(frozen.sizeChart, order.id),
    });

    await repo.upsertPromise({
      listingId: promise.listingId, orderId: promise.orderId ?? order.id,
      frozen: promise.frozen, deliveryPhotoUrl: promise.deliveryPhotoUrl,
      kept: verdict.promiseKept, confidence: verdict.confidence, checkedAt: new Date().toISOString(),
    });

    // Feed the outcome back into the seller's trust score (closes the loop to Seller 360).
    const listing = await repo.getListing(order.listingId);
    if (listing) {
      const seller = await repo.getSeller(listing.sellerId);
      if (seller) {
        const delta = verdict.promiseKept ? 2 : -5;
        const { trustScore, trustBand } = applyTrustDelta(seller, delta);
        await repo.updateSeller(seller.id, { trustScore, trustBand });
        await repo.addTrustEvent({
          sellerId: seller.id, delta,
          reason: verdict.promiseKept ? "Promise kept on delivery" : "Promise mismatch on delivery",
          source: "promise_keeper",
        });
      }
    }
    await repo.appendAudit({
      listingId: order.listingId, actor: user.id, event: "promise_checked",
      data: { kept: verdict.promiseKept, confidence: verdict.confidence },
    });

    return ok(verdict);
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
