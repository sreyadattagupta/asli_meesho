"use client";

import { useEffect, useState } from "react";
import CameraCapture, { CapturedPhoto } from "@/components/CameraCapture";
import { StreamingChecklist } from "@/components/ui/StreamingChecklist";
import { useSellerStore } from "@/lib/store";
import { decide, stepForAction } from "@/lib/orchestrator";
import type { OrchestratorDecision, OrchestratorAction, FlowStep } from "@/lib/orchestrator";

type CheckState = "pending" | "active" | "done" | "failed";
const IDLE_CHECKS: { id: string; label: string; state: CheckState }[] = [
  { id: "product", label: "Checking product", state: "pending" },
  { id: "code", label: "Reading code", state: "pending" },
  { id: "live", label: "Scoring live capture", state: "pending" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Step 3 — THE SHOWPIECE. Dynamic, time-bound, single-use code (invariant #3);
// camera-only capture (invariant #2); VLM verifies same-item + code; the
// orchestrator's decide() routes the outcome (invariant #6/#7).
export default function ChallengeStep() {
  const {
    challenge,
    catalogFile,
    attempt,
    setChallenge,
    setMatchResult,
    setDecision,
    bumpAttempt,
  } = useSellerStore();

  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number>(0);
  const [note, setNote] = useState<string | null>(null);
  const [checks, setChecks] = useState(IDLE_CHECKS);

  const setCheck = (id: string, state: CheckState) =>
    setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, state } : c)));

  // countdown to the code's expiry
  useEffect(() => {
    if (!challenge) return;
    const tick = () =>
      setRemaining(Math.max(0, Math.round((challenge.expiresAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [challenge]);

  async function reissue() {
    const res = await fetch("/api/challenge");
    setChallenge(await res.json());
    setPhoto(null);
    setNote(null);
  }

  async function verify() {
    if (!photo || !catalogFile || !challenge) return;
    setBusy(true);
    setNote(null);
    setChecks([
      { id: "product", label: "Checking product", state: "active" },
      { id: "code", label: "Reading code", state: "pending" },
      { id: "live", label: "Scoring live capture", state: "pending" },
    ]);
    try {
      const form = new FormData();
      form.append("catalog", catalogFile);
      form.append("live", photo.blob, "live.jpg");
      form.append("code", challenge.code);
      const { listingId, trigger: trig } = useSellerStore.getState();
      if (listingId) form.append("listingId", listingId);
      form.append("matchCount", String(trig?.matchCount ?? 0));
      const res = await fetch("/api/challenge", { method: "POST", body: form });
      const match = await res.json();
      if (!res.ok) {
        setChecks(IDLE_CHECKS);
        const msg = match?.error?.message ?? match?.error ?? "Verification failed.";
        setNote(res.status === 409 ? `${msg} Tap "Get a new code" and retake.` : msg);
        if (res.status === 409) setRemaining(0); // surface the reissue button
        return;
      }
      setMatchResult(match);

      // Staged reveal — perceived streaming (real SSE is overkill at this latency).
      setCheck("product", match.same_item ? "done" : "failed");
      await sleep(300);
      setCheck("code", "active");
      await sleep(300);
      setCheck("code", match.code_visible ? "done" : "failed");
      await sleep(300);
      setCheck("live", "active");
      await sleep(300);
      setCheck("live", match.passed ? "done" : "failed");
      await sleep(400);

      // The SERVER orchestrator decides from persisted signals (invariant #6).
      // Signed-out local demo (no draft) falls back to the same pure decide() locally.
      let decision: OrchestratorDecision & { action: OrchestratorAction; nextStep: FlowStep };
      if (listingId) {
        const aRes = await fetch("/api/asli/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId }),
        });
        if (!aRes.ok) {
          const err = await aRes.json().catch(() => null);
          setNote(err?.error?.message ?? "Decision engine unavailable — retry.");
          setChecks(IDLE_CHECKS);
          return;
        }
        decision = await aRes.json();
      } else {
        const local = decide({
          reverseImageMatches: trig?.matchCount ?? 0,
          sameItem: !!match.same_item,
          codeVisible: !!match.code_visible,
          matchConfidence: Number(match.confidence ?? 0),
          sellerIsNew: true, // cold-start: no trust record in signed-out demo
          attempt,
        });
        decision = { ...local, nextStep: stepForAction(local.action) };
      }

      if (decision.action === "RE_CHALLENGE") {
        setDecision(decision);
        bumpAttempt();
        setNote(
          `${decision.reason} New bar: ${Math.round(decision.requiredConfidence * 100)}%. Take a clearer live photo with the code.`,
        );
        setPhoto(null);
        setChecks(IDLE_CHECKS);
        setRemaining(0); // single-use — a retry always needs a fresh code
      } else {
        useSellerStore.getState().applyDecision(decision);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!challenge) return null;
  const expired = remaining <= 0;

  return (
    <div className="card p-6">
      <h2 className="text-2xl font-bold">Prove you hold it</h2>
      <p className="mt-1 text-sm text-white/50">
        Write today’s code on a slip of paper, place it next to the real product,
        and take a <b>live camera photo</b>. A screenshot can’t fake this.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-asli-violet to-asli-pink p-[2px]">
          <div className="rounded-2xl bg-asli-ink px-6 py-4 text-center">
            <div className="text-xs uppercase tracking-widest text-white/40">
              Today’s code
            </div>
            <div className="font-mono text-4xl font-black tracking-[0.3em] text-white">
              {challenge.code}
            </div>
          </div>
        </div>
        <div className="text-sm">
          <div className={expired ? "text-red-400" : "text-white/70"}>
            {expired ? "Expired" : `Expires in ${remaining}s`}
          </div>
          <div className="text-white/40">Single-use · attempt {attempt + 1}</div>
          {expired && (
            <button className="btn-ghost mt-2 !py-1.5 text-xs" onClick={reissue}>
              Get a new code
            </button>
          )}
        </div>
      </div>

      <div className="mt-6">
        {photo ? (
          <div className="space-y-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.previewUrl}
              alt="live capture"
              className="mx-auto max-h-72 rounded-xl border border-white/10"
            />
            {busy && <StreamingChecklist items={checks} />}
            <div className="flex gap-3">
              <button className="btn-ghost" onClick={() => setPhoto(null)} disabled={busy}>
                Retake
              </button>
              <button className="btn-primary flex-1" onClick={verify} disabled={busy || expired}>
                {busy ? "AI verifying…" : "Verify possession →"}
              </button>
            </div>
          </div>
        ) : (
          <CameraCapture code={challenge.code} onCapture={setPhoto} />
        )}
      </div>

      {note && (
        <p className="mt-4 rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {note}
        </p>
      )}
    </div>
  );
}
