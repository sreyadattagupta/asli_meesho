"use client";

// Previous · Save Draft · Cancel · Next — the controls every wizard step carries (spec §5).
//
// The agent steps (trigger/challenge/sizing) drive themselves: their "Next" IS the check, so they
// render this with `next` omitted and the orchestrator decides where the seller goes. The data steps
// (details/pricing/inventory) pass a validated `next`.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Save, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useSellerStore } from "@/lib/store";
import { saveDraftFields } from "@/lib/draftClient";
import { useT } from "@/lib/i18n";
import { prevStep } from "@/lib/orchestrator";

export function WizardNav({
  next,
  nextLabel,
  nextDisabled = false,
  /** Steps with nothing typed yet (upload) hide it rather than offer an empty save. */
  canSaveDraft = true,
}: {
  next?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  canSaveDraft?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const step = useSellerStore((s) => s.step);
  const setStep = useSellerStore((s) => s.setStep);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [saving, setSaving] = useState(false);

  const back = prevStep(step);

  async function saveDraft() {
    const { listingId, draft } = useSellerStore.getState();
    if (!listingId) {
      // Signed-out demo mode has no row to save to; the flow itself persists in localStorage.
      toast({ kind: "success", message: t("wizard.savedLocal") });
      return;
    }
    setSaving(true);
    try {
      await saveDraftFields(listingId, draft);
      toast({ kind: "success", message: t("wizard.saved") });
    } catch (e) {
      toast({ kind: "error", message: e instanceof Error ? e.message : t("wizard.saveFailed") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
        <button
          onClick={() => back && setStep(back)}
          disabled={!back}
          // Disabled rather than hidden: the control keeps its place in the row, and the tooltip says
          // why it's off — a button that vanishes reads as a bug.
          title={back ? undefined : t("wizard.prevLocked")}
          className="btn-ghost inline-flex min-h-[44px] items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("wizard.previous")}
        </button>

        {canSaveDraft && (
          <button
            onClick={() => void saveDraft()}
            disabled={saving}
            className="btn-ghost inline-flex min-h-[44px] items-center gap-1.5 disabled:opacity-40"
          >
            <Save className="h-4 w-4" aria-hidden />
            {saving ? t("wizard.saving") : t("wizard.saveDraft")}
          </button>
        )}

        <button
          onClick={() => setConfirmCancel(true)}
          className="btn-ghost inline-flex min-h-[44px] items-center gap-1.5 text-white/50 hover:text-asli-red"
        >
          <X className="h-4 w-4" aria-hidden />
          {t("wizard.cancel")}
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

      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title={t("wizard.leaveTitle")}>
        <p className="text-sm text-white/60">{t("wizard.leaveBody")}</p>
        <div className="mt-5 flex gap-3">
          <button className="btn-ghost flex-1" onClick={() => setConfirmCancel(false)}>
            {t("wizard.keepEditing")}
          </button>
          <button
            className="btn-primary flex-1"
            onClick={() => {
              // Leave the store alone: reset() here would drop the listingId and orphan the draft row
              // the seller was just promised they could come back to.
              setConfirmCancel(false);
              router.push("/seller/listings");
            }}
          >
            {t("wizard.leave")}
          </button>
        </div>
      </Modal>
    </>
  );
}
