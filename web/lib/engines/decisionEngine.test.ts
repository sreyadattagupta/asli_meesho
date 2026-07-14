import { describe, expect, it } from "vitest";
import { unify, type AgentOutputs } from "./decisionEngine";
import type { RiskResult } from "./riskRadar";

const risk: Pick<RiskResult, "trustScore" | "band"> = { trustScore: 60, band: "medium" };
const base: AgentOutputs = {
  possession: { passed: true, confidence: 0.96, sameItem: true, codeVisible: true },
  sizing: { confidence: 0.8 },
  risk,
  orchestratorAction: "AUTO_APPROVE",
};

describe("unify — Unified Decision Engine", () => {
  it("verified when approved ∧ possession ∧ sizing", () => {
    const d = unify(base);
    expect(d.verdict).toBe("verified");
    expect(d.asliVerified).toBe(true);
    expect(d.trustScore).toBe(63); // 60 + 3
  });

  it("blocked path drops trust", () => {
    const d = unify({ ...base, orchestratorAction: "BLOCK",
      possession: { passed: false, confidence: 0.1, sameItem: false, codeVisible: false } });
    expect(d.verdict).toBe("blocked");
    expect(d.asliVerified).toBe(false);
    expect(d.trustScore).toBe(52); // 60 - 8
  });

  it("escalated path", () => {
    expect(unify({ ...base, orchestratorAction: "ESCALATE_HUMAN" }).verdict).toBe("escalated");
  });

  it("pending when sizing missing/low even if approved", () => {
    const d = unify({ ...base, sizing: { confidence: 0.4 } });
    expect(d.verdict).toBe("pending");
    expect(d.asliVerified).toBe(false);
  });

  it("always explains itself and clamps trust", () => {
    const d = unify({ ...base, risk: { ...risk, trustScore: 99 } });
    expect(d.explanation.length).toBeGreaterThan(0);
    expect(d.trustScore).toBeLessThanOrEqual(100);
  });
});
