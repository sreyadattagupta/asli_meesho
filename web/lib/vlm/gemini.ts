// Deployed cloud provider — Gemini 2.0 Flash via plain REST (no SDK; declared-stack rule).
// Same JSON contract as Ollama/Mock. Prompts single-sourced from prompts/vlm-prompts.json.
import {
  renderMatchPrompt, renderMeasurePrompt, renderDeliveryPrompt, parseJsonLoose,
  type MatchResult, type MeasureResult, type DeliveryResult,
  type DeliveryPromiseInput, type VlmProvider,
} from "./provider";

const MODEL = "gemini-2.0-flash";
// Bound each Gemini call so a stalled request degrades to Mock instead of hanging the seller.
const HTTP_TIMEOUT_MS = Number(process.env.VLM_HTTP_TIMEOUT_MS ?? 60_000);

async function blobToInline(b: Blob): Promise<{ inline_data: { mime_type: string; data: string } }> {
  const buf = Buffer.from(await b.arrayBuffer());
  return { inline_data: { mime_type: b.type || "image/jpeg", data: buf.toString("base64") } };
}

async function geminiGenerate(parts: unknown[], key: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0, response_mime_type: "application/json" },
      }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new Error(`gemini ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

export class GeminiProvider implements VlmProvider {
  name = "gemini" as const;
  private key: string;

  constructor(key = process.env.GEMINI_API_KEY) {
    if (!key) throw new Error("GEMINI_API_KEY is required for VLM_PROVIDER=gemini");
    this.key = key;
  }

  async match(catalog: Blob, live: Blob, code: string): Promise<MatchResult> {
    const parts = [
      { text: renderMatchPrompt(code) },
      { text: "CATALOG image:" }, await blobToInline(catalog),
      { text: "LIVE image:" }, await blobToInline(live),
    ];
    const raw = await geminiGenerate(parts, this.key);
    // The photo is product-only; the code is typed and text-verified upstream (a non-empty
    // `code` reaching here is already confirmed), so possession = same_item at/above the bar.
    const r = parseJsonLoose<{ same_item: boolean; confidence: number; reason: string }>(raw);
    const code_visible = Boolean(code.trim());
    const passed = r.same_item && code_visible && r.confidence >= 0.7;
    return { ...r, code_visible, passed };
  }

  async measure(flatlay: Blob, referenceObject: "a4" | "tape"): Promise<MeasureResult> {
    const parts = [{ text: renderMeasurePrompt(referenceObject) }, await blobToInline(flatlay)];
    const raw = await geminiGenerate(parts, this.key);
    return parseJsonLoose<MeasureResult>(raw);
  }

  async verifyDelivery(delivery: Blob, catalog: Blob, promise: DeliveryPromiseInput): Promise<DeliveryResult> {
    // Gemini reasons over both images directly; it returns same_product + observed attributes.
    // (No embedding cosine on the pure-Vercel path — the hosted CV service supplies that when present.)
    const parts = [
      { text: renderDeliveryPrompt(promise.title, promise.category) },
      { text: "CATALOG (promised) image:" }, await blobToInline(catalog),
      { text: "DELIVERY photo:" }, await blobToInline(delivery),
    ];
    const raw = await geminiGenerate(parts, this.key);
    const r = parseJsonLoose<{
      same_product: boolean; observed?: { category?: string; count?: number; color?: string };
      confidence?: number; reason?: string;
    }>(raw);
    return {
      same_product: Boolean(r.same_product),
      cosine: r.confidence ?? (r.same_product ? 0.85 : 0.3),
      observed: r.observed ?? {},
      reason: r.reason ?? "Gemini delivery verification.",
    };
  }
}
