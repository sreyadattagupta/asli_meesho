"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useSellerStore } from "@/lib/store";
import Stepper from "@/components/flow/Stepper";
import UploadStep from "@/components/flow/UploadStep";
import TriggerStep from "@/components/flow/TriggerStep";
import ChallengeStep from "@/components/flow/ChallengeStep";
import SizingStep from "@/components/flow/SizingStep";
import DetailsStep from "@/components/flow/DetailsStep";
import PricingStep from "@/components/flow/PricingStep";
import InventoryStep from "@/components/flow/InventoryStep";
import ReviewStep from "@/components/flow/ReviewStep";
import ResultStep from "@/components/flow/ResultStep";
import { PageHeader } from "@/components/nav/PageHeader";
import type { FlowStep } from "@/lib/orchestrator";

// useSearchParams() opts the subtree into client-side rendering, so Next requires a Suspense
// boundary around it or the prerender fails the build outright.
export default function CreateListingPage() {
  return (
    <Suspense fallback={<WizardSkeleton />}>
      <ListingWizard />
    </Suspense>
  );
}

function WizardSkeleton() {
  return (
    <div aria-busy>
      <div className="h-8 w-48 animate-pulse rounded bg-white/10" />
      <div className="mt-6 h-6 w-full animate-pulse rounded bg-white/5" />
      <div className="mt-8 h-64 animate-pulse rounded-2xl bg-white/5" />
    </div>
  );
}

const STEPS: Record<FlowStep, React.ComponentType> = {
  upload: UploadStep,
  trigger: TriggerStep,
  challenge: ChallengeStep,
  sizing: SizingStep,
  details: DetailsStep,
  pricing: PricingStep,
  inventory: InventoryStep,
  review: ReviewStep,
  live: ResultStep,
};

/**
 * The listing wizard. Nothing here runs on its own — the seller reaches this page by clicking
 * "Create Listing", and Agent 1 only fires when they press "Run image check" on the first step
 * (spec §3). Signing in never starts an agent.
 */
function ListingWizard() {
  const step = useSellerStore((s) => s.step);
  const reset = useSellerStore((s) => s.reset);
  const setOwnerKey = useSellerStore((s) => s.setOwnerKey);
  const setListingId = useSellerStore((s) => s.setListingId);
  const reduce = useReducedMotion();
  // `?listing=<id>` — the seller portal's "Re-run AI checks" action. The flow re-verifies THAT
  // listing (UploadStep reuses an existing listingId instead of creating a draft) rather than
  // starting a new one. The id is not trusted: /api/challenge and /api/sizing both prove ownership
  // server-side before writing anything to it.
  const rerunListingId = useSearchParams().get("listing");
  // Gate rendering until we've reconciled the persisted flow with the signed-in seller, so a stale
  // "all done" step from a previous account on this browser never flashes.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/users/me");
        const me = res.ok ? await res.json() : null;
        const key: string | null = me?.sellerId ?? me?.name ?? null;
        const st = useSellerStore.getState();
        if (rerunListingId) {
          // Re-run always starts clean, then pins the flow to the listing being re-verified.
          reset();
          if (key) setOwnerKey(key);
          setListingId(rerunListingId);
        } else if (key && (st.ownerKey !== key || st.step === "live")) {
          // Start FRESH (dynamic per seller) when: a different seller now owns this browser's flow,
          // or the persisted flow already finished ("live"). Otherwise resume mid-flow on refresh.
          reset();
          setOwnerKey(key);
        } else if (key && !st.ownerKey) {
          setOwnerKey(key);
        }
      } catch {
        /* offline — the layout guard already proved the session; leave the flow as-is */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reset, setOwnerKey, setListingId, rerunListingId]);

  if (!ready) return <WizardSkeleton />;

  const StepView = STEPS[step];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Create listing"
        subtitle="Prove it's yours, get it measured, then tell buyers about it."
      />

      <Stepper step={step} />

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, x: -16 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <StepView />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
