import { z } from "zod";
import { requireRole, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { fail, ok } from "@/lib/api";

// cm values only — the mapped size label ("M") lives on the SizeMeasurement row.
const publishSchema = z.object({
  sizeChart: z.record(z.string(), z.number()).optional(),
});

// POST: go LIVE — flips the listing to verified+live and FREEZES the promise
// (Agent 4's contract: what was claimed at go-live, checked again at delivery).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole("seller");
    const { id } = await params;
    const parsed = publishSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return fail(400, "invalid_body", "Invalid size chart payload.");
    const repo = await repoReady();
    const listing = await repo.getListing(id);
    if (!listing || listing.sellerId !== user.sellerId) return fail(404, "not_found", "Listing not found.");
    if (listing.status === "blocked") return fail(409, "blocked", "A blocked listing cannot go live.");

    // Drafts are created untitled — the wizard collects the title after the agents run, so the row
    // exists for a while with `title: ""`. This is the gate that stops one of those reaching the
    // marketplace if the Details step were ever skipped or its PATCH silently failed.
    if (listing.title.trim().length < 3) {
      return fail(409, "incomplete", "Add a product title before publishing.");
    }

    // ✓ Asli Verified requires a PASSING possession check (Agent 1 ∧ Agent 2 upstream). A seller who
    // hit "Continue anyway" after the challenge couldn't be confirmed has a user_continued check
    // instead: that listing may go live but is NOT verified and is left flagged for review. A listing
    // with neither still can't publish.
    const checks = await repo.listChecks(id);
    const possession = checks.filter((c) => c.agent === "possession");
    const passed = possession.some((c) => Boolean(c.payload["passed"]));
    const userContinued = possession.some((c) => Boolean(c.payload["user_continued"]));
    if (!passed && !userContinued) {
      return fail(409, "not_verified", "Possession has not been proven for this listing.");
    }
    const verified = passed; // continue-anyway ⇒ live but unverified

    const updated = await repo.updateListing(id, {
      // Unverified go-live keeps no rank boost and no badge — the marketplace already ranks it below
      // verified listings and shows the subtler state.
      status: "live", verified, flowStep: "live", rankBoost: verified ? 1 : 0,
      ...(parsed.data.sizeChart ? { sizeChart: parsed.data.sizeChart } : {}),
    });
    // An unverified go-live must be in the review queue so a human can confirm possession later. The
    // continue-unverified route already created one; this backstops the direct-publish path.
    if (!verified) {
      const pending = (await repo.listPendingReviews()).some((r) => r.listingId === id);
      if (!pending) await repo.createReview({ listingId: id, status: "pending" });
    }
    const images = await repo.listImages(id);
    await repo.upsertPromise({
      listingId: id,
      frozen: {
        title: updated.title,
        price: updated.price,
        category: updated.category,
        sizeChart: updated.sizeChart ?? null,
        imageUrl: images.find((i) => i.kind === "catalog")?.url ?? null,
      },
    });
    await repo.appendAudit({
      listingId: id, actor: user.id, event: "listing_published",
      data: { verified, promiseFrozen: true, possession: passed ? "passed" : "user_continued" },
    });
    return ok({ listing: updated });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
