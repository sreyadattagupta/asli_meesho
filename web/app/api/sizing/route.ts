import crypto from "crypto";
import { vlmMeasure } from "@/lib/vlmClient";
import type { MeasureResult, MeasuredDims } from "@/lib/vlm/provider";
import { toSizeChart, fuseMeasurements, type PerImageMeasure } from "@/lib/sizing";
import { gradeChart, type GradeDim } from "@/lib/grading";
import { dimensionConfidence } from "@/lib/confidence";
import { repoReady } from "@/lib/db";
import { assertOwnedListing } from "@/lib/listingOwnership";
import { HttpError } from "@/lib/auth";
import { fail, ok } from "@/lib/api";

// Measurement waits on the CV service and fuses several images, so it runs longer than the
// platform default allows. Without this the function is cut off mid-measure and returns an HTML
// 504 the client cannot parse. Matches challenge and promise-keeper/check.
export const maxDuration = 120;

const DIMS: GradeDim[] = ["chest_cm", "waist_cm", "length_cm", "shoulder_cm", "sleeve_cm"];

// A measurement's structured dims — prefer the CV engine's `measurements`, else reconstruct from the
// flat cm fields so non-CV providers (gemini/mock) still fuse. Only real (>0) dims are kept.
function dimsOf(r: MeasureResult): MeasuredDims {
  if (r.measurements && Object.keys(r.measurements).length) return r.measurements;
  const out: MeasuredDims = {};
  for (const d of DIMS) {
    const v = (r as unknown as Record<string, number | null | undefined>)[d];
    if (typeof v === "number" && v > 0) out[d] = v;
  }
  return out;
}

