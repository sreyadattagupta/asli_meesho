import { describe, expect, it } from "vitest";
import { checkPromise, type FrozenPromise } from "./promiseKeeper";

const frozen: FrozenPromise = {
  title: "Anarkali Kurti Violet Block Print", price: 449, category: "kurtis",
  sizeChart: { chest_cm: 96, length_cm: 118, waist_cm: 88 }, imageUrl: "/mock/kurtis-1.svg",
};

describe("checkPromise", () => {
  it("kept when delivery matches", () => {
    const v = checkPromise(frozen, {
      photoPresent: true, titleSeen: "Anarkali Kurti Violet Block Print",
      observedSize: { chest_cm: 96, length_cm: 118, waist_cm: 88 },
    });
    expect(v.promiseKept).toBe(true);
    expect(v.confidence).toBeCloseTo(0.9);
    expect(v.mismatches).toHaveLength(0);
  });

  it("flags size drift > 2cm", () => {
    const v = checkPromise(frozen, {
      photoPresent: true, titleSeen: frozen.title,
      observedSize: { chest_cm: 100, length_cm: 118, waist_cm: 88 },
    });
    expect(v.promiseKept).toBe(false);
    expect(v.mismatches[0]).toMatch(/chest off by 4\.0 cm/);
    expect(v.confidence).toBeCloseTo(0.75);
  });

  it("no photo ⇒ low-confidence, not kept", () => {
    const v = checkPromise(frozen, { photoPresent: false });
    expect(v.promiseKept).toBe(false);
    expect(v.confidence).toBe(0.3);
  });

  it("flags a different product name", () => {
    const v = checkPromise(frozen, {
      photoPresent: true, titleSeen: "Plain Cotton Bedsheet Blue",
      observedSize: { chest_cm: 96, length_cm: 118, waist_cm: 88 },
    });
    expect(v.mismatches).toContain("delivered a different product name");
  });
});
