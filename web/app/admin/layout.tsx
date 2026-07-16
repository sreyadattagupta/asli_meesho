// Trust & Safety console shell — dark Asli skin (inherited), tabbed nav.
//
// This layout is the ROLE GUARD for every /admin/* page. It used to be a client component, which
// cannot read the session, and none of the admin pages checked the role either: middleware only
// proves you are signed in ("this gate only keeps signed-out users out of the shell"), so any
// authenticated buyer or seller could open the admin console and see the reviewer UI. The APIs
// 403'd so no data loaded — but the shell rendering at all is what CLAUDE.md §11's "middleware gate
// + per-route role re-check" exists to prevent.
//
// A server layout guards every nested route from one place; the tabs move to a client child.
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import { AdminNav } from "@/features/admin/AdminNav";

const ROLE_HOME = { seller: "/seller", buyer: "/shop", admin: "/admin" } as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?returnTo=/admin");
  // Signed in but not an admin: send them to their own home rather than a dead end.
  if (user.role !== "admin") redirect(ROLE_HOME[user.role] ?? "/shop");

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-asli-violet" aria-hidden />
        <h1 className="text-xl font-black tracking-tight">Trust &amp; Safety</h1>
        <span className="pill bg-white/5 text-white/40">admin console</span>
      </div>

      <AdminNav />
      {children}
    </main>
  );
}
