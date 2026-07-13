// Trust recompute — pure. Phase 4 uses a simple clamped delta; Phase 5 (Task 5.1)
// swaps the internals to the beta-reputation scoreSeller with this signature unchanged.
import type { TrustBand } from "@/lib/db/types";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Band thresholds are fixed across the app: high ≥70, medium ≥45, else low. */
export function bandFor(score: number): TrustBand {
  return score >= 70 ? "high" : score >= 45 ? "medium" : "low";
}

/** Apply a trust delta to a seller's current score, returning the new score + band. */
export function applyTrustDelta(
  seller: { trustScore: number },
  delta: number,
): { trustScore: number; trustBand: TrustBand } {
  const trustScore = Math.round(clamp(seller.trustScore + delta, 0, 100));
  return { trustScore, trustBand: bandFor(trustScore) };
}
