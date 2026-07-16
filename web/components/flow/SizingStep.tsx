"use client";

import { useRef, useState } from "react";
import { Minus, Plus, X, ScanLine, Upload, Camera } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ConfidenceBar } from "@/components/ui/ConfidenceBar";
import { useSellerStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import type { I18nKey } from "@/lib/i18n/en";
import { useVoiceGuide } from "@/lib/useVoiceGuide";
import { toSizeChart } from "@/lib/sizing";
import type { SizeChart } from "@/lib/sizing";
import { gradeChart, GRADE_SIZES, type GradeDim, type GeneratedChart } from "@/lib/grading";
import { exportChartJSON, exportChartCSV, exportChartPDF } from "@/lib/chartExport";
import GuidedSizingCamera from "./GuidedSizingCamera";

// The declared-size selector offers the graded size ladder (XS–4XL), minus the non-apparel "Free Size".
const DECLARE_SIZES = GRADE_SIZES;
// Which measured dimensions can anchor/grade a chart, with their i18n label keys.
const GRADE_COLS: { dim: GradeDim; labelKey: I18nKey }[] = [
  { dim: "chest_cm", labelKey: "flow.sizing.chest" },
  { dim: "waist_cm", labelKey: "flow.sizing.waist" },
  { dim: "length_cm", labelKey: "flow.sizing.length" },
  { dim: "shoulder_cm", labelKey: "flow.sizing.shoulder" },
];

interface Graded {
  chart: GeneratedChart;
  confidence: { perDim: Partial<Record<GradeDim, number>>; overall: number };
  measurements: Partial<Record<GradeDim, number>>;
  edited: Partial<Record<GradeDim, boolean>>;
}

// Step 4 — Agent 2. One or more flat-lay photos + A4 reference → VLM measures each → the
// best-confidence shot builds the size chart, then an inline editor lets the seller nudge values.
export default function SizingStep() {
  const {
    flatlayFiles,
    flatlayPreviews,
    sizeChart,
    addFlatlays,
    removeFlatlay,
    setMeasureResult,
    setSizeChart,
    // Aliased: `setDeclaredSize` below is this step's local selection state.
    setDeclaredSize: setStoreDeclaredSize,
    setStep,
  } = useSellerStore();
  const t = useT();
  useVoiceGuide("flow.sizing.voice");
  const category = useSellerStore((s) => s.draft.category);
  const inputRef = useRef<HTMLInputElement>(null);
  const [ref, setRef] = useState<"a4" | "tape">("a4");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [retake, setRetake] = useState<string | null>(null);
  const [bestIndex, setBestIndex] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [declaredSize, setDeclaredSize] = useState<string>("");
  const [graded, setGraded] = useState<Graded | null>(null);
  const [garmentType, setGarmentType] = useState<string | null>(null);
  // Which engine actually measured this garment, straight from the response — the UI must not claim
  // an engine that did not run.
  const [provider, setProvider] = useState<string | null>(null);

  async function loadDemoFlatlay() {
    const res = await fetch("/proof/flatlay_real.jpg");
    const blob = await res.blob();
    addFlatlays([new File([blob], "flatlay_real.jpg", { type: "image/jpeg" })]);
  }

  // Guided scan produced a validated frame → add it and measure immediately.
  function onScanCapture(file: File) {
    addFlatlays([file]);
    setScanning(false);
    void measure();
  }

  async function measure() {
    const files = useSellerStore.getState().flatlayFiles;
    if (files.length === 0) return;
    setBusy(true);
    setErr(null);
    setRetake(null);
    setBestIndex(null);
    setSizeChart(undefined);
    setGraded(null);
    setGarmentType(null);
    try {
      const form = new FormData();
      files.forEach((f) => form.append("flatlay", f));
      form.append("reference_object", ref);
      form.append("category", category);
      if (declaredSize) form.append("declaredSize", declaredSize);
      const listingId = useSellerStore.getState().listingId;
      if (listingId) form.append("listingId", listingId);
      const res = await fetch("/api/sizing", { method: "POST", body: form });
      const m = await res.json();
      if (!res.ok) {
        setErr(m?.error?.message ?? m?.error ?? "Measurement failed.");
        return;
      }
      // The pipeline couldn't measure reliably → ask for a retake, never show a fabricated size.
      if (m.needs_retake) {
        setRetake(m.reason ?? "Couldn't measure — include a plain A4 sheet in frame and retake.");
        return;
      }
      setMeasureResult(m);
      setGarmentType(typeof m.garment_type === "string" ? m.garment_type : null);
      setProvider(typeof m.provider === "string" ? m.provider : null);
      setSizeChart(toSizeChart(m, category)); // band label kept for the store/review/buyer surfaces
      // The size the seller declared is what the chart is anchored on and what we persist as
      // mappedSize — carry it so the go-live screen doesn't announce a different size.
      setStoreDeclaredSize(declaredSize || undefined);
      if (typeof m.bestIndex === "number") setBestIndex(m.bestIndex);
      // Graded chart (declared-size path): anchor on the seller-declared size, per-dim confidence.
      if (m.chart && declaredSize && m.confidence && typeof m.confidence === "object") {
        setGraded({ chart: m.chart, confidence: m.confidence, measurements: m.measurements ?? {}, edited: {} });
      }
    } catch {
      setErr("Measurement failed — check the sizing service and retry.");
    } finally {
      setBusy(false);
    }
  }

  /** ±0.5 cm nudge, re-mapping the size label from the adjusted measurements. */
  function nudge(key: "chestCm" | "lengthCm" | "waistCm", delta: number) {
    if (!sizeChart) return;
    const next: SizeChart = { ...sizeChart, [key]: Math.max(1, Math.round((sizeChart[key] + delta) * 10) / 10) };
    const remapped = toSizeChart({
      chest_cm: next.chestCm, length_cm: next.lengthCm, waist_cm: next.waistCm,
      reference_used: ref, confidence: next.confidence,
    }, category);
    setSizeChart(remapped);
  }

  /** Edit a measured anchor dim → re-grade the whole chart client-side (no server round-trip). */
  function regrade(dim: GradeDim, delta: number) {
    if (!graded || !declaredSize) return;
    const base = graded.measurements[dim];
    if (base === undefined) return;
    const nextMeasurements = { ...graded.measurements, [dim]: Math.max(1, Math.round((base + delta) * 10) / 10) };
    const chart = gradeChart(category ?? "top", declaredSize, nextMeasurements);
    setGraded({ ...graded, chart, measurements: nextMeasurements, edited: { ...graded.edited, [dim]: true } });
  }

  return (
    <div className="card p-6">
      {scanning && <GuidedSizingCamera onCapture={onScanCapture} onClose={() => setScanning(false)} />}
      <span className="pill bg-asli-green/15 text-asli-green ring-1 ring-asli-green/30">
        {t("flow.sizing.pill")}
      </span>
      <h2 className="mt-3 text-2xl font-bold">{t("flow.sizing.title")}</h2>
      <p className="mt-1 text-sm text-white/50">{t("flow.sizing.subtitle")}</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          {/* Thumbnail grid — every uploaded flat-lay, plus an "add more" tile. */}
          <div className="grid grid-cols-3 gap-2">
            {flatlayPreviews.map((src, i) => (
              <div
                key={src}
                className={[
                  "group relative aspect-square overflow-hidden rounded-xl border bg-white/[0.02]",
                  bestIndex === i ? "border-asli-green ring-2 ring-asli-green/40" : "border-white/15",
                ].join(" ")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`flat-lay ${i + 1}`} className="h-full w-full object-contain" />
                {bestIndex === i && (
                  <span className="absolute inset-x-0 bottom-0 bg-asli-green/90 py-0.5 text-center text-[10px] font-bold text-black">
                    {t("flow.sizing.bestShot")}
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Remove photo ${i + 1}`}
                  onClick={() => removeFlatlay(i)}
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white/80 opacity-0 transition hover:bg-asli-red hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            ))}
            {/* Add-more / initial choose tile. */}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="grid aspect-square place-items-center rounded-xl border border-dashed border-white/20 bg-white/[0.02] px-1 text-center text-xs text-white/40 hover:border-asli-green/50 hover:text-asli-green/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
            >
              <span className="flex flex-col items-center gap-1">
                <Plus className="h-5 w-5" aria-hidden />
                {flatlayPreviews.length === 0 ? t("flow.sizing.choosePhoto") : t("flow.sizing.addMore")}
              </span>
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFlatlays(Array.from(e.target.files));
              e.target.value = ""; // allow re-picking the same file
            }}
          />
          {flatlayPreviews.length > 0 && (
            <p className="mt-2 text-xs text-white/40">
              {t("flow.sizing.photoCount").replace("{n}", String(flatlayPreviews.length))}
            </p>
          )}
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
          {/* Declared true size (Agent 2 grading anchor). Optional: omit → legacy band label only. */}
          <div>
            <p className="text-xs font-medium text-white/60">{t("flow.sizing.declarePrompt")}</p>
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={t("flow.sizing.declarePrompt")}>
              {DECLARE_SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={declaredSize === s}
                  onClick={() => setDeclaredSize(declaredSize === s ? "" : s)}
                  className={[
                    "min-w-[44px] rounded-lg px-2 py-2 text-sm font-bold ring-1 transition",
                    declaredSize === s
                      ? "bg-asli-violet/25 text-asli-violet ring-asli-violet/50"
                      : "bg-white/5 text-white/50 ring-white/10 hover:text-white/80",
                  ].join(" ")}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-white/35">{t("flow.sizing.declareHint")}</p>
          </div>
          {/* Two input options: upload from device, or capture live with the A4 guide overlay. */}
          <p className="text-xs font-medium text-white/60">{t("flow.sizing.chooseMethod")}</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex flex-col items-start gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-asli-violet/50 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
            >
              <Upload className="h-5 w-5 text-asli-violet" aria-hidden />
              <span className="text-sm font-semibold">{t("flow.sizing.optionUpload")}</span>
              <span className="text-[11px] leading-tight text-white/40">{t("flow.sizing.optionUploadHint")}</span>
            </button>
            <button
              type="button"
              onClick={() => setScanning(true)}
              className="flex flex-col items-start gap-1 rounded-xl border border-asli-green/25 bg-asli-green/[0.05] p-3 text-left transition hover:border-asli-green/60 hover:bg-asli-green/[0.10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-green"
            >
              <Camera className="h-5 w-5 text-asli-green" aria-hidden />
              <span className="text-sm font-semibold">{t("flow.sizing.optionCapture")}</span>
              <span className="text-[11px] leading-tight text-white/40">{t("flow.sizing.optionCaptureHint")}</span>
            </button>
          </div>
          <p className="flex items-center gap-1 text-[10px] text-white/30">
            <ScanLine className="h-3 w-3" aria-hidden />
            {/* Before measuring: what the pipeline will do. After: the engine the response says ran —
                never a blanket "measured by <engine>" claim the backend did not make. */}
            {provider
              ? t("flow.sizing.inferenceRan").replace("{provider}", provider)
              : t("flow.sizing.inferenceLabel")}
          </p>
          <button className="btn-ghost text-xs" onClick={loadDemoFlatlay}>
            {t("flow.sizing.demoBtn")}
          </button>
          <button className="btn-ghost" disabled={flatlayPreviews.length === 0 || busy} onClick={measure}>
            {busy ? t("flow.sizing.measuring") : t("flow.sizing.measure")}
          </button>
          {err && (
            <p role="alert" className="text-xs text-asli-red">
              {err} <button className="underline" onClick={measure}>Retry</button>
            </p>
          )}
        </div>
      </div>

      {retake && (
        <div role="alert" className="mt-6 rounded-xl border border-asli-amber/30 bg-asli-amber/[0.06] p-4">
          <div className="flex items-center gap-2 text-asli-amber">
            <span className="pill bg-asli-amber/15 text-asli-amber ring-1 ring-asli-amber/30">
              {t("flow.sizing.retakePill")}
            </span>
          </div>
          <p className="mt-2 text-sm text-white/70">{retake}</p>
          <button className="btn-ghost mt-3" onClick={measure} disabled={busy}>
            {t("flow.sizing.retryMeasure")}
          </button>
        </div>
      )}

      {sizeChart && !graded && (
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

      {graded && (
        <div className="mt-6 rounded-xl border border-asli-violet/25 bg-asli-violet/[0.05] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold">{t("flow.sizing.gradedTitle")}</h3>
              <p className="text-xs text-white/45">{t("flow.sizing.gradedSubtitle")}</p>
              {garmentType && (
                <p className="mt-1 text-xs text-white/60">
                  Detected garment:{" "}
                  <span className="font-semibold capitalize text-asli-violet">{garmentType}</span>
                </p>
              )}
            </div>
            <span className="text-2xl font-black text-asli-violet">{graded.chart.anchoredOn}</span>
          </div>

          {/* Generated chart — the declared size row is the measured anchor (highlighted). */}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[360px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-white/40">
                  <th className="py-1 pr-2 font-medium">Size</th>
                  {GRADE_COLS.filter((c) => graded.measurements[c.dim] !== undefined).map((c) => (
                    <th key={c.dim} className="py-1 px-2 font-medium">{t(c.labelKey)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {graded.chart.sizes.map((row) => {
                  const isAnchor = row.size === graded.chart.anchoredOn;
                  return (
                    <tr
                      key={row.size}
                      className={isAnchor ? "rounded bg-asli-green/[0.10] font-semibold" : "text-white/70"}
                    >
                      <td className="py-1 pr-2">
                        <span className="inline-flex items-center gap-1.5">
                          {row.size}
                          {isAnchor && (
                            <Badge variant="verified">{t("flow.sizing.measuredBadge")}</Badge>
                          )}
                        </span>
                      </td>
                      {GRADE_COLS.filter((c) => graded.measurements[c.dim] !== undefined).map((c) => (
                        <td key={c.dim} className="py-1 px-2 font-mono tabular-nums">
                          {row[c.dim] !== undefined ? `${row[c.dim]}` : "—"}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Per-dimension confidence + inline edit of the measured anchor (re-grades client-side). */}
          <p className="mt-4 text-xs font-medium text-white/60">{t("flow.sizing.perDimConf")}</p>
          <div className="mt-2 space-y-2">
            {GRADE_COLS.filter((c) => graded.measurements[c.dim] !== undefined).map((c) => (
              <div key={c.dim} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-xs text-white/50">
                  {t(c.labelKey)}
                  {graded.edited[c.dim] && (
                    <span className="ml-1 text-[10px] text-asli-amber">({t("flow.sizing.edited")})</span>
                  )}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    aria-label={`Decrease ${t(c.labelKey)}`}
                    onClick={() => regrade(c.dim, -0.5)}
                    className="grid h-7 w-7 place-items-center rounded-md bg-white/5 text-white/60 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
                  >
                    <Minus className="h-3 w-3" aria-hidden />
                  </button>
                  <span className="w-14 text-center font-mono text-xs tabular-nums">{graded.measurements[c.dim]} cm</span>
                  <button
                    aria-label={`Increase ${t(c.labelKey)}`}
                    onClick={() => regrade(c.dim, 0.5)}
                    className="grid h-7 w-7 place-items-center rounded-md bg-white/5 text-white/60 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
                  >
                    <Plus className="h-3 w-3" aria-hidden />
                  </button>
                </div>
                <div className="flex-1">
                  <ConfidenceBar value={graded.confidence.perDim[c.dim] ?? 0} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2">
            <span className="text-xs uppercase tracking-wide text-white/40">{t("flow.sizing.overallConf")}</span>
            <span className="font-mono font-bold tabular-nums text-asli-green">
              {Math.round(graded.confidence.overall * 100)}%
            </span>
          </div>

          {/* Download the AI-generated chart — JSON / CSV / PDF. */}
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="w-full text-[11px] uppercase tracking-wide text-white/35">Download size chart</span>
            {([
              { label: "JSON", fn: exportChartJSON },
              { label: "CSV", fn: exportChartCSV },
              { label: "PDF", fn: exportChartPDF },
            ] as const).map(({ label, fn }) => (
              <button
                key={label}
                type="button"
                onClick={() => fn(graded.chart, { garmentType, category, confidence: graded.confidence.overall })}
                className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] py-2 text-xs font-semibold text-white/70 transition hover:border-asli-violet/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
              >
                {label}
              </button>
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
