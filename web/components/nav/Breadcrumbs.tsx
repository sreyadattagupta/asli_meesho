"use client";

// Trail derived from the path (lib/nav.ts breadcrumbs) — never hand-written per page, so a new route
// gets a correct trail without touching this file.
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { breadcrumbs } from "@/lib/nav";
import type { Role } from "@/lib/db/types";

export function Breadcrumbs({ path, role }: { path: string; role: Role }) {
  const crumbs = breadcrumbs(path, role);
  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1 text-xs">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={c.href} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-white/20" aria-hidden />}
              {last ? (
                // The current page is not a link — it's where you already are.
                <span aria-current="page" className="truncate font-semibold text-white/80">
                  {c.label}
                </span>
              ) : (
                <Link
                  href={c.href}
                  className="truncate text-white/40 transition hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
                >
                  {c.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
