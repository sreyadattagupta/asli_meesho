// TS mirror of vlm-service/calibration.dimension_confidence — same monotone, bounded map, so the
// deployed route computes per-dimension confidence even if the VLM service is unreachable.
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function dimensionConfidence(p: {
  nImages: number; relSpread: number; segQuality: number; landmarkConf: number;
  refAspectErr: number; residual: number; resolutionOk?: number;
}): number {
  const coverage = 1 - Math.exp(-0.9 * Math.max(0, p.nImages));
  const agreement = sigmoid(14 * (0.1 - clamp01(p.relSpread)));
  const geometry = sigmoid(12 * (0.18 - p.refAspectErr)) * sigmoid(10 * (0.3 - p.residual));
  const conf =
    0.05 + 0.3 * coverage + 0.25 * agreement + 0.2 * geometry +
    0.1 * clamp01(p.segQuality) + 0.07 * clamp01(p.landmarkConf) + 0.03 * clamp01(p.resolutionOk ?? 1);
  return Math.round(clamp01(conf) * 10000) / 10000;
}
