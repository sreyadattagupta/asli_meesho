// Grade a full size chart from ONE measured garment + the seller-declared true size, mirroring
// vlm-service/grading.py. Params are the fitted grade slopes (training/fit_grading.py), hosted on the
// HF Hub and synced into this bundled JSON at build time (scripts/sync-grading.mjs), so the chart
// renders even if the Hub or the VLM service is down. Anchor row = the measured garment, verbatim.
import params from "./grading.json";

export type GradeDim = "chest_cm" | "waist_cm" | "length_cm" | "shoulder_cm" | "sleeve_cm";
export const GRADE_SIZES = params.sizes as string[];

export interface GradedRow {
  size: string;
  chest_cm?: number; waist_cm?: number; length_cm?: number; shoulder_cm?: number; sleeve_cm?: number;
}
export interface GeneratedChart {
  sizes: GradedRow[];
  anchoredOn: string;
  sizedBy: GradeDim;
}

const ORD: Record<string, number> = Object.fromEntries(GRADE_SIZES.map((s, i) => [s, i]));

export function gradeChart(
  category: string,
  declaredSize: string,
  measured: Partial<Record<GradeDim, number>>,
): GeneratedChart {
  const cats = params.categories as Record<string, { dims: Record<string, { slope: number; intercept: number }>; sized_by: GradeDim }>;
  const cat = cats[category] ?? cats.top;
  const dOrd = ORD[declaredSize];
  if (dOrd === undefined) throw new Error(`unknown size ${declaredSize}`);
  const sizes: GradedRow[] = GRADE_SIZES.map((size) => {
    const row: GradedRow = { size };
    for (const [dim, p] of Object.entries(cat.dims)) {
      const base = measured[dim as GradeDim];
      if (base === undefined) continue;
      row[dim as GradeDim] = Math.round((base + p.slope * (ORD[size] - dOrd)) * 10) / 10;
    }
    return row;
  });
  return { sizes, anchoredOn: declaredSize, sizedBy: cat.sized_by };
}
