"use client";

import { cn } from "@/lib/cn";
import { ShieldHalf, ShoppingBag, Store } from "lucide-react";
import type { Role } from "@/lib/db/types";

const personas: { role: Role; label: string; icon: typeof Store }[] = [
  { role: "seller", label: "Seller", icon: Store },
  { role: "buyer", label: "Buyer", icon: ShoppingBag },
  { role: "admin", label: "Admin", icon: ShieldHalf },
];

/** Labelled demo convenience — judges hop personas in one click (prod would gate roles). */
export function PersonaSwitcher({ current, onSwitch }: {
  current: Role; onSwitch: (r: Role) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="rounded-full bg-asli-amber/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-asli-amber">
        demo
      </span>
      <div role="group" aria-label="Switch persona (demo)" className="flex rounded-full border border-white/10 bg-white/[0.04] p-0.5">
        {personas.map(({ role, label, icon: Icon }) => (
          <button
            key={role}
            onClick={() => onSwitch(role)}
            aria-pressed={current === role}
            className={cn(
              "flex min-h-[36px] items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet",
              current === role ? "bg-asli-violet text-white" : "text-white/60 hover:text-white",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">{label}</span>
            <span className="sr-only sm:hidden">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
