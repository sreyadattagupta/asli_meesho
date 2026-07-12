"use client";

import { FLOW_ORDER, FlowStep } from "@/lib/orchestrator";

const LABELS: Record<FlowStep, string> = {
  upload: "Upload",
  trigger: "Image check",
  challenge: "Live proof",
  sizing: "Auto-size",
  review: "Review",
  live: "Live",
};

export default function Stepper({ step }: { step: FlowStep }) {
  const current = FLOW_ORDER.indexOf(step);
  return (
    <ol className="mb-8 flex flex-wrap items-center gap-2 text-xs">
      {FLOW_ORDER.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={[
                "pill ring-1",
                active
                  ? "bg-asli-violet text-white ring-asli-violet"
                  : done
                    ? "bg-asli-green/15 text-asli-green ring-asli-green/30"
                    : "bg-white/5 text-white/40 ring-white/10",
              ].join(" ")}
            >
              {done ? "✓" : i + 1} {LABELS[s]}
            </span>
            {i < FLOW_ORDER.length - 1 && (
              <span className="text-white/20">→</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
