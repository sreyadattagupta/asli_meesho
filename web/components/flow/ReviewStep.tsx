"use client";

import { useState } from "react";
import { Camera, QrCode, Ruler, ShieldQuestion } from "lucide-react";
import { AgentReasonRow } from "@/components/ui/AgentReasonRow";
import { ConfidenceBar } from "@/components/ui/ConfidenceBar";
import { useSellerStore } from "@/lib/store";

// Step 5 — the decision panel. Renders BLOCK / ESCALATE / APPROVE outcomes with
// each agent's reason + confidence vs the orchestrator's required bar (invariant #8).
export default function ReviewStep() {
  const { decision, matchResult, sizeChart, listingId, setApproved, setStep, reset } =
    useSellerStore();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const bar = decision?.requiredConfidence;

  async function publish() {
    setBusy(true);
    setErr(null);
    try {
      if (listingId) {
        const res = await fetch(`/api/listings/${listingId}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sizeChart: sizeChart
              ? { chest_cm: sizeChart.chestCm, length_cm: sizeChart.lengthCm, waist_cm: sizeChart.waistCm }
              : undefined,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setErr(body?.error?.message ?? "Publish failed — retry.");
          return;
        }
      }
      setApproved(true);
      setStep("live");
    } catch {
      setErr("Publish failed — retry.");
    } finally {
      setBusy(false);
    }
  }

  const agentRows = matchResult && (
    <div className="mt-4 space-y-1 rounded-xl bg-white/[0.03] px-3 py-2">
      <AgentReasonRow icon={Camera} label="Same product as catalog" passed={matchResult.same_item} />
      <AgentReasonRow icon={QrCode} label="Today’s code visible on slip" passed={matchResult.code_visible} />
      <AgentReasonRow
        icon={ShieldQuestion}
        label="Match confidence vs required bar"
        confidence={matchResult.confidence}
        passed={bar === undefined ? undefined : matchResult.confidence >= bar}
        note={matchResult.reason}
      />
      <div className="px-1 pb-2 pt-1">
        <ConfidenceBar value={matchResult.confidence} bar={bar} />
        {bar !== undefined && (
          <p className="mt-1 text-[10px] text-white/40">
            Required bar this attempt: {Math.round(bar * 100)}% (risk-adaptive)
          </p>
        )}
      </div>
    </div>
  );

  // ---- BLOCK: clear failure, listing stopped ----
  if (decision?.action === "BLOCK") {
    return (
      <div className="card border-asli-red/30 p-6">
        <span className="pill bg-asli-red/15 text-asli-red ring-1 ring-asli-red/30">
          ✕ BLOCKED — possession not proven
        </span>
        <h2 className="mt-3 text-2xl font-bold">This listing can’t go live</h2>
        <p className="mt-1 text-sm text-white/50">{decision.reason}</p>
        {agentRows}
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

  // ---- ESCALATE_HUMAN: routed to the Trust & Safety queue ----
  if (decision?.action === "ESCALATE_HUMAN") {
    return (
      <div className="card border-asli-amber/30 p-6">
        <span className="pill bg-asli-amber/15 text-asli-amber ring-1 ring-asli-amber/30">
          ⚑ HUMAN REVIEW — ambiguous
        </span>
        <h2 className="mt-3 text-2xl font-bold">Routed to a Trust & Safety reviewer</h2>
        <p className="mt-1 text-sm text-white/50">{decision.reason}</p>
        {agentRows}
        {listingId ? (
          <div className="mt-5 rounded-xl border border-asli-amber/20 bg-asli-amber/[0.06] px-4 py-3 text-sm text-asli-amber/90">
            Locked pending review — a reviewer will decide in the admin queue.
            You’ll keep your trust record either way.
          </div>
        ) : (
          <div className="mt-5 flex gap-3">
            <button className="btn-ghost flex-1" onClick={reset}>
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
        )}
        {!listingId && (
          <p className="mt-3 text-[10px] uppercase tracking-wide text-white/30">
            simulated reviewer — sign in as admin for the real queue
          </p>
        )}
      </div>
    );
  }

  // ---- AUTO_APPROVE path: possession + size verified, final publish ----
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
          {agentRows}
        </>
      )}

      {sizeChart && (
        <>
          <h3 className="mt-5 text-sm font-semibold text-white/60">
            Agent 2 · Smart Sizing
          </h3>
          <div className="mt-2 space-y-1 rounded-xl bg-white/[0.03] px-3 py-2">
            <AgentReasonRow
              icon={Ruler}
              label={`Size ${sizeChart.size} — measured from the flat-lay`}
              confidence={sizeChart.confidence}
              passed
              note={`chest ${sizeChart.chestCm} cm · length ${sizeChart.lengthCm} cm · waist ${sizeChart.waistCm} cm`}
            />
          </div>
        </>
      )}

      {err && (
        <p role="alert" className="mt-4 text-xs text-asli-red">
          {err} <button className="underline" onClick={publish}>Retry</button>
        </p>
      )}

      <button className="btn-primary mt-6 w-full" onClick={publish} disabled={busy}>
        {busy ? "Publishing…" : "Approve & publish listing →"}
      </button>
    </div>
  );
}
