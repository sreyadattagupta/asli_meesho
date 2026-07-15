import { describe, it, expect } from "vitest";
import { fuseMeasurements, median } from "./sizing";

describe("fuseMeasurements", () => {
  it("takes the median per dimension and counts images", () => {
    const fused = fuseMeasurements([
      { measurements: { chest_cm: 54, waist_cm: 46 } },
      { measurements: { chest_cm: 55, waist_cm: 47 } },
      { measurements: { chest_cm: 56, waist_cm: 48 } },
    ]);
    expect(fused.measurements.chest_cm).toBe(55);
    expect(fused.nImages.chest_cm).toBe(3);
  });
  it("reports higher relative spread when images disagree", () => {
    const tight = fuseMeasurements([{ measurements: { chest_cm: 55 } }, { measurements: { chest_cm: 55.2 } }]);
    const loose = fuseMeasurements([{ measurements: { chest_cm: 50 } }, { measurements: { chest_cm: 60 } }]);
    expect(loose.relSpread.chest_cm!).toBeGreaterThan(tight.relSpread.chest_cm!);
  });
  it("median of two returns the mean", () => { expect(median([4, 6])).toBe(5); });
});
