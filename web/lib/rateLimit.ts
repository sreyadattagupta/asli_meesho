// Tiny in-memory sliding-window throttle. Lives outside route files because Next.js
// App Router forbids non-handler exports from `route.ts` (breaks `next build` typegen).

const log = new Map<string, number[]>();

/** True once `key` exceeds `max` hits within `windowMs`. Records the hit. */
export function rateLimited(key: string, max = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (log.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  log.set(key, recent);
  return recent.length > max;
}

/** Test-only reset of the window state. */
export function resetRateLimiter(): void {
  log.clear();
}
