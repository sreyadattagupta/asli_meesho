import { describe, it, expect } from "vitest";
import { fuseMeasurements, median, toSizeChart } from "./sizing";

const m = (chest: number, waist = 0, length = 0) => ({
  chest_cm: chest, waist_cm: waist, length_cm: length,
  reference_used: "a4" as const, confidence: 0.9,
});

describe("toSizeChart", () => {
  it("never labels a size when the garment was not measured", () => {
    // A zero/absent chest means the CV pipeline measured nothing — a band lookup would have
    // fabricated XS off `0 <= 42`. No measurement ⇒ no size.
    expect(toSizeChart(m(0), "kurti").size).toBeNull();
    expect(toSizeChart({ ...m(0), chest_cm: null }, "kurti").size).toBeNull();
  });

  it("derives the size from the Hub-fitted grade params, not a hand-typed band table", () => {
    // kurti chest: intercept 44.0 + slope 2.5/step ⇒ M (ord 2) predicts 49.0 cm.
    expect(toSizeChart(m(49), "kurti").size).toBe("M");
    expect(toSizeChart(m(44), "kurti").size).toBe("XS");
  });

  it("moves the label as the measured centimetres move", () => {
    const sizes = [44, 49, 54, 59].map((c) => toSizeChart(m(c), "kurti").size);
    expect(new Set(sizes).size).toBe(4); // every measurement lands on its own size
  });

  it("sizes bottoms by waist, per the fitted params' sized_by", () => {
    const c = toSizeChart(m(0, 34), "leggings");
    expect(c.sizedBy).toBe("waist");
    expect(c.size).toBe("M"); // bottom waist: intercept 30.0 + 2.0/step ⇒ M = 34.0
  });

  it("returns no size for categories the fitted model does not grade", () => {
    expect(toSizeChart(m(50), "jewellery").size).toBeNull();
  });
});

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
