"use client";

import { cn } from "@/lib/cn";
import { ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n";

/** The brand payoff — appears on marketplace cards, product detail, and go-live. */
export function VerifiedBadge({ size = "md" }: { size?: "sm" | "md" }) {
  const t = useT();
  const sm = size === "sm";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-asli-green/15 font-semibold text-asli-green ring-1 ring-asli-green/30",
        "shadow-[0_0_12px_rgba(34,197,94,0.25)]",
        sm ? "gap-1 px-2 py-0.5 text-[11px]" : "gap-1.5 px-3 py-1 text-xs",
      )}
    >
      <ShieldCheck className={sm ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden />
      {t("verified.badge")}
    </span>
  );
}
