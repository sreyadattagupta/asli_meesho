"use client";

// Reviewer cockpit — full agent context + approve/reject with a required note.
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X, ShieldCheck, ShieldX, Camera, Bot } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { AgentReasonRow } from "@/components/ui/AgentReasonRow";
import { EvidenceCards } from "@/components/seller/EvidenceCards";
import type { ReviewQueueItem } from "@/app/api/review/queue/route";

export function ReviewDetailDrawer({
  item, onClose, onDecided,
}: {
  item: ReviewQueueItem;
  onClose: () => void;
  onDecided: (reviewId: string, decision: "approved" | "rejected") => void;
}) {
  const reduce = useReducedMotion();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const catalog = item.images.find((i) => i.kind === "catalog")?.url ?? "/mock/kurtis-1.svg";
  const live = item.images.find((i) => i.kind === "live")?.url ?? catalog;
  const escalation = item.checks.filter((c) => c.action === "ESCALATE_HUMAN").at(-1);

  async function decide(decision: "approved" | "rejected") {
    if (note.trim().length === 0) { setErr("A note is required to record your decision."); return; }
    setBusy(decision); setErr(null);
    try {
      const res = await fetch(`/api/review/${item.review.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note.trim() }),
      });
      const body = await res.json();
      if (!res.ok) { setErr(body?.error?.message ?? "Decision failed — retry."); return; }
      onDecided(item.review.id, decision);
    } catch {
      setErr("Network hiccup — retry.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
      >
        <motion.aside
          role="dialog" aria-modal="true" aria-label="Review listing"
          className="h-full w-full max-w-lg overflow-y-auto border-l border-white/10 bg-[#120b22] p-5 shadow-2xl"
          initial={reduce ? { opacity: 0 } : { x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { x: 40, opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-asli-amber">Escalated for review</p>
              <h2 className="text-lg font-bold">{item.listing?.title ?? "Listing"}</h2>
              <p className="text-sm text-white/50">
                {item.seller?.shopName} · trust {item.seller?.trustScore ?? "—"}
              </p>
            </div>
            <button
              onClick={onClose} aria-label="Close"
              className="flex h-11 w-11 items-center justify-center rounded-xl text-white/60 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          {/* Side-by-side evidence */}
          <div className="grid grid-cols-2 gap-3">
            <figure>
              <figcaption className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/40">Catalog</figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={catalog} alt="Catalog" className="aspect-square w-full rounded-xl border border-white/10 object-cover" />
            </figure>
            <figure>
              <figcaption className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/40">Live capture</figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={live} alt="Live capture" className="aspect-square w-full rounded-xl border border-white/10 object-cover" />
            </figure>
          </div>

          {escalation && (
            <div className="mt-4 rounded-xl border border-asli-amber/30 bg-asli-amber/5 px-4 py-3 text-xs text-white/70">
              <span className="font-semibold text-asli-amber">Why escalated:</span> {escalation.reason}
              {" "}Required bar {Math.round(escalation.requiredConfidence * 100)}%.
            </div>
          )}

          {/* Agent trail */}
          <div className="mt-4 divide-y divide-white/5 rounded-xl border border-white/10 px-3">
            {item.checks.map((c) => (
              <AgentReasonRow
                key={c.id}
                icon={c.agent === "orchestrator" ? Bot : Camera}
                label={`${c.agent} · ${c.action}`}
                note={c.reason}
                confidence={c.confidence}
                passed={c.action === "AUTO_APPROVE" ? true : c.action === "BLOCK" ? false : undefined}
              />
            ))}
          </div>

          {/* Reverse-search evidence (Agent 1, component 5) */}
          {item.evidence && item.evidence.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/40">
                Web evidence ({item.evidence.length})
              </p>
              <EvidenceCards evidence={item.evidence} />
            </div>
          )}

          {/* Decision */}
          <div className="mt-5">
            <label htmlFor="note" className="text-xs font-semibold text-white/60">Reviewer note (required)</label>
            <textarea
              id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3}
              placeholder="Record why you approved or rejected…"
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
            />
            {err && <p role="alert" className="mt-2 text-xs text-asli-red">{err}</p>}
            <div className="mt-3 flex gap-2">
              <Button variant="primary" loading={busy === "approved"} disabled={busy !== null} onClick={() => decide("approved")} className="flex-1">
                <ShieldCheck className="h-4 w-4" aria-hidden /> Approve
              </Button>
              <Button variant="danger" loading={busy === "rejected"} disabled={busy !== null} onClick={() => decide("rejected")} className="flex-1">
                <ShieldX className="h-4 w-4" aria-hidden /> Reject
              </Button>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-white/40">
              <Badge variant="neutral">demo</Badge> Your decision updates the seller&apos;s trust score.
            </p>
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
