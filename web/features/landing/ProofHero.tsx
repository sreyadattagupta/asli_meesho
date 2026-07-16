"use client";

// The hero's signature: the proof moment itself, not a description of it.
//
// A challenge code sits under a TTL that ticks down in real time from CHALLENGE_TTL_SECONDS, and the
// agent reasons stream in the way they do in the real flow. This is the one thing on the page that
// behaves like the product — everything else is quiet around it.
//
// Honesty: this is an ILLUSTRATION, labelled as one. It never calls GET /api/challenge — that issues
// a real single-use code, and burning one per landing view would be a lie of a different kind. The
// countdown is real elapsed time; the code is a sample.
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { Check, ShieldCheck } from "lucide-react";

const TTL_SECONDS = 300; // mirrors CHALLENGE_TTL_SECONDS — the bar a real seller works against

// The reasons the orchestrator actually composes (CLAUDE.md §6.8), in the order the VLM returns them.
const REASONS = [
  { label: "Same product", value: 0.96 },
  { label: "Code visible", value: 0.98 },
  { label: "Taken live", value: 0.94 },
] as const;

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ProofHero() {
  const reduce = useReducedMotion();
  // Reduced motion gets the settled state immediately: the point is the verdict, not the reveal.
  const [shown, setShown] = useState(reduce ? REASONS.length : 0);
  const [remaining, setRemaining] = useState(TTL_SECONDS);

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setShown((n) => (n < REASONS.length ? n + 1 : n)), 620);
    return () => clearInterval(t);
  }, [reduce]);

  useEffect(() => {
    const t = setInterval(() => setRemaining((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  const passed = shown >= REASONS.length;
  const expired = remaining === 0;

  return (
    <div className="card w-full max-w-sm p-5 text-left">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">
          Sample proof
        </span>
        <span
          className={`pill ring-1 ${
            expired
              ? "bg-asli-red/10 text-asli-red ring-asli-red/30"
              : "bg-asli-amber/10 text-asli-amber ring-asli-amber/30"
          }`}
          aria-live="off"
        >
          {expired ? "Code expired" : `Expires in ${mmss(remaining)}`}
        </span>
      </div>

      {/* The code is the invariant made visible: dynamic, time-bound, single-use. */}
      <div className="mt-4 flex items-center gap-3">
        <div className="font-mono text-3xl font-black tracking-[0.35em] text-white">7X3K</div>
        <span className="pill bg-white/5 text-[10px] text-white/40 ring-1 ring-white/10">
          single-use
        </span>
      </div>
      <p className="mt-2 text-xs text-white/40">
        Written on a slip, photographed next to the product. A screenshot can&apos;t produce it.
      </p>

      <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
        {REASONS.map((r, i) => (
          <motion.div
            key={r.label}
            className="flex items-center justify-between gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: i < shown ? 1 : 0.25 }}
            transition={{ duration: 0.3 }}
          >
            <span className="flex items-center gap-2 text-sm text-white/70">
              <Check
                className={`h-3.5 w-3.5 ${i < shown ? "text-asli-green" : "text-white/20"}`}
                aria-hidden
              />
              {r.label}
            </span>
            <span className="font-mono text-sm text-white/50">
              {i < shown ? `${Math.round(r.value * 100)}%` : "—"}
            </span>
          </motion.div>
        ))}
      </div>

      <motion.div
        className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-asli-green/10 py-2.5 text-sm font-bold text-asli-green ring-1 ring-asli-green/25"
        initial={{ opacity: 0 }}
        animate={{ opacity: passed ? 1 : 0 }}
        transition={{ duration: 0.35 }}
        aria-hidden={!passed}
      >
        <ShieldCheck className="h-4 w-4" aria-hidden />
        Possession proven
      </motion.div>
    </div>
  );
}
