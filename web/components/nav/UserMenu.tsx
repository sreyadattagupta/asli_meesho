"use client";

// The account menu in the global header: Profile · Settings · Sign out.
//
// Targets come from the role's own nav config (lib/nav.ts), so the menu offers Settings to a seller
// (who has that page) and not to a buyer (who does not) without hardcoding either.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, LogOut, ShieldHalf, ShoppingBag, Store } from "lucide-react";
import { NAV } from "@/lib/nav";
import { ROLE_LABEL } from "@/lib/roles";
import { useT } from "@/lib/i18n";
import type { Role } from "@/lib/db/types";

const ACCOUNT_LABELS = ["Profile", "Settings"];

// The persona switcher's mobile home — see PersonaSwitcher for why it moves here below `sm`.
const PERSONAS: { role: Role; label: string; icon: typeof Store }[] = [
  { role: "seller", label: "Seller", icon: Store },
  { role: "buyer", label: "Buyer", icon: ShoppingBag },
  { role: "admin", label: "Admin", icon: ShieldHalf },
];

export function UserMenu({
  name,
  role,
  onSwitchPersona,
}: {
  name: string;
  role: Role;
  onSwitchPersona: (r: Role) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape — a menu you can only dismiss by picking something is a
  // trap for both mouse and keyboard.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const accountLinks = NAV[role].filter((i) => ACCOUNT_LABELS.includes(i.label));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex min-h-[36px] items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
      >
        <span className="grid h-5 w-5 place-items-center rounded-full bg-asli-violet/25 text-[10px] font-bold text-asli-violet">
          {name.charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-[10ch] truncate sm:inline">{name}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#160f26] shadow-xl"
          >
            <div className="border-b border-white/10 px-3 py-2.5">
              <p className="truncate text-sm font-semibold text-white">{name}</p>
              <p className="text-[11px] capitalize text-white/40">{ROLE_LABEL[role]}</p>
            </div>
            {/* Mobile-only: the header's persona group lives here instead (PersonaSwitcher). */}
            <div className="border-b border-white/10 py-1 sm:hidden">
              <p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wide text-asli-amber">
                Demo · switch persona
              </p>
              {PERSONAS.map(({ role: r, label, icon: Icon }) => (
                <button
                  key={r}
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    if (r !== role) onSwitchPersona(r);
                  }}
                  aria-current={r === role ? "true" : undefined}
                  className={`flex min-h-[40px] w-full items-center gap-2.5 px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-asli-violet ${
                    r === role ? "text-asli-violet" : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                  {r === role && <span className="ml-auto text-[10px] uppercase">current</span>}
                </button>
              ))}
            </div>

            {accountLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex min-h-[40px] items-center gap-2.5 px-3 py-2 text-sm text-white/70 transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-asli-violet"
              >
                <item.icon className="h-4 w-4" aria-hidden />
                {item.label}
              </Link>
            ))}
            {/* A plain <a>: signing out is a server route that clears the cookie and redirects — a
                client-side navigation would keep the stale session in memory. */}
            <a
              href="/api/auth/logout"
              role="menuitem"
              className="flex min-h-[40px] items-center gap-2.5 border-t border-white/10 px-3 py-2 text-sm text-white/70 transition hover:bg-asli-red/10 hover:text-asli-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-asli-violet"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              {t("nav.signout")}
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
