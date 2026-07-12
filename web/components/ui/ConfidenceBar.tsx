"use client";

import { cn } from "@/lib/cn";
import { motion, useReducedMotion } from "framer-motion";

/** Animated 0..1 confidence fill; green at/above the required bar, amber below. */
export function ConfidenceBar({ value, bar }: { value: number; bar?: number }) {
  const reduce = useReducedMotion();
  const required = bar ?? 0.7;
  const pass = value >= required;
  const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={`Confidence ${pct}%${bar !== undefined ? `, required ${Math.round(required * 100)}%` : ""}`}
      className="relative h-2 w-full overflow-hidden rounded-full bg-white/10"
    >
      <motion.div
        className={cn("h-full rounded-full", pass ? "bg-asli-green" : "bg-asli-amber")}
        initial={reduce ? { width: `${pct}%` } : { width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 20 }}
      />
      {bar !== undefined && (
        <span
          aria-hidden
          className="absolute inset-y-0 w-0.5 bg-white/70"
          style={{ left: `${Math.round(required * 100)}%` }}
        />
      )}
    </div>
  );
}
