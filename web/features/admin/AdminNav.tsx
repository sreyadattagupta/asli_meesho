"use client";

// Admin console tabs. Client-only because the active tab depends on the current path — the role
// guard lives in the server layout above it (app/admin/layout.tsx).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListChecks, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/queue", label: "Review queue", icon: ListChecks },
  { href: "/admin/users", label: "Roles", icon: Users },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-1.5" aria-label="Admin sections">
      {TABS.map((tab) => {
        // Exact match for the index tab, prefix for the rest — otherwise every tab lights up on /admin.
        const active = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet",
              active
                ? "bg-asli-violet/15 text-asli-violet ring-1 ring-asli-violet/30"
                : "text-white/60 hover:bg-white/5",
            )}
          >
            <tab.icon className="h-4 w-4" aria-hidden />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
