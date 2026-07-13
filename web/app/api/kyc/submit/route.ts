import { requireRole, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { kycSubmitSchema } from "@/lib/validation";
import { fail, ok } from "@/lib/api";
import { applyTrustDelta } from "@/lib/engines/trust";

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;

/** Seller KYC onboarding — simulated verification feeding the cold-start trust prior. */
export async function POST(req: Request) {
  try {
    const user = await requireRole("seller");
    if (!user.sellerId) return fail(409, "no_seller", "No seller profile for this account.");
    const form = await req.formData();

    const parsed = kycSubmitSchema.safeParse({ shopName: form.get("shopName") });
    if (!parsed.success) return fail(400, "invalid_shop", "Shop name must be 2–80 characters.");

    const doc = form.get("doc");
    if (!(doc instanceof File)) return fail(422, "no_document", "A document image is required.");
    if (!ALLOWED.includes(doc.type)) return fail(422, "bad_type", "Upload a JPEG, PNG or WebP image.");
    if (doc.size > MAX_BYTES) return fail(422, "too_large", "Document must be 8 MB or smaller.");

    // Simulated document verification (labelled in the UI).
    if (process.env.NODE_ENV !== "test") await new Promise((r) => setTimeout(r, 1200));

    const repo = await repoReady();
    const seller = await repo.getSeller(user.sellerId);
    if (!seller) return fail(404, "not_found", "Seller not found.");

    const { trustScore, trustBand } = applyTrustDelta(seller, 3);
    await repo.updateSeller(seller.id, {
      kycStatus: "verified", shopName: parsed.data.shopName, trustScore, trustBand,
    });
    await repo.addTrustEvent({
      sellerId: seller.id, delta: 3, reason: "KYC documents verified", source: "kyc_verified",
    });
    await repo.appendAudit({ actor: user.id, event: "kyc_verified", data: { shopName: parsed.data.shopName } });

    return ok({ kycStatus: "verified", shopName: parsed.data.shopName });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
