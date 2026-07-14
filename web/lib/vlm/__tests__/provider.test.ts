import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  renderMatchPrompt, renderMeasurePrompt, parseJsonLoose, withDegradation,
  vlmDegraded, __resetDegraded, type VlmProvider, type MatchResult,
} from "../provider";
import { MockProvider } from "../mock";
import { GeminiProvider } from "../gemini";

describe("prompt rendering (single source)", () => {
  it("renders the match prompt with no unresolved placeholder", () => {
    // The challenge code is entered/verified as TEXT upstream and is NOT in the photo, so the
    // match prompt is code-agnostic. renderMatchPrompt must still leave no {{code}} token behind.
    const p = renderMatchPrompt("AX42");
    expect(p.length).toBeGreaterThan(0);
    expect(p).not.toContain("{{code}}");
  });
  it("substitutes the reference object", () => {
    expect(renderMeasurePrompt("a4")).toContain("a4");
    expect(renderMeasurePrompt("a4")).not.toContain("{{reference}}");
  });
});

describe("parseJsonLoose", () => {
  it("parses plain JSON", () => {
    expect(parseJsonLoose<{ a: number }>('{"a":1}').a).toBe(1);
  });
  it("strips ``` fences and surrounding prose", () => {
    expect(parseJsonLoose<{ a: number }>('here:\n```json\n{"a":2}\n```').a).toBe(2);
  });
});

describe("MockProvider", () => {
  it("passes a distinct live capture, fails a reused catalog image", async () => {
    const m = new MockProvider();
    const catalog = new Blob([new Uint8Array(100)]);
    const live = new Blob([new Uint8Array(200)]);
    expect((await m.match(catalog, live, "AX42")).passed).toBe(true);
    expect((await m.match(catalog, new Blob([new Uint8Array(100)]), "AX42")).passed).toBe(false);
  });
});

describe("GeminiProvider + withDegradation", () => {
  const OLD = process.env.GEMINI_API_KEY;
  beforeEach(() => { process.env.GEMINI_API_KEY = "test-key"; __resetDegraded(); });
  afterEach(() => { process.env.GEMINI_API_KEY = OLD; vi.restoreAllMocks(); });

  const img = () => new Blob([new Uint8Array(50)], { type: "image/jpeg" });
  const geminiText = (text: string) => ({
    ok: true, status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  });

  it("parses a happy Gemini match response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      geminiText('{"same_item":true,"code_visible":true,"confidence":0.9,"reason":"ok"}') as unknown as Response));
    const r: MatchResult = await new GeminiProvider().match(img(), new Blob([new Uint8Array(80)]), "AX42");
    expect(r.same_item).toBe(true);
    expect(r.passed).toBe(true);
  });

  it("possession FAILS CLOSED (never auto-passes) and flips degraded after retries fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, text: async () => "boom" }) as unknown as Response));
    const wrapped: VlmProvider = withDegradation(new GeminiProvider());
    const r = await wrapped.match(img(), new Blob([new Uint8Array(80)]), "AX42");
    // Security-critical: a possession gate must never fail OPEN on VLM outage.
    expect(r.passed).toBe(false);
    expect(r.same_item).toBe(false);
    expect(r.confidence).toBe(0);
    expect(vlmDegraded()).toBe(true);
  });
});
