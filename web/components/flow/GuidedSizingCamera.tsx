"use client";

// Guided Smart-Sizing scanner — a document-scanner-style camera for garment measurement.
//
// Opens the live camera, overlays an A4-shaped guide at the centre, and validates every frame with
// real client-side CV (lib/vision/liveA4). The shutter is DISABLED until the A4 is detected, centred,
// perpendicular, the garment is visible, and the frame is sharp and well-lit — the user cannot
// capture (or bypass to a gallery upload) an invalid frame. On capture the full-resolution frame is
// handed back; the authoritative four-corner homography + measurement run server-side (detect.py).

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, X, Camera, RefreshCw } from "lucide-react";
import { analyzeFrame, type FrameVerdict } from "@/lib/vision/liveA4";

const GATES: Array<{ key: keyof FrameVerdict; label: string }> = [
  { key: "a4Detected", label: "A4 detected" },
  { key: "centered", label: "Centered" },
  { key: "perpendicular", label: "Straight-on" },
  { key: "garmentVisible", label: "Garment in frame" },
  { key: "sharp", label: "Sharp" },
  { key: "lightingOk", label: "Lighting" },
];

export default function GuidedSizingCamera({
  onCapture,
  onClose,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [verdict, setVerdict] = useState<FrameVerdict | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          setError(
            `Camera needs HTTPS or localhost — this page is on ${window.location.protocol}//${window.location.host}. ` +
              "Open it as https:// (npm run dev:https) or on localhost.",
          );
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch {
        setError("Camera unavailable or permission denied. Grant camera access and reopen.");
      }
    }
    start();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Live validation loop — throttled to ~8 fps so the CV stays cheap on a phone.
  useEffect(() => {
    if (!ready) return;
    let last = 0;
    const tick = (ts: number) => {
      if (ts - last >= 120 && videoRef.current && videoRef.current.readyState >= 2) {
        last = ts;
        try { setVerdict(analyzeFrame(videoRef.current)); } catch { /* transient frame */ }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [ready]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !verdict?.ready) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 160);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  }, [onCapture, verdict]);

  const canCapture = Boolean(verdict?.ready);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold text-white/80">Smart Sizing · guided scan</span>
        <button aria-label="Close scanner" onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white/70 hover:bg-white/20">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <p className="px-4 pb-2 text-center text-sm text-white/60">
        Place the A4 sheet flat at the center of the garment and align it with the on-screen A4 frame.
      </p>

      {/* camera stage */}
      <div className="relative mx-auto aspect-[3/4] w-full max-w-md flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />

        {!ready && !error && (
          <div className="absolute inset-0 grid place-items-center text-white/50">Starting camera…</div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-amber-200/80">{error}</div>
        )}

        {/* A4 guide overlay (portrait 21:29.7) — turns green when the frame is capture-ready */}
        {ready && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div
              className="rounded-lg border-2 border-dashed transition-colors duration-200"
              style={{
                width: "46%",
                aspectRatio: "21 / 29.7",
                borderColor: canCapture ? "rgba(34,197,94,0.95)" : "rgba(255,255,255,0.7)",
                boxShadow: canCapture ? "0 0 0 9999px rgba(34,197,94,0.06)" : "0 0 0 9999px rgba(0,0,0,0.28)",
              }}
            >
              <span className="mt-1 block text-center text-[11px] font-semibold tracking-wide"
                style={{ color: canCapture ? "rgba(34,197,94,0.95)" : "rgba(255,255,255,0.7)" }}>
                A4
              </span>
            </div>
          </div>
        )}

        {/* scan-line */}
        {ready && !reduce && !canCapture && (
          <motion.div aria-hidden
            className="pointer-events-none absolute inset-x-8 h-px bg-gradient-to-r from-transparent via-asli-violet/70 to-transparent"
            animate={{ top: ["16%", "82%", "16%"] }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} />
        )}

        {/* live guidance banner */}
        {ready && verdict && (
          <div className="absolute inset-x-0 bottom-0 p-3">
            <div className={[
              "rounded-xl px-4 py-2.5 text-center text-sm font-semibold backdrop-blur",
              canCapture ? "bg-asli-green/85 text-black" : "bg-black/60 text-white",
            ].join(" ")} role="status" aria-live="polite">
              {verdict.guidance}
            </div>
          </div>
        )}

        <AnimatePresence>
          {flash && (
            <motion.div aria-hidden className="pointer-events-none absolute inset-0 bg-white"
              initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} />
          )}
        </AnimatePresence>
      </div>

      {/* gate checklist */}
      {ready && verdict && (
        <div className="mx-auto flex w-full max-w-md flex-wrap justify-center gap-1.5 px-4 py-3">
          {GATES.map((g) => {
            const pass = Boolean(verdict[g.key]);
            return (
              <span key={g.key} className={[
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
                pass ? "bg-asli-green/15 text-asli-green" : "bg-white/8 text-white/40",
              ].join(" ")}>
                {pass ? <Check className="h-3 w-3" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
                {g.label}
              </span>
            );
          })}
        </div>
      )}

      {/* shutter — disabled until every gate passes */}
      <div className="mx-auto w-full max-w-md px-4 pb-6">
        <button
          onClick={capture}
          disabled={!canCapture}
          className={[
            "flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold transition",
            canCapture ? "bg-asli-green text-black hover:brightness-105" : "cursor-not-allowed bg-white/10 text-white/40",
          ].join(" ")}
        >
          <Camera className="h-5 w-5" aria-hidden />
          {canCapture ? "Capture" : "Align the A4 frame to enable capture"}
        </button>
        {error && (
          <button onClick={onClose}
            className="mt-2 flex w-full items-center justify-center gap-1 text-xs text-white/50 hover:text-white/70">
            <RefreshCw className="h-3 w-3" aria-hidden /> Close and try again
          </button>
        )}
      </div>
    </div>
  );
}
