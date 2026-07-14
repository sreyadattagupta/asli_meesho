import { requireRole, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { reviewDecisionSchema } from "@/lib/validation";
import { fail, ok } from "@/lib/api";
import { applyTrustDelta } from "@/lib/engines/trust";
import type { Review } from "@/lib/db/types";

const AGENT1_BASE =
  process.env.AGENT1_SERVICE_URL ?? process.env.VLM_SERVICE_URL ?? "http://localhost:8000";

/** Push the reviewer's verdict to the Agent 1 engine so it updates priors (component 10). */
async function notifyAgent1Feedback(
  listingId: string,
  sellerId: string,
  decision: "approved" | "rejected",
  passes: number,
  fails: number,
) {
  try {
    const form = new FormData();
    form.append("listingId", listingId);
    form.append("sellerId", sellerId);
    form.append("decision", decision === "approved" ? "approve" : "reject");
    form.append("passes", String(passes));
    form.append("fails", String(fails));
    await fetch(`${AGENT1_BASE}/agent1/feedback`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // engine offline — the learning update is best-effort, the review still stands
  }
}

/** Reviewer verdict → listing state + seller trust feedback (closes the learning loop). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole("admin");
    const { id } = await params;
    const parsed = reviewDecisionSchema.safeParse(await req.json());
    if (!parsed.success) return fail(400, "invalid_body", "decision and a note are required.");
    const { decision, note } = parsed.data;
    const repo = await repoReady();

    let review: Review;
    try {
      review = await repo.decideReview(id, decision, note, admin.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("already decided")) return fail(409, "already_decided", "This review was already decided.");
      if (msg.includes("not found")) return fail(404, "not_found", "Review not found.");
      throw err;
    }

    const listing = await repo.getListing(review.listingId);
    const seller = listing ? await repo.getSeller(listing.sellerId) : null;

    const approved = decision === "approved";
    if (listing) {
      await repo.updateListing(listing.id, approved
        ? { status: "live", verified: true, flowStep: "live" }
        : { status: "rejected" });
    }
    if (seller) {
      const delta = approved ? 5 : -10;
      const { trustScore, trustBand } = applyTrustDelta(seller, delta);
      const passes = seller.passes + (approved ? 1 : 0);
      const fails = seller.fails + (approved ? 0 : 1);
      await repo.updateSeller(seller.id, { trustScore, trustBand, passes, fails });
      await repo.addTrustEvent({
        sellerId: seller.id, delta,
        reason: approved ? "Listing approved on review" : "Listing rejected on review",
        source: approved ? "review_approved" : "review_rejected",
      });
      // Agent 1 feedback learning (component 10) — best-effort; never blocks the reviewer.
      await notifyAgent1Feedback(review.listingId, seller.id, decision, passes, fails);
    }
    await repo.appendAudit({
      listingId: review.listingId, actor: admin.id,
      event: approved ? "review_approved" : "review_rejected",
      data: { note },
    });

    return ok({ review });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
