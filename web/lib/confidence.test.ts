import { describe, it, expect } from "vitest";
import { dimensionConfidence } from "./confidence";

describe("dimensionConfidence", () => {
  it("matches the Python calibration.dimension_confidence value (parity)", () => {
    // vlm-service: dimension_confidence(3, 0.03, 0.8, 0.85, 0.05, 0.1, 1.0) -> 0.8267
    const v = dimensionConfidence({
      nImages: 3, relSpread: 0.03, segQuality: 0.8, landmarkConf: 0.85,
      refAspectErr: 0.05, residual: 0.1, resolutionOk: 1.0,
    });
    expect(v).toBeCloseTo(0.8267, 4);
  });
  it("is monotone: more images ↑, disagreement ↓", () => {
    const few = dimensionConfidence({ nImages: 1, relSpread: 0, segQuality: 0.8, landmarkConf: 0.8, refAspectErr: 0.05, residual: 0.1 });
    const many = dimensionConfidence({ nImages: 4, relSpread: 0, segQuality: 0.8, landmarkConf: 0.8, refAspectErr: 0.05, residual: 0.1 });
    const loose = dimensionConfidence({ nImages: 4, relSpread: 0.25, segQuality: 0.8, landmarkConf: 0.8, refAspectErr: 0.05, residual: 0.1 });
    expect(many).toBeGreaterThanOrEqual(few);
    expect(loose).toBeLessThan(many);
  });
});
