"use client";

import { useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useSellerStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { useVoiceGuide } from "@/lib/useVoiceGuide";
import { toSizeChart } from "@/lib/sizing";
import type { SizeChart } from "@/lib/sizing";

// Step 4 — Agent 2. Flat-lay + A4 reference → VLM measures → auto size chart,
// then an inline editor lets the seller nudge values before publish.
export default function SizingStep() {
  const {
    flatlayPreview,
    sizeChart,
    setFlatlay,
    setMeasureResult,
    setSizeChart,
    setStep,
  } = useSellerStore();
  const t = useT();
  useVoiceGuide("flow.sizing.voice");
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
      const listingId = useSellerStore.getState().listingId;
      if (listingId) form.append("listingId", listingId);
      const res = await fetch("/api/sizing", { method: "POST", body: form });
      const m = await res.json();
      if (!res.ok) {
        setErr(m?.error?.message ?? m?.error ?? "Measurement failed.");
        return;
      }
      setMeasureResult(m);
      setSizeChart(toSizeChart(m));
    } catch {
      setErr("Measurement failed — check the VLM service and retry.");
    } finally {
      setBusy(false);
    }
  }

  /** ±0.5 cm nudge, re-mapping the size label from the adjusted chest. */
  function nudge(key: "chestCm" | "lengthCm" | "waistCm", delta: number) {
    if (!sizeChart) return;
    const next: SizeChart = { ...sizeChart, [key]: Math.max(1, Math.round((sizeChart[key] + delta) * 10) / 10) };
    const remapped = toSizeChart({
      chest_cm: next.chestCm, length_cm: next.lengthCm, waist_cm: next.waistCm,
      reference_used: ref, confidence: next.confidence,
    });
    setSizeChart(remapped);
  }

  return (
    <div className="card p-6">
      <span className="pill bg-asli-green/15 text-asli-green ring-1 ring-asli-green/30">
        {t("flow.sizing.pill")}
      </span>
      <h2 className="mt-3 text-2xl font-bold">{t("flow.sizing.title")}</h2>
      <p className="mt-1 text-sm text-white/50">{t("flow.sizing.subtitle")}</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div
          onClick={() => inputRef.current?.click()}
          className="grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-xl border border-dashed border-white/20 bg-white/[0.02] hover:border-asli-green/50"
        >
          {flatlayPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={flatlayPreview} alt="flatlay" className="h-full w-full object-contain" />
          ) : (
            <span className="text-sm text-white/40">{t("flow.sizing.choosePhoto")}</span>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && setFlatlay(e.target.files[0])}
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
                {r === "a4" ? t("flow.sizing.a4") : t("flow.sizing.tape")}
              </button>
            ))}
          </div>
          <button className="btn-ghost" onClick={loadDemoFlatlay}>
            {t("flow.sizing.demoBtn")}
          </button>
          <button className="btn-primary" disabled={!flatlayPreview || busy} onClick={measure}>
            {busy ? t("flow.sizing.measuring") : t("flow.sizing.measure")}
          </button>
          {err && (
            <p role="alert" className="text-xs text-asli-red">
              {err} <button className="underline" onClick={measure}>Retry</button>
            </p>
          )}
        </div>
      </div>

      {sizeChart && (
        <div className="mt-6 rounded-xl border border-asli-green/20 bg-asli-green/[0.04] p-4">
          <div className="flex items-center justify-between gap-3">
            <Badge variant="verified">{t("flow.sizing.measuredBadge")}</Badge>
            <span className="text-2xl font-black">{sizeChart.size}</span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {([
              { key: "chestCm", label: t("flow.sizing.chest") },
              { key: "lengthCm", label: t("flow.sizing.length") },
              { key: "waistCm", label: t("flow.sizing.waist") },
            ] as const).map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2">
                <span className="text-xs uppercase tracking-wide text-white/40">{label}</span>
                <div className="flex items-center gap-2">
                  <button
                    aria-label={`Decrease ${label}`}
                    onClick={() => nudge(key, -0.5)}
                    className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-white/60 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
                  >
                    <Minus className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <span className="w-16 text-center font-mono font-bold tabular-nums">{sizeChart[key]} cm</span>
                  <button
                    aria-label={`Increase ${label}`}
                    onClick={() => nudge(key, 0.5)}
                    className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-white/60 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button className="btn-primary mt-4 w-full" onClick={() => setStep("review")}>
            {t("flow.sizing.continue")}
          </button>
        </div>
      )}
    </div>
  );
}
