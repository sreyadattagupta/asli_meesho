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

// Attempt cap used ONLY to bound the risk-adaptive confidence nudge (see requiredConfidence). The
// live proof is NOT lock-out based: a failed attempt always earns a retry with a fresh single-use
// code (policy: unlimited retries). A live proof that never matches simply never passes — we never
// permanently block an honest seller who is fumbling their photos.
export const MAX_ATTEMPTS = 2;

// Same-product confidence floor for Agent 1 (Live Proof). Calibrated to the possession-confidence
// scale the vlm-service actually emits under the segmentation + crop-CLIP model: a genuine live
// re-capture of a real garment lands ≈0.90–0.95, a different/rejected item ≤0.45. The bar sits
// between those bands so a genuine seller clears it while a mismatch never does. The service already
// hard-gates same_item (crop cosine + colour + code); this is the composed second gate. Adaptive
// (invariant #7) but never a constant. Configurable without touching logic.
export const MATCH_THRESHOLD = Number(process.env.NEXT_PUBLIC_MATCH_THRESHOLD ?? 0.82);

// Exact user-facing copy required by the Agent-1 spec — surfaced verbatim in the seller UI.
export const MSG_LIVE_PROOF_MISMATCH =
  "The uploaded live proof does not match your original catalog photo. Please retake the photo.";
export const MSG_LIVE_PROOF_BLOCKED =
  "Verification failed twice. This listing has been blocked for security reasons. Please start a new verification.";

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
  bar += Math.min(s.attempt, MAX_ATTEMPTS) * 0.01; // each retry nudges the bar
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

  // FAIL — wrong/replaced item or similarity under the bar. Always retry with a FRESH single-use
  // code (policy: unlimited retries — invariant #3 keeps each code dynamic + single-use + TTL-bound).
  // The seller is never locked out; a proof that never matches the catalog simply never passes.
  return {
    action: "RE_CHALLENGE",
    requiredConfidence: bar,
    reason: MSG_LIVE_PROOF_MISMATCH,
  };
}
