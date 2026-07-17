import { describe, expect, it } from "vitest";
import {
  decide, requiredConfidence, stepForAction, MAX_ATTEMPTS, MATCH_THRESHOLD,
  MATCH_THRESHOLD_DEFAULT, MAX_REQUIRED_CONFIDENCE, parseMatchThreshold,
  MSG_LIVE_PROOF_MISMATCH, MSG_LIVE_PROOF_ESCALATED,
  prevStep, nextStep, FLOW_ORDER, FLOW_PHASES,
} from "./orchestrator";

const base = {
  reverseImageMatches: 3, sameItem: true, codeVisible: true,
  matchConfidence: 0.95, sellerIsNew: false, attempt: 0,
};

// The genuine band the vlm-service actually emits (see orchestrator.ts). Asserted as literals, not
// relative to MATCH_THRESHOLD: the assertions below must FAIL if the configured floor ever drifts
// into this band. A misconfigured NEXT_PUBLIC_MATCH_THRESHOLD=0.90 once shipped exactly that — every
// honest seller was told "Product mismatch" on every retry — while the relative tests stayed green.
const GENUINE_WORST_CASE = 0.83;
const MISMATCH_TYPICAL = 0.45;

describe("requiredConfidence", () => {
  it("floored at the configured threshold", () =>
    expect(requiredConfidence(base)).toBeCloseTo(MATCH_THRESHOLD));
  it("cold-start nudges above the floor", () =>
    expect(requiredConfidence({ ...base, sellerIsNew: true })).toBeGreaterThan(MATCH_THRESHOLD));
  it("reverse-image reuse does NOT raise the bar (invariant #1 — trigger, not a penalty)", () =>
    expect(requiredConfidence({ ...base, reverseImageMatches: 50 })).toBeCloseTo(MATCH_THRESHOLD));

  it("NEVER reaches the genuine band, even at maximum risk", () =>
    expect(requiredConfidence({ ...base, sellerIsNew: true, reverseImageMatches: 50, attempt: 9 }))
      .toBeLessThan(GENUINE_WORST_CASE));
  it("always stays above the mismatch band", () =>
    expect(requiredConfidence(base)).toBeGreaterThan(MISMATCH_TYPICAL));
});

describe("parseMatchThreshold — config can't silently redefine the gate", () => {
  it("unset falls back to the calibrated default", () =>
    expect(parseMatchThreshold(undefined)).toBe(MATCH_THRESHOLD_DEFAULT));
  it("present-but-blank does NOT become 0 (Number('') === 0 would disable the gate)", () =>
    expect(parseMatchThreshold("")).toBe(MATCH_THRESHOLD_DEFAULT));
  it("non-numeric falls back", () => expect(parseMatchThreshold("high")).toBe(MATCH_THRESHOLD_DEFAULT));
  it("rejects a value inside the genuine band (the 0.90 misconfiguration)", () =>
    expect(parseMatchThreshold("0.90")).toBe(MATCH_THRESHOLD_DEFAULT));
  it("rejects a value down in the mismatch band", () =>
    expect(parseMatchThreshold("0.4")).toBe(MATCH_THRESHOLD_DEFAULT));
  it("accepts an in-band override", () => expect(parseMatchThreshold("0.8")).toBe(0.8));
});

describe("decide — a genuine capture always clears the bar", () => {
  // The regression: worst-case genuine confidence, cold-start seller, deep into the retry budget.
  it.each([0, 1, 5, 9])("AUTO_APPROVEs a worst-case genuine capture at attempt %i", (attempt) =>
    expect(decide({ ...base, matchConfidence: GENUINE_WORST_CASE, sellerIsNew: true, attempt }).action)
      .toBe("AUTO_APPROVE"));

  it("still rejects a mismatch at the same risk level", () =>
    expect(decide({ ...base, matchConfidence: MISMATCH_TYPICAL, sellerIsNew: true, attempt: 0 }).action)
      .toBe("RE_CHALLENGE"));

  it("the composed bar never exceeds the documented ceiling", () =>
    expect(requiredConfidence({ ...base, sellerIsNew: true, attempt: 99 }))
      .toBeLessThanOrEqual(MAX_REQUIRED_CONFIDENCE));
});

