// Adaptive orchestrator for the seller listing flow.
//
// More than a linear pipeline: the orchestrator READS each agent's output and
// DECIDES the next action — re-challenge (with rising strictness), escalate to a
// human, auto-approve, or block — weighting reverse-image risk, the VLM match
// confidence, the seller's trust history, and how many attempts have been made.
// UI/API routes drive the step machine; `decide()` is the agentic control logic.

export type FlowStep =
  | "upload" // catalog image upload
  | "trigger" // reverse-image search (TRIGGER only — invariant #1)
  | "challenge" // dynamic camera-only possession challenge
  | "sizing" // flat-lay measurement
  | "review" // human approval gate
  | "live"; // listing goes LIVE

export const FLOW_ORDER: FlowStep[] = [
  "upload",
  "trigger",
  "challenge",
  "sizing",
  "review",
  "live",
];

export function nextStep(step: FlowStep): FlowStep {
  const i = FLOW_ORDER.indexOf(step);
  return FLOW_ORDER[Math.min(i + 1, FLOW_ORDER.length - 1)];
}

export interface FlowState {
  step: FlowStep;
  challengeCode?: string;
  possessionPassed?: boolean;
  approved?: boolean; // human-in-the-loop gate before "live"
}

export const initialFlow: FlowState = { step: "upload" };

// ----------------------------------------------------------------------------
// Adaptive decision layer (the "agentic" part).
// ----------------------------------------------------------------------------

export type OrchestratorAction =
  | "AUTO_APPROVE" // both core checks satisfied at/above the required bar → proceed
  | "RE_CHALLENGE" // close miss → ask again, with a stricter bar this attempt
  | "ESCALATE_HUMAN" // ambiguous or repeated failure → route to a Suraksha reviewer
  | "BLOCK"; // clear failure → stop the listing

export interface AgentSignals {
  /** reverse-image hits — high count raises the bar (invariant #1: trigger only). */
  reverseImageMatches: number;
  /** Agent 1 — Possession-Proof. */
  sameItem: boolean;
  codeVisible: boolean;
  matchConfidence: number; // 0..1
  /** seller trust context — new sellers get a stricter bar (cold-start). */
  sellerIsNew: boolean;
  /** how many challenge attempts have already been made this session. */
  attempt: number;
}

export interface OrchestratorDecision {
  action: OrchestratorAction;
  /** confidence bar this decision required — rises with risk & attempts. */
  requiredConfidence: number;
  reason: string;
}

// Live-Proof retry budget. Per the seller spec the flow NEVER hard-blocks: a mismatch always earns
// another capture with a fresh single-use code (invariant #3). The seller gets up to MAX_ATTEMPTS
// retries; only after exhausting them does the listing go to a HUMAN reviewer (escalate, not block) —
// so an honest seller is never dead-ended, and a genuine thief is caught by the reviewer, not an
// auto-verdict. Fraud stays backstopped by the single-use code + human review.
export const MAX_ATTEMPTS = 10;

// Same-product confidence floor for Agent 1 (Live Proof). Calibrated to the possession-confidence
// scale the vlm-service actually emits under the segmentation + crop-CLIP/DINOv2 same-item gate: a
// genuine live re-capture of a real garment lands ≈0.83–0.95, a different/rejected item ≤0.45. The
// bar sits between those bands so a genuine seller clears it while a mismatch never does. The service
// already hard-gates same_item (crop cosine + colour + code); this is the composed second gate.
// Adaptive (invariant #7) but never a constant. Configurable without touching logic.
export const MATCH_THRESHOLD = Number(process.env.NEXT_PUBLIC_MATCH_THRESHOLD ?? 0.78);

// Exact user-facing copy required by the Agent-1 spec — surfaced verbatim in the seller UI.
export const MSG_LIVE_PROOF_MISMATCH =
  "Product mismatch detected. Please capture the same product again.";
// After the retry budget is spent we hand off to a human — never a hard security block.
export const MSG_LIVE_PROOF_ESCALATED =
  "We couldn't confirm the product after several attempts. Sending it to our team for a quick manual review — you're not blocked.";
