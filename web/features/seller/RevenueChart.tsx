// Revenue bars, hand-rolled SVG.
//
// A chart library would be a new dependency (§11) for one chart on one screen. This is ~30 lines,
// ships no JS, and scales to the data it's given.
export function RevenueChart({ series }: { series: { day: string; value: number }[] }) {
  const max = Math.max(...series.map((p) => p.value), 1); // 1 floor: never divide by zero on a new seller
  const empty = series.every((p) => p.value === 0);

  return (
    <div>
      <div className="flex h-32 items-end gap-1.5" role="img" aria-label={`Revenue for the last ${series.length} days`}>
        {series.map((p) => (
          <div key={p.day} className="flex flex-1 flex-col items-center gap-1.5">
            <div
              className={`w-full rounded-t transition-all ${empty ? "bg-white/5" : "bg-asli-violet/70"}`}
              // A zero day still gets a hairline, so the axis reads as a row of days rather than a gap.
              style={{ height: `${empty ? 2 : Math.max(2, (p.value / max) * 100)}%` }}
              title={`${p.day}: ₹${p.value}`}
            />
            <span className="text-[9px] text-white/25">{p.day.slice(8)}</span>
          </div>
        ))}
      </div>
      {empty && (
        <p className="mt-3 text-xs text-white/35">
          No orders yet — your first sale will show up here.
        </p>
      )}
    </div>
  );
}
