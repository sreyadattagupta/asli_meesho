"use client";

import { cn } from "@/lib/cn";

/** EN | हि toggle — Bharat-first sellers switch the flow language in one tap. */
export function LanguageToggle({ locale, onToggle }: {
  locale: "en" | "hi"; onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      aria-label={locale === "en" ? "हिंदी में बदलें" : "Switch to English"}
      className="flex min-h-[36px] items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
    >
      <span className={cn(locale === "en" ? "text-white" : "text-white/40")}>EN</span>
      <span className="text-white/30" aria-hidden>|</span>
      <span className={cn(locale === "hi" ? "text-white" : "text-white/40")}>हि</span>
    </button>
  );
}
