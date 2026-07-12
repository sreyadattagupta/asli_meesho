"use client";

import { useSellerStore } from "@/lib/store";

// Step 6 — the listing goes LIVE, Asli Verified.
export default function ResultStep() {
  const { sizeChart, catalogPreview, reset } = useSellerStore();

  return (
    <div className="card border-asli-green/30 p-8 text-center">
      <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-asli-green/20 text-3xl">
        ✓
      </div>
      <span className="pill bg-asli-green/15 text-asli-green ring-1 ring-asli-green/30">
        ✓ Asli Verified — now LIVE
      </span>
      <h2 className="mt-4 text-3xl font-black">Your listing is live</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-white/50">
        Possession proven with today’s live code, size chart measured — not
        guessed. Buyers see a listing they can trust.
      </p>

      <div className="mx-auto mt-6 max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] text-left">
        {catalogPreview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={catalogPreview} alt="listing" className="h-48 w-full object-cover" />
        )}
        <div className="flex items-center justify-between p-4">
          <div>
            <div className="font-semibold">Verified listing</div>
            <div className="text-xs text-white/40">
              {sizeChart ? `Size ${sizeChart.size} · chest ${sizeChart.chestInches}"` : "Asli Verified"}
            </div>
          </div>
          <span className="pill bg-asli-green/15 text-asli-green">✓ Asli</span>
        </div>
      </div>

      <button className="btn-ghost mt-8" onClick={reset}>
        List another product
      </button>
    </div>
  );
}
