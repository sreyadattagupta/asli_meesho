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

    // ✓ Asli Verified requires a passing possession check (Agent 1 ∧ Agent 2 upstream).
    const checks = await repo.listChecks(id);
    const passed = checks.some((c) => c.agent === "possession" && Boolean(c.payload["passed"]));
    if (!passed) return fail(409, "not_verified", "Possession has not been proven for this listing.");

    const updated = await repo.updateListing(id, {
      status: "live", verified: true, flowStep: "live", rankBoost: 1,
      ...(parsed.data.sizeChart ? { sizeChart: parsed.data.sizeChart } : {}),
    });
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
      data: { verified: true, promiseFrozen: true },
    });
    return ok({ listing: updated });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
