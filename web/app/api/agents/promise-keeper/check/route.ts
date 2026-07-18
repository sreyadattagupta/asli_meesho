import { z } from "zod";
import { requireRole, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { checkPromise, type FrozenPromise, type DeliveryObservation } from "@/lib/engines/promiseKeeper";
import { vlmVerifyDelivery } from "@/lib/vlmClient";
import { loadImageBlob } from "@/lib/images";
import { applyTrustDelta } from "@/lib/engines/trust";

// This route waits on the CV service, which cold-starts in 30–60s. The platform default cuts the
// function off well before that and returns an HTML 504, which the client cannot parse as JSON.
export const maxDuration = 120;

/**
 * Agent 4 — delivery vs frozen promise. Real verification: the delivery photo (buyer upload or the
 * seeded delivery image) is compared against the frozen catalog image via the shared VLM/CLIP
 * pipeline (provider.verifyDelivery), then composed into an explainable verdict and fed back into
 * the seller's trust score. Accepts JSON `{ orderId }` (use the stored delivery photo) or multipart
 * with a `delivery` file (buyer uploads a fresh photo, which is persisted then verified).
 */
export async function POST(req: Request) {
  try {
    const user = await requireRole("buyer");
    const repo = await repoReady();

    // Parse either a JSON body or a multipart upload.
    let orderId: string;
    let uploaded: Blob | null = null;
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      orderId = String(form.get("orderId") ?? "");
      const f = form.get("delivery");
      uploaded = f instanceof Blob ? f : null;
    } else {
      const parsed = z.object({ orderId: z.string().min(1) }).safeParse(await req.json());
      if (!parsed.success) return fail(400, "invalid_body", "orderId is required.");
      orderId = parsed.data.orderId;
    }
    if (!orderId) return fail(400, "invalid_body", "orderId is required.");

    const order = await repo.getOrder(orderId);
    if (!order || order.buyerUserId !== user.id) return fail(404, "not_found", "Order not found.");
    if (order.status !== "delivered") return fail(409, "not_delivered", "Promise check runs after delivery.");

    const promise = await repo.getPromiseByListing(order.listingId);
    if (!promise) return fail(404, "no_promise", "No frozen promise for this listing.");
    const frozen = promise.frozen as unknown as FrozenPromise;

    // Persist a freshly-uploaded delivery photo (camera/file) as a data URL on the promise.
    let deliveryPhotoUrl = promise.deliveryPhotoUrl;
    if (uploaded) {
      const buf = Buffer.from(await uploaded.arrayBuffer());
      deliveryPhotoUrl = `data:${uploaded.type || "image/jpeg"};base64,${buf.toString("base64")}`;
    }
    if (!deliveryPhotoUrl) return fail(400, "no_delivery_photo", "Upload a delivery photo to verify.");

    // Real delivery verification against the frozen catalog image. If the CV service or an image
    // load fails, degrade to a photo-on-file observation (labelled) rather than hard-failing.
    const catalogRef = frozen.imageUrl;
    let obs: DeliveryObservation = { photoPresent: true };
    let degraded = false;
    if (catalogRef) {
      try {
        const [deliveryBlob, catalogBlob] = await Promise.all([
          loadImageBlob(deliveryPhotoUrl),
          loadImageBlob(catalogRef),
        ]);
        const dr = await vlmVerifyDelivery(deliveryBlob, catalogBlob, {
          title: frozen.title, category: frozen.category,
        });
        obs = {
          photoPresent: true,
          cosine: dr.cosine,
          sameProduct: dr.same_product,
          observedCategory: dr.observed.category,
          observedCount: dr.observed.count,
        };
      } catch {
        degraded = true; // verification unavailable — fall back to presence only
      }
    }

    const verdict = checkPromise(frozen, obs);
    if (degraded) verdict.reason = `${verdict.reason} (image verification unavailable — photo on file)`;

    await repo.upsertPromise({
      listingId: promise.listingId, orderId: promise.orderId ?? order.id,
      frozen: promise.frozen, deliveryPhotoUrl: deliveryPhotoUrl,
      kept: verdict.promiseKept, confidence: verdict.confidence, checkedAt: new Date().toISOString(),
    });

    // Feed the outcome back into the seller's trust score — but ONLY when identity verification
    // actually passed (PROMISE_KEPT / PROMISE_BROKEN). A product mismatch, a low-confidence review,
    // a retake request, or unavailable verification must never move the seller's score: those may be
    // a wrong/blurry buyer upload, not a broken promise, and rewarding/penalising on them is exactly
    // the false-positive this gate exists to prevent.
    if (verdict.updateTrustScore) {
      const listing = await repo.getListing(order.listingId);
      if (listing) {
        const seller = await repo.getSeller(listing.sellerId);
        if (seller) {
          const delta = verdict.promiseKept ? 2 : -5;
          const { trustScore, trustBand } = applyTrustDelta(seller, delta);
          await repo.updateSeller(seller.id, { trustScore, trustBand });
          await repo.addTrustEvent({
            sellerId: seller.id, delta,
            reason: verdict.promiseKept ? "Promise kept on delivery" : "Promise broken on delivery",
            source: "promise_keeper",
          });
        }
      }
    }
    await repo.appendAudit({
      listingId: order.listingId, actor: user.id, event: "promise_checked",
      data: {
        status: verdict.status, kept: verdict.promiseKept, confidence: verdict.confidence,
        score: verdict.score, cosine: obs.cosine ?? null,
        mismatchCodes: verdict.mismatchCodes, trustUpdated: verdict.updateTrustScore,
      },
    });

    return ok(verdict);
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(502, "vlm_unavailable", `Verification failed: ${String(e)}`);
  }
}
