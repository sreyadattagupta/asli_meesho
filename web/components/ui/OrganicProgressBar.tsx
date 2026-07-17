"use client";

// An organic-feeling progress fill: it eases toward a cap and never claims 100% on its own, then
// snaps to completion once the real work (`done`) actually finishes. The easing math lives in
// lib/organicProgress.ts so it can be unit tested without mounting this component.
import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";
import { deriveK, finalizeProgress, stepToward } from "@/lib/organicProgress";

const TICK_MS = 120;
const CAP = 0.92;
const FINISH_MS = 300;

export function OrganicProgressBar({
  expectedMs,
  done,
  className,
}: {
  /** Roughly how long the real operation is expected to take, in ms — shapes the creep rate. */
  expectedMs: number;
  /** Flips true when the real work finishes; the bar then jumps to 100%. */
  done: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [progress, setProgress] = useState(0); // 0..1

  // Organic creep toward CAP while the work is still in flight.
  useEffect(() => {
    if (done) return;
    const k = deriveK(expectedMs, TICK_MS);
    const id = setInterval(() => setProgress((p) => stepToward(p, CAP, k)), TICK_MS);
    return () => clearInterval(id);
  }, [done, expectedMs]);

  // Once the real work is done, jump the target to 100% — the CSS width transition animates it.
  useEffect(() => {
    setProgress((p) => finalizeProgress(p, done));
  }, [done]);

  const pct = Math.round(progress * 100);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/10", className)}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-asli-violet to-asli-pink"
        style={{
          width: `${pct}%`,
          // Reduced motion: instant width jumps, no eased transition.
          transition: reduce ? "none" : `width ${done ? FINISH_MS : TICK_MS}ms ease-out`,
        }}
      />
    </div>
  );
}
