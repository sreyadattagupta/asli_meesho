// VlmProvider seam — one contract, three implementations (Gemini deployed · Ollama local · Mock).
// Selected by VLM_PROVIDER; wrapped in withDegradation so a real provider failure falls back to
// the labelled MockProvider and flips a module-level `degraded` flag the admin monitor reads.
import promptsJson from "../../../prompts/vlm-prompts.json";
import { MockProvider } from "./mock";
import { OllamaServiceProvider } from "./ollama";
import { GeminiProvider } from "./gemini";

export interface MatchSignals {
  cosine: number;
  method: "clip" | "phash";
  color_match?: boolean;
  code_source?: "vlm" | "ocr" | "none";
  code_score?: number;
  ocr_available?: boolean;
  blur_var?: number;
  reuse_suspect?: boolean;
  quality_ok?: boolean;
}

export interface MatchResult {
  same_item: boolean;
  code_visible: boolean;
  confidence: number;
  reason: string;
  passed: boolean;
  /** Explainability signals from the production pipeline (service provider). Optional so
   *  the Gemini/mock providers satisfy the contract without the CV service. */
  signals?: MatchSignals;
}

export interface MeasureSignals {
  method: "homography" | "ratio" | "none";
  ref_aspect_err?: number;
  residual?: number;
  box_sanity?: number;
  quality_ok?: boolean;
  blur_var?: number;
}

export interface MeasureResult {
  chest_cm: number;
  length_cm: number;
  waist_cm: number;
  reference_used: string;
  confidence: number;
  /** Explainability signals from the metrology pipeline (service provider). Optional. */
  signals?: MeasureSignals;
}

export interface DeliveryPromiseInput {
  title: string;
  category: string;
}

export interface DeliveryResult {
  same_product: boolean;
  cosine: number;
  observed: { category?: string; count?: number; color?: string };
  reason: string;
  method?: "clip" | "phash";
}

export interface VlmProvider {
  name: "gemini" | "ollama" | "mock";
  match(catalog: Blob, live: Blob, code: string): Promise<MatchResult>;
  measure(flatlay: Blob, referenceObject: "a4" | "tape"): Promise<MeasureResult>;
  /** Agent 4 — delivery photo vs frozen catalog + promised attributes. */
  verifyDelivery(delivery: Blob, catalog: Blob, promise: DeliveryPromiseInput): Promise<DeliveryResult>;
}

// ---- single-sourced prompt rendering -------------------------------------
const prompts = promptsJson as { match_prompt: string; measure_prompt: string; delivery_prompt: string };
export function renderMatchPrompt(code: string): string {
  return prompts.match_prompt.split("{{code}}").join(code);
}
export function renderMeasurePrompt(reference: string): string {
  return prompts.measure_prompt.split("{{reference}}").join(reference);
}
export function renderDeliveryPrompt(title: string, category: string): string {
  return prompts.delivery_prompt.split("{{title}}").join(title).split("{{category}}").join(category);
}

/** Defensive JSON parse — strips ``` fences and trailing prose the model may add. */
export function parseJsonLoose<T>(text: string): T {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object in model output");
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

// ---- degradation wrapper --------------------------------------------------
let _degraded = false;
export function vlmDegraded(): boolean { return _degraded; }
export function __resetDegraded(): void { _degraded = false; }

/** A hard FAIL-CLOSED possession result. When the real VLM is unreachable/timing out we must NOT
 *  fall back to a permissive mock that reports a pass — a possession gate that fails OPEN would let
 *  any photo through (the "accepts any dress" bug). The seller retries with a fresh code instead. */
function failClosedMatch(): MatchResult {
  return {
    same_item: false,
    code_visible: false,
    confidence: 0,
    reason: "Verification service is temporarily unavailable — please retake the photo and try again.",
    passed: false,
  };
}

/** Wrap a provider: on error retry once, then degrade. match() FAILS CLOSED (never auto-passes);
 *  the non-security calls (measure/verifyDelivery) degrade to the labelled Mock. */
export function withDegradation(p: VlmProvider): VlmProvider {
  const fallback = new MockProvider();
  async function guard<T>(primary: () => Promise<T>, onFail: () => Promise<T>): Promise<T> {
    try {
      return await primary();
    } catch {
      try {
        return await primary(); // one retry
      } catch {
        _degraded = true;
        return onFail();
      }
    }
  }
  return {
    name: p.name,
    // Possession: fail CLOSED — degradation must never turn into a silent auto-accept.
    match: (c, l, code) => guard(() => p.match(c, l, code), async () => failClosedMatch()),
    measure: (f, r) => guard(() => p.measure(f, r), () => fallback.measure(f, r)),
    verifyDelivery: (d, c, pr) =>
      guard(() => p.verifyDelivery(d, c, pr), () => fallback.verifyDelivery(d, c, pr)),
  };
}

export function getVlmProvider(): VlmProvider {
  switch (process.env.VLM_PROVIDER) {
    case "gemini": return withDegradation(new GeminiProvider());
    case "ollama": return withDegradation(new OllamaServiceProvider());
    default: return new MockProvider(); // labelled mock, no degradation needed
  }
}
