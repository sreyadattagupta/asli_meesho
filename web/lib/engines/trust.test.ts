import { describe, expect, it } from "vitest";
import { applyTrustDelta, bandFor } from "./trust";

describe("applyTrustDelta", () => {
  it("adds a positive delta and recomputes the band", () => {
    expect(applyTrustDelta({ trustScore: 68 }, 5)).toEqual({ trustScore: 73, trustBand: "high" });
  });
  it("subtracts and can drop a band", () => {
    expect(applyTrustDelta({ trustScore: 48 }, -10)).toEqual({ trustScore: 38, trustBand: "low" });
  });
  it("clamps to [0, 100]", () => {
    expect(applyTrustDelta({ trustScore: 3 }, -50).trustScore).toBe(0);
    expect(applyTrustDelta({ trustScore: 98 }, 50).trustScore).toBe(100);
  });
});

describe("bandFor", () => {
  it("uses 70/45 thresholds", () => {
    expect(bandFor(70)).toBe("high");
    expect(bandFor(45)).toBe("medium");
    expect(bandFor(44)).toBe("low");
  });
});
