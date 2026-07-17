"use client";

// Buyer chrome: a light top nav, not the dark sidebar the seller and admin portals use.
//
// Two reasons it differs. The marketplace wears Meesho's bright retail skin (CLAUDE.md §9) — a dark
// rail would read as a different product. And a sidebar next to a product grid is not how any
// storefront works: the grid wants the width.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, isActive } from "@/lib/nav";
import { NotificationBell } from "./NotificationBell";

export function BuyerNav() {
  const path = usePathname();

  return (
    <div className="sticky top-14 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-1 px-4">
        <nav aria-label="Buyer navigation" className="flex flex-1 gap-1">
          {NAV.buyer.map((item) => {
            const active = isActive(path, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "-mb-px flex min-h-[44px] items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-meesho-pink",
                  active
                    ? "border-meesho-pink text-meesho-pink"
                    : "border-transparent text-zinc-500 hover:text-zinc-900",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <NotificationBell skin="light" />
      </div>
    </div>
  );
}
