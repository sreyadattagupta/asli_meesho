// Map raw VLM measurements → Meesho size taxonomy.
// Auto-fills a standardized size chart from the flat-lay chest width (cm).

import type { MeasureResult } from "./vlmClient";

export type MeeshoSize = "XS" | "S" | "M" | "L" | "XL" | "XXL" | "XXXL";

// Flat-lay chest width (pit-to-pit) → label. As-worn chest ≈ 2 × flat width.
const CHART: Array<{ size: MeeshoSize; maxFlatChestCm: number }> = [
  { size: "XS", maxFlatChestCm: 44 },
  { size: "S", maxFlatChestCm: 48 },
  { size: "M", maxFlatChestCm: 52 },
  { size: "L", maxFlatChestCm: 56 },
  { size: "XL", maxFlatChestCm: 60 },
  { size: "XXL", maxFlatChestCm: 64 },
  { size: "XXXL", maxFlatChestCm: Infinity },
];

export interface SizeChart {
  size: MeeshoSize;
  chestCm: number;
  lengthCm: number;
  waistCm: number;
  chestInches: number; // as-worn chest for the buyer-facing label
  confidence: number;
}

export function toSizeChart(m: MeasureResult): SizeChart {
  const size =
    CHART.find((row) => m.chest_cm <= row.maxFlatChestCm)?.size ?? "XXXL";
  return {
    size,
    chestCm: round1(m.chest_cm),
    lengthCm: round1(m.length_cm),
    waistCm: round1(m.waist_cm),
    chestInches: Math.round((m.chest_cm * 2) / 2.54),
    confidence: m.confidence,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
