"use client";

import { cn } from "@/lib/cn";
import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { Fragment } from "react";

/** Animated flow progress — active pill glides between steps, done connectors fill green. */
export function Stepper({ steps, currentId, doneIds }: {
  steps: { id: string; label: string }[]; currentId: string; doneIds: string[];
}) {
  const reduce = useReducedMotion();
  return (
    <ol className="flex items-center gap-1" aria-label="Progress">
      {steps.map((step, i) => {
        const done = doneIds.includes(step.id);
        const current = step.id === currentId;
        return (
          <Fragment key={step.id}>
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  "h-px min-w-3 flex-1 transition-colors duration-300",
                  done || current ? "bg-asli-green/60" : "bg-white/10",
                )}
              />
            )}
            <li
              aria-current={current ? "step" : undefined}
              className={cn(
                "relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
                done ? "text-asli-green" : current ? "text-white" : "text-white/40",
              )}
            >
              {current && (
                <motion.span
                  layoutId="step-pill"
                  className="absolute inset-0 rounded-full bg-asli-violet/25 ring-1 ring-asli-violet/50"
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 32 }}
                  aria-hidden
                />
              )}
              <span className="relative flex items-center gap-1.5">
                {done && <Check className="h-3 w-3" aria-hidden />}
                {step.label}
              </span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
