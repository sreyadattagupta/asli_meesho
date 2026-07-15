// Map real VLM/CV measurements → Meesho size taxonomy, per garment category.
//
// The size is DERIVED from the measured centimetres, so it changes with the garment: a narrow
// kurti and a wide one land on different rows. There are no fixed per-image predictions here — the
// only constants are the published garment-industry size bands (real charts), and which body
// dimension a category is sized by (tops → chest, bottoms → waist).

import type { MeasureResult } from "./vlmClient";
import type { GradeDim } from "./grading";

export type MeeshoSize = "XS" | "S" | "M" | "L" | "XL" | "XXL" | "XXXL" | "4XL" | "Free Size";

type Band = { size: MeeshoSize; maxCm: number };

// Flat-lay chest width (pit-to-pit) → label. As-worn chest ≈ 2 × flat width; these bands are the
// standard women's apparel grade (e.g. flat chest 44 cm ≈ 34" bust = S).
const CHEST_BANDS: Band[] = [
  { size: "XS", maxCm: 42 },
  { size: "S", maxCm: 46 },
  { size: "M", maxCm: 50 },
  { size: "L", maxCm: 54 },
  { size: "XL", maxCm: 58 },
  { size: "XXL", maxCm: 62 },
  { size: "XXXL", maxCm: Infinity },
];

// Flat-lay waist width → label, for bottoms (leggings, pants, skirts).
const WAIST_BANDS: Band[] = [
  { size: "XS", maxCm: 33 },
  { size: "S", maxCm: 37 },
  { size: "M", maxCm: 41 },
  { size: "L", maxCm: 45 },
  { size: "XL", maxCm: 49 },
  { size: "XXL", maxCm: 53 },
  { size: "XXXL", maxCm: Infinity },
];

// Which dimension sizes each category. Anything not apparel-graded (saree cloth, jewellery,
// footwear) reports its measurements but a "Free Size" label — a fixed S/M/L would be fabricated.
const CHEST_CATEGORIES = new Set(["kurtis", "kurti", "dress", "dresses", "tops", "top", "shirt"]);
const WAIST_CATEGORIES = new Set(["bottoms", "bottom", "leggings", "pants", "trousers", "skirt"]);

export interface SizeChart {
  size: MeeshoSize;
  chestCm: number;
  lengthCm: number;
  waistCm: number;
  chestInches: number; // as-worn chest for the buyer-facing label
  confidence: number;
  sizedBy: "chest" | "waist" | "none";
}

function bandFor(cm: number, bands: Band[]): MeeshoSize {
  return bands.find((b) => cm <= b.maxCm)?.size ?? bands[bands.length - 1].size;
}

/**
 * Real cm → size label. `category` selects the grading dimension; unknown/non-apparel ⇒ Free Size.
 * @deprecated Per-image band lookup is superseded by declared-size grading (lib/grading.ts
 * `gradeChart`). Kept for the buyer SizeChartTable + store until they migrate to the graded chart.
 */
export function toSizeChart(m: MeasureResult, category?: string): SizeChart {
  const chest = m.chest_cm ?? 0;
  const length = m.length_cm ?? 0;
  const waist = m.waist_cm ?? 0;
  const cat = (category ?? "").toLowerCase();

  let size: MeeshoSize;
  let sizedBy: SizeChart["sizedBy"];
  if (WAIST_CATEGORIES.has(cat)) {
    size = bandFor(waist, WAIST_BANDS);
    sizedBy = "waist";
  } else if (CHEST_CATEGORIES.has(cat) || cat === "") {
    // Default to chest grading for apparel tops (and when category is unknown).
    size = bandFor(chest, CHEST_BANDS);
    sizedBy = "chest";
  } else {
    size = "Free Size";
    sizedBy = "none";
  }

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
