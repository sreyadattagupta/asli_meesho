"use client";

import { Ruler } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { Listing, SizeMeasurement } from "@/lib/db/types";
import { toSizeChart } from "@/lib/sizing";

/** AI-measured size chart — the Agent 2 payoff on the product page. */
export function SizeChartTable({
  listing,
  measurement,
}: {
  listing: Listing;
  measurement: SizeMeasurement | null;
}) {
  const t = useT();
  // Prefer the persisted measurement; fall back to the frozen sizeChart record.
  const chest = measurement?.chestCm ?? listing.sizeChart?.chest_cm;
  const length = measurement?.lengthCm ?? listing.sizeChart?.length_cm;
  const waist = measurement?.waistCm ?? listing.sizeChart?.waist_cm;
  if (chest === undefined && length === undefined && waist === undefined) return null;

  // Only a persisted SizeMeasurement comes from Agent 2 actually measuring a flat-lay. Seeded demo
  // listings carry a frozen `sizeChart` that no camera ever saw — claiming "Measured, not guessed"
  // over those numbers would be a fabricated trust signal on the buyer's product page (invariant #9:
  // label simulations honestly).
  const isMeasured = measurement !== null;

  const mapped =
    measurement?.mappedSize ??
    (chest !== undefined
      ? toSizeChart({
          chest_cm: chest, length_cm: length ?? 0, waist_cm: waist ?? 0,
          reference_used: "a4", confidence: 0.9,
        }).size
      : null);

  const rows = [
    { label: t("product.size.chest"), value: chest },
    { label: t("product.size.length"), value: length },
    { label: t("product.size.waist"), value: waist },
  ].filter((r): r is { label: string; value: number } => r.value !== undefined);

  return (
    <section className="buyer-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-zinc-800">
          <Ruler className="h-4 w-4 text-asli-violet" aria-hidden />
          {t("product.size.title")}
        </h2>
        {isMeasured ? (
          <span className="rounded-full bg-asli-green/10 px-2.5 py-1 text-[11px] font-semibold text-asli-green">
            {t("product.size.measured")}
          </span>
        ) : (
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-500">
            {t("product.size.simulated")}
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {rows.map((r) => (
          <div key={r.label} className="rounded-xl bg-zinc-50 px-3 py-2 text-center">
            <div className="text-[11px] uppercase tracking-wide text-zinc-400">{r.label}</div>
            <div className="font-mono text-sm font-bold text-zinc-800">
              {r.value} {t("product.size.cm")}
            </div>
          </div>
        ))}
      </div>
      {mapped && (
        <p className="mt-3 text-xs text-zinc-500">
          {t(isMeasured ? "product.size.mapsMeasured" : "product.size.mapsDemo", { size: mapped })}
        </p>
      )}
    </section>
  );
}
