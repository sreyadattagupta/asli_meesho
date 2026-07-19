import { describe, expect, it } from "vitest";
import { checkPromise, type FrozenPromise } from "./promiseKeeper";

const frozen: FrozenPromise = {
  title: "Anarkali Kurti Violet Block Print", price: 449, category: "kurtis",
  sizeChart: { chest_cm: 96, length_cm: 118, waist_cm: 88 }, imageUrl: "/mock/delivery/order-catalog.jpg",
};

describe("checkPromise — identity hard gate", () => {
  it("kept only when the SAME product arrives, category agrees, and size holds", () => {
    const v = checkPromise(frozen, {
      photoPresent: true, cosine: 0.9, sameProduct: true, observedCategory: "kurtis",
      observedSize: { chest_cm: 96, length_cm: 118, waist_cm: 88 },
    });
    expect(v.status).toBe("PROMISE_KEPT");
    expect(v.promiseKept).toBe(true);
    expect(v.confidence).toBeGreaterThan(0.85);
    expect(v.updateTrustScore).toBe(true);
    expect(v.mismatches).toHaveLength(0);
  });

  // The reported production bug: a completely different product (T-shirt) must NEVER be "kept".
  it("a different product ⇒ PRODUCT_MISMATCH, score 0, no trust update", () => {
    const v = checkPromise(
      { ...frozen, title: "Radha Krishna printed kurta", category: "kurtis" },
      { photoPresent: true, cosine: 0.28, sameProduct: false, observedCategory: "tshirt" },
    );
    expect(v.status).toBe("PRODUCT_MISMATCH");
    expect(v.promiseKept).toBe(false);
    expect(v.score).toBe(0);
    expect(v.updateTrustScore).toBe(false);
    expect(v.requiresRetake).toBe(true);
    expect(v.mismatchCodes).toContain("identity_mismatch");
    expect(v.mismatchCodes).toContain("category_mismatch");
  });

  // Regression: verification unavailable (no catalog image / CV down) used to default OPEN at 45%.
  it("no verification signal ⇒ RETAKE, never a silent pass", () => {
    const v = checkPromise(frozen, { photoPresent: true }); // sameProduct undefined, no cosine
    expect(v.status).toBe("RETAKE_PHOTO");
    expect(v.promiseKept).toBe(false);
    expect(v.score).toBe(0);
    expect(v.updateTrustScore).toBe(false);
  });

  it("a garment-category conflict fails even if the embedding says same", () => {
    const v = checkPromise(frozen, {
      photoPresent: true, cosine: 0.85, sameProduct: true, observedCategory: "sarees",
    });
    expect(v.status).toBe("PRODUCT_MISMATCH");
    expect(v.promiseKept).toBe(false);
    expect(v.mismatchCodes).toContain("category_mismatch");
    expect(v.updateTrustScore).toBe(false);
  });

  it("same product but low confidence ⇒ REQUIRES_REVIEW, not approved", () => {
    const v = checkPromise(frozen, {
      photoPresent: true, cosine: 0.55, sameProduct: true, observedCategory: "kurtis",
    });
    expect(v.status).toBe("REQUIRES_REVIEW");
    expect(v.promiseKept).toBe(false);
    expect(v.score).toBe(0);
    expect(v.updateTrustScore).toBe(false);
  });

  it("right product but size drift > 2cm ⇒ PROMISE_BROKEN (seller penalised)", () => {
    const v = checkPromise(frozen, {
      photoPresent: true, cosine: 0.9, sameProduct: true, observedCategory: "kurtis",
      observedSize: { chest_cm: 100, length_cm: 118, waist_cm: 88 },
    });
    expect(v.status).toBe("PROMISE_BROKEN");
    expect(v.promiseKept).toBe(false);
    expect(v.updateTrustScore).toBe(true);
    expect(v.mismatches.some((m) => /chest off by 4\.0 cm/.test(m))).toBe(true);
  });

  it("no photo ⇒ NO_PHOTO, not kept", () => {
    const v = checkPromise(frozen, { photoPresent: false });
    expect(v.status).toBe("NO_PHOTO");
    expect(v.promiseKept).toBe(false);
    expect(v.confidence).toBe(0.3);
    expect(v.updateTrustScore).toBe(false);
  });

  // Production crashed here: the CV service returns `category: null` when the VLM attribute read
  // fails, null slips past an `!== undefined` guard, and the buyer got
  // "Verification failed: TypeError: Cannot read properties of null (reading 'toLowerCase')".
  it("survives a null attribute read and still honours the identity signal", () => {
    const v = checkPromise(frozen, {
      photoPresent: true, sameProduct: true, cosine: 0.9,
      observedCategory: null, observedCount: null, observedSize: null,
    });
    expect(v.status).toBe("PROMISE_KEPT");
    expect(v.promiseKept).toBe(true);
  });

  it("treats an unread category as no evidence, not as a conflict", () => {
    const v = checkPromise(frozen, {
      photoPresent: true, sameProduct: false, cosine: 0.2, observedCategory: null,
    });
    expect(v.status).toBe("PRODUCT_MISMATCH");
    expect(v.mismatchCodes).not.toContain("category_mismatch"); // identity failed it, not the null
  });

  it("does not read an unread count as zero items delivered", () => {
    const v = checkPromise(frozen, {
      photoPresent: true, sameProduct: true, cosine: 0.9, observedCount: null,
    });
    expect(v.mismatchCodes).not.toContain("count_mismatch");
    expect(v.status).toBe("PROMISE_KEPT");
  });

  it("never assigns a similarity percentage to a non-verified state", () => {
    for (const obs of [
      { photoPresent: true, sameProduct: false as const, cosine: 0.4, observedCategory: "tshirt" },
      { photoPresent: true }, // unavailable
      { photoPresent: true, sameProduct: true as const, cosine: 0.5, observedCategory: "kurtis" }, // review
    ]) {
      expect(checkPromise(frozen, obs).score).toBe(0);
    }
  });
});
