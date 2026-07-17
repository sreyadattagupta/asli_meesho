"use client";

// The footer every wizard step carries: Previous · Save draft & exit · Start new · Next.
//
// The agent steps (trigger/challenge/sizing) drive themselves — their verify button IS the advance —
// so they render this with `next` omitted. The data steps (details/pricing/inventory) pass a
// validated `next`.
//
// Leaving is NON-DESTRUCTIVE: the draft listing row exists server-side from the Upload step on, so
// "Save draft & exit" and "Start new" both just free the CLIENT slot (localStorage) — the draft stays
// in My Listings and resumes from there (features/seller/ProductRow → /seller/create-listing?listing=).
// That is what lets a seller stuck at Agent 1 or Agent 2 walk away and start a fresh listing.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, LogOut, Plus } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useSellerStore, useSessionStore } from "@/lib/store";
import { saveDraftFields } from "@/lib/draftClient";
import { useT } from "@/lib/i18n";
import { prevStep, AGENT_STEPS } from "@/lib/orchestrator";

export function WizardNav({
  next,
  nextLabel,
  nextDisabled = false,
}: {
  next?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const step = useSellerStore((s) => s.step);
  const setStep = useSellerStore((s) => s.setStep);
  const reset = useSellerStore((s) => s.reset);
  const setOwnerKey = useSellerStore((s) => s.setOwnerKey);
  const [busy, setBusy] = useState<null | "exit" | "new">(null);

  const back = prevStep(step);

  /** Persist whatever the seller has typed so far. No-op on agent steps (nothing typed yet). */
  async function persist(): Promise<void> {
    const { listingId, draft, step: cur } = useSellerStore.getState();
    if (!listingId || AGENT_STEPS.includes(cur) || cur === "upload") return;
    try {
      await saveDraftFields(listingId, draft);
    } catch {
      // Best-effort — the row already exists as a draft; a failed field save must not trap the seller
      // in the wizard. Surfaced by the caller's toast.
    }
  }

  async function saveAndExit() {
    setBusy("exit");
    await persist();
    reset(); // free the client slot; the draft persists server-side and appears in My Listings
    toast({ kind: "success", message: t("wizard.savedToListings") });
    router.push("/seller/listings");
  }

  async function startNew() {
    setBusy("new");
    await persist(); // keep any typed fields on the current draft before we leave it
    const { user } = useSessionStore.getState();
    const key = user?.sellerId ?? user?.name ?? null;
    reset();
    if (key) setOwnerKey(key);
    toast({ kind: "success", message: t("wizard.startedNew") });
    setBusy(null);
    // Stay on /seller/create-listing — reset() put the flow back at Upload, so a fresh listing begins.
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
      <button
        onClick={() => back && setStep(back)}
        disabled={!back}
        // Disabled, not hidden: it keeps its place and the tooltip says why — a vanishing button reads
        // as a bug. Null across the agent boundary (invariant #3: a spent code can't be re-entered).
        title={back ? undefined : t("wizard.prevLocked")}
        className="btn-ghost inline-flex min-h-[44px] items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t("wizard.previous")}
      </button>

      <button
        onClick={() => void saveAndExit()}
        disabled={busy !== null}
        className="btn-ghost inline-flex min-h-[44px] items-center gap-1.5 disabled:opacity-40"
      >
        <LogOut className="h-4 w-4" aria-hidden />
        {busy === "exit" ? t("wizard.saving") : t("wizard.saveExit")}
      </button>

      <button
        onClick={() => void startNew()}
        disabled={busy !== null}
        className="btn-ghost inline-flex min-h-[44px] items-center gap-1.5 text-white/50 disabled:opacity-40"
      >
        <Plus className="h-4 w-4" aria-hidden />
        {t("wizard.startNew")}
      </button>

      {next && (
        <button
          onClick={next}
          disabled={nextDisabled}
          className="btn-primary ml-auto inline-flex min-h-[44px] items-center gap-1.5 disabled:opacity-40"
        >
          {nextLabel ?? t("wizard.next")}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
