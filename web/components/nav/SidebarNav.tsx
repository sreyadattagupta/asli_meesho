"use client";

// The portal's link list. Client-side because the active item depends on the current path.
// Items come from lib/nav.ts — this component renders whatever the config says and knows nothing
// about which portal it is in.
import Link from "next/link";
import { NAV, isActive, navMessagesFor } from "@/lib/nav";
import { useNavLoadingStore } from "@/lib/store";
import type { Role } from "@/lib/db/types";

export function SidebarNav({
  role,
  path,
  onNavigate,
}: {
  role: Role;
  path: string;
  /** Mobile drawer closes on tap; the desktop rail passes nothing. */
  onNavigate?: () => void;
}) {
  const startNavLoading = useNavLoadingStore((s) => s.start);

  return (
    <nav aria-label={`${role} navigation`} className="flex flex-col gap-0.5">
      {NAV[role].map((item) => {
        const active = isActive(path, item);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => {
              // Same-page clicks navigate nowhere, so starting the overlay would leave it stuck
              // with no pathname change to clear it.
              if (!active) startNavLoading(navMessagesFor(item));
              onNavigate?.();
            }}
            aria-current={active ? "page" : undefined}
            className={[
              "flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet",
              active
                ? "bg-asli-violet/15 text-white ring-1 ring-asli-violet/40"
                : "text-white/45 hover:bg-white/5 hover:text-white/80",
            ].join(" ")}
          >
            <Icon className={`h-4 w-4 shrink-0 ${active ? "text-asli-violet" : ""}`} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
