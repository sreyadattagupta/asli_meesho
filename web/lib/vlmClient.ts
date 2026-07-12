// HTTP client → our self-hosted vlm-service (FastAPI + Ollama).
// Server-side only. API routes proxy multipart form-data through here.

const VLM_URL = process.env.VLM_SERVICE_URL ?? "http://localhost:8000";

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

/** Agent 1 — possession proof. POST /vlm/match (catalog + live + code). */
export async function vlmMatch(
  catalog: Blob,
  live: Blob,
  code: string,
): Promise<MatchResult> {
  const form = new FormData();
  form.append("catalog", catalog, "catalog.jpg");
  form.append("live", live, "live.jpg");
  form.append("code", code);

  const res = await fetch(`${VLM_URL}/vlm/match`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`vlm /match ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Agent 2 — smart sizing. POST /vlm/measure (flatlay + reference_object). */
export async function vlmMeasure(
  flatlay: Blob,
  referenceObject: "a4" | "tape" = "a4",
): Promise<MeasureResult> {
  const form = new FormData();
  form.append("flatlay", flatlay, "flatlay.jpg");
  form.append("reference_object", referenceObject);

  const res = await fetch(`${VLM_URL}/vlm/measure`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`vlm /measure ${res.status}: ${await res.text()}`);
  return res.json();
}
