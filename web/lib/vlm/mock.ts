// Labelled mock VLM — deterministic, no network. Distinguishes a genuine live capture from a
// reused catalog image (byte-identical ⇒ no live proof) so the honest/thief demo paths differ.
import type { MatchResult, MeasureResult, VlmProvider } from "./provider";

export class MockProvider implements VlmProvider {
  name = "mock" as const;

  async match(catalog: Blob, live: Blob, _code: string): Promise<MatchResult> {
    const reused = catalog.size === live.size; // reused catalog image = not a live capture
    if (reused) {
      return {
        same_item: true, code_visible: false, confidence: 0.34,
        reason: "Live photo looks reused from the catalog — challenge code slip not detected.",
        passed: false,
      };
    }
    return {
      same_item: true, code_visible: true, confidence: 0.93,
      reason: "Live product matches the catalog and the challenge code is readable.",
      passed: true,
    };
  }

  async measure(_flatlay: Blob, referenceObject: "a4" | "tape"): Promise<MeasureResult> {
    return { chest_cm: 96, length_cm: 118, waist_cm: 88, reference_used: referenceObject, confidence: 0.9 };
  }
}
