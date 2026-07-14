"use client";

// Camera-ONLY capture — enforces invariant #2.
// The challenge step must use a LIVE camera stream (getUserMedia). A gallery/file
// picker is NEVER offered here — that would defeat the possession proof.
//
// The seller photographs ONLY the product; the dynamic code is TYPED separately and
// text-verified server-side (single-use claim). For pitching on a laptop with no product
// in hand, a clearly-labelled DEMO row loads product-only fixture photos and, alongside
// the photo, hands back the code the seller should type (`demoCode`) so each scenario —
// genuine / thief / wrong code — drives the real decision path.

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useT } from "@/lib/i18n";

export interface CapturedPhoto {
  blob: Blob;
  previewUrl: string;
  source: "camera" | "demo";
  /** Demo-only: the code the seller "types" for this scenario (prefills the code input). */
  demoCode?: string;
}

type FixtureKey = "genuine" | "thief" | "wrongcode";

const FIXTURES: Array<{
  key: FixtureKey;
  label: string;
  hint: string;
  base: string; // product-only photo
  codeFor: (issued: string) => string; // the code the seller types for this scenario
}> = [
  {
    key: "genuine",
    label: "Genuine (right product)",
    hint: "honest seller",
    base: "/proof/real_kurti_live.jpg", // the SAME kurti as the catalog, re-shot → passes
    codeFor: (issued) => issued, // types the REAL issued code → passes
  },
  {
    key: "thief",
    label: "Thief (different item)",
    hint: "wrong product",
    base: "/proof/real_other_dress.png", // a DIFFERENT dress → same_item fails → blocked
    codeFor: (issued) => issued,
  },
  {
    key: "wrongcode",
    label: "Wrong code typed",
    hint: "code mismatch",
    base: "/proof/real_kurti_live.jpg", // right product, but a wrong typed code → claim rejects
    codeFor: () => "WR0NG",
  },
];

/** Load a product-only fixture photo as a JPEG blob (no slip drawn — the code is typed). */
async function composeFixture(base: string): Promise<Blob> {
  const img = await loadImage(base);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || 500;
  canvas.height = img.naturalHeight || 500;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9),
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

export default function CameraCapture({
  code,
  onCapture,
}: {
  code: string; // current dynamic challenge code — the code a demo fixture "types"
  onCapture: (photo: CapturedPhoto) => void;
}) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        // getUserMedia is gated to secure contexts. Over a plain-HTTP LAN IP (e.g.
        // http://192.168.x.x:3000) the browser blocks the camera and mediaDevices is undefined —
        // that's the usual "camera unavailable" here, not a hardware/permission issue.
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          setError(
            `Camera needs HTTPS or localhost — this page is on ${window.location.protocol}//${window.location.host}. ` +
              "Open it as https:// (run `npm run dev:https`) or on localhost, or use a demo photo below.",
          );
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch {
        setError(
          "Camera unavailable or permission denied. Use a device with a camera — or a demo photo below.",
        );
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const snap = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 160);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture({ blob, previewUrl: URL.createObjectURL(blob), source: "camera" });
      },
      "image/jpeg",
      0.9,
    );
  }, [onCapture]);

  const loadDemo = useCallback(
    async (f: (typeof FIXTURES)[number]) => {
      const blob = await composeFixture(f.base);
      onCapture({
        blob,
        previewUrl: URL.createObjectURL(blob),
        source: "demo",
        demoCode: f.codeFor(code),
      });
    },
    [onCapture, code],
  );

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 aspect-video">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {!ready && !error && (
          <div className="absolute inset-0 grid place-items-center text-white/50">
            Starting camera…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-amber-200/80">
            {error}
          </div>
        )}
        <span className="pill absolute left-3 top-3 bg-asli-pink/80 text-white">
          {t("flow.challenge.cameraOnly")}
        </span>

        {/* Framing overlay: product reticle only — the code is typed, not photographed */}
        {ready && (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 56"
            preserveAspectRatio="none"
            aria-hidden
          >
            {/* product reticle corner brackets */}
            <g stroke="rgba(139,92,246,0.9)" strokeWidth="0.7" fill="none" strokeLinecap="round">
              <path d="M28 10 h8 M28 10 v8" />
              <path d="M72 10 h-8 M72 10 v8" />
              <path d="M28 46 h8 M28 46 v-8" />
              <path d="M72 46 h-8 M72 46 v-8" />
            </g>
            <text x="50" y="29" textAnchor="middle" fontSize="3.2" fill="rgba(245,243,255,0.55)">product here</text>
          </svg>
        )}

        {/* soft scan-line */}
        {ready && !reduce && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-x-4 h-px bg-gradient-to-r from-transparent via-asli-violet/70 to-transparent"
            animate={{ top: ["12%", "86%", "12%"] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }}
          />
        )}

        {/* shutter flash */}
        <AnimatePresence>
          {flash && (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-white"
              initial={{ opacity: 0.85 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
            />
          )}
        </AnimatePresence>
      </div>

      <button className="btn-primary w-full" onClick={snap} disabled={!ready}>
        {t("flow.challenge.capture")}
      </button>

      <div className="rounded-xl border border-dashed border-white/15 p-4">
        <div className="mb-2 text-xs uppercase tracking-wide text-white/40">
          Demo fixtures (no product needed · fills in the code to type)
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {FIXTURES.map((f) => (
            <button
              key={f.key}
              onClick={() => loadDemo(f)}
              className="btn-ghost flex-col !items-start !px-3 !py-2 text-left"
            >
              <span className="text-xs font-semibold text-white/80">{f.label}</span>
              <span className="text-[10px] text-white/40">{f.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
