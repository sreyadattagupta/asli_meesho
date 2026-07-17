"use client";

// Shared loading UI for both the reverse-image check (inline, over the upload card) and portal
// navigation (full-screen, over the content region). Composes a themed icon, OrganicProgressBar,
// and a message that rotates every few seconds (lib/useRotatingMessage.ts).
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useRotatingMessage } from "@/lib/useRotatingMessage";
import { OrganicProgressBar } from "./OrganicProgressBar";

export function LoadingOverlay({
  variant,
  messages,
  expectedMs,
  done,
  label,
}: {
  /** "inline" covers a card (parent must be `relative`); "screen" covers the content region. */
  variant: "inline" | "screen";
  messages: string[];
  expectedMs: number;
  done: boolean;
  /** Stable screen-reader text — the ONLY thing the live region announces. */
  label: string;
}) {
  const reduce = useReducedMotion();
  const message = useRotatingMessage(messages);

  return (
    // role=status/aria-live carries only `label` (via the sr-only span below); the rotating funny
    // text is aria-hidden so it isn't re-announced every 3s.
    <div
      role="status"
      aria-live="polite"
      aria-busy={!done}
      className={cn(
        "grid place-items-center bg-[#0b0715]/80 backdrop-blur-sm",
        variant === "inline" ? "absolute inset-0 z-20 rounded-2xl" : "fixed inset-x-0 bottom-0 top-14 z-30",
      )}
    >
      <span className="sr-only">{label}</span>
      <div className="flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl border border-white/10 bg-[#160f26]/90 px-6 py-5 text-center shadow-2xl">
        <Loader2 className={cn("h-6 w-6 text-asli-violet", !reduce && "animate-spin")} aria-hidden />
        <OrganicProgressBar expectedMs={expectedMs} done={done} className="w-full" />
        {reduce ? (
          <p aria-hidden className="min-h-[1.25rem] text-sm font-medium text-white/70">
            {message}
          </p>
        ) : (
          <AnimatePresence mode="wait">
            <motion.p
              key={message}
              aria-hidden
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="min-h-[1.25rem] text-sm font-medium text-white/70"
            >
              {message}
            </motion.p>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
