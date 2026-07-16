"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSellerStore } from "@/lib/store";
import Stepper from "@/components/flow/Stepper";
import UploadStep from "@/components/flow/UploadStep";
import TriggerStep from "@/components/flow/TriggerStep";
import ChallengeStep from "@/components/flow/ChallengeStep";
import SizingStep from "@/components/flow/SizingStep";
import ReviewStep from "@/components/flow/ReviewStep";
import ResultStep from "@/components/flow/ResultStep";

// useSearchParams() opts the subtree into client-side rendering, so Next requires a Suspense
// boundary around it or the /sell prerender fails the build outright.
export default function SellPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-xl px-4 py-16 text-center text-white/40">Loading…</div>}>
      <SellFlow />
    </Suspense>
  );
}

function SellFlow() {
  const step = useSellerStore((s) => s.step);
  const reset = useSellerStore((s) => s.reset);
  const setOwnerKey = useSellerStore((s) => s.setOwnerKey);
  const setListingId = useSellerStore((s) => s.setListingId);
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
        /* unauthenticated / offline — middleware gates /sell; leave the flow as-is */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reset, setOwnerKey, setListingId, rerunListingId]);

  if (!ready) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="h-8 w-32 animate-pulse rounded bg-white/10" />
        <div className="mt-8 h-64 animate-pulse rounded-2xl bg-white/5" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-lg font-black tracking-tight">
          <span className="bg-gradient-to-r from-asli-violet to-asli-pink bg-clip-text text-transparent">
            असली
          </span>{" "}
          Asli
        </Link>
        <span className="pill bg-white/5 text-white/40">seller flow</span>
      </header>

      <Stepper step={step} />

      {step === "upload" && <UploadStep />}
      {step === "trigger" && <TriggerStep />}
      {step === "challenge" && <ChallengeStep />}
      {step === "sizing" && <SizingStep />}
      {step === "review" && <ReviewStep />}
      {step === "live" && <ResultStep />}
    </main>
  );
}
