// Agent 3 — Risk Radar. Beta-reputation trust scoring (Jøsang & Ismail 2002), pure + explainable.
export interface SellerSignals {
  passes: number;
  fails: number;
  isNew: boolean;
  kycVerified: boolean;
  imageReuseCount: number;
  recentEvents: { delta: number; ageDays: number }[];
  /** Listing-derived signals (optional; computed from persisted listings in the route). */
  priceZScore?: number;          // seller's avg listing price vs category norm, in σ
  listingVelocityPerDay?: number; // listings created in the last 24h (burst detector)
}

export interface RiskResult {
  trustScore: number;
  band: "high" | "medium" | "low";
  contributingSignals: { label: string; impact: number; detail: string }[];
  fastLaneEligible: boolean;
  /** Beta posterior 95% credible interval (0–100) — wide when evidence is thin (cold start). */
  credibleInterval: { lo: number; hi: number; sd: number };
}

const ALPHA = 2, BETA = 2;
const Z95 = 1.96;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function scoreSeller(s: SellerSignals): RiskResult {
  const signals: RiskResult["contributingSignals"] = [];

  // Beta reputation: E[Beta(α+passes, β+fails)] scaled 0–100. Cold start (0/0) ⇒ 50.
  const a = ALPHA + s.passes, b = BETA + s.fails;
  const base = (100 * a) / (a + b);
  signals.push({
    label: "Track record", impact: Math.round(base - 50),
    detail: `${s.passes} passes / ${s.fails} fails (beta prior α=β=2)`,
  });

  // Posterior spread — the reject-option handle: thin evidence ⇒ wide interval ⇒ treat as riskier.
  const sd = Math.sqrt((a * b) / ((a + b) ** 2 * (a + b + 1))) * 100;
  const credibleInterval = {
    lo: Math.round(clamp(base - Z95 * sd, 0, 100)),
    hi: Math.round(clamp(base + Z95 * sd, 0, 100)),
    sd: Math.round(sd * 10) / 10,
  };

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

  // Price anomaly — a listing priced far from its category norm is a classic scam/lure signal.
  let priceImpact = 0;
  if (s.priceZScore !== undefined && Math.abs(s.priceZScore) > 2) {
    priceImpact = -Math.round(clamp((Math.abs(s.priceZScore) - 2) * 3, 0, 8));
    if (priceImpact) signals.push({
      label: "Price anomaly", impact: priceImpact,
      detail: `Priced ${s.priceZScore.toFixed(1)}σ from the category norm`,
    });
  }

  // Listing velocity — a sudden burst of new listings is a bulk-abuse signal.
  let velImpact = 0;
  if (s.listingVelocityPerDay !== undefined && s.listingVelocityPerDay > 15) {
    velImpact = -Math.round(clamp((s.listingVelocityPerDay - 15) / 5, 0, 6));
    if (velImpact) signals.push({
      label: "Listing velocity", impact: velImpact,
      detail: `${s.listingVelocityPerDay.toFixed(0)} new listings in 24h`,
    });
  }

  const trustScore = Math.round(
    clamp(base + recency + reuse + kyc + priceImpact + velImpact, 0, 100));
  const band = trustScore >= 70 ? "high" : trustScore >= 45 ? "medium" : "low";
  return {
    trustScore, band, contributingSignals: signals, credibleInterval,
    fastLaneEligible: trustScore >= 85 && !s.isNew && s.kycVerified,
  };
}
