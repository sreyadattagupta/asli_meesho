import { describe, it, expect, vi } from "vitest";

// Mock the VLM client so the route runs without the Python service. Two usable shots that agree.
vi.mock("@/lib/vlmClient", () => ({
  vlmMeasure: vi.fn(async () => ({
    needs_retake: false,
    chest_cm: 55, length_cm: 68, waist_cm: 47, shoulder_cm: 42, reference_used: "a4", confidence: 0.8,
    measurements: { chest_cm: 55, waist_cm: 47, length_cm: 68, shoulder_cm: 42 },
    signals: { method: "homography", seg_quality: 0.8, landmark_conf: 0.9, ref_aspect_err: 0.05, residual: 0.1, resolution_ok: 1 },
  })),
}));

import { POST } from "../sizing/route";

function form(fields: Record<string, string>, files = 1) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (let i = 0; i < files; i++) fd.append("flatlay", new File([new Uint8Array([1])], `a${i}.png`, { type: "image/png" }));
  return fd;
}

describe("POST /api/sizing", () => {
  it("fuses, grades, and returns per-dim confidence when a size is declared", async () => {
    const res = await POST(new Request("http://x/api/sizing", { method: "POST", body: form({ category: "top", declaredSize: "XXL", reference_object: "a4" }, 2) }));
    const body = await res.json();
    expect(body.needs_retake ?? false).toBe(false);
    expect(body.measurements.chest_cm).toBe(55);
    expect(body.chart.sizes.find((r: { size: string; chest_cm: number }) => r.size === "XXL").chest_cm).toBe(55);
    expect(body.chart.sizes.find((r: { size: string; chest_cm: number }) => r.size === "XL").chest_cm).toBeCloseTo(52.5, 1);
    expect(body.confidence.overall).toBeGreaterThan(0);
    expect(body.confidence.perDim.chest_cm).toBeGreaterThan(0);
    expect(body.declaredSize).toBe("XXL");
  });

  it("legacy path (no declaredSize) still returns a band size and no chart", async () => {
    const res = await POST(new Request("http://x/api/sizing", { method: "POST", body: form({ category: "top", reference_object: "a4" }, 1) }));
    const body = await res.json();
    expect(body.size).toBeDefined();
    expect(body.chart).toBeNull();
  });
});
