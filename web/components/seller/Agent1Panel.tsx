"use client";

// Agent 1 verification surface — the engine's explainable trust score + signal breakdown.
// TRIGGER + evidence, never a verdict (invariant #1): a low band raises scrutiny, never auto-blocks.
import { ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ConfidenceBar } from "@/components/ui/ConfidenceBar";

type Band = "high" | "medium" | "low";

// Human labels + whether the raw signal is a RISK (shown inverted so the bar reads "good = full").
const SIGNAL_META: Record<string, { label: string; risk: boolean }> = {
  brand_consistency: { label: "Brand consistent", risk: false },
  title_agreement: { label: "Title matches market", risk: false },
  price_anomaly: { label: "Price vs market", risk: true },
  manipulation: { label: "Image integrity", risk: true },
  aigen: { label: "Not AI-generated", risk: true },
  internal_dupe: { label: "Not a duplicate listing", risk: true },
  reverse_reuse: { label: "Image originality", risk: true },
};

const BAND_STYLE: Record<Band, { badge: "verified" | "trigger" | "blocked"; icon: typeof ShieldCheck; text: string }> = {
  high: { badge: "verified", icon: ShieldCheck, text: "High trust" },
  medium: { badge: "trigger", icon: ShieldQuestion, text: "Medium trust" },
  low: { badge: "blocked", icon: ShieldAlert, text: "Low trust" },
};

export function Agent1Panel({
  trustScore,
  band,
  signals,
  explanation,
  degraded,
}: {
  trustScore?: number | null;
  band?: Band | null;
  signals?: Record<string, number>;
  explanation?: string;
  degraded?: boolean;
}) {
  if (trustScore == null || !band) return null;
  const style = BAND_STYLE[band];
  const Icon = style.icon;
  const rows = Object.entries(signals ?? {}).filter(([k]) => k in SIGNAL_META);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-white/80" aria-hidden />
          <span className="text-sm font-semibold text-white">Agent 1 · Trust score</span>
        </div>
        <Badge variant={style.badge}>
          {style.text} · {Math.round(trustScore * 100)}%
        </Badge>
      </div>

      {explanation && <p className="mt-2 text-xs text-white/60">{explanation}</p>}
      {degraded && (
        <p className="mt-1 text-xs text-asli-amber">
          Some live signals were unavailable — score uses what could be verified.
        </p>
      )}

      {rows.length > 0 && (
        <ul className="mt-3 space-y-2">
          {rows.map(([key, raw]) => {
            const meta = SIGNAL_META[key];
            // display value: risk signals shown as (1 - raw) so a full green bar always = good
            const shown = meta.risk ? 1 - raw : raw;
            return (
              <li key={key} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-2">
                <span className="truncate text-xs text-white/60">{meta.label}</span>
                <ConfidenceBar value={shown} />
                <span className="text-right text-xs tabular-nums text-white/50">
                  {Math.round(shown * 100)}%
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