// Retained for back-compat with any importer; escalation (above) is the terminal state now.
export const MSG_LIVE_PROOF_BLOCKED = MSG_LIVE_PROOF_ESCALATED;

/** Which flow step the UI renders after an orchestrator action. */
export function stepForAction(a: OrchestratorAction): FlowStep {
  switch (a) {
    case "AUTO_APPROVE":
      return "sizing"; // caller advances to "review" when a measurement already exists
    case "RE_CHALLENGE":
      return "challenge";
    case "ESCALATE_HUMAN":
    case "BLOCK":
      return "review"; // review screen renders the locked/blocked terminal states
  }
}

/**
 * Risk-adaptive confidence bar, floored at MATCH_THRESHOLD. A new seller (cold-start) and each
 * repeat attempt push the bar HIGHER — never below the floor (invariant #7).
 *
 * NOTE: reverse-image reuse does NOT raise this bar. "Seen elsewhere" is a TRIGGER, not a verdict
 * (invariant #1) — an honest reseller using a supplier's catalog photo must not face a HARDER
 * possession proof just because the image is widely reused. Reuse gates whether the challenge runs;
 * it never penalises the seller's live proof.
 */
export function requiredConfidence(
  s: Pick<AgentSignals, "reverseImageMatches" | "sellerIsNew" | "attempt">,
): number {
  let bar = MATCH_THRESHOLD;
  if (s.sellerIsNew) bar += 0.03; // cold-start: a touch stricter until a record exists
  bar += Math.min(s.attempt, 3) * 0.01; // small nudge for the first few retries, then plateau — with
  // a 10-retry budget we must NOT keep tightening the bar into rejecting a genuine seller.
  return Math.min(bar, 0.9);
}

/**
 * The agentic core: turn raw Agent-1 signals into the next action.
 *
 * Agent 1 (Live Proof) is a STRICT gate: the live photo must be the SAME product as the catalog
 * (same_item) with the code confirmed AND the match confidence at/above the ≥90% bar. Any failure
 * — a different item, a swapped product, or similarity under the bar — is a verification failure:
 * the seller retries, and a SECOND failure blocks the listing (MAX_ATTEMPTS). No silent pass, no
 * cached verdict — `s` is computed fresh from the real VLM/embedding pipeline on every attempt.
 */
export function decide(s: AgentSignals, opts?: { fastLane?: boolean }): OrchestratorDecision {
  const bar = requiredConfidence(s);

  // Risk Radar fast lane: a trusted seller skips the live challenge entirely. Runs BEFORE the
  // possession gate because their possession signals may not exist yet (challenge was skipped).
  if (opts?.fastLane) {
    return {
      action: "AUTO_APPROVE",
      requiredConfidence: bar,
      reason: "Trusted seller fast lane (score ≥ 85, KYC verified).",
    };
  }

  // PASS — same product, code confirmed, similarity at/above the strict ≥90% bar.
  const passed = s.sameItem && s.codeVisible && s.matchConfidence >= bar;
  if (passed) {
    return {
      action: "AUTO_APPROVE",
      requiredConfidence: bar,
      reason: `Live proof matches the catalog at ${Math.round(s.matchConfidence * 100)}% (≥ ${Math.round(
        bar * 100,
      )}% required).`,
    };
  }

  // NOT PASSED — different product, code not confirmed, or similarity under the bar. NEVER a hard
  // block (seller spec): the seller re-captures with a FRESH single-use code (invariant #3). Only once
  // the retry budget is spent does it go to a HUMAN reviewer — still not a dead-end for the seller.
  if (s.attempt >= MAX_ATTEMPTS) {
    return {
      action: "ESCALATE_HUMAN",
      requiredConfidence: bar,
      reason: MSG_LIVE_PROOF_ESCALATED,
    };
  }

  return {
    action: "RE_CHALLENGE",
    requiredConfidence: bar,
    reason: MSG_LIVE_PROOF_MISMATCH,
  };
}
