"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { ShieldAlert } from "lucide-react";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { useSellerStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { useVoiceGuide } from "@/lib/useVoiceGuide";

const CONFETTI_COLORS = ["#8B5CF6", "#EC4899", "#F59E0B", "#22C55E", "#F43397"];

/** ~40 canvas particles falling once — the go-live hero moment. */
function runConfetti(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const dpr = window.devicePixelRatio || 1;
  const w = (canvas.width = canvas.offsetWidth * dpr);
  const h = (canvas.height = canvas.offsetHeight * dpr);
  const parts = Array.from({ length: 40 }, () => ({
    x: Math.random() * w,
    y: -20 - Math.random() * h * 0.4,
    vx: (Math.random() - 0.5) * 2 * dpr,
    vy: (1.6 + Math.random() * 2.4) * dpr,
    size: (4 + Math.random() * 5) * dpr,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.2,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
  }));
  let raf = 0;
  const start = performance.now();
  const tick = (now: number) => {
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (now - start < 3200) raf = requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, w, h);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

// Step 6 — the listing goes LIVE. ✓ Asli Verified when possession passed; an honest "live but
// unverified, pending review" state when the seller continued past a failing challenge.
export default function ResultStep() {
  const { sizeChart, declaredSize, catalogPreview, draft, reset, possessionUnverified } =
    useSellerStore();
  const t = useT();
  const verified = !possessionUnverified;
  useVoiceGuide(verified ? "flow.result.voice" : "flow.result.unverifiedVoice");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    // No confetti for an unverified go-live — it isn't the same celebration.
    if (reduce || !verified || !canvasRef.current) return;
    return runConfetti(canvasRef.current);
  }, [reduce, verified]);

  return (
    <div
      className={`card relative overflow-hidden p-8 text-center ${
        verified ? "border-asli-green/30" : "border-asli-amber/30"
      }`}
    >
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
      <div className="relative">
        {verified ? (
          <>
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-asli-green/20 text-3xl">
              ✓
            </div>
            <VerifiedBadge />
            <h2 className="mt-4 text-3xl font-black">{t("flow.result.title")}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-white/50">{t("flow.result.subtitle")}</p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-asli-amber/20">
              <ShieldAlert className="h-8 w-8 text-asli-amber" aria-hidden />
            </div>
            <span className="pill bg-asli-amber/15 text-asli-amber ring-1 ring-asli-amber/30">
              {t("flow.result.unverifiedPill")}
            </span>
            <h2 className="mt-4 text-3xl font-black">{t("flow.result.unverifiedTitle")}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-white/50">
              {t("flow.result.unverifiedSubtitle")}
            </p>
          </>
        )}

        <div className="mx-auto mt-6 max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] text-left">
          {catalogPreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={catalogPreview} alt="listing" className="h-48 w-full object-cover" />
          )}
          <div className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="truncate font-semibold">{draft.title || "Your listing"}</div>
              <div className="text-xs text-white/40">
                ₹{draft.price}
                {/* The seller's declared tag size wins: it is what the chart is anchored on and what
                    we persisted as mappedSize. Falling back to the derived band label announced a
                    different size ("Size XS" for a garment the seller listed as L). */}
                {sizeChart ? ` · Size ${declaredSize ?? sizeChart.size ?? "—"} · chest ${sizeChart.chestInches}"` : ""}
              </div>
            </div>
            {verified ? (
              <VerifiedBadge size="sm" />
            ) : (
              <span className="pill shrink-0 bg-asli-amber/15 text-[10px] text-asli-amber ring-1 ring-asli-amber/30">
                unverified
              </span>
            )}
          </div>
        </div>

        {/* Where a seller actually wants to go next: their products, with this listing now in it.
            A link rather than an auto-redirect — this screen is the payoff, and bouncing off it the
            moment it renders throws that away. reset() clears the finished flow on the way out so
            /sell starts clean next time. */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/seller/listings" className="btn-primary" onClick={reset}>
            {t("flow.result.products")}
          </Link>
          <button className="btn-ghost" onClick={reset}>
            {t("flow.result.another")}
          </button>
        </div>
      </div>
    </div>
  );
}
