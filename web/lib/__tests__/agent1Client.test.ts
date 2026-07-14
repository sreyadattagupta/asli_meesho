import { describe, it, expect, vi, afterEach } from "vitest";
import { verifyProduct, Agent1Error } from "@/lib/agent1Client";

afterEach(() => vi.restoreAllMocks());

describe("agent1Client", () => {
  it("maps a successful engine response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              triggered: true,
              trust_score: 0.7,
              band: "high",
              signals: { price_anomaly: 0.1 },
              evidence: [],
              platforms: [],
              explanation: "ok",
              degraded: false,
            }),
            { status: 200 },
          ),
      ),
    );
    const r = await verifyProduct(new Blob([new Uint8Array([1])]), { title: "x" });
    expect(r.trustScore).toBe(0.7);
    expect(r.band).toBe("high");
    expect(r.signals.price_anomaly).toBe(0.1);
  });

  it("throws Agent1Error on non-200", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 502 })));
    await expect(verifyProduct(new Blob([new Uint8Array([1])]), {})).rejects.toBeInstanceOf(
      Agent1Error,
    );
  });

  it("throws Agent1Error when the engine is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    await expect(verifyProduct(new Blob([new Uint8Array([1])]), {})).rejects.toBeInstanceOf(
      Agent1Error,
    );
  });
});
