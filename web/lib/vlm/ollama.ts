// Self-hosted provider — proxies to the FastAPI + Ollama vlm-service ($0/call, local demo).
// Contract identical to the other providers; the service owns image compositing + prompting.
import type {
  MatchResult, MeasureResult, DeliveryResult, DeliveryPromiseInput, VlmProvider,
} from "./provider";

const VLM_URL = process.env.VLM_SERVICE_URL ?? "http://localhost:8000";
// Hard ceiling on a single VLM call. A cold-load / stuck model must never leave the seller
// blocked on an infinite spinner — the abort throws, which withDegradation() catches and falls
// back to the labelled MockProvider. Tunable so a slow CPU box can raise it (default 60s).
const HTTP_TIMEOUT_MS = Number(process.env.VLM_HTTP_TIMEOUT_MS ?? 60_000);

/** POST a multipart form to the VLM service with a bounded timeout (aborts on hang). */
async function postForm(path: string, form: FormData): Promise<Response> {
  const res = await fetch(`${VLM_URL}${path}`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`vlm ${path} ${res.status}: ${await res.text()}`);
  return res;
}

export class OllamaServiceProvider implements VlmProvider {
  name = "ollama" as const;

  async match(catalog: Blob, live: Blob, code: string): Promise<MatchResult> {
    const form = new FormData();
    form.append("catalog", catalog, "catalog.jpg");
    form.append("live", live, "live.jpg");
    form.append("code", code);
    const res = await postForm("/vlm/match", form);
    return res.json() as Promise<MatchResult>;
  }

  async measure(flatlay: Blob, referenceObject: "a4" | "tape"): Promise<MeasureResult> {
    const form = new FormData();
    form.append("flatlay", flatlay, "flatlay.jpg");
    form.append("reference_object", referenceObject);
    const res = await postForm("/vlm/measure", form);
    return res.json() as Promise<MeasureResult>;
  }

  async verifyDelivery(delivery: Blob, catalog: Blob, promise: DeliveryPromiseInput): Promise<DeliveryResult> {
    const form = new FormData();
    form.append("delivery", delivery, "delivery.jpg");
    form.append("catalog", catalog, "catalog.jpg");
    form.append("title", promise.title);
    form.append("category", promise.category);
    const res = await postForm("/vlm/verify_delivery", form);
    return res.json() as Promise<DeliveryResult>;
  }
}
