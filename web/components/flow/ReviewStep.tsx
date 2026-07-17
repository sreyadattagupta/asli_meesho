"use client";

import { useState } from "react";
import { Camera, QrCode, Ruler, ShieldQuestion } from "lucide-react";
import { AgentReasonRow } from "@/components/ui/AgentReasonRow";
import { ConfidenceBar } from "@/components/ui/ConfidenceBar";
import { useSellerStore } from "@/lib/store";
import { saveDraftFields } from "@/lib/draftClient";
import { useT } from "@/lib/i18n";
import { useVoiceGuide } from "@/lib/useVoiceGuide";
import { WizardNav } from "./WizardNav";

// Step 8 ("Preview") — the decision panel. Renders BLOCK / ESCALATE / APPROVE outcomes with each
// agent's reason + confidence vs the orchestrator's required bar (invariant #8), and owns the single
// point where the seller's typed fields are written to the listing row.
export default function ReviewStep() {
  const { decision, matchResult, sizeChart, listingId, draft, setApproved, setStep, reset } =
    useSellerStore();
  const t = useT();
  // Voice matches the outcome shown — blocked / escalated / ready-to-publish.
  useVoiceGuide(
    decision?.action === "BLOCK"
      ? "flow.review.blockedVoice"
      : decision?.action === "ESCALATE_HUMAN"
        ? "flow.review.escalatedVoice"
        : "flow.review.voice",
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const bar = decision?.requiredConfidence;

  async function publish() {
    setBusy(true);
    setErr(null);
    try {
      if (listingId) {
        // Write what the seller typed BEFORE going live. The Details/Pricing/Inventory steps keep
        // their values in the store so the seller can move between them freely; this is where they
        // become the listing. Publish re-checks the title server-side and refuses an untitled draft,
        // so a failure here must stop the publish rather than ship a blank product to the feed.
        await saveDraftFields(listingId, draft);

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
    } catch (e) {
      // saveDraftFields throws a DraftSaveError carrying the route's own message ("Add a product
      // title…"); anything else is a genuine publish failure.
      setErr(e instanceof Error ? e.message : "Publish failed — retry.");
    } finally {
      setBusy(false);
    }
  }

  const agentRows = matchResult && (
    <div className="mt-4 space-y-1 rounded-xl bg-white/[0.03] px-3 py-2">
      <AgentReasonRow icon={Camera} label={t("flow.review.sameProduct")} passed={matchResult.same_item} />
      <AgentReasonRow icon={QrCode} label={t("flow.review.codeVisible")} passed={matchResult.code_visible} />
      <AgentReasonRow
        icon={ShieldQuestion}
        label={t("flow.review.confVsBar")}
        confidence={matchResult.confidence}
        passed={bar === undefined ? undefined : matchResult.confidence >= bar}
        note={matchResult.reason}
      />
      <div className="px-1 pb-2 pt-1">
        <ConfidenceBar value={matchResult.confidence} bar={bar} />
        {bar !== undefined && (
          <p className="mt-1 text-[10px] text-white/40">
            {t("flow.review.barNote", { p: Math.round(bar * 100) })}
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
          {t("flow.review.blockedPill")}
        </span>
        <h2 className="mt-3 text-2xl font-bold">{t("flow.review.blockedTitle")}</h2>
        <p className="mt-1 text-sm text-white/50">{decision.reason}</p>
        {agentRows}
        <p className="mt-4 text-xs text-white/40">{t("flow.review.blockedNote")}</p>
        <button className="btn-ghost mt-5" onClick={reset}>
          {t("flow.review.startOver")}
        </button>
      </div>
    );
  }

  // ---- ESCALATE_HUMAN: routed to the Trust & Safety queue ----
  if (decision?.action === "ESCALATE_HUMAN") {
    return (
      <div className="card border-asli-amber/30 p-6">
        <span className="pill bg-asli-amber/15 text-asli-amber ring-1 ring-asli-amber/30">
          {t("flow.review.escalatedPill")}
        </span>
        <h2 className="mt-3 text-2xl font-bold">{t("flow.review.escalatedTitle")}</h2>
        <p className="mt-1 text-sm text-white/50">{decision.reason}</p>
        {agentRows}
        {listingId ? (
          <div className="mt-5 rounded-xl border border-asli-amber/20 bg-asli-amber/[0.06] px-4 py-3 text-sm text-asli-amber/90">
            {t("flow.review.lockedNote")}
          </div>
        ) : (
          <div className="mt-5 flex gap-3">
            <button className="btn-ghost flex-1" onClick={reset}>
              {t("flow.review.reject")}
            </button>
            <button
              className="btn-primary flex-1"
              onClick={() => {
                setApproved(true);
                setStep("live");
              }}
            >
              {t("flow.review.approve")}
            </button>
          </div>
        )}
        {!listingId && (
          <p className="mt-3 text-[10px] uppercase tracking-wide text-white/30">
            {t("flow.review.simNote")}
          </p>
        )}
      </div>
    );
  }

  // ---- AUTO_APPROVE path: possession + size verified, final publish ----
  return (
    <div className="card border-asli-green/25 p-6">
      <span className="pill bg-asli-green/15 text-asli-green ring-1 ring-asli-green/30">
        {t("flow.review.readyPill")}
      </span>
      <h2 className="mt-3 text-2xl font-bold">{t("flow.review.title")}</h2>

      {/* What the seller typed, laid out the way a buyer will meet it — the last chance to catch a
          wrong price or a typo before it's on the marketplace. */}
      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-base font-bold text-white">{draft.title || "Untitled listing"}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="text-lg font-black text-white">₹{draft.price}</span>
          {draft.mrp > draft.price && (
            <>
              <span className="text-sm text-white/30 line-through">₹{draft.mrp}</span>
              <span className="pill bg-asli-green/15 text-asli-green ring-1 ring-asli-green/30">
                {t("flow.pricing.off", { n: Math.round((1 - draft.price / draft.mrp) * 100) })}
              </span>
            </>
          )}
          <span className="pill bg-white/5 capitalize text-white/40">{draft.category}</span>
        </div>
        <p className="mt-2 text-xs text-white/40">
          {draft.stock} in stock{draft.sku.trim() ? ` · SKU ${draft.sku.trim()}` : ""}
        </p>
        {draft.description.trim() && (
          <p className="mt-2 line-clamp-3 text-xs text-white/50">{draft.description}</p>
        )}
      </div>

      {matchResult && (
        <>
          <h3 className="mt-4 text-sm font-semibold text-white/60">
            {t("flow.review.agent1")}
          </h3>
          {agentRows}
        </>
      )}

      {sizeChart && (
        <>
          <h3 className="mt-5 text-sm font-semibold text-white/60">
            {t("flow.review.agent2")}
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
        {busy ? t("flow.review.publishing") : t("flow.review.publish")}
      </button>

      {/* Previous goes back to Inventory — the data steps are the seller's to revisit. Publish is the
          step's own action above, so no Next here. */}
      <WizardNav />
    </div>
  );
}
