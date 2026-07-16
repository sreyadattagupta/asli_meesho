// Map real VLM/CV measurements → Meesho size taxonomy, per garment category.
//
// The size is DERIVED from the measured centimetres against the FITTED grade params
// (lib/grading.json — least-squares slopes over the published size-chart dataset, versioned on the
// HF Hub), so it changes with the garment: a narrow kurti and a wide one land on different rows.
// There is no hand-typed band table and no per-image prediction here — the model predicts each
// size's centimetres and we take the nearest. A dimension the CV pipeline did not measure yields
// NO size (null), never a fabricated label.

import type { MeasureResult } from "./vlmClient";
import params from "./grading.json";
import type { GradeDim } from "./grading";

export type MeeshoSize = "XS" | "S" | "M" | "L" | "XL" | "XXL" | "XXXL" | "4XL" | "Free Size";

type FittedDim = { slope: number; intercept: number };
type FittedCategory = { dims: Record<string, FittedDim>; sized_by: GradeDim };
const FITTED = params.categories as unknown as Record<string, FittedCategory>;

// Seller/marketplace category strings → the categories the fitted model actually grades. A category
// the model does not grade (saree cloth, jewellery, footwear) gets its measurements reported but no
// size label — a fixed S/M/L there would be fabricated.
const CATEGORY_ALIASES: Record<string, string> = {
  "": "top", top: "top", tops: "top", shirt: "top", tshirt: "top", "t-shirt": "top",
  kurti: "kurti", kurtis: "kurti", kurta: "kurti",
  dress: "dress", dresses: "dress", gown: "dress",
  bottom: "bottom", bottoms: "bottom", leggings: "bottom", pants: "bottom",
  trousers: "bottom", skirt: "bottom", jeans: "bottom",
};

export interface SizeChart {
  /** null when the sizing dimension was not measured, or the category is not graded by the model. */
  size: MeeshoSize | null;
  chestCm: number;
  lengthCm: number;
  waistCm: number;
  chestInches: number; // as-worn chest for the buyer-facing label
  confidence: number;
  sizedBy: "chest" | "waist" | "none";
}

/**
 * Nearest fitted size: the params predict cm = intercept + slope × size_ord for every size, so we
 * pick the size whose PREDICTED measurement is closest to the one we actually measured. Data-derived
 * (the slopes come from the graded dataset), not a hardcoded cutoff table.
 */
function sizeFromFit(cm: number, cat: FittedCategory, dim: GradeDim): MeeshoSize | null {
  const p = cat.dims[dim];
  if (!p || !(cm > 0)) return null; // unmeasured dimension ⇒ no size, never a guess
  let best: MeeshoSize | null = null;
  let bestErr = Infinity;
  (params.sizes as MeeshoSize[]).forEach((size, ord) => {
    const err = Math.abs(p.intercept + p.slope * ord - cm);
    if (err < bestErr) { bestErr = err; best = size; }
  });
  return best;
}

/**
 * Real measured cm → size label, using the fitted grade params. `category` selects the model row;
 * the model's own `sized_by` picks the dimension (tops → chest, bottoms → waist).
 * Returns `size: null` when nothing was measured or the category is not graded.
 * @deprecated Per-image labelling is superseded by declared-size grading (lib/grading.ts
 * `gradeChart`). Kept for the buyer SizeChartTable + store until they migrate to the graded chart.
 */
export function toSizeChart(m: MeasureResult, category?: string): SizeChart {
  const chest = m.chest_cm ?? 0;
  const length = m.length_cm ?? 0;
  const waist = m.waist_cm ?? 0;

  const key = CATEGORY_ALIASES[(category ?? "").toLowerCase().trim()];
  const cat = key ? FITTED[key] : undefined;
  const dim = cat?.sized_by;
  const measured = dim === "waist_cm" ? waist : chest;
  const size = cat && dim ? sizeFromFit(measured, cat, dim) : null;
  const sizedBy: SizeChart["sizedBy"] = !cat || !dim ? "none" : dim === "waist_cm" ? "waist" : "chest";

  return {
    size,
    chestCm: round1(chest),
    lengthCm: round1(length),
    waistCm: round1(waist),
    chestInches: Math.round((chest * 2) / 2.54),
    confidence: m.confidence,
    sizedBy,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Cross-image fusion (Agent 2 multi-image) ────────────────────────────────────────────────────
// Fuse N per-image garment measurements into one robust set (median per dimension) plus the
// agreement signals the confidence engine needs. Grading (lib/grading.ts `gradeChart`) turns the
// fused, seller-anchored measurement into a full chart; this fusion no longer picks a size band.

export interface PerImageMeasure {
  measurements: Partial<Record<GradeDim, number>>;
}
export interface FusedMeasure {
  measurements: Partial<Record<GradeDim, number>>;
  relSpread: Partial<Record<GradeDim, number>>;
  nImages: Partial<Record<GradeDim, number>>;
}

const FUSE_DIMS: GradeDim[] = ["chest_cm", "waist_cm", "length_cm", "shoulder_cm", "sleeve_cm"];

/** Median of a numeric list; the average of the two middles for even counts. */
export function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Median per dimension across images + the relative spread (stdev/mean) that feeds confidence. */
export function fuseMeasurements(images: PerImageMeasure[]): FusedMeasure {
  const measurements: FusedMeasure["measurements"] = {};
  const relSpread: FusedMeasure["relSpread"] = {};
  const nImages: FusedMeasure["nImages"] = {};
  for (const d of FUSE_DIMS) {
    const vals = images
      .map((im) => im.measurements[d])
      .filter((v): v is number => typeof v === "number" && v > 0);
    if (!vals.length) continue;
    const med = median(vals);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    measurements[d] = Math.round(med * 10) / 10;
    relSpread[d] = mean ? Math.round((std / mean) * 1000) / 1000 : 0;
    nImages[d] = vals.length;
  }
  return { measurements, relSpread, nImages };
}
