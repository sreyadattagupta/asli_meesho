// Labelled mock VLM — deterministic, no network. Distinguishes a genuine live capture from a
// reused catalog image (byte-identical ⇒ no live proof) so the honest/thief demo paths differ.
import type {
  MatchResult, MeasureResult, DeliveryResult, DeliveryPromiseInput, VlmProvider,
} from "./provider";

export class MockProvider implements VlmProvider {
  name = "mock" as const;

  async match(catalog: Blob, live: Blob, code: string): Promise<MatchResult> {
    // Code is typed + text-verified upstream; a non-empty code here is already confirmed.
    const codeVisible = Boolean(code.trim());
    const reused = catalog.size === live.size; // reused catalog image = not a live capture
    if (reused) {
      return {
        same_item: true, code_visible: codeVisible, confidence: 0.34,
        reason: "Live photo looks reused from the catalog — not a fresh capture of the product.",
        passed: false,
      };
    }
    return {
      same_item: true, code_visible: codeVisible, confidence: 0.93,
      reason: "Live product matches the catalog and the code was entered correctly.",
      passed: codeVisible,
    };
  }

  async measure(_flatlay: Blob, referenceObject: "a4" | "tape"): Promise<MeasureResult> {
    return { chest_cm: 96, length_cm: 118, waist_cm: 88, reference_used: referenceObject, confidence: 0.9 };
  }

  async verifyDelivery(delivery: Blob, catalog: Blob, _promise: DeliveryPromiseInput): Promise<DeliveryResult> {
    // Byte-identical delivery == the frozen catalog image ⇒ same product (the seeded match case);
    // a different-sized photo stands in for a genuine mismatch. Labelled, deterministic.
    const same = delivery.size === catalog.size;
    return same
      ? { same_product: true, cosine: 0.94, observed: { count: 1 }, reason: "Delivery matches the listing photo.", method: "phash" }
      : { same_product: false, cosine: 0.31, observed: { count: 1 }, reason: "Delivery photo differs from the listing.", method: "phash" };
  }
}
