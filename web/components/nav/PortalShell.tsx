"use client";

// The frame every portal page sits in: sidebar rail (desktop) / drawer (mobile), a strip with the
// breadcrumb trail and the unread bell, then the page. Used by /seller, /buyer and /admin alike —
// the only difference between them is the `role` it looks up in lib/nav.ts.
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { SidebarNav } from "./SidebarNav";
import { Breadcrumbs } from "./Breadcrumbs";
import { NotificationBell } from "./NotificationBell";
import { NavLoadingController } from "./NavLoadingController";
import type { Role } from "@/lib/db/types";

// Lives in each portal's layout, so it does not know (or need) the page's title — pages render their
// own <PageHeader>. Keeping the frame in the layout is what stops the sidebar re-mounting, and
// losing its scroll position, on every navigation.
export function PortalShell({ role, children }: { role: Role; children: ReactNode }) {
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);
  const reduce = useReducedMotion();

  // A link tap inside the drawer changes the path but not this component's mount state, so without
  // this the drawer stays open over the page the user just asked for.
  useEffect(() => setDrawer(false), [path]);

  // Escape closes the drawer — a focus-trapping panel with no keyboard exit is a trap.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  return (
    <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6">
      <NavLoadingController />

      <aside className="hidden w-56 shrink-0 lg:block">
        <div className="sticky top-20">
          <SidebarNav role={role} path={path} />
        </div>
      </aside>

      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDrawer(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              aria-hidden
            />
            <motion.div
              // Reduced motion gets the panel without the slide — it still needs to appear.
              initial={reduce ? { opacity: 0 } : { x: "-100%" }}
              animate={reduce ? { opacity: 1 } : { x: 0 }}
              exit={reduce ? { opacity: 0 } : { x: "-100%" }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              className="fixed inset-y-0 left-0 z-50 w-64 border-r border-white/10 bg-[#0b0715] p-4 lg:hidden"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-bold text-white/70">Menu</span>
                <button
                  onClick={() => setDrawer(false)}
                  aria-label="Close navigation"
                  className="grid h-9 w-9 place-items-center rounded-full text-white/50 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <SidebarNav role={role} path={path} onNavigate={() => setDrawer(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="min-w-0 flex-1">
        <div className="mb-5 flex items-center gap-3">
          <button
            onClick={() => setDrawer(true)}
            aria-label="Open navigation"
            aria-expanded={drawer}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/60 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet lg:hidden"
          >
            <Menu className="h-4 w-4" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <Breadcrumbs path={path} role={role} />
          </div>
          <NotificationBell />
        </div>

        {children}
      </div>
    </div>
  );
}
