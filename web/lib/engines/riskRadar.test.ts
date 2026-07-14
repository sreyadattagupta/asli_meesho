import { describe, expect, it } from "vitest";
import { scoreSeller } from "./riskRadar";

const base = { passes: 0, fails: 0, isNew: true, kycVerified: false, imageReuseCount: 0, recentEvents: [] };

describe("scoreSeller — beta reputation", () => {
  it("cold-start prior α=β=2 ⇒ 50", () => expect(scoreSeller(base).trustScore).toBe(50));

  it("monotonic in passes", () =>
    expect(scoreSeller({ ...base, passes: 10 }).trustScore)
      .toBeGreaterThan(scoreSeller({ ...base, passes: 2 }).trustScore));

  it("recent negative outweighs stale negative", () => {
    const fresh = scoreSeller({ ...base, recentEvents: [{ delta: -10, ageDays: 1 }] });
    const stale = scoreSeller({ ...base, recentEvents: [{ delta: -10, ageDays: 90 }] });
    expect(fresh.trustScore).toBeLessThan(stale.trustScore);
  });

  it("fast lane: score≥85 ∧ !new ∧ kyc", () => {
    const vet = { ...base, passes: 60, fails: 1, isNew: false, kycVerified: true };
    expect(scoreSeller(vet).fastLaneEligible).toBe(true);
    expect(scoreSeller({ ...vet, kycVerified: false }).fastLaneEligible).toBe(false);
  });

  it("bounded 0..100, explains itself", () => {
    const r = scoreSeller({ ...base, fails: 500 });
    expect(r.trustScore).toBeGreaterThanOrEqual(0);
    expect(r.contributingSignals.length).toBeGreaterThan(0);
  });

  it("credible interval is wide at cold start, narrows with evidence", () => {
    const cold = scoreSeller(base).credibleInterval;
    const seasoned = scoreSeller({ ...base, passes: 80, fails: 20 }).credibleInterval;
    expect(cold.hi - cold.lo).toBeGreaterThan(seasoned.hi - seasoned.lo);
    expect(cold.lo).toBeGreaterThanOrEqual(0);
    expect(cold.hi).toBeLessThanOrEqual(100);
  });

  it("price anomaly lowers score and is explained", () => {
    const normal = scoreSeller({ ...base, passes: 20 });
    const anomalous = scoreSeller({ ...base, passes: 20, priceZScore: -4 });
    expect(anomalous.trustScore).toBeLessThan(normal.trustScore);
    expect(anomalous.contributingSignals.some((s) => s.label === "Price anomaly")).toBe(true);
  });

  it("listing-velocity burst lowers score", () => {
    const calm = scoreSeller({ ...base, passes: 20, listingVelocityPerDay: 3 });
    const burst = scoreSeller({ ...base, passes: 20, listingVelocityPerDay: 40 });
    expect(burst.trustScore).toBeLessThan(calm.trustScore);
  });
});
