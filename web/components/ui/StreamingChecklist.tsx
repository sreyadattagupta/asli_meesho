"use client";

import { cn } from "@/lib/cn";
import { motion, useReducedMotion } from "framer-motion";
import { Check, X } from "lucide-react";

type ItemState = "pending" | "active" | "done" | "failed";

/** Live VLM progress — "checking product ✓ → reading code ✓ → scoring live…" */
export function StreamingChecklist({ items }: {
  items: { id: string; label: string; state: ItemState }[];
}) {
  const reduce = useReducedMotion();
  return (
    <ul className="flex flex-col gap-2" aria-live="polite">
      {items.map((item) => (
        <motion.li
          key={item.id}
          className={cn(
            "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm",
            item.state === "done" && "border-asli-green/25 bg-asli-green/10 text-white/90",
            item.state === "failed" && "border-asli-red/25 bg-asli-red/10 text-white/90",
            item.state === "active" && "border-asli-violet/30 bg-asli-violet/10 text-white",
            item.state === "pending" && "border-white/10 bg-white/[0.03] text-white/40",
          )}
          animate={item.state === "failed" && !reduce ? { x: [0, -6, 6, -3, 0] } : undefined}
          transition={{ duration: 0.35 }}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
            {item.state === "done" && (
              <motion.span
                initial={reduce ? false : { scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 24 }}
              >
                <Check className="h-4 w-4 text-asli-green" />
              </motion.span>
            )}
            {item.state === "failed" && <X className="h-4 w-4 text-asli-red" />}
            {item.state === "active" && (
              <span className={cn("h-2.5 w-2.5 rounded-full bg-asli-violet", !reduce && "animate-pulse")} />
            )}
            {item.state === "pending" && <span className="h-2.5 w-2.5 rounded-full bg-white/15" />}
          </span>
          <span className={cn(item.state === "pending" && !reduce && "animate-pulse")}>
            {item.label}
            {item.state === "active" && "…"}
          </span>
          <span className="sr-only">
            {item.state === "done" ? " — done" : item.state === "failed" ? " — failed" : item.state === "active" ? " — in progress" : " — waiting"}
          </span>
        </motion.li>
      ))}
    </ul>
  );
}
