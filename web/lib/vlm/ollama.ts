// Self-hosted provider — proxies to the FastAPI + Ollama vlm-service ($0/call, local demo).
// Contract identical to the other providers; the service owns image compositing + prompting.
import type { MatchResult, MeasureResult, VlmProvider } from "./provider";

const VLM_URL = process.env.VLM_SERVICE_URL ?? "http://localhost:8000";

export class OllamaServiceProvider implements VlmProvider {
  name = "ollama" as const;

  async match(catalog: Blob, live: Blob, code: string): Promise<MatchResult> {
    const form = new FormData();
    form.append("catalog", catalog, "catalog.jpg");
    form.append("live", live, "live.jpg");
    form.append("code", code);
    const res = await fetch(`${VLM_URL}/vlm/match`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`vlm /match ${res.status}: ${await res.text()}`);
    return res.json() as Promise<MatchResult>;
  }

  async measure(flatlay: Blob, referenceObject: "a4" | "tape"): Promise<MeasureResult> {
    const form = new FormData();
    form.append("flatlay", flatlay, "flatlay.jpg");
    form.append("reference_object", referenceObject);
    const res = await fetch(`${VLM_URL}/vlm/measure`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`vlm /measure ${res.status}: ${await res.text()}`);
    return res.json() as Promise<MeasureResult>;
  }
}
