"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n";

const FILTERS = [
  { key: "all", labelKey: "shop.filter.all" },
  { key: "verified", labelKey: "shop.filter.verified" },
] as const;

/** Shop title, subtitle, and verified-filter nav — client so the storefront localizes. */
export function ShopHeader({ filter }: { filter: string }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-black tracking-tight">{t("shop.title")}</h1>
        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-zinc-500">
          <ShieldCheck className="h-4 w-4 text-asli-green" aria-hidden />
          {t("shop.subtitle")}
        </p>
      </div>
      <nav className="flex gap-2" aria-label="Feed filter">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/buyer/dashboard" : `/buyer/dashboard?filter=${f.key}`}
            aria-current={filter === f.key ? "page" : undefined}
            className={[
              "min-h-[44px] rounded-full px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-meesho-pink",
              filter === f.key
                ? "bg-meesho-pink text-white"
                : "border border-zinc-200 bg-white text-zinc-600 hover:border-meesho-pink/40",
            ].join(" ")}
          >
            {t(f.labelKey)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
