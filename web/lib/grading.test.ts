import { describe, it, expect } from "vitest";
import { gradeChart } from "./grading";

describe("gradeChart", () => {
  const measured = { chest_cm: 55, waist_cm: 47, length_cm: 68, shoulder_cm: 42, sleeve_cm: 23 };
  it("returns the measured row verbatim at the declared size", () => {
    const c = gradeChart("top", "XXL", measured);
    const row = c.sizes.find((r) => r.size === "XXL")!;
    expect(row.chest_cm).toBe(55);
  });
  it("grades one step down by the fitted slope", () => {
    const c = gradeChart("top", "XXL", measured);
    expect(c.sizes.find((r) => r.size === "XL")!.chest_cm).toBeCloseTo(52.5, 1);
  });
});
