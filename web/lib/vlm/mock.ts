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
    // No hardcoded size. Real measurement needs the CV sizing service (detect.py → metrology). With
    // no service configured we ask for a retake rather than fabricating a chart (the old 96/118/88
    // → always-XXXL bug). Configure VLM_PROVIDER=ollama with the vlm-service running to measure.
    return {
      needs_retake: true,
      reason: "Live sizing needs the CV measurement service. Start vlm-service (VLM_PROVIDER=ollama) "
        + "to measure this garment from the photo.",
      chest_cm: null, length_cm: null, waist_cm: null,
      reference_used: referenceObject, confidence: 0,
    };
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
