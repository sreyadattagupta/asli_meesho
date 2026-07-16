"use client";

// Portal tabs. Client-side only because the active tab depends on the current path.
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/seller", label: "Dashboard" },
  { href: "/seller/products", label: "Products" },
  { href: "/seller/profile", label: "Profile" },
];

export function SellerNav() {
  const path = usePathname();
  return (
    <nav className="mt-5 flex gap-1 border-b border-white/10" aria-label="Seller portal">
      {TABS.map((t) => {
        // Exact match for the index tab, prefix for the rest — otherwise /seller/products would
        // light up "Dashboard" too.
        const active = t.href === "/seller" ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px min-h-[44px] border-b-2 px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet ${
              active
                ? "border-asli-violet text-white"
                : "border-transparent text-white/45 hover:text-white/80"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
