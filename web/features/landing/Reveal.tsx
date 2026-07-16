"use client";

// Scroll reveal for the landing sections. One wrapper, used everywhere, so the page has a single
// motion vocabulary instead of per-section variants. Reduced motion drops the transform and keeps
// the fade — the content still arrives, it just doesn't travel (invariant #11).
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.45, ease: "easeOut", delay: reduce ? 0 : delay }}
    >
      {children}
    </motion.div>
  );
}
