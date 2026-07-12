"use client";

import { useRef, useState } from "react";
import { useSellerStore } from "@/lib/store";
import { toSizeChart } from "@/lib/sizing";

// Step 4 — Agent 2. Flat-lay + A4 reference → VLM measures → auto size chart.
export default function SizingStep() {
  const {
    flatlayPreview,
    setFlatlay,
    setMeasureResult,
    setSizeChart,
    setStep,
  } = useSellerStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [ref, setRef] = useState<"a4" | "tape">("a4");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadDemoFlatlay() {
    const res = await fetch("/proof/flatlay_real.jpg");
    const blob = await res.blob();
    setFlatlay(new File([blob], "flatlay_real.jpg", { type: "image/jpeg" }));
  }

  async function measure() {
    const file = useSellerStore.getState().flatlayFile;
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const form = new FormData();
      form.append("flatlay", file);
      form.append("reference_object", ref);
      const res = await fetch("/api/sizing", { method: "POST", body: form });
      const m = await res.json();
      if (!res.ok) {
        setErr(m.error ?? "Measurement failed.");
        return;
      }
      setMeasureResult(m);
      setSizeChart(toSizeChart(m));
      setStep("review");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-6">
      <span className="pill bg-asli-green/15 text-asli-green ring-1 ring-asli-green/30">
        ✓ Possession proven
      </span>
      <h2 className="mt-3 text-2xl font-bold">Auto-build the size chart</h2>
      <p className="mt-1 text-sm text-white/50">
        Lay the garment flat with an <b>A4 sheet</b> (or a measuring tape) in frame
        for scale. One photo → real centimetres, no manual entry.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div
          onClick={() => inputRef.current?.click()}
          className="grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-xl border border-dashed border-white/20 bg-white/[0.02] hover:border-asli-green/50"
        >
          {flatlayPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={flatlayPreview} alt="flatlay" className="h-full w-full object-contain" />
          ) : (
            <span className="text-sm text-white/40">Click to choose flat-lay photo</span>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) =>
              e.target.files?.[0] && setFlatlay(e.target.files[0])
            }
          />
        </div>

        <div className="flex flex-col justify-center gap-3">
          <div className="flex gap-2">
            {(["a4", "tape"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRef(r)}
                className={[
                  "pill flex-1 justify-center py-2 ring-1",
                  ref === r
                    ? "bg-asli-green/20 text-asli-green ring-asli-green/40"
                    : "bg-white/5 text-white/50 ring-white/10",
                ].join(" ")}
              >
                {r === "a4" ? "A4 sheet" : "Measuring tape"}
              </button>
            ))}
          </div>
          <button className="btn-ghost" onClick={loadDemoFlatlay}>
            Use demo flat-lay photo
          </button>
          <button className="btn-primary" disabled={!flatlayPreview || busy} onClick={measure}>
            {busy ? "Measuring (10–40s)…" : "Measure & auto-fill →"}
          </button>
          {err && <p className="text-xs text-red-300">{err}</p>}
        </div>
      </div>
    </div>
  );
}
