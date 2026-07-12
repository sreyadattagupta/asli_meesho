"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { Card } from "./Card";

/** Admin metric tile — 800ms ease-out count-up (instant under reduced motion). */
export function StatTile({ label, value, suffix, countUp = true }: {
  label: string; value: number; suffix?: string; countUp?: boolean;
}) {
  const reduce = useReducedMotion();
  const animate = countUp && !reduce;
  const [shown, setShown] = useState(animate ? 0 : value);

  useEffect(() => {
    if (!animate) { setShown(value); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / 800, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setShown(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, animate]);

  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-2xl font-black tabular-nums tracking-tight">
        {shown.toLocaleString("en-IN")}
        {suffix && <span className="ml-0.5 text-base font-bold text-white/60">{suffix}</span>}
      </span>
      <span className="text-xs font-medium text-white/50">{label}</span>
    </Card>
  );
}
