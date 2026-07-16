"use client";

// A plain "take a photo" camera: live stream → shutter → File. No verification semantics.
//
// Why this exists: <input capture="environment"> is a HINT that only mobile honours. On desktop the
// attribute is ignored and the browser opens a file picker, so a button labelled "Take a photo"
// silently became a second gallery picker. This uses getUserMedia so the label is true on a laptop
// too, and falls back to the capture input when there is no camera or permission is refused.
//
// NOT for the challenge step — that has its own CameraCapture with the live-code flow (invariant #2).
import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";

export function PhotoCamera({
  onCapture,
  onClose,
  fallbackLabel = "Choose a photo instead",
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
  fallbackLabel?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch {
        // No camera, or the user said no. Say so and offer the picker rather than hanging.
        setError("No camera available. You can pick a photo instead.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function shoot() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
      onClose();
    }, "image/jpeg", 0.92);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Take a photo">
      <div className="card w-full max-w-md overflow-hidden p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-white/80">Take a photo</span>
          <button onClick={onClose} aria-label="Close camera" className="rounded-lg p-2 text-white/50 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {error ? (
          <p role="alert" className="py-6 text-center text-sm text-white/50">{error}</p>
        ) : (
          <video ref={videoRef} playsInline muted className="aspect-square w-full rounded-xl bg-black object-cover" />
        )}

        <div className="mt-4 flex flex-col gap-2">
          {!error && (
            <button onClick={shoot} disabled={!ready} className="btn-primary">
              <Camera className="h-4 w-4" aria-hidden /> {ready ? "Capture" : "Starting camera…"}
            </button>
          )}
          <button onClick={() => fallbackRef.current?.click()} className="btn-ghost">
            {fallbackLabel}
          </button>
        </div>

        <input
          ref={fallbackRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = ""; // same re-pick trap as the catalog input
            if (f) { onCapture(f); onClose(); }
          }}
        />
      </div>
    </div>
  );
}
