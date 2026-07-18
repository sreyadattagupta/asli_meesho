"use client";

// Mounted once in AppShell (always present, so it survives the portal shell swapping on a persona
// switch). Shows a full-screen loading overlay between the start of a navigation and the destination
// page rendering, held for a minimum dwell so the message is readable rather than flashing. A hard
// MAX_WAIT safety timeout always clears it, so a cancelled or failed navigation can't leave it stuck.
//
// Two ways a run starts:
//   1. Explicit `start()` calls — the sidebar (tailored copy) and the persona switcher (AppShell).
//   2. The global capture-phase click listener below — any other in-app <a> navigation (product
//      cards, breadcrumbs, dashboard buttons…), so "it's loading" feedback is app-wide, not just on
//      the sidebar.
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useNavLoadingStore } from "@/lib/store";
import { navMessagesForPath } from "@/lib/nav";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";

const MIN_DWELL = 1200;
const MAX_WAIT = 8000;
const POLL_MS = 100;
const EXPECTED_MS = 1200;

export function NavLoadingController() {
  const active = useNavLoadingStore((s) => s.active);
  const messages = useNavLoadingStore((s) => s.messages);
  const startedAt = useNavLoadingStore((s) => s.startedAt);
  const startPath = useNavLoadingStore((s) => s.startPath);
  const start = useNavLoadingStore((s) => s.start);
  const stop = useNavLoadingStore((s) => s.stop);
  const pathname = usePathname();

  // Global interceptor for ordinary link navigations. Capture phase so we fire before the router
  // handles the click. We deliberately skip anything that isn't a plain same-tab, same-origin,
  // different-page left-click — and the sidebar, which starts its own run with tailored copy.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      if (anchor.closest('nav[aria-label$="navigation"]')) return; // sidebar handles its own copy
      const href = anchor.getAttribute("href");
      if (!href) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return; // external link
      if (url.pathname === window.location.pathname) return; // same page / in-page hash
      start(navMessagesForPath(url.pathname));
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [start]);

  // Clear once the live path differs from where we started AND the minimum dwell has elapsed.
  // pathname is a dependency, so the interval closure always sees the current route.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      const changed = startPath !== null && pathname !== startPath;
      if (changed && Date.now() - startedAt >= MIN_DWELL) stop();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [active, startPath, startedAt, pathname, stop]);

  // Safety net: a navigation that errors, is cancelled, or never resolves can't leave this stuck.
  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => stop(), MAX_WAIT);
    return () => clearTimeout(id);
  }, [active, startedAt, stop]);

  if (!active) return null;

  return (
    <LoadingOverlay
      variant="screen"
      messages={messages}
      expectedMs={EXPECTED_MS}
      done={false}
      label="Loading page…"
    />
  );
}
