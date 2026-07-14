import { describe, expect, it } from "vitest";
import {
  decide, requiredConfidence, stepForAction, MAX_ATTEMPTS, MATCH_THRESHOLD,
  MSG_LIVE_PROOF_MISMATCH,
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

  it("fails a match just under the confidence bar (retry on first attempt)", () =>
    expect(decide({ ...base, matchConfidence: MATCH_THRESHOLD - 0.05 }).action).toBe("RE_CHALLENGE"));

  it("RE_CHALLENGE on a verification failure, with the exact mismatch copy", () => {
    const d = decide({ ...base, sameItem: false, matchConfidence: 0.4, attempt: 0 });
    expect(d.action).toBe("RE_CHALLENGE");
    expect(d.reason).toBe(MSG_LIVE_PROOF_MISMATCH);
  });

  it("keeps RE_CHALLENGE on repeat failures — unlimited retries, never a lock-out (policy 2A)", () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const d = decide({ ...base, sameItem: false, matchConfidence: 0.4, attempt });
      expect(d.action).toBe("RE_CHALLENGE");
      expect(d.reason).toBe(MSG_LIVE_PROOF_MISMATCH);
    }
  });

  it("a different item never AUTO_APPROVEs", () => {
    for (let attempt = 0; attempt < MAX_ATTEMPTS + 2; attempt++) {
      expect(decide({ ...base, sameItem: false, matchConfidence: 0.1, attempt }).action)
        .not.toBe("AUTO_APPROVE");
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
    // wrong item → RE_CHALLENGE (retry with a fresh code), never a lock-out
    expect(decide({ ...base, sameItem: false, matchConfidence: 0.1, attempt: 1 }, { fastLane: false }).action)
      .toBe("RE_CHALLENGE");
  });
});
