// Trust & Safety console shell — dark Asli skin (inherited).
//
// This layout is the ROLE GUARD for every /admin/* page. It used to be a client component, which
// cannot read the session, and none of the admin pages checked the role either: middleware only
// proves you are signed in ("this gate only keeps signed-out users out of the shell"), so any
// authenticated buyer or seller could open the admin console and see the reviewer UI. The APIs
// 403'd so no data loaded — but the shell rendering at all is what CLAUDE.md §11's "middleware gate
// + per-route role re-check" exists to prevent.
//
// A server layout guards every nested route from one place; the nav moves to a client child.
import type { ReactNode } from "react";
import { requirePortal } from "@/lib/guards";
import { PortalShell } from "@/components/nav/PortalShell";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requirePortal("admin");
  return <PortalShell role="admin">{children}</PortalShell>;
}
