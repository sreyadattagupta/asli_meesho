import { describe, expect, it } from "vitest";
import {
  decide, requiredConfidence, stepForAction, MAX_ATTEMPTS, MATCH_THRESHOLD,
  MSG_LIVE_PROOF_MISMATCH, MSG_LIVE_PROOF_ESCALATED,
} from "./orchestrator";

const base = {
  reverseImageMatches: 3, sameItem: true, codeVisible: true,
  matchConfidence: 0.95, sellerIsNew: false, attempt: 0,
};

describe("requiredConfidence", () => {
  it("floored at the strict ≥90% threshold", () =>
    expect(requiredConfidence(base)).toBeCloseTo(MATCH_THRESHOLD));
  it("cold-start nudges above the floor", () =>
    expect(requiredConfidence({ ...base, sellerIsNew: true })).toBeGreaterThan(MATCH_THRESHOLD));
  it("reverse-image reuse does NOT raise the bar (invariant #1 — trigger, not a penalty)", () =>
    expect(requiredConfidence({ ...base, reverseImageMatches: 50 })).toBeCloseTo(MATCH_THRESHOLD));
  it("caps at 0.90", () => expect(requiredConfidence({ ...base, sellerIsNew: true,
    reverseImageMatches: 50, attempt: 9 })).toBeLessThanOrEqual(0.9));
});

describe("decide — strict Agent-1 gate", () => {
  it("AUTO_APPROVE when same product + code + confidence ≥ 90%", () =>
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
