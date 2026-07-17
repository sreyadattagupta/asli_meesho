"use client";

// Unread indicator. The count is whatever /api/notifications/count says is waiting for THIS role —
// unread messages for a seller or buyer, listings sitting in the queue for an admin — so the badge
// always points at real rows, never a decoration.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

interface Notice {
  count: number;
  href: string;
  label: string;
}

// The seller/admin portals are the dark Asli trust skin; the buyer marketplace is the bright Meesho
// retail one (CLAUDE.md §9). Same bell, two surfaces.
const SKIN = {
  dark: "border-white/10 bg-white/[0.04] text-white/50 hover:bg-white/10 hover:text-white focus-visible:ring-asli-violet",
  light: "border-zinc-200 bg-white text-zinc-500 hover:border-meesho-pink/40 hover:text-zinc-900 focus-visible:ring-meesho-pink",
} as const;

export function NotificationBell({ skin = "dark" }: { skin?: keyof typeof SKIN }) {
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const load = async () => {
      try {
        const res = await fetch("/api/notifications/count", { signal: ctrl.signal });
        if (res.ok) setNotice((await res.json()) as Notice);
      } catch {
        // Offline or signed out mid-session — leave the last known count rather than flashing a
        // wrong zero. The bell still navigates.
      }
    };
    void load();
    // Poll instead of a socket: the count is cheap, and a websocket for a badge is a lot of moving
    // parts to keep alive on a serverless deploy.
    const id = setInterval(load, 30_000);
    return () => {
      ctrl.abort();
      clearInterval(id);
    };
  }, []);

  if (!notice) return null;
  const badge = notice.count > 9 ? "9+" : String(notice.count);

  return (
    <Link
      href={notice.href}
      aria-label={notice.count > 0 ? `${notice.label}: ${notice.count}` : notice.label}
      className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 ${SKIN[skin]}`}
    >
      <Bell className="h-4 w-4" aria-hidden />
      {notice.count > 0 && (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 grid h-4 min-w-[1rem] place-items-center rounded-full bg-asli-pink px-1 text-[10px] font-bold text-white"
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
