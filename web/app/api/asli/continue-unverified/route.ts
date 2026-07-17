import { z } from "zod";
import { requireRole, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { fail, ok } from "@/lib/api";

/**
 * Seller chose "Continue anyway" after the possession challenge kept failing.
 *
 * This is the escape hatch for a genuine seller the same-item gate can't confidently confirm — never
 * a bypass of the trust guarantee. It records possession as INCOMPLETE (not passed), drops the
 * listing into the human review queue, and lets the flow proceed to sizing. At publish the listing
 * goes live but is NOT ✓ Asli Verified (the publish route reads this same check) — so "verified"
 * still means possession was actually proven, and a thief who spams continue-anyway only ever gets an
 * unverified, review-flagged listing.
 */
export async function POST(req: Request) {
  try {
    const user = await requireRole("seller");
    const { listingId } = z.object({ listingId: z.string().min(1) }).parse(await req.json());
    const repo = await repoReady();

    const listing = await repo.getListing(listingId);
    if (!listing || listing.sellerId !== user.sellerId) {
      return fail(404, "not_found", "Listing not found.");
    }
    if (listing.verified) {
      // Already proven — nothing to continue past.
      return ok({ alreadyVerified: true });
    }

    const attempts = (await repo.listChecks(listingId)).filter((c) => c.agent === "possession").length;

    // The audit record possession relies on: passed:false + user_continued:true. Publish keys off this
    // to allow an UNVERIFIED go-live, and the review queue shows it as seller-continued.
    await repo.addCheck({
      listingId,
      agent: "possession",
      payload: { passed: false, user_continued: true, attempts },
      confidence: 0,
      action: "USER_CONTINUED",
      requiredConfidence: 0,
      reason:
        "Seller continued after the possession challenge could not be confirmed. Possession is " +
        "unverified — the listing may go live without the ✓ badge and needs manual review.",
    });

    // Flag for a human. Idempotent-ish: a second continue just adds another pending review, which the
    // queue de-dupes by listing in practice; not worth a uniqueness check for the demo.
    await repo.createReview({ listingId, status: "pending" });
    await repo.appendAudit({
      listingId,
      actor: user.id,
      event: "possession_user_continued",
      data: { attempts },
    });

    return ok({ continued: true, attempts });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
