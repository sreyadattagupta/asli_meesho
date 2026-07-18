"use client";

// Agent 4 payoff — "Arrived as promised?" Frozen go-live promise vs the REAL delivery photo,
// verified by the shared VLM/CLIP pipeline. Buyer may upload a fresh photo or use the delivered one.
import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, CheckCircle2, PackageCheck, Camera } from "lucide-react";
import type { PromiseRecord } from "@/lib/db/types";

export interface PromiseVerdict {
  promiseKept: boolean;
  confidence: number;
  mismatches: string[];
  reason: string;
}

/**
 * Shrink a camera photo before upload.
 *
 * A phone shot is routinely 3–12 MB, and a serverless function body caps at
 * 4.5 MB — over that the platform rejects the request with an HTML error page
 * before our route ever runs, which the buyer saw as a bare network error. The
 * verifier works off a garment silhouette, so 1600px is ample.
 */
async function downscale(file: File, maxEdge = 1600, quality = 0.85): Promise<File> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, maxEdge / longest);
    // Already small enough on both counts — leave it untouched.
    if (scale === 1 && file.size < 1_500_000) {
      bitmap.close?.();
      return file;
    }
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // never block the upload on a resize failure
  }
}

export function PromiseKeeperCard({
  orderId,
  promise,
}: {
  orderId: string;
  promise: PromiseRecord | null;
}) {
  const [verdict, setVerdict] = useState<PromiseVerdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();

  const frozen = promise?.frozen as
    | { title?: string; price?: number; imageUrl?: string; sizeChart?: Record<string, number> }
    | undefined;

  async function pick(f: File | null) {
    const shrunk = f ? await downscale(f) : null;
    setFile(shrunk);
    setPreview(shrunk ? URL.createObjectURL(shrunk) : null);
    setVerdict(null);
    setErr(null);
  }

  async function check() {
    setBusy(true);
    setErr(null);
    try {
      // Multipart when the buyer uploaded a fresh delivery photo; JSON to use the delivered one.
      const res = await fetch("/api/agents/promise-keeper/check", file
        ? { method: "POST", body: (() => { const fd = new FormData(); fd.append("orderId", orderId); fd.append("delivery", file, file.name); return fd; })() }
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) });

      // A platform-level failure (413 too large, 504 timeout) returns an HTML error page, not our
      // JSON envelope — parsing it blind is what used to surface as a bare "Network hiccup".
      const raw = await res.text();
      let body: { error?: { message?: string } } & Partial<PromiseVerdict>;
      try {
        body = JSON.parse(raw);
      } catch {
        setErr(
          res.status === 413
            ? "That photo is too large — try one under 4 MB."
            : res.status === 504 || res.status === 408
              ? "The check is taking longer than usual — retry in a moment."
              : `Check failed (${res.status}) — retry.`,
        );
        return;
      }
      if (!res.ok) {
        setErr(body?.error?.message ?? "Check failed — retry.");
        return;
      }
      setVerdict(body as PromiseVerdict);
    } catch {
      setErr("Network hiccup — retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="buyer-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-zinc-800">
        <PackageCheck className="h-4 w-4 text-asli-violet" aria-hidden />
        Arrived as promised?
      </h2>
      <p className="mt-1 text-xs text-zinc-500">
        This listing&apos;s promises were frozen at go-live. Promise Keeper compares them with the
        delivery evidence and feeds the outcome back into the seller&apos;s trust score.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <figure>
          <figcaption className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            Promised at go-live
          </figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={frozen?.imageUrl ?? "/mock/kurtis-1.svg"}
            alt="Promised product"
            className="aspect-square w-full rounded-xl border border-zinc-100 object-cover"
          />
          <p className="mt-1 truncate text-xs text-zinc-600">{frozen?.title ?? "—"}</p>
        </figure>
        <figure>
          <figcaption className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            Delivery photo
          </figcaption>
          {preview ?? promise?.deliveryPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview ?? promise?.deliveryPhotoUrl ?? ""}
              alt="Delivery evidence"
              className="aspect-square w-full rounded-xl border border-zinc-100 object-cover"
            />
          ) : (
            <div className="grid aspect-square w-full place-items-center rounded-xl border border-dashed border-zinc-200 text-xs text-zinc-400">
              No delivery photo
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-200 px-2 py-1.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
          >
            <Camera className="h-3.5 w-3.5" aria-hidden />
            {file ? "Change photo" : "Upload your delivery photo"}
          </button>
        </figure>
      </div>

      <AnimatePresence mode="wait">
        {verdict ? (
          <motion.div
            key="verdict"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={[
              "mt-4 rounded-xl border px-4 py-3",
              verdict.promiseKept
                ? "border-asli-green/30 bg-asli-green/5"
                : "border-asli-amber/40 bg-asli-amber/5",
            ].join(" ")}
          >
            <p className={`flex items-center gap-2 text-sm font-bold ${verdict.promiseKept ? "text-asli-green" : "text-asli-amber"}`}>
              {verdict.promiseKept ? (
                <><CheckCircle2 className="h-4 w-4" aria-hidden /> Promise kept · {Math.round(verdict.confidence * 100)}%</>
              ) : (
                <><AlertTriangle className="h-4 w-4" aria-hidden /> Mismatch found · {Math.round(verdict.confidence * 100)}%</>
              )}
            </p>
            <p className="mt-1 text-xs text-zinc-600">{verdict.reason}</p>
            {verdict.mismatches.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-xs text-zinc-600">
                {verdict.mismatches.map((m) => <li key={m}>{m}</li>)}
              </ul>
            )}
            <p className="mt-2 text-[10px] uppercase tracking-wide text-zinc-400">
              Outcome recorded on the seller&apos;s trust score
            </p>
          </motion.div>
        ) : (
          <motion.div key="cta" className="mt-4">
            {err && (
              <p role="alert" className="mb-2 text-xs text-asli-red">
                {err}
              </p>
            )}
            <button
              onClick={check}
              disabled={busy}
              className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-asli-violet px-5 py-3 font-semibold text-white transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
            >
              {busy ? "Checking promise…" : err ? "Retry promise check" : "Check promise →"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
