"use client";

import { useRef, useState } from "react";
import { useSellerStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { useVoiceGuide } from "@/lib/useVoiceGuide";

// Step 1 — catalog upload. Gallery upload is FINE here (invariant #2 only bans it
// on the challenge step). This is the seller's listing photo.
const CATEGORIES = ["sarees", "kurtis", "footwear", "jewellery"] as const;

export default function UploadStep() {
  const { catalogPreview, draft, setDraft, setCatalog, setTrigger, setStep, setListingId } = useSellerStore();
  const t = useT();
  useVoiceGuide("flow.upload.voice");
  const inputRef = useRef<HTMLInputElement>(null);
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

  /** Create the server-side draft once; signed-out demo continues locally (labelled). */
  async function ensureDraft(): Promise<void> {
    if (useSellerStore.getState().listingId) return;
    const res = await fetch("/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
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
    <div className="card p-6">
      <h2 className="text-2xl font-bold">{t("flow.upload.title")}</h2>
      <p className="mt-1 text-sm text-white/50">{t("flow.upload.subtitle")}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_8rem_10rem]">
        <label className="flex flex-col gap-1 text-xs font-medium text-white/50">
          {t("flow.upload.titleLabel")}
          <input
            value={draft.title}
            onChange={(e) => setDraft({ title: e.target.value })}
            placeholder={t("flow.upload.titlePlaceholder")}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-white/50">
          {t("flow.upload.priceLabel")}
          <input
            type="number"
            min={1}
            max={100000}
            value={draft.price}
            onChange={(e) => setDraft({ price: Math.max(1, Math.floor(Number(e.target.value) || 0)) })}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-white/50">
          {t("flow.upload.categoryLabel")}
          <select
            value={draft.category}
            onChange={(e) => setDraft({ category: e.target.value as (typeof CATEGORIES)[number] })}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c} className="bg-[#160f26]">{c}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div
          onClick={() => inputRef.current?.click()}
          className="grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-xl border border-dashed border-white/20 bg-white/[0.02] hover:border-asli-violet/50"
        >
          {catalogPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={catalogPreview} alt="catalog" className="h-full w-full object-contain" />
          ) : (
            <span className="text-sm text-white/40">{t("flow.upload.choosePhoto")}</span>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </div>

        <div className="flex flex-col justify-center gap-3">
          <button className="btn-ghost" onClick={loadDemoCatalog}>
            {t("flow.upload.demoBtn")}
          </button>
          <button
            className="btn-primary"
            disabled={!catalogPreview || draft.title.trim().length < 3 || busy}
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
    </div>
  );
}
