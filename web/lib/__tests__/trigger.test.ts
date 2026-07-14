import { afterEach, describe, expect, it, vi } from "vitest";
import { isMockMode, mockTrigger } from "../trigger";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("TriggerSource seam", () => {
  it("isMockMode true only when TRIGGER_SOURCE=mock", () => {
    vi.stubEnv("TRIGGER_SOURCE", "mock");
    expect(isMockMode()).toBe(true);
  });

  it("isMockMode false for any real source (engine owns the real path)", () => {
    vi.stubEnv("TRIGGER_SOURCE", "serpapi");
    expect(isMockMode()).toBe(false);
    vi.stubEnv("TRIGGER_SOURCE", "");
    expect(isMockMode()).toBe(false);
  });

  it("mockTrigger returns a labelled trigger with real marketplace names", () => {
    const r = mockTrigger();
    expect(r.source).toBe("mock");
    expect(r.triggered).toBe(true);
    expect(r.matchCount).toBeGreaterThan(0);
    expect(r.platforms.length).toBeGreaterThan(0);
  });
});
