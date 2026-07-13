"use client";

// "Why you can trust this" — expandable explainability panel (invariant #8).
// Wears the dark Asli trust skin inside the light marketplace: one system, two surfaces.
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Camera, ChevronDown, PackageCheck, Ruler, ShieldCheck, Store } from "lucide-react";
import { AgentReasonRow } from "@/components/ui/AgentReasonRow";
import type { ListingBundle } from "@/lib/listing";

const BAND_LABEL = { high: "High-trust seller", medium: "Established seller", low: "New seller" } as const;

export function TrustPanel({ bundle }: { bundle: ListingBundle }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const { listing, checks, measurement, trustBand, promiseArmed } = bundle;

  const possession = checks.filter((c) => c.agent === "possession").at(-1);
  const sizeConfidence = measurement?.confidence ?? (listing.sizeChart ? 0.9 : undefined);

  return (
    <section className="overflow-hidden rounded-2xl border border-asli-violet/25 bg-[#150e28] text-white">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-asli-green" aria-hidden />
          Why you can trust this
        </span>
        <ChevronDown
          className={`h-4 w-4 text-white/50 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="space-y-1 border-t border-white/10 px-4 py-3">
              {possession ? (
                <AgentReasonRow
                  icon={Camera}
                  label="Possession proven with a live challenge code"
                  confidence={possession.confidence}
                  passed={possession.action === "AUTO_APPROVE"}
                  note={possession.reason}
                />
              ) : (
                <AgentReasonRow
                  icon={Camera}
                  label="Possession not verified for this listing"
                  passed={false}
                  note="Seller hasn't completed the live proof."
                />
              )}
              <AgentReasonRow
                icon={Ruler}
                label={
                  measurement
                    ? `Size measured from a flat-lay (${measurement.referenceUsed} reference)`
                    : listing.sizeChart
                      ? "Size chart measured, not guessed"
                      : "No measured size chart"
                }
                confidence={sizeConfidence}
                passed={sizeConfidence !== undefined ? true : undefined}
              />
              <AgentReasonRow
                icon={Store}
                label={BAND_LABEL[trustBand]}
                note={`Trust score ${bundle.trustScore}/100 · Risk Radar (simulated seller history)`}
                passed={trustBand !== "low" ? true : undefined}
              />
              <AgentReasonRow
                icon={PackageCheck}
                label={promiseArmed ? "Promise Keeper armed" : "Promise Keeper arms at go-live"}
                note="Listing promises frozen at go-live; checked against the delivery photo."
                passed={promiseArmed ? true : undefined}
              />
              <p className="pb-1 pt-2 text-[10px] uppercase tracking-wide text-white/30">
                Verified-first ranking boost active · seller history simulated
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
