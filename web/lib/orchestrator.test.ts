import { describe, expect, it } from "vitest";
import { decide, requiredConfidence, stepForAction, MAX_ATTEMPTS } from "./orchestrator";

const base = {
  reverseImageMatches: 3, sameItem: true, codeVisible: true,
  matchConfidence: 0.9, sellerIsNew: false, attempt: 0,
};

describe("requiredConfidence", () => {
  it("base bar 0.70", () => expect(requiredConfidence(base)).toBeCloseTo(0.7));
  it("cold-start +0.10", () => expect(requiredConfidence({ ...base, sellerIsNew: true })).toBeCloseTo(0.8));
  it("heavy reuse +0.10", () => expect(requiredConfidence({ ...base, reverseImageMatches: 12 })).toBeCloseTo(0.8));
  it("caps at 0.95", () => expect(requiredConfidence({ ...base, sellerIsNew: true,
    reverseImageMatches: 12, attempt: 9 })).toBeLessThanOrEqual(0.95));
});

describe("decide", () => {
  it("AUTO_APPROVE above bar", () => expect(decide(base).action).toBe("AUTO_APPROVE"));
  it("BLOCK wrong item at floor confidence", () =>
    expect(decide({ ...base, sameItem: false, matchConfidence: 0.1 }).action).toBe("BLOCK"));
  it("RE_CHALLENGE close miss with attempts left", () =>
    expect(decide({ ...base, codeVisible: false, matchConfidence: 0.6 }).action).toBe("RE_CHALLENGE"));
  it("ESCALATE_HUMAN when out of retries", () =>
    expect(decide({ ...base, codeVisible: false, matchConfidence: 0.6, attempt: MAX_ATTEMPTS }).action)
      .toBe("ESCALATE_HUMAN"));
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
  it("ineligible path is unchanged when fastLane is false", () => {
    expect(decide(base, { fastLane: false }).action).toBe("AUTO_APPROVE");
    expect(decide({ ...base, sameItem: false, matchConfidence: 0.1 }, { fastLane: false }).action).toBe("BLOCK");
  });
});
