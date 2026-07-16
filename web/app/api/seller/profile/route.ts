import { requireRole, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { sellerProfileSchema } from "@/lib/validation";

/** The caller's own seller record. Never takes an id from the client. */
export async function GET() {
  try {
    const user = await requireRole("seller");
    if (!user.sellerId) return fail(409, "no_seller", "Finish onboarding first.");
    const repo = await repoReady();
    const seller = await repo.getSeller(user.sellerId);
    if (!seller) return fail(404, "no_seller", "Seller record not found.");
    return ok(seller);
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}

/**
 * Seller edits their own business profile.
 *
 * The schema is closed: trustScore, trustBand, passes, fails and kycStatus are absent because the
 * agents and reviewers own them. A seller who could PATCH their own trust score would skip every
 * check the score exists to gate.
 */
export async function PATCH(req: Request) {
  try {
    const user = await requireRole("seller");
    if (!user.sellerId) return fail(409, "no_seller", "Finish onboarding first.");

    const parsed = sellerProfileSchema.safeParse(await req.json());
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return fail(400, "invalid_body", first?.message ?? "Check the details and retry.");
    }

    const repo = await repoReady();
    const updated = await repo.updateSeller(user.sellerId, parsed.data);
    await repo.appendAudit({
      actor: user.id, event: "seller_profile_updated",
      data: { changed: Object.keys(parsed.data) }, // field names only — no GST/PAN in the log
    });
    return ok(updated);
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
