import { describe, expect, it } from "vitest";
import { deriveK, finalizeProgress, stepToward } from "./organicProgress";

const TICK_MS = 120;
const CAP = 0.92;

describe("stepToward", () => {
  it("eases monotonically toward the cap but never reaches it, however many ticks run", () => {
    const k = deriveK(20000, TICK_MS); // mirrors the reverse-image check's expectedMs
    let progress = 0;
    let prev = -1;
    for (let i = 0; i < 500; i++) {
      progress = stepToward(progress, CAP, k);
      expect(progress).toBeGreaterThan(prev); // monotonic
      expect(progress).toBeLessThan(CAP); // never reaches the cap on its own
      prev = progress;
    }
    // ...but it should have crept meaningfully close to it.
    expect(progress).toBeGreaterThan(0.8);
  });
});

describe("deriveK", () => {
  it("creeps slower for a longer expected duration", () => {
    expect(deriveK(20000, TICK_MS)).toBeLessThan(deriveK(1200, TICK_MS));
  });

  it("stays within sane bounds for degenerate inputs", () => {
    expect(deriveK(0, TICK_MS)).toBeLessThanOrEqual(0.5);
    expect(deriveK(1_000_000, TICK_MS)).toBeGreaterThanOrEqual(0.01);
  });
});

describe("finalizeProgress", () => {
  it("leaves progress untouched while not done", () => {
    expect(finalizeProgress(0.5, false)).toBe(0.5);
    expect(finalizeProgress(0, false)).toBe(0);
  });

  it("jumps straight to 100% once done, regardless of where it was", () => {
    expect(finalizeProgress(0.5, true)).toBe(1);
    expect(finalizeProgress(0, true)).toBe(1);
  });
});
