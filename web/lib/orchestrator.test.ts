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
