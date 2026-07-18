"use client";

import Link from "next/link";
import { ArrowLeft, Star, Store } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { TrustBand } from "@/lib/db/types";

/** Back-to link above the product gallery — label depends on where the buyer came from. */
export function ProductBackLink({ href, toListings }: { href: string; toListings: boolean }) {
  const t = useT();
  return (
    <Link
      href={href}
      className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-meesho-pink"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden /> {t(toListings ? "product.backToListings" : "product.backToShop")}
    </Link>
  );
}

/** Title, simulated rating, seller-band, category and description — the facts block on product detail. */
export function ProductInfoHeader({
  title,
  category,
  description,
  trustBand,
}: {
  title: string;
  category: string;
  description?: string;
  trustBand: TrustBand;
}) {
  const t = useT();
  const sellerLabel =
    trustBand === "high" ? t("product.seller.high") : trustBand === "medium" ? t("product.seller.established") : t("product.seller.new");

  return (
    <div>
      <h1 className="text-xl font-bold leading-snug text-zinc-900 sm:text-2xl">{title}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        {/* A hardcoded 4.3 sat here — the same number on every product, presented as if
            buyers had rated it. There is no review data in this system, so it is labelled
            rather than dressed up (invariant #9). The trust band beside it IS real. */}
        <span
          className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 font-semibold text-zinc-500"
          title={t("product.ratingTooltip")}
        >
          <Star className="h-3.5 w-3.5 fill-current" aria-hidden /> 4.3
          <span className="ml-1 text-[10px] font-normal uppercase tracking-wide text-zinc-400">
            {t("product.ratingSimulated")}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-zinc-500">
          <Store className="h-3.5 w-3.5" aria-hidden />
          {sellerLabel}
        </span>
        <span className="capitalize text-zinc-400">{category}</span>
      </div>
      {description && <p className="mt-2 text-sm leading-relaxed text-zinc-500">{description}</p>}
    </div>
  );
}
