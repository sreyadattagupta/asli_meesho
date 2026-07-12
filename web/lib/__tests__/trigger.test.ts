import { afterEach, describe, expect, it, vi } from "vitest";
import { getTrigger } from "../trigger";

const bytes = Buffer.from("fake-image");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getTrigger (TriggerSource seam)", () => {
  it("TRIGGER_SOURCE=mock returns a labelled mock trigger", async () => {
    vi.stubEnv("TRIGGER_SOURCE", "mock");
    const r = await getTrigger("hash1", bytes);
    expect(r.source).toBe("mock");
    expect(r.triggered).toBe(true);
    expect(r.matchCount).toBeGreaterThan(0);
    expect(r.platforms.length).toBeGreaterThan(0);
  });

  it("serpapi without SERPAPI_KEY falls through to mock", async () => {
    vi.stubEnv("TRIGGER_SOURCE", "serpapi");
    vi.stubEnv("SERPAPI_KEY", "");
    const r = await getTrigger("hash2", bytes);
    expect(r.source).toBe("mock");
  });

  it("unknown source value warns and falls back to mock", async () => {
    vi.stubEnv("TRIGGER_SOURCE", "banana");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await getTrigger("hash3", bytes);
    expect(r.source).toBe("mock");
    expect(warn).toHaveBeenCalled();
  });

  it("qdrant falls through to mock until the embed service lands", async () => {
    vi.stubEnv("TRIGGER_SOURCE", "qdrant");
    vi.stubEnv("VLM_SERVICE_URL", "http://127.0.0.1:9"); // unreachable
    const r = await getTrigger("hash4", bytes);
    expect(r.source).toBe("mock");
  });
});
