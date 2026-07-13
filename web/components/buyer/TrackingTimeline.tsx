"use client";

// Order lifecycle timeline — simulated logistics events with a demo fast-forward.
import { motion, useReducedMotion } from "framer-motion";
import { Check, FastForward } from "lucide-react";
import type { Order, OrderStatus } from "@/lib/db/types";

const STEPS: { status: OrderStatus; label: string; hint: string }[] = [
  { status: "placed", label: "Order placed", hint: "Payment confirmed (mock)" },
  { status: "shipped", label: "Shipped", hint: "With delivery partner" },
  { status: "delivered", label: "Delivered", hint: "Handed to you" },
];
const RANK: Record<OrderStatus, number> = { placed: 0, shipped: 1, delivered: 2 };

export function TrackingTimeline({
  order,
  advancing,
  onAdvance,
}: {
  order: Order;
  advancing: boolean;
  onAdvance: () => void;
}) {
  const reduce = useReducedMotion();
  const rank = RANK[order.status];

  return (
    <section className="buyer-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-zinc-800">
          Tracking
          <span className="ml-2 rounded-full bg-asli-amber/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-asli-amber">
            simulated
          </span>
        </h2>
        {order.status !== "delivered" && (
          <button
            onClick={onAdvance}
            disabled={advancing}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-600 transition hover:border-meesho-pink/40 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-meesho-pink"
          >
            <FastForward className="h-3.5 w-3.5" aria-hidden />
            {advancing ? "Advancing…" : "Fast-forward (demo)"}
          </button>
        )}
      </div>

      <ol className="mt-4 space-y-0">
        {STEPS.map((step, i) => {
          const done = i <= rank;
          const current = i === rank;
          return (
            <li key={step.status} className="relative flex gap-3 pb-6 last:pb-0">
              {i < STEPS.length - 1 && (
                <span
                  className={`absolute left-[11px] top-6 h-[calc(100%-1.5rem)] w-0.5 ${i < rank ? "bg-asli-green" : "bg-zinc-200"}`}
                  aria-hidden
                />
              )}
              <motion.span
                initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.08, duration: 0.25 }}
                className={[
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full text-white",
                  done ? "bg-asli-green" : "border-2 border-zinc-200 bg-white",
                ].join(" ")}
              >
                {done && <Check className="h-3.5 w-3.5" aria-hidden />}
              </motion.span>
              <div>
                <p className={`text-sm font-semibold ${done ? "text-zinc-800" : "text-zinc-400"}`}>
                  {step.label}
                  {current && order.status !== "delivered" && (
                    <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-asli-violet">
                      current
                    </span>
                  )}
                </p>
                <p className="text-xs text-zinc-400">{step.hint}</p>
                {step.status === "delivered" && order.deliveredAt && (
                  <p className="text-[11px] text-zinc-400">
                    {new Date(order.deliveredAt).toLocaleString()}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
