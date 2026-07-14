import { describe, expect, it } from "vitest";
import { checkPromise, type FrozenPromise } from "./promiseKeeper";

const frozen: FrozenPromise = {
  title: "Anarkali Kurti Violet Block Print", price: 449, category: "kurtis",
  sizeChart: { chest_cm: 96, length_cm: 118, waist_cm: 88 }, imageUrl: "/mock/delivery/order-catalog.jpg",
};

describe("checkPromise", () => {
  it("kept when delivery matches product + category + size", () => {
    const v = checkPromise(frozen, {
      photoPresent: true, cosine: 0.9, sameProduct: true, observedCategory: "kurtis",
      observedSize: { chest_cm: 96, length_cm: 118, waist_cm: 88 },
    });
    expect(v.promiseKept).toBe(true);
    expect(v.confidence).toBeGreaterThan(0.85);
    expect(v.mismatches).toHaveLength(0);
  });

  it("flags size drift > 2cm", () => {
    const v = checkPromise(frozen, {
      photoPresent: true, cosine: 0.9, sameProduct: true, observedCategory: "kurtis",
      observedSize: { chest_cm: 100, length_cm: 118, waist_cm: 88 },
    });
    expect(v.promiseKept).toBe(false);
    expect(v.mismatches.some((m) => /chest off by 4\.0 cm/.test(m))).toBe(true);
  });

  it("no photo ⇒ low-confidence, not kept", () => {
    const v = checkPromise(frozen, { photoPresent: false });
    expect(v.promiseKept).toBe(false);
    expect(v.confidence).toBe(0.3);
  });

  it("flags a different product (image mismatch)", () => {
    const v = checkPromise(frozen, {
      photoPresent: true, cosine: 0.3, sameProduct: false, observedCategory: "kurtis",
    });
    expect(v.promiseKept).toBe(false);
    expect(v.mismatches).toContain("delivered item does not match the listing photo");
    expect(v.confidence).toBeLessThan(0.5);
  });

  it("flags a category mismatch", () => {
    const v = checkPromise(frozen, {
      photoPresent: true, cosine: 0.85, sameProduct: true, observedCategory: "sarees",
    });
    expect(v.promiseKept).toBe(false);
    expect(v.mismatches.some((m) => /category differs/.test(m))).toBe(true);
  });

  it("confidence rises with image similarity", () => {
    const lo = checkPromise(frozen, { photoPresent: true, cosine: 0.5, sameProduct: true, observedCategory: "kurtis" });
    const hi = checkPromise(frozen, { photoPresent: true, cosine: 0.95, sameProduct: true, observedCategory: "kurtis" });
    expect(hi.confidence).toBeGreaterThan(lo.confidence);
  });
});
