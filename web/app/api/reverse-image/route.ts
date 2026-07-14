import crypto from "crypto";
import { NextRequest } from "next/server";
import { verifyProduct, Agent1Error, type Agent1Result } from "@/lib/agent1Client";
import { isMockMode, mockTrigger } from "@/lib/trigger";
import { repoReady } from "@/lib/db";
import { fail, ok } from "@/lib/api";

// POST: catalog image → Agent 1 verification (invariant #1 — TRIGGER + evidence, never a verdict).
// The engine runs live reverse search, evidence extraction, cross-check and the trust score.
// With a listingId, persists the catalog image + an audit entry against the draft.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("catalog");
    if (!(file instanceof Blob)) return fail(400, "catalog_required", "Catalog image required.");
    const listingId =
      typeof form.get("listingId") === "string" ? (form.get("listingId") as string) : undefined;

    const buf = Buffer.from(await file.arrayBuffer());
    const imageHash = crypto.createHash("sha256").update(buf).digest("hex");

    // Offline-dev opt-in only (invariant: no fabricated data on real paths).
    if (isMockMode()) {
      const t = mockTrigger();
      await persist(listingId, file, buf, imageHash, t.triggered, t.matchCount);
      return ok({
        triggered: t.triggered, matchCount: t.matchCount, platforms: t.platforms,
        sources: t.sources, evidence: [], trustScore: null, band: null,
        explanation: "Offline mock trigger (TRIGGER_SOURCE=mock).", degraded: false, mocked: true,
      });
    }

    let result: Agent1Result;
    try {
      result = await verifyProduct(file, { listingId });
    } catch (e) {
      if (e instanceof Agent1Error)
        return fail(503, "agent1_unavailable", "Verification service is unavailable. Retry.");
      throw e;
    }

    await persist(listingId, file, buf, imageHash, result.triggered, result.evidence.length, result);

    // Back-compat shape (matchCount/platforms/sources) + new evidence fields.
    return ok({
      triggered: result.triggered,
      matchCount: result.evidence.length,
      platforms: result.platforms,
      sources: result.evidence.map((e) => e.link),
      evidence: result.evidence,
      signals: result.signals,
      trustScore: result.trustScore,
      band: result.band,
      explanation: result.explanation,
      degraded: result.degraded,
      mocked: false,
    });
  } catch {
    return fail(500, "internal", "Image check failed.");
  }
}

/** Persist the catalog image + audit trail + advance the flow step. No-op without a listingId. */
async function persist(
  listingId: string | undefined,
  file: Blob,
  buf: Buffer,
  imageHash: string,
  triggered: boolean,
  matchCount: number,
  result?: Agent1Result,
) {
  if (!listingId) return;
  const repo = await repoReady();
  const listing = await repo.getListing(listingId);
  if (!listing) return;
  // data URL keeps the demo self-contained (no blob storage in the declared stack)
  const url = `data:${file.type || "image/jpeg"};base64,${buf.toString("base64")}`;
  await repo.addImage({ listingId, url, imageHash, kind: "catalog" });
  await repo.updateListing(listingId, { flowStep: triggered ? "challenge" : "sizing" });
  await repo.appendAudit({
    listingId,
    actor: "trigger",
    event: "reverse_image_checked",
    data: {
      triggered,
      matchCount, // consumed by /api/asli/analyze → orchestrator reverseImageMatches signal
      trustScore: result?.trustScore ?? null,
      band: result?.band ?? null,
      evidence: result?.evidence.slice(0, 8) ?? [],
      degraded: result?.degraded ?? false,
    },
  });
}
