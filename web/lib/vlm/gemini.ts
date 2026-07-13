// Deployed cloud provider — Gemini 2.0 Flash via plain REST (no SDK; declared-stack rule).
// Same JSON contract as Ollama/Mock. Prompts single-sourced from prompts/vlm-prompts.json.
import {
  renderMatchPrompt, renderMeasurePrompt, parseJsonLoose,
  type MatchResult, type MeasureResult, type VlmProvider,
} from "./provider";

const MODEL = "gemini-2.0-flash";

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
    const r = parseJsonLoose<Omit<MatchResult, "passed">>(raw);
    const passed = r.same_item && r.code_visible && r.confidence >= 0.7;
    return { ...r, passed };
  }

  async measure(flatlay: Blob, referenceObject: "a4" | "tape"): Promise<MeasureResult> {
    const parts = [{ text: renderMeasurePrompt(referenceObject) }, await blobToInline(flatlay)];
    const raw = await geminiGenerate(parts, this.key);
    return parseJsonLoose<MeasureResult>(raw);
  }
}
