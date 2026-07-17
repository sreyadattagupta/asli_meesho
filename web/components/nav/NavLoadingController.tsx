"use client";

// Mounted once in PortalShell. Shows a full-screen loading overlay between a sidebar nav click
// (see SidebarNav's onClick) and the destination page actually rendering, held for a minimum
// dwell so the witty message is always readable rather than flashing. A hard MAX_WAIT safety
// timeout always clears it, so a cancelled or failed navigation can never leave it stuck.
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useNavLoadingStore } from "@/lib/store";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";

const MIN_DWELL = 1200;
const MAX_WAIT = 8000;
const POLL_MS = 100;
const EXPECTED_MS = 1200;

export function NavLoadingController() {
  const active = useNavLoadingStore((s) => s.active);
  const messages = useNavLoadingStore((s) => s.messages);
  const startedAt = useNavLoadingStore((s) => s.startedAt);
  const stop = useNavLoadingStore((s) => s.stop);
  const pathname = usePathname();

  // The path we were on when this run started — captured on the render where `active` flips true,
  // which happens before the <Link> actually completes its transition — so we can tell once the
  // route has genuinely changed.
  const originPathRef = useRef<string | null>(null);
  const wasActiveRef = useRef(false);
  if (active && !wasActiveRef.current) originPathRef.current = pathname;
  wasActiveRef.current = active;

  // Latest values for the polling closure below, without re-subscribing the interval every render.
  const latestRef = useRef({ pathname, startedAt });
  latestRef.current = { pathname, startedAt };

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      const { pathname: p, startedAt: s } = latestRef.current;
      const pathChanged = originPathRef.current !== null && p !== originPathRef.current;
      const dwelled = Date.now() - s >= MIN_DWELL;
      if (pathChanged && dwelled) stop();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [active, stop]);

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
