"use client";

// "Why you can trust this" — expandable explainability panel (invariant #8).
// Wears the dark Asli trust skin inside the light marketplace: one system, two surfaces.
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Camera, ChevronDown, PackageCheck, Ruler, ShieldCheck, Store } from "lucide-react";
import { AgentReasonRow } from "@/components/ui/AgentReasonRow";
import { useT } from "@/lib/i18n";
import type { ListingBundle } from "@/lib/listing";

export function TrustPanel({ bundle }: { bundle: ListingBundle }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const { listing, checks, measurement, trustBand, promiseArmed, decision } = bundle;
  const BAND_LABEL = {
    high: t("product.seller.high"), medium: t("product.seller.established"), low: t("product.seller.new"),
  } as const;
  const verdictColor = {
    verified: "text-asli-green", blocked: "text-asli-red",
    escalated: "text-asli-amber", pending: "text-asli-violet",
  }[decision.verdict];

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
          {t("trust.why")}
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
              <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-white/[0.04] px-3 py-2 text-xs">
                <span className="font-semibold text-white/50">{t("trust.engine")}</span>
                <span className={`font-bold ${verdictColor}`}>{t(`trust.verdict.${decision.verdict}`)}</span>
                <span className="text-white/40">
                  · {t("trust.trust", { score: decision.trustScore })} ·{" "}
                  {decision.asliVerified ? `✓ ${t("verified.badge")}` : t("trust.notYetVerified")}
                </span>
              </div>
              {possession ? (
                <AgentReasonRow
                  icon={Camera}
                  label={t("trust.possessionProven")}
                  confidence={possession.confidence}
                  passed={possession.action === "AUTO_APPROVE"}
                  note={possession.reason}
                />
              ) : (
                <AgentReasonRow
                  icon={Camera}
                  label={t("trust.possessionNot")}
                  passed={false}
                  note={t("trust.possessionNotNote")}
                />
              )}
              <AgentReasonRow
                icon={Ruler}
                label={
                  measurement
                    ? t("trust.sizeMeasuredFrom", { ref: measurement.referenceUsed })
                    : listing.sizeChart
                      ? t("trust.sizeMeasured")
                      : t("trust.noSize")
                }
                confidence={sizeConfidence}
                passed={sizeConfidence !== undefined ? true : undefined}
              />
              <AgentReasonRow
                icon={Store}
                label={BAND_LABEL[trustBand]}
                note={t("trust.riskNote", { score: bundle.trustScore })}
                passed={trustBand !== "low" ? true : undefined}
              />
              <AgentReasonRow
                icon={PackageCheck}
                label={promiseArmed ? t("trust.promiseArmed") : t("trust.promiseArms")}
                note={t("trust.promiseNote")}
                passed={promiseArmed ? true : undefined}
              />
              <p className="pb-1 pt-2 text-[10px] uppercase tracking-wide text-white/30">
                {t("trust.footer")}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
