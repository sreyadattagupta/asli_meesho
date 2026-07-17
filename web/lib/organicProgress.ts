// Pure math behind OrganicProgressBar's fill curve, split out from the component so it's unit
// testable without mounting anything (the component itself pulls in framer-motion, which needs a
// real render to exercise meaningfully).

/** One tick of exponential easing toward `cap`: closes a `k` fraction of the remaining gap. */
export function stepToward(progress: number, cap: number, k: number): number {
  return progress + (cap - progress) * k;
}

/**
 * Derive a per-tick easing constant from the expected total duration, so the curve's rate roughly
 * tracks how long the real operation is expected to take — a 20s expectedMs creeps far slower than
 * a 1.2s one. Clamped so degenerate `expectedMs` values (0, huge) still produce a sane curve.
 */
export function deriveK(expectedMs: number, tickMs: number): number {
  const ticks = Math.max(1, expectedMs / tickMs);
  // Close ~90% of the gap to the cap by the time `expectedMs` has elapsed.
  const k = 1 - Math.pow(0.1, 1 / ticks);
  return Math.min(0.5, Math.max(0.01, k));
}

/** Once `done`, the target jumps straight to 100% (1); otherwise the organic progress stands. */
export function finalizeProgress(progress: number, done: boolean): number {
  return done ? 1 : progress;
}
