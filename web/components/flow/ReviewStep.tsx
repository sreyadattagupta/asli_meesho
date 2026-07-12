"use client";

import { useSellerStore } from "@/lib/store";
import type { MatchResult } from "@/lib/vlmClient";

function Check({ ok, label, pct }: { ok: boolean; label: string; pct?: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
      <span className={ok ? "text-asli-green" : "text-red-400"}>
        {ok ? "✓" : "✕"} {label}
      </span>
      {pct !== undefined && <span className="text-white/40">{pct}%</span>}
    </div>
  );
}

function MatchChecks({ m }: { m: MatchResult }) {
  return (
    <div className="mt-4 space-y-2">
      <Check ok={m.same_item} label="Same product as catalog" />
      <Check ok={m.code_visible} label="Today’s code visible on slip" />
      <Check ok={m.confidence >= 0.7} label="Model confidence" pct={Math.round(m.confidence * 100)} />
      {m.reason && <p className="px-1 pt-1 text-xs text-white/40">“{m.reason}”</p>}
    </div>
  );
}

// Step 5 — human-in-the-loop gate. Renders BLOCK / ESCALATE / APPROVE outcomes.
export default function ReviewStep() {
  const { decision, matchResult, sizeChart, setApproved, setStep, reset } =
    useSellerStore();

  // ---- BLOCK: clear failure, listing stopped ----
  if (decision?.action === "BLOCK") {
    return (
      <div className="card border-red-500/30 p-6">
        <span className="pill bg-red-500/15 text-red-300 ring-1 ring-red-500/30">
          ✕ BLOCKED — possession not proven
        </span>
        <h2 className="mt-3 text-2xl font-bold">This listing can’t go live</h2>
        <p className="mt-1 text-sm text-white/50">{decision.reason}</p>
        {matchResult && <MatchChecks m={matchResult} />}
        <p className="mt-4 text-xs text-white/40">
          A thief holding only a downloaded image can’t photograph it next to
          today’s live code. That’s the point.
        </p>
        <button className="btn-ghost mt-5" onClick={reset}>
          Start over
        </button>
      </div>
    );
  }

  // ---- ESCALATE_HUMAN: ambiguous, route to a reviewer ----
  if (decision?.action === "ESCALATE_HUMAN") {
    return (
      <div className="card border-asli-amber/30 p-6">
        <span className="pill bg-asli-amber/15 text-asli-amber ring-1 ring-asli-amber/30">
          ⚑ HUMAN REVIEW — ambiguous
        </span>
        <h2 className="mt-3 text-2xl font-bold">Routed to a Suraksha reviewer</h2>
        <p className="mt-1 text-sm text-white/50">{decision.reason}</p>
        {matchResult && <MatchChecks m={matchResult} />}
        <div className="mt-5 flex gap-3">
          <button
            className="btn-ghost flex-1"
            onClick={reset}
          >
            Reviewer: reject
          </button>
          <button
            className="btn-primary flex-1"
            onClick={() => {
              setApproved(true);
              setStep("live");
            }}
          >
            Reviewer: approve →
          </button>
        </div>
      </div>
    );
  }

  // ---- AUTO_APPROVE path: possession + size verified, final human sign-off ----
  return (
    <div className="card border-asli-green/25 p-6">
      <span className="pill bg-asli-green/15 text-asli-green ring-1 ring-asli-green/30">
        ✓ Verified — ready to publish
      </span>
      <h2 className="mt-3 text-2xl font-bold">Review & publish</h2>

      {matchResult && (
        <>
          <h3 className="mt-4 text-sm font-semibold text-white/60">
            Agent 1 · Possession-Proof
          </h3>
          <MatchChecks m={matchResult} />
        </>
      )}

      {sizeChart && (
        <>
          <h3 className="mt-5 text-sm font-semibold text-white/60">
            Agent 2 · Smart Sizing (auto-filled)
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { k: "Size", v: sizeChart.size },
              { k: "Chest", v: `${sizeChart.chestCm} cm` },
              { k: "Length", v: `${sizeChart.lengthCm} cm` },
              { k: "Waist", v: `${sizeChart.waistCm} cm` },
            ].map((c) => (
              <div key={c.k} className="rounded-lg bg-white/[0.03] px-3 py-2 text-center">
                <div className="text-[10px] uppercase tracking-wide text-white/40">
                  {c.k}
                </div>
                <div className="text-lg font-bold">{c.v}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <button
        className="btn-primary mt-6 w-full"
        onClick={() => {
          setApproved(true);
          setStep("live");
        }}
      >
        Approve & publish listing →
      </button>
    </div>
  );
}
