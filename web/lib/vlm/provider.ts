// VlmProvider seam — one contract, three implementations (Gemini deployed · Ollama local · Mock).
// Selected by VLM_PROVIDER; wrapped in withDegradation so a real provider failure falls back to
// the labelled MockProvider and flips a module-level `degraded` flag the admin monitor reads.
import promptsJson from "../../../prompts/vlm-prompts.json";
import { MockProvider } from "./mock";
import { OllamaServiceProvider } from "./ollama";
import { GeminiProvider } from "./gemini";

export interface MatchResult {
  same_item: boolean;
  code_visible: boolean;
  confidence: number;
  reason: string;
  passed: boolean;
}

export interface MeasureResult {
  chest_cm: number;
  length_cm: number;
  waist_cm: number;
  reference_used: string;
  confidence: number;
}

export interface VlmProvider {
  name: "gemini" | "ollama" | "mock";
  match(catalog: Blob, live: Blob, code: string): Promise<MatchResult>;
  measure(flatlay: Blob, referenceObject: "a4" | "tape"): Promise<MeasureResult>;
}

// ---- single-sourced prompt rendering -------------------------------------
const prompts = promptsJson as { match_prompt: string; measure_prompt: string };
export function renderMatchPrompt(code: string): string {
  return prompts.match_prompt.split("{{code}}").join(code);
}
export function renderMeasurePrompt(reference: string): string {
  return prompts.measure_prompt.split("{{reference}}").join(reference);
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

/** Wrap a provider: on error retry once, then fall back to Mock and mark degraded. */
export function withDegradation(p: VlmProvider): VlmProvider {
  const fallback = new MockProvider();
  async function guard<T>(primary: () => Promise<T>, mock: () => Promise<T>): Promise<T> {
    try {
      return await primary();
    } catch {
      try {
        return await primary(); // one retry
      } catch {
        _degraded = true;
        return mock();
      }
    }
  }
  return {
    name: p.name,
    match: (c, l, code) => guard(() => p.match(c, l, code), () => fallback.match(c, l, code)),
    measure: (f, r) => guard(() => p.measure(f, r), () => fallback.measure(f, r)),
  };
}

export function getVlmProvider(): VlmProvider {
  switch (process.env.VLM_PROVIDER) {
    case "gemini": return withDegradation(new GeminiProvider());
    case "ollama": return withDegradation(new OllamaServiceProvider());
    default: return new MockProvider(); // labelled mock, no degradation needed
  }
}
