"use client";

import Link from "next/link";
import { Truck, Wallet } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { Listing } from "@/lib/db/types";

/** Price + purchase CTA — routes into the mock checkout. */
export function BuyBox({ listing }: { listing: Listing }) {
  const t = useT();
  const pct = Math.round(100 - (listing.price / (listing.price * 1.4)) * 100);
  return (
    <section className="buyer-card p-4">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-black text-zinc-900">₹{listing.price}</span>
        <span className="text-sm text-zinc-400 line-through">
          ₹{Math.round(listing.price * 1.4)}
        </span>
        <span className="text-sm font-semibold text-asli-green">{t("product.off", { pct })}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1">
          <Truck className="h-3.5 w-3.5" aria-hidden /> {t("product.freeDeliveryFull")}
        </span>
        <span className="inline-flex items-center gap-1">
          <Wallet className="h-3.5 w-3.5" aria-hidden /> {t("product.cashOnDelivery")}
        </span>
      </div>
      <Link
        href={`/checkout?listing=${listing.id}`}
        className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-meesho-pink px-5 py-3 font-semibold text-white transition hover:bg-meesho-deep active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-meesho-deep"
      >
        {t("product.buyNow")} →
      </Link>
    </section>
  );
}
