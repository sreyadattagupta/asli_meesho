"use client";

// Trust & Safety console shell — dark Asli skin (inherited), tabbed nav.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListChecks, Users, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/queue", label: "Review queue", icon: ListChecks },
  { href: "/admin/users", label: "Roles", icon: Users },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-asli-violet" aria-hidden />
        <h1 className="text-xl font-black tracking-tight">Trust &amp; Safety</h1>
        <span className="pill bg-white/5 text-white/40">admin console</span>
      </div>

      <nav className="mb-6 flex flex-wrap gap-1.5" aria-label="Admin sections">
        {TABS.map((tab) => {
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

      {children}
    </main>
  );
}
