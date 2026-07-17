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
import { useToast } from "@/components/ui/Toast";
import type { ListingBundle } from "@/lib/listing";
import type { SizeChart } from "@/lib/sizing";
import type { SellerDraft } from "@/lib/store";
import type { FlowStep } from "@/lib/orchestrator";

type ResumeSetters = {
  reset: () => void;
  setOwnerKey: (k: string) => void;
  setListingId: (id: string) => void;
  setStep: (s: FlowStep) => void;
  setDraft: (d: Partial<SellerDraft>) => void;
  setSizeChart: (c: SizeChart | undefined) => void;
  toast: (t: { kind: "success" | "error"; message: string }) => void;
};

/**
 * Resume a draft the seller left mid-flow.
 *
 * The draft listing row persists server-side, so "continue later" means reading its state back and
 * jumping to the right step — NOT redoing proven work:
 *  - possession passed AND a measurement exists → both agents are done → open the details form,
 *    rehydrating the typed fields and the measured size chart.
 *  - possession passed, no measurement yet → resume at Agent 2 (sizing).
 *  - otherwise → re-run from Upload (a half-finished possession challenge cannot resume — the code was
 *    single-use, so a fresh one is required; invariant #3).
 */
async function resumeDraft(id: string, key: string | null, s: ResumeSetters): Promise<void> {
  s.reset();
  if (key) s.setOwnerKey(key);
  s.setListingId(id);

  let bundle: ListingBundle | null = null;
  try {
    const res = await fetch(`/api/listings/${id}`);
    if (res.ok) bundle = (await res.json()) as ListingBundle;
  } catch {
    /* offline — fall through to the re-run path (Upload) */
  }
  if (!bundle) return;

  // Same test the publish route uses — a persisted possession check marked passed. Reading it from
  // the checks avoids depending on the shape of the composed decision object.
  const possessionPassed = bundle.checks.some(
    (c) => c.agent === "possession" && Boolean(c.payload?.["passed"]),
  );
  const m = bundle.measurement;

  if (possessionPassed && m) {
    // Both agents cleared — carry the typed fields and the measured chart to the details form.
    const l = bundle.listing;
    s.setDraft({
      title: l.title,
      description: l.description ?? "",
      price: l.price,
      mrp: l.mrp ?? 0,
      category: l.category as SellerDraft["category"],
      stock: l.stock ?? 1,
      sku: l.sku ?? "",
    });
    s.setSizeChart({
      size: (m.mappedSize as SizeChart["size"]) ?? null,
      chestCm: m.chestCm,
      lengthCm: m.lengthCm,
      waistCm: m.waistCm,
      chestInches: Math.round((m.chestCm / 2.54) * 10) / 10,
      confidence: m.confidence,
      sizedBy: "chest",
    });
    s.setStep("details");
    s.toast({ kind: "success", message: "Resumed — possession and sizing already passed." });
  } else if (possessionPassed) {
    s.setStep("sizing");
  }
  // else: leave the flow at Upload — the agents re-run for this listing.
}

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
  const setStep = useSellerStore((s) => s.setStep);
  const setDraft = useSellerStore((s) => s.setDraft);
  const setSizeChart = useSellerStore((s) => s.setSizeChart);
  const { toast } = useToast();
  const reduce = useReducedMotion();
  // `?listing=<id>` — the seller portal's "Continue draft" / "Re-run AI checks" action. It RESUMES
  // that listing: if possession and sizing already passed we jump straight to the details form so the
  // seller never redoes proven work; otherwise the agents re-run. The id is not trusted — /api/
  // challenge, /api/sizing and /api/listings/:id/publish all prove ownership server-side.
  const resumeListingId = useSearchParams().get("listing");
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

        if (resumeListingId) {
          await resumeDraft(resumeListingId, key, {
            reset, setOwnerKey, setListingId, setStep, setDraft, setSizeChart, toast,
          });
        } else if (key && (st.ownerKey !== key || st.step === "live")) {
          // Start FRESH when a different seller now owns this browser's flow, or the persisted flow
          // already finished. Otherwise resume mid-flow on refresh.
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
    // resumeListingId is the only value that changes what this effect does; the setters are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeListingId]);

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