describe("decide — strict Agent-1 gate", () => {
  it("AUTO_APPROVE when same product + code + confidence above the bar", () =>
    expect(decide(base).action).toBe("AUTO_APPROVE"));

  it("close miss (right item, code ok, under the bar) retries on the first attempt", () =>
    expect(decide({ ...base, matchConfidence: MATCH_THRESHOLD - 0.05, attempt: 0 }).action)
      .toBe("RE_CHALLENGE"));

  it("a different item RE_CHALLENGEs (never a hard block), with the mismatch copy", () => {
    const d = decide({ ...base, sameItem: false, matchConfidence: 0.4, attempt: 0 });
    expect(d.action).toBe("RE_CHALLENGE");
    expect(d.reason).toBe(MSG_LIVE_PROOF_MISMATCH);
  });

  it("RE_CHALLENGEs when the code is not confirmed (retry, never block)", () =>
    expect(decide({ ...base, codeVisible: false, attempt: 0 }).action).toBe("RE_CHALLENGE"));

  it("escalates to a human once the retry budget is spent — never BLOCK", () => {
    const under = { ...base, matchConfidence: MATCH_THRESHOLD - 0.05 };
    expect(decide({ ...under, attempt: MAX_ATTEMPTS - 1 }).action).toBe("RE_CHALLENGE");
    const d = decide({ ...under, attempt: MAX_ATTEMPTS });
    expect(d.action).toBe("ESCALATE_HUMAN");
    expect(d.reason).toBe(MSG_LIVE_PROOF_ESCALATED);
  });

  it("never BLOCKs and never AUTO_APPROVEs a different item at any attempt", () => {
    for (let attempt = 0; attempt <= MAX_ATTEMPTS + 2; attempt++) {
      const a = decide({ ...base, sameItem: false, matchConfidence: 0.1, attempt }).action;
      expect(a).not.toBe("AUTO_APPROVE");
      expect(a).not.toBe("BLOCK");
    }
  });
});

describe("stepForAction", () => {
  it("maps every action to a flow step", () => {
    expect(stepForAction("AUTO_APPROVE")).toBe("sizing");
    expect(stepForAction("RE_CHALLENGE")).toBe("challenge");
    expect(stepForAction("ESCALATE_HUMAN")).toBe("review");
    expect(stepForAction("BLOCK")).toBe("review");
  });
});

describe("decide — fast lane (Task 5.4)", () => {
  it("eligible seller auto-approves before the possession gate", () => {
    // Even with no valid possession signals, a fast-lane seller is approved.
    const noProof = { ...base, sameItem: false, codeVisible: false, matchConfidence: 0 };
    const d = decide(noProof, { fastLane: true });
    expect(d.action).toBe("AUTO_APPROVE");
    expect(d.reason).toMatch(/fast lane/i);
  });
  it("ineligible path runs the strict gate when fastLane is false", () => {
    expect(decide(base, { fastLane: false }).action).toBe("AUTO_APPROVE");
    // wrong item → RE_CHALLENGE (retry, never a hard block; a human decides after the retry budget)
    expect(decide({ ...base, sameItem: false, matchConfidence: 0.1, attempt: 1 }, { fastLane: false }).action)
      .toBe("RE_CHALLENGE");
  });
});

describe("wizard step navigation", () => {
  it("runs the agents BEFORE asking the seller to type anything", () => {
    // The whole point of the ordering: a listing that can't prove possession is stopped before the
    // honest seller has filled in three forms.
    const agentsEnd = FLOW_ORDER.indexOf("sizing");
    for (const dataStep of ["details", "pricing", "inventory", "review"] as const) {
      expect(FLOW_ORDER.indexOf(dataStep)).toBeGreaterThan(agentsEnd);
    }
  });

  it("has no Previous out of the first step", () => {
    expect(prevStep("upload")).toBeNull();
  });

  it("refuses to walk back INTO an agent step", () => {
    // Re-entering `challenge` would burn a spent single-use code or hand back a reusable one —
    // exactly the reuse invariant #3 exists to stop. Same for the sizing measurement already written.
    expect(prevStep("details")).toBeNull(); // ← would land on sizing
    expect(prevStep("challenge")).toBeNull(); // ← would land on trigger
  });

  it("lets the seller move freely across the steps whose data is their own", () => {
    expect(prevStep("pricing")).toBe("details");
    expect(prevStep("inventory")).toBe("pricing");
    expect(prevStep("review")).toBe("inventory");
  });

  it("allows re-uploading the catalog photo before any code has been issued", () => {
    expect(prevStep("trigger")).toBe("upload");
  });

  it("advances sizing into the data steps, not straight to preview", () => {
    expect(nextStep("sizing")).toBe("details");
    expect(nextStep("inventory")).toBe("review");
  });

  it("stops at the last step", () => {
    expect(nextStep("live")).toBe("live");
  });

  it("covers every step in exactly one progress phase", () => {
    // The Stepper renders phases; a step in none of them would leave the indicator blank mid-flow,
    // and one in two would light up twice.
    for (const step of FLOW_ORDER) {
      expect(FLOW_PHASES.filter((p) => p.steps.includes(step))).toHaveLength(1);
    }
  });
});
