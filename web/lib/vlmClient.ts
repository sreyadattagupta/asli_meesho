// Server-side VLM entry point — delegates to the VlmProvider seam (Gemini · Ollama · Mock),
// selected by VLM_PROVIDER and wrapped with graceful degradation. API routes call these.
import {
  getVlmProvider, type MatchResult, type MeasureResult,
  type DeliveryResult, type DeliveryPromiseInput,
} from "./vlm/provider";

export type { MatchResult, MeasureResult, DeliveryResult };

/** Agent 1 — possession proof. */
export function vlmMatch(catalog: Blob, live: Blob, code: string): Promise<MatchResult> {
  return getVlmProvider().match(catalog, live, code);
}

/** Agent 2 — smart sizing. */
export function vlmMeasure(flatlay: Blob, referenceObject: "a4" | "tape" = "a4"): Promise<MeasureResult> {
  return getVlmProvider().measure(flatlay, referenceObject);
}

/** Agent 4 — delivery vs frozen promise. */
export function vlmVerifyDelivery(
  delivery: Blob, catalog: Blob, promise: DeliveryPromiseInput,
): Promise<DeliveryResult> {
  return getVlmProvider().verifyDelivery(delivery, catalog, promise);
}
