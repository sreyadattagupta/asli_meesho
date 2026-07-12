"use client";

import { useRef, useState } from "react";
import { useSellerStore } from "@/lib/store";

// Step 1 — catalog upload. Gallery upload is FINE here (invariant #2 only bans it
// on the challenge step). This is the seller's listing photo.
export default function UploadStep() {
  const { catalogPreview, setCatalog, setTrigger, setStep } = useSellerStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    setCatalog(file);
  }

  async function loadDemoCatalog() {
    const res = await fetch("/proof/catalog_real.jpg");
    const blob = await res.blob();
    setCatalog(new File([blob], "catalog_real.jpg", { type: "image/jpeg" }));
  }

  async function runCheck() {
    const file = useSellerStore.getState().catalogFile;
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("catalog", file);
      const res = await fetch("/api/reverse-image", { method: "POST", body: form });
      const trigger = await res.json();
      setTrigger(trigger);
      setStep("trigger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-6">
      <h2 className="text-2xl font-bold">Upload your catalog photo</h2>
      <p className="mt-1 text-sm text-white/50">
        This is your listing image. Supplier/catalog photos are welcome — sharing
        one is normal for resellers.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div
          onClick={() => inputRef.current?.click()}
          className="grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-xl border border-dashed border-white/20 bg-white/[0.02] hover:border-asli-violet/50"
        >
          {catalogPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={catalogPreview} alt="catalog" className="h-full w-full object-contain" />
          ) : (
            <span className="text-sm text-white/40">Click to choose a photo</span>
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
            Use demo catalog photo
          </button>
          <button
            className="btn-primary"
            disabled={!catalogPreview || busy}
            onClick={runCheck}
          >
            {busy ? "Checking image…" : "Run image check →"}
          </button>
          <p className="text-xs text-white/40">
            We reverse-image search this photo. A hit only <b>triggers</b> a live
            proof — it never blocks you.
          </p>
        </div>
      </div>
    </div>
  );
}
