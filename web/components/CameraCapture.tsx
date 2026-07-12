"use client";

// Camera-ONLY capture — enforces invariant #2.
// The challenge step must use a LIVE camera stream (getUserMedia). A gallery/file
// picker is NEVER offered here — that would defeat the possession proof.
//
// For pitching on a laptop with no product in hand, a clearly-labelled DEMO row
// composes fixture photos in-browser (canvas): the product image + a slip that
// shows the CURRENT dynamic code. These are demo fixtures, not a user gallery
// upload, and they honour invariant #3 (the code stays dynamic per session).

import { useCallback, useEffect, useRef, useState } from "react";

export interface CapturedPhoto {
  blob: Blob;
  previewUrl: string;
  source: "camera" | "demo";
}

type FixtureKey = "genuine" | "thief" | "wrongcode";

const FIXTURES: Array<{
  key: FixtureKey;
  label: string;
  hint: string;
  base: string; // product image drawn under the slip
  codeFor: (issued: string) => string | null; // slip text (null = no slip)
}> = [
  {
    key: "genuine",
    label: "Genuine (product + code)",
    hint: "honest seller",
    base: "/proof/catalog_real.jpg",
    codeFor: (issued) => issued, // writes the REAL issued code → passes
  },
  {
    key: "thief",
    label: "Thief (different item)",
    hint: "wrong product",
    base: "/proof/live_otheritem.jpg",
    codeFor: () => null, // no valid product, no code → blocked
  },
  {
    key: "wrongcode",
    label: "Wrong code on slip",
    hint: "code mismatch",
    base: "/proof/catalog_real.jpg",
    codeFor: () => "WR0NG", // right item, wrong code → code_visible fails
  },
];

// Draw `base` image with a handwritten-style code slip into a JPEG blob.
async function composeFixture(base: string, code: string | null): Promise<Blob> {
  const img = await loadImage(base);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || 500;
  canvas.height = img.naturalHeight || 500;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  if (code) {
    const w = canvas.width * 0.34;
    const h = canvas.height * 0.16;
    const x = canvas.width - w - canvas.width * 0.02;
    const y = canvas.height * 0.58;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#111111";
    ctx.font = `bold ${Math.round(h * 0.5)}px Arial`;
    ctx.textBaseline = "middle";
    ctx.fillText(code, x + w * 0.1, y + h * 0.5);
  }

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
  code: string; // current dynamic challenge code — drawn onto the genuine fixture
  onCapture: (photo: CapturedPhoto) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
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
      const blob = await composeFixture(f.base, f.codeFor(code));
      onCapture({ blob, previewUrl: URL.createObjectURL(blob), source: "demo" });
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
          ● LIVE · camera only
        </span>
      </div>

      <button className="btn-primary w-full" onClick={snap} disabled={!ready}>
        📸 Capture live photo
      </button>

      <div className="rounded-xl border border-dashed border-white/15 p-4">
        <div className="mb-2 text-xs uppercase tracking-wide text-white/40">
          Demo fixtures (no product needed · uses today’s live code)
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
