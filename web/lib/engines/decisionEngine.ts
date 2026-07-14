// Unified Decision Engine — composes all agents into one explainable verdict. Pure.
import type { OrchestratorAction } from "@/lib/orchestrator";
import type { RiskResult } from "./riskRadar";

export interface AgentOutputs {
  possession?: { passed: boolean; confidence: number; sameItem: boolean; codeVisible: boolean };
  sizing?: { confidence: number };
  // Only the fields unify() reads — any full RiskResult satisfies this structurally.
  risk: Pick<RiskResult, "trustScore" | "band">;
  orchestratorAction: OrchestratorAction;
}

export interface FinalDecision {
  trustScore: number;
  asliVerified: boolean;
  verdict: "verified" | "pending" | "blocked" | "escalated";
  explanation: string[];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function unify(o: AgentOutputs): FinalDecision {
  // ✓ Asli Verified requires Agent 1 (possession) ∧ Agent 2 (sizing).
  const asliVerified = Boolean(o.possession?.passed) && (o.sizing?.confidence ?? 0) >= 0.6;

  const verdict: FinalDecision["verdict"] =
    o.orchestratorAction === "BLOCK" ? "blocked"
    : o.orchestratorAction === "ESCALATE_HUMAN" ? "escalated"
    : o.orchestratorAction === "AUTO_APPROVE" && asliVerified ? "verified"
    : "pending";

  const trustScore = Math.round(clamp(
    o.risk.trustScore + (verdict === "verified" ? 3 : verdict === "blocked" ? -8 : 0), 0, 100));

  const explanation: string[] = [];
  if (o.possession) {
    explanation.push(o.possession.passed
      ? `Possession proven at ${pct(o.possession.confidence)} (same item ${o.possession.sameItem ? "✓" : "✗"}, code ${o.possession.codeVisible ? "✓" : "✗"}).`
      : `Possession not proven (${pct(o.possession.confidence)}).`);
  }
  if (o.sizing) {
    explanation.push((o.sizing.confidence >= 0.6)
      ? `Size measured at ${pct(o.sizing.confidence)} confidence.`
      : `Size measurement low-confidence (${pct(o.sizing.confidence)}).`);
  }
  explanation.push(`Seller trust ${o.risk.trustScore} (${o.risk.band} band).`);
  explanation.push(asliVerified ? "Promise Keeper armed for delivery." : "Awaiting both possession and sizing to verify.");

  return { trustScore, asliVerified, verdict, explanation };
}
