"use client";

// The screening record, filterable and exportable.
//
// CSV rather than a chart library: this is the artefact a reviewer takes to a weekly meeting or an
// audit, and it has to open in whatever they already use. Built in the browser from rows we already
// have — no new dependency, no export endpoint to secure.
import { useMemo, useState } from "react";
import { Download, FileBarChart } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";

export interface ListingReportRow {
  listingId: string;
  title: string;
  shop: string;
  category: string;
  status: string;
  verified: boolean;
  price: number;
  action: string | null;
  requiredConfidence: number | null;
  confidence: number | null;
  createdAt: string;
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "verified", label: "✓ Verified" },
  { key: "escalated", label: "Escalated" },
  { key: "blocked", label: "Blocked" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const CSV_COLUMNS = [
  "listing_id", "title", "shop", "category", "status", "verified",
  "price_inr", "action", "required_confidence", "confidence", "created_at",
] as const;

/** RFC-4180 escaping: a title with a comma or a quote must not shift every later column. */
function csvCell(v: string | number | boolean | null): string {
  if (v === null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: ListingReportRow[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.listingId, r.title, r.shop, r.category, r.status, r.verified,
        r.price, r.action, r.requiredConfidence, r.confidence, r.createdAt,
      ].map(csvCell).join(","),
    );
  }
  return lines.join("\n");
}

export function ReportTable({ rows }: { rows: ListingReportRow[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const shown = useMemo(() => {
    switch (filter) {
      case "verified":
        return rows.filter((r) => r.verified);
      case "escalated":
        return rows.filter((r) => r.status === "escalated" || r.action === "ESCALATE_HUMAN");
      case "blocked":
        return rows.filter((r) => r.status === "blocked" || r.action === "BLOCK");
      default:
        return rows;
    }
  }, [rows, filter]);

  function download() {
    const blob = new Blob([toCsv(shown)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Date-stamped: these get filed, and three files called "report.csv" help nobody.
    a.download = `asli-listings-${filter}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={FileBarChart}
        title="Nothing to report yet"
        hint="Listings appear here once sellers have put them through the agents."
      />
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex flex-wrap gap-1.5" aria-label="Report filter">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`min-h-[44px] rounded-xl px-3.5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet ${
                filter === f.key
                  ? "bg-asli-violet text-white"
                  : "border border-white/10 text-white/50 hover:bg-white/5"
              }`}
            >
              {f.label}
            </button>
          ))}
        </nav>
        <button
          onClick={download}
          className="btn-ghost ml-auto inline-flex min-h-[44px] items-center gap-1.5"
        >
          <Download className="h-4 w-4" aria-hidden />
          Export CSV ({shown.length})
        </button>
      </div>

      <div className="card overflow-x-auto p-1">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-white/30">
              <th className="px-3 py-3 font-semibold">Listing</th>
              <th className="px-3 font-semibold">Shop</th>
              <th className="px-3 font-semibold">Status</th>
              <th className="px-3 font-semibold">Decision</th>
              <th className="px-3 text-right font-semibold">Scored / required</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.listingId} className="border-t border-white/5">
                <td className="max-w-[16rem] truncate px-3 py-3 font-medium text-white/80">
                  {r.title}
                </td>
                <td className="max-w-[10rem] truncate px-3 text-white/45">{r.shop}</td>
                <td className="px-3">
                  <Badge variant={r.verified ? "verified" : r.status === "blocked" ? "blocked" : "neutral"}>
                    {r.verified ? "verified" : r.status}
                  </Badge>
                </td>
                <td className="px-3 text-xs text-white/45">{r.action ?? "—"}</td>
                <td className="px-3 py-3 text-right font-mono text-xs">
                  {r.confidence === null ? (
                    <span className="text-white/25">—</span>
                  ) : (
                    <span
                      className={
                        r.requiredConfidence !== null && r.confidence >= r.requiredConfidence
                          ? "text-asli-green"
                          : "text-asli-amber"
                      }
                    >
                      {Math.round(r.confidence * 100)}%
                      {r.requiredConfidence !== null && (
                        <span className="text-white/30"> / {Math.round(r.requiredConfidence * 100)}%</span>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shown.length === 0 && (
        <p className="py-6 text-center text-sm text-white/35">No listings match this filter.</p>
      )}
    </>
  );
}
