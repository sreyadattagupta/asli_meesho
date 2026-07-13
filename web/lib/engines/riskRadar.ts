// Agent 3 — Risk Radar. Beta-reputation trust scoring (Jøsang & Ismail 2002), pure + explainable.
export interface SellerSignals {
  passes: number;
  fails: number;
  isNew: boolean;
  kycVerified: boolean;
  imageReuseCount: number;
  recentEvents: { delta: number; ageDays: number }[];
}

export interface RiskResult {
  trustScore: number;
  band: "high" | "medium" | "low";
  contributingSignals: { label: string; impact: number; detail: string }[];
  fastLaneEligible: boolean;
}

const ALPHA = 2, BETA = 2;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function scoreSeller(s: SellerSignals): RiskResult {
  const signals: RiskResult["contributingSignals"] = [];

  // Beta reputation: E[Beta(α+passes, β+fails)] scaled 0–100. Cold start (0/0) ⇒ 50.
  const base = (100 * (ALPHA + s.passes)) / (ALPHA + BETA + s.passes + s.fails);
  signals.push({
    label: "Track record", impact: Math.round(base - 50),
    detail: `${s.passes} passes / ${s.fails} fails (beta prior α=β=2)`,
  });

  // Recency-weighted events, ~30-day decay, capped ±15.
  const recency = clamp(
    s.recentEvents.reduce((sum, e) => sum + e.delta * Math.exp(-e.ageDays / 30), 0), -15, 15);
  if (s.recentEvents.length) signals.push({
    label: "Recent outcomes", impact: Math.round(recency),
    detail: `${s.recentEvents.length} events, recency-weighted`,
  });

  const reuse = s.imageReuseCount >= 10 ? -5 : 0;
  if (reuse) signals.push({
    label: "Image reuse", impact: reuse,
    detail: `Catalog image seen ${s.imageReuseCount}× online`,
  });

  const kyc = s.kycVerified ? 3 : 0;
  if (kyc) signals.push({ label: "KYC", impact: kyc, detail: "Documents verified" });

  const trustScore = Math.round(clamp(base + recency + reuse + kyc, 0, 100));
  const band = trustScore >= 70 ? "high" : trustScore >= 45 ? "medium" : "low";
  return {
    trustScore, band, contributingSignals: signals,
    fastLaneEligible: trustScore >= 85 && !s.isNew && s.kycVerified,
  };
}
