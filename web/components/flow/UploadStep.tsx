"use client";

import { useRef, useState } from "react";
import { useSellerStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { useVoiceGuide } from "@/lib/useVoiceGuide";
import { REVERSE_IMAGE_MESSAGES } from "@/lib/loadingMessages";
import { PhotoCamera } from "@/components/ui/PhotoCamera";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { WizardNav } from "./WizardNav";

// Step 1 — catalog upload. Gallery upload is FINE here (invariant #2 only bans it
// on the challenge step). This is the seller's listing photo.
//
// The photo, and nothing else. Title, price and stock come later (Details/Pricing/Inventory), after
// the agents have cleared the listing — no point making an honest seller fill in three forms before
// we can tell them whether the photo can be verified at all.
export default function UploadStep() {
  const { catalogPreview, setDraft, setCatalog, setTrigger, setStep, setListingId } = useSellerStore();
  const t = useT();
  useVoiceGuide("flow.upload.voice");
  const galleryRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setCatalog(file);
  }

  async function loadDemoCatalog() {
    // Real garment (black chikankari kurti). The matching live-proof demo fixture is the SAME kurti
    // re-photographed; the "thief" fixture is a different dress → exercises the real same-item model.
    const res = await fetch("/proof/real_kurti_catalog.png");
    const blob = await res.blob();
    setCatalog(new File([blob], "real_kurti_catalog.png", { type: "image/png" }));
    if (!useSellerStore.getState().draft.title) setDraft({ title: "Chikankari Embroidered Kurti — Black" });
  }

  /**
   * Create the server-side draft once; signed-out demo continues locally (labelled).
   *
   * Sent empty — the route defaults an untitled draft. The row has to exist before the agents run
   * because every check, image and challenge claim is written against its id.
   */
  async function ensureDraft(): Promise<void> {
    if (useSellerStore.getState().listingId) return;
    const res = await fetch("/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const body = (await res.json()) as { listingId: string };
      setListingId(body.listingId);
    } else if (res.status !== 401 && res.status !== 403) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(body?.error?.message ?? "Could not create the listing draft.");
    }
    // 401/403 = not signed in as seller — flow continues in local demo mode.
  }

  async function runCheck() {
    const file = useSellerStore.getState().catalogFile;
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await ensureDraft();
      const form = new FormData();
      form.append("catalog", file);
      const listingId = useSellerStore.getState().listingId;
      if (listingId) form.append("listingId", listingId);
      const res = await fetch("/api/reverse-image", { method: "POST", body: form });
      if (!res.ok) throw new Error("Image check failed — please retry.");
      const trigger = await res.json();
      setTrigger(trigger);
      setStep("trigger");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card relative p-6">
      {busy && (
        <LoadingOverlay
          variant="inline"
          messages={REVERSE_IMAGE_MESSAGES}
          expectedMs={20000}
          done={!busy}
          label="Checking your photo…"
        />
      )}

      <h2 className="text-2xl font-bold">{t("flow.upload.title")}</h2>
      <p className="mt-1 text-sm text-white/50">{t("flow.upload.subtitle")}</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {/* A real <button>, not a div+onClick: the dropzone is the primary control on this step and
            has to be reachable by keyboard and announced to a screen reader (invariant #11). */}
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          aria-label={t("flow.upload.fromGallery")}
          className="grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-xl border border-dashed border-white/20 bg-white/[0.02] hover:border-asli-violet/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
        >
          {catalogPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={catalogPreview} alt="catalog" className="h-full w-full object-contain" />
          ) : (
            <span className="text-sm text-white/40">{t("flow.upload.choosePhoto")}</span>
          )}
        </button>

        {/* Gallery deliberately omits `capture` — the catalog photo is usually a supplier's, which is
            normal for a reseller (invariant #1). Camera-only applies to the CHALLENGE step, never here. */}
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            // Clear the value or picking the SAME file twice fires nothing: `change` needs the value
            // to differ, so a re-pick (or pick → demo photo → same pick) looks like a dead button.
            e.target.value = "";
          }}
        />

        <div className="flex flex-col justify-center gap-3">
          <button className="btn-ghost" onClick={() => galleryRef.current?.click()}>
            {t("flow.upload.fromGallery")}
          </button>
          {/* Opens a real getUserMedia camera. `capture="environment"` alone is a mobile-only hint:
              desktop ignores it and shows a file picker, so this button was a second gallery button
              on a laptop. PhotoCamera falls back to that input when there's no camera. */}
          <button className="btn-ghost" onClick={() => setCameraOpen(true)}>
            {t("flow.upload.fromCamera")}
          </button>
          <button className="btn-ghost" onClick={loadDemoCatalog}>
            {t("flow.upload.demoBtn")}
          </button>
          <button
            className="btn-primary"
            disabled={!catalogPreview || busy}
            onClick={runCheck}
          >
            {busy ? t("flow.upload.checking") : t("flow.upload.runCheck")}
          </button>
          {error && (
            <p role="alert" className="text-xs text-asli-red">
              {error}{" "}
              <button className="underline" onClick={runCheck}>Retry</button>
            </p>
          )}
          <p className="text-xs text-white/40">{t("flow.upload.triggerNote")}</p>
        </div>
      </div>

      {/* First step: no Previous, and nothing typed yet to save. Cancel is still offered. */}
      <WizardNav />

      {cameraOpen && (
        <PhotoCamera
          onCapture={onFile}
          onClose={() => setCameraOpen(false)}
          fallbackLabel={t("flow.upload.fromGallery")}
        />
      )}
    </div>
  );
}
