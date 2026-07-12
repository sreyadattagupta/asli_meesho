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

export const MAX_ATTEMPTS = 2;

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
 * Risk-adaptive confidence bar. A bare possession check needs 0.70; a new seller,
 * a heavily-reused image, or a repeat attempt each push the bar higher — so the
 * system reasons about *how sure* it must be, rather than applying one fixed rule.
 */
export function requiredConfidence(
  s: Pick<AgentSignals, "reverseImageMatches" | "sellerIsNew" | "attempt">,
): number {
  let bar = 0.7;
  if (s.sellerIsNew) bar += 0.1; // cold-start: stricter until a record exists
  if (s.reverseImageMatches >= 10) bar += 0.1; // widely-reused image → more scrutiny
  bar += Math.min(s.attempt, MAX_ATTEMPTS) * 0.05; // each retry raises the bar
  return Math.min(bar, 0.95);
}

/** The agentic core: turn raw agent signals into the next action. */
export function decide(s: AgentSignals): OrchestratorDecision {
  const bar = requiredConfidence(s);

  // Wrong item is never recoverable by retrying — block outright.
  if (!s.sameItem && s.matchConfidence <= 0.2) {
    return {
      action: "BLOCK",
      requiredConfidence: bar,
      reason: "Different product from the catalog photo.",
    };
  }

  const passed = s.sameItem && s.codeVisible && s.matchConfidence >= bar;
  if (passed) {
    return {
      action: "AUTO_APPROVE",
      requiredConfidence: bar,
      reason: `Possession proven at ${s.matchConfidence.toFixed(2)} ≥ ${bar.toFixed(2)}.`,
    };
  }

  // Close miss (right item, code unclear, or just under the bar) → adaptive retry.
  const closeMiss = s.sameItem && s.matchConfidence >= bar - 0.2;
  if (closeMiss && s.attempt < MAX_ATTEMPTS) {
    return {
      action: "RE_CHALLENGE",
      requiredConfidence: bar,
      reason: "Right item but proof unclear — re-challenging at a stricter bar.",
    };
  }

  // Out of retries or genuinely ambiguous → hand to a human (Suraksha).
  return {
    action: "ESCALATE_HUMAN",
    requiredConfidence: bar,
    reason: "Ambiguous after retries — routing to human review.",
  };
}