// POST: one or more flat-lay photos + reference object → VLM measures EACH.
//   • Legacy path (no declaredSize): highest-confidence shot wins → toSizeChart band label.
//   • Graded path (declaredSize present): fuse ALL shots (median per dim) → grade a full XS–4XL chart
//     anchored on the seller-declared size → per-dimension confidence. No fabricated size on failure.
// Backward compatible: a single `flatlay` field and the legacy response fields still work.
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const flatlays = form.getAll("flatlay").filter((f): f is File => f instanceof Blob);
    const ref = form.get("reference_object");
    const listingId = typeof form.get("listingId") === "string" ? (form.get("listingId") as string) : undefined;
    const category = typeof form.get("category") === "string" ? (form.get("category") as string) : undefined;
    const declaredSize = typeof form.get("declaredSize") === "string" ? (form.get("declaredSize") as string) : undefined;

    if (flatlays.length === 0) return fail(400, "flatlay_required", "At least one flat-lay image required.");
    const referenceObject = ref === "tape" ? "tape" : "a4";

    // Measure every photo. A photo the CV pipeline couldn't measure comes back needs_retake (conf 0).
    const measured = await Promise.all(
      flatlays.map(async (blob) => ({ blob, result: await vlmMeasure(blob, referenceObject) })),
    );
    // Usable = the CV pipeline returned real, non-zero dimensions. A `chest_cm != null` check is not
    // enough: a 0 cm chest is non-null and would be graded as the smallest size, inventing a label
    // for a garment that was never actually measured.
    const usable = measured.filter(
      (m) => !(m.result.needs_retake ?? m.result.retake) && Object.keys(dimsOf(m.result)).length >= 2,
    );

    // No photo yielded a reliable measurement → ask for a retake, never invent a size.
    if (usable.length === 0) {
      const reason =
        measured.map((m) => m.result.reason).find(Boolean) ??
        "Couldn't measure the garment. Include a plain A4 sheet flat in the frame and retake.";
      return ok({
        needs_retake: true, retake: true, reason,
        chest_cm: null, length_cm: null, waist_cm: null,
        reference_used: referenceObject, confidence: 0,
        photosSubmitted: flatlays.length,
      });
    }

    const best = usable.reduce((a, b) => (b.result.confidence > a.result.confidence ? b : a));
    const result = best.result;
    const chart = toSizeChart(result, category);

    // Cross-image fusion (median per dim) over every usable shot — the graded chart's anchor input.
    const perImage: (PerImageMeasure & { signals?: MeasureResult["signals"] })[] = usable.map((m) => ({
      measurements: dimsOf(m.result),
      signals: m.result.signals,
    }));
    const fused = fuseMeasurements(perImage);

    // Graded chart + per-dimension confidence — only when the seller declared the true size.
    let graded:
      | { chart: ReturnType<typeof gradeChart>; confidence: { perDim: Partial<Record<GradeDim, number>>; overall: number } }
      | undefined;
    const measuredDims = DIMS.filter((d) => (fused.measurements[d] ?? 0) > 0);
    if (declaredSize && measuredDims.length >= 2) {
      const generated = gradeChart(category ?? "top", declaredSize, fused.measurements);
      const perDim: Partial<Record<GradeDim, number>> = {};
      for (const d of measuredDims) {
        const sig = perImage.map((p) => p.signals ?? ({} as NonNullable<MeasureResult["signals"]>));
        const avg = (k: keyof NonNullable<MeasureResult["signals"]>) =>
          sig.reduce((a, s) => a + ((s as unknown as Record<string, number>)[k as string] ?? 0), 0) / sig.length;
        perDim[d] = dimensionConfidence({
          nImages: fused.nImages[d] ?? 0,
          relSpread: fused.relSpread[d] ?? 0,
          segQuality: avg("seg_quality"),
          landmarkConf: avg("landmark_conf"),
          refAspectErr: avg("ref_aspect_err"),
          residual: avg("residual"),
          resolutionOk: avg("resolution_ok"),
        });
      }
      const vals = Object.values(perDim) as number[];
      const overall = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10000) / 10000 : 0;
      graded = { chart: generated, confidence: { perDim, overall } };
    }

    if (listingId) {
      // Writing to a listing requires owning it. Without this, any caller could name another shop's
      // listing and overwrite its measured size chart.
      await assertOwnedListing(listingId);
      const repo = await repoReady();
      const listing = await repo.getListing(listingId);
      if (listing) {
        // Persist every flat-lay to the listing gallery; the fused measurement drives the size record.
        for (const { blob } of measured) {
          const buf = Buffer.from(await blob.arrayBuffer());
          await repo.addImage({
            listingId,
            url: `data:${blob.type || "image/jpeg"};base64,${buf.toString("base64")}`,
            imageHash: crypto.createHash("sha256").update(buf).digest("hex"),
            kind: "flatlay",
          });
        }
        await repo.addMeasurement({
          listingId,
          chestCm: (fused.measurements.chest_cm ?? result.chest_cm) as number,
          lengthCm: (fused.measurements.length_cm ?? result.length_cm) as number,
          waistCm: (fused.measurements.waist_cm ?? result.waist_cm) as number,
          referenceUsed: result.reference_used ?? referenceObject,
          confidence: graded?.confidence.overall ?? result.confidence,
          mappedSize: declaredSize ?? chart.size,
        });
        await repo.appendAudit({
          listingId, actor: "smart-sizing", event: "size_measured",
          data: {
            measurements: fused.measurements, mappedSize: declaredSize ?? chart.size,
            declaredSize: declaredSize ?? null, category: category ?? null,
            photosSubmitted: flatlays.length, bestIndex: measured.indexOf(best),
            gradedConfidence: graded?.confidence.overall ?? null,
          },
        });
      }
    }

    // `photosSubmitted` + `bestIndex` let the UI flag which shot won; `chart`/`confidence`/`declaredSize`
    // are the graded outputs (null when the seller has not yet declared a size).
    return ok({
      ...result,
      size: chart.size,
      measurements: fused.measurements,
      declaredSize: declaredSize ?? null,
      chart: graded?.chart ?? null,
      confidence: graded ? graded.confidence : result.confidence,
      photosSubmitted: flatlays.length,
      bestIndex: measured.indexOf(best),
    });
  } catch (e) {
    // An auth/ownership refusal is not a VLM outage — reporting 502 would tell the seller to retry
    // something that will never succeed.
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(502, "vlm_unavailable", `Measurement failed: ${String(e)}`);
  }
}
