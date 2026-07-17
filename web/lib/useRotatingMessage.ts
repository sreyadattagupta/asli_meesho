"use client";

// Rotates through a list of strings every `intervalMs`, driving the funny copy in LoadingOverlay.
// The interval-advance and shuffle are pure functions on purpose: they're the part worth unit
// testing, and keeping them free of React lets that happen without mounting a component.
import { useEffect, useRef, useState } from "react";

/** Fisher–Yates shuffle. Pure — does not mutate `arr`. */
export function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Advance a rotation index by one step, wrapping around `length`. Guards `length <= 0`. */
export function nextRotationIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return (index + 1) % length;
}

/**
 * Returns the current message, advancing to the next one every `intervalMs`. The order is
 * shuffled once per mount (stable across re-renders via `useRef`) so repeat visits don't always
 * open on the same line. Guards an empty array by returning "". Does not itself animate — motion
 * is the caller's concern (see LoadingOverlay's AnimatePresence).
 */
export function useRotatingMessage(messages: string[], intervalMs = 3000): string {
  const orderRef = useRef<string[] | null>(null);
  if (orderRef.current === null || orderRef.current.length !== messages.length) {
    orderRef.current = shuffle(messages);
  }
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (messages.length === 0) return;
    const id = setInterval(() => {
      setIndex((i) => nextRotationIndex(i, orderRef.current!.length));
    }, intervalMs);
    return () => clearInterval(id);
    // orderRef is intentionally excluded — it's a ref, not reactive state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, messages.length]);

  if (messages.length === 0) return "";
  return orderRef.current[index] ?? "";
}
