"use client";

// Progress indicator for the listing wizard.
//
// Renders PHASES, not raw steps: Agent 1 spans trigger + challenge internally, but to the seller
// "prove you have it" is one thing that either happens or doesn't. The step machine stays granular
// (lib/orchestrator.ts) — this is only how it is shown.
import { motion, useReducedMotion } from "framer-motion";
import { FLOW_PHASES, FLOW_ORDER, FlowStep } from "@/lib/orchestrator";

export default function Stepper({ step }: { step: FlowStep }) {
  const reduce = useReducedMotion();
  const currentIndex = FLOW_ORDER.indexOf(step);
  const activePhase = FLOW_PHASES.findIndex((p) => p.steps.includes(step));

  return (
    <ol className="mb-8 flex flex-wrap items-center gap-1.5 text-xs" aria-label="Listing progress">
      {FLOW_PHASES.map((phase, i) => {
        const done = i < activePhase;
        const active = i === activePhase;
        // Multi-step phases show which part they are on ("1/2") — otherwise Agent 1 looks stuck.
        const within =
          active && phase.steps.length > 1
            ? ` ${phase.steps.indexOf(step) + 1}/${phase.steps.length}`
            : "";
        return (
          <li key={phase.key} className="flex items-center gap-1.5">
            <motion.span
              // Only the active pill animates: a whole row pulsing is noise, not progress.
              animate={active && !reduce ? { scale: [1, 1.04, 1] } : { scale: 1 }}
              transition={{ duration: 1.8, repeat: active && !reduce ? Infinity : 0, ease: "easeInOut" }}
              aria-current={active ? "step" : undefined}
              className={[
                "pill whitespace-nowrap ring-1",
                active
                  ? "bg-asli-violet text-white ring-asli-violet"
                  : done
                    ? "bg-asli-green/15 text-asli-green ring-asli-green/30"
                    : "bg-white/5 text-white/40 ring-white/10",
              ].join(" ")}
            >
              {done ? "✓" : i + 1} {phase.label}
              {within}
            </motion.span>
            {i < FLOW_PHASES.length - 1 && <span className="text-white/20">→</span>}
          </li>
        );
      })}
      <span className="sr-only">
        Step {currentIndex + 1} of {FLOW_ORDER.length}
      </span>
    </ol>
  );
}
