"use client";

// One product row + its actions. Client because every action is a mutation with loading/error state.
//
// Actions call the same API a script would (PATCH/DELETE /api/listings/:id), which re-checks
// ownership server-side — this component never decides who may touch what.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, Trash2, Upload, EyeOff, RefreshCw } from "lucide-react";
import type { Listing, SizeMeasurement } from "@/lib/db/types";

const STATUS_STYLE: Record<string, string> = {
  live: "bg-asli-green/10 text-asli-green ring-asli-green/25",
  draft: "bg-white/5 text-white/50 ring-white/15",
  escalated: "bg-asli-amber/10 text-asli-amber ring-asli-amber/25",
  blocked: "bg-asli-red/10 text-asli-red ring-asli-red/25",
  rejected: "bg-asli-red/10 text-asli-red ring-asli-red/25",
  pending: "bg-asli-violet/10 text-asli-violet ring-asli-violet/25",
  archived: "bg-white/5 text-white/30 ring-white/10",
};

export function ProductRow({
  listing,
  measurement,
  trustScore,
}: {
  listing: Listing;
  measurement: SizeMeasurement | null;
  trustScore: number | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function call(action: string, init: RequestInit) {
    setBusy(action);
    setErr(null);
    try {
      const res = await fetch(`/api/listings/${listing.id}`, init);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(body?.error?.message ?? "That didn't go through."); return; }
      router.refresh();
    } catch {
      setErr("Network hiccup — retry.");
    } finally {
      setBusy(null);
    }
  }

  const setStatus = (status: "live" | "draft") =>
    call(status, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

  const archive = () => {
    // Archiving is reversible in the data but not from this screen — worth a confirm.
    if (!confirm(`Remove “${listing.title}” from the marketplace? Order history is kept.`)) return;
    call("archive", { method: "DELETE" });
  };

  const chart = measurement
    ? `${measurement.chestCm}·${measurement.waistCm}·${measurement.lengthCm} cm`
    : "—";

  return (
    <tr className="border-t border-white/5 align-middle">
      <td className="py-3 pr-3">
        <div className="font-medium text-white/85">{listing.title}</div>
        <div className="text-xs text-white/35">₹{listing.price} · {listing.category}</div>
        {err && <p role="alert" className="mt-1 text-xs text-asli-red">{err}</p>}
      </td>
      <td className="px-3">
        <span className={`pill ring-1 ${STATUS_STYLE[listing.status] ?? STATUS_STYLE.draft}`}>
          {listing.status}
        </span>
      </td>
      <td className="px-3">
        {listing.verified ? (
          <span className="text-xs font-semibold text-asli-green">✓ Verified</span>
        ) : (
          <span className="text-xs text-white/35">Not verified</span>
        )}
      </td>
      <td className="px-3 font-mono text-xs text-white/60">
        {trustScore === null ? "—" : `${Math.round(trustScore * 100)}%`}
      </td>
      <td className="px-3 font-mono text-xs text-white/60">{chart}</td>
      <td className="py-3 pl-3">
        <div className="flex flex-wrap items-center justify-end gap-1">
          {/* The public page only exists once a listing is live — /shop/:id notFound()s otherwise.
              Linking a draft there would 404 the seller out of their own portal, so it's disabled
              with the reason. `from=seller` gives the product page a back link that returns here. */}
          {listing.status === "live" ? (
            <Link
              href={`/shop/${listing.id}?from=seller`}
              className="rounded-lg p-2 text-white/50 transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
              aria-label={`View ${listing.title} in the marketplace`}
              title="View in the marketplace"
            >
              <Eye className="h-4 w-4" aria-hidden />
            </Link>
          ) : (
            <span
              className="cursor-not-allowed rounded-lg p-2 text-white/15"
              title="Publish this listing to give it a marketplace page"
              aria-label={`${listing.title} has no marketplace page until it is published`}
            >
              <Eye className="h-4 w-4" aria-hidden />
            </span>
          )}

          {/* Re-running the agents means walking the real flow — there is no "just re-score" shortcut
              that wouldn't fabricate a result, so this routes to the flow rather than faking one. */}
          <Link
            href={`/sell?listing=${listing.id}`}
            className="rounded-lg p-2 text-white/50 transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
            aria-label={`Re-run verification for ${listing.title}`}
            title="Re-run AI checks"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
          </Link>

          {listing.status === "live" ? (
            <button
              onClick={() => setStatus("draft")}
              disabled={busy !== null}
              className="rounded-lg p-2 text-white/50 transition hover:bg-white/5 hover:text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
              aria-label={`Unpublish ${listing.title}`}
              title="Unpublish"
            >
              <EyeOff className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <button
              onClick={() => setStatus("live")}
              disabled={busy !== null || listing.status === "archived"}
              className="rounded-lg p-2 text-white/50 transition hover:bg-white/5 hover:text-asli-green disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
              aria-label={`Publish ${listing.title}`}
              title="Publish"
            >
              <Upload className="h-4 w-4" aria-hidden />
            </button>
          )}

          <button
            onClick={archive}
            disabled={busy !== null || listing.status === "archived"}
            className="rounded-lg p-2 text-white/50 transition hover:bg-white/5 hover:text-asli-red disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-red"
            aria-label={`Remove ${listing.title}`}
            title="Remove from marketplace"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </td>
    </tr>
  );
}
