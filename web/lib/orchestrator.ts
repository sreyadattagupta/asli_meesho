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
  | "details" // title, category, description
  | "pricing" // price, MRP, discount
  | "inventory" // stock, SKU
  | "review" // human approval gate (shown as "Preview")
  | "live"; // listing goes LIVE (shown as "Publish")

// The agents run BEFORE the seller types anything. Deliberate: a listing that cannot prove possession
// is going to be stopped either way, and making someone fill in three forms first only to be blocked
// wastes the honest seller's time and the thief's is not worth protecting.
export const FLOW_ORDER: FlowStep[] = [
  "upload",
  "trigger",
  "challenge",
  "sizing",
  "details",
  "pricing",
  "inventory",
  "review",
  "live",
];

/** Steps owned by an agent: the seller cannot skip forward past them or walk back into them. */
export const AGENT_STEPS: FlowStep[] = ["trigger", "challenge", "sizing"];

/** One pill in the progress indicator. Agent 1 spans two steps but reads as a single phase. */
export interface FlowPhase {
  key: string;
  label: string;
  steps: FlowStep[];
}

export const FLOW_PHASES: FlowPhase[] = [
  { key: "upload", label: "Upload", steps: ["upload"] },
  { key: "agent1", label: "Agent 1 · Possession", steps: ["trigger", "challenge"] },
  { key: "agent2", label: "Agent 2 · Sizing", steps: ["sizing"] },
  { key: "details", label: "Details", steps: ["details"] },
  { key: "pricing", label: "Pricing", steps: ["pricing"] },
  { key: "inventory", label: "Inventory", steps: ["inventory"] },
  { key: "review", label: "Preview", steps: ["review"] },
  { key: "live", label: "Publish", steps: ["live"] },
];

export function nextStep(step: FlowStep): FlowStep {
  const i = FLOW_ORDER.indexOf(step);
  return FLOW_ORDER[Math.min(i + 1, FLOW_ORDER.length - 1)];
}

/**
 * The step a "Previous" button goes to, or null when there isn't one.
 *
 * Null whenever the step behind is an agent's. The challenge code is single-use and time-bound
 * (invariant #3): re-entering `challenge` would either burn a code the seller already spent or hand
 * back a reusable one, which is exactly the reuse the invariant exists to stop. Agent 2's
 * measurement is likewise already written against this listing. The seller isn't stuck — the flow
 * offers "Start over", which issues a fresh code against a fresh attempt.
 */
export function prevStep(step: FlowStep): FlowStep | null {
  const i = FLOW_ORDER.indexOf(step);
  if (i <= 0) return null;
  const prev = FLOW_ORDER[i - 1];
  return AGENT_STEPS.includes(prev) ? null : prev;
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
//
// The bands above are the whole contract, so both edges are enforced here rather than trusted to
// config. A bar at/above GENUINE_FLOOR rejects honest sellers on every retry (a genuine capture
// cannot score its way out); a bar near the mismatch band waves thieves through.
const GENUINE_FLOOR = 0.83; // lowest confidence a genuine re-capture is expected to reach
const MISMATCH_CEILING = 0.45; // highest confidence a rejected/different item is expected to reach
export const MATCH_THRESHOLD_DEFAULT = 0.78;
/** Hard ceiling for the composed bar — must stay strictly under the genuine band. */
export const MAX_REQUIRED_CONFIDENCE = 0.82;

/**
 * Parse the configured floor defensively. `Number(process.env.X ?? d)` does NOT survive contact with
 * real config: `??` only catches null/undefined, so a var present-but-blank yields `Number("") === 0`
 * and silently disables the gate. An out-of-band value is equally unsafe in the other direction —
 * `MATCH_THRESHOLD=0.90` (the *vlm-service* python knob, a different scale) was set here once and
 * pushed the bar to 0.90, inside the genuine band, so every honest seller was told
 * "Product mismatch" forever. Anything unparseable or out of band falls back to the calibrated default.
 */
export function parseMatchThreshold(raw: string | undefined): number {
  const n = Number(raw);
  if (!raw?.trim() || !Number.isFinite(n)) return MATCH_THRESHOLD_DEFAULT;
  if (n <= MISMATCH_CEILING || n > MAX_REQUIRED_CONFIDENCE) return MATCH_THRESHOLD_DEFAULT;
  return n;
}

export const MATCH_THRESHOLD = parseMatchThreshold(process.env.NEXT_PUBLIC_MATCH_THRESHOLD);

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
      return "sizing"; // caller advances past it when a measurement already exists
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
  // Cap strictly BELOW the genuine band (≈0.83+): past that the risk nudges stop discriminating and
  // just reject honest sellers, who then retry into the same wall until they land in human review.
  return Math.min(bar, MAX_REQUIRED_CONFIDENCE);
}

/**
 * The agentic core: turn raw Agent-1 signals into the next action.
 *
 * Agent 1 (Live Proof) is a STRICT gate: the live photo must be the SAME product as the catalog
 * (same_item) with the code confirmed AND the match confidence at/above the adaptive bar. Any failure
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

  // PASS — same product, code confirmed, similarity at/above the adaptive bar.
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
