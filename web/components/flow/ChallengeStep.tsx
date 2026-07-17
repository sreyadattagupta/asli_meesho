"use client";

import { useEffect, useState } from "react";
import CameraCapture, { CapturedPhoto } from "@/components/CameraCapture";
import { StreamingChecklist } from "@/components/ui/StreamingChecklist";
import { useSellerStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { useVoiceGuide } from "@/lib/useVoiceGuide";
import { WizardNav } from "./WizardNav";
import { decide, stepForAction } from "@/lib/orchestrator";
import type { OrchestratorDecision, OrchestratorAction, FlowStep } from "@/lib/orchestrator";
import type { I18nKey } from "@/lib/i18n/en";

type CheckState = "pending" | "active" | "done" | "failed";
type CheckId = "product" | "code" | "live";
// Labels resolve through t() at render so they follow the live locale.
const CHECK_LABEL: Record<CheckId, I18nKey> = {
  product: "flow.challenge.checkProduct",
  code: "flow.challenge.checkCode",
  live: "flow.challenge.checkLive",
};
const IDLE_CHECKS: { id: CheckId; state: CheckState }[] = [
  { id: "product", state: "pending" },
  { id: "code", state: "pending" },
  { id: "live", state: "pending" },
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
  const t = useT();
  useVoiceGuide("flow.challenge.voice");

  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [typedCode, setTypedCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [remaining, setRemaining] = useState<number>(0);
  const [note, setNote] = useState<string | null>(null);
  const [checks, setChecks] = useState(IDLE_CHECKS);

  // After two failed attempts the seller shouldn't be trapped by a gate that can't confirm a genuine
  // product. They may Retake Again, or continue to Agent 2 — recorded as UNVERIFIED possession, which
  // publishes without the ✓ badge and lands in the review queue (never a silent pass).
  const canContinueUnverified = attempt >= 2;

  async function continueUnverified() {
    setContinuing(true);
    try {
      const { listingId } = useSellerStore.getState();
      if (listingId) {
        const res = await fetch("/api/asli/continue-unverified", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId }),
        });
        if (!res.ok) {
          const b = await res.json().catch(() => null);
          setNote(b?.error?.message ?? "Couldn't continue — retry.");
          return;
        }
      }
      // Advance to Agent 2. Possession stays unverified (server-recorded when a listing exists); the
      // flag drives the honest "unverified" go-live screen.
      useSellerStore.getState().setPossessionUnverified(true);
      useSellerStore.getState().setStep("sizing");
    } catch {
      setNote("Network hiccup — retry.");
    } finally {
      setContinuing(false);
    }
  }

  // Camera path: seller types the code manually. Demo path: the fixture hands back the code to
  // type (`demoCode`) so the genuine / thief / wrong-code scenarios each drive the real path.
  const handleCapture = (p: CapturedPhoto) => {
    setPhoto(p);
    if (p.demoCode !== undefined) setTypedCode(p.demoCode);
  };

  const setCheck = (id: CheckId, state: CheckState) =>
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

  // Fetch a FRESH single-use code and reset the capture. Codes are dynamic + single-use + TTL-bound
  // (invariant #3), so every retry / reload issues a new one — the seller is never locked out.
  async function reissue({ keepNote = false }: { keepNote?: boolean } = {}) {
    const res = await fetch("/api/challenge");
    setChallenge(await res.json());
    setPhoto(null);
    setTypedCode("");
    if (!keepNote) setNote(null);
  }

  // On entering the challenge step (including after a browser reload that restored the flow), always
  // start from a fresh code rather than a stale / already-used one.
  useEffect(() => {
    if (!challenge || challenge.expiresAt <= Date.now()) void reissue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verify() {
    if (!photo || !catalogFile || !challenge) return;
    const entered = typedCode.trim().toUpperCase();
    if (!entered) {
      setNote(t("flow.challenge.enterCode"));
      return;
    }
    setBusy(true);
    setNote(null);
    setChecks([
      { id: "product", state: "active" },
      { id: "code", state: "pending" },
      { id: "live", state: "pending" },
    ]);
    try {
      const form = new FormData();
      form.append("catalog", catalogFile);
      form.append("live", photo.blob, "live.jpg");
      form.append("code", entered); // seller-typed code — text-verified by the single-use claim
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
        // Verification failed — show the exact mismatch copy and AUTO-ISSUE a fresh single-use code
        // so the seller can immediately retake (unlimited retries; no lock-out — policy 2A).
        setDecision(decision);
        bumpAttempt();
        setChecks(IDLE_CHECKS);
        await reissue({ keepNote: true });
        setNote(decision.reason); // MSG_LIVE_PROOF_MISMATCH — kept through the reissue
      } else {
        // AUTO_APPROVE → advance to sizing; BLOCK → locked terminal (blocked card, no proceed).
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
      <h2 className="text-2xl font-bold">{t("flow.challenge.title")}</h2>
      <p className="mt-1 text-sm text-white/50">{t("flow.challenge.subtitle")}</p>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-asli-violet to-asli-pink p-[2px]">
          <div className="rounded-2xl bg-asli-ink px-6 py-4 text-center">
            <div className="text-xs uppercase tracking-widest text-white/40">
              {t("flow.challenge.codeLabel")}
            </div>
            <div className="font-mono text-4xl font-black tracking-[0.3em] text-white">
              {challenge.code}
            </div>
          </div>
        </div>
        <div className="text-sm">
          <div className={expired ? "text-red-400" : "text-white/70"}>
            {expired ? t("flow.challenge.expired") : t("flow.challenge.expiresIn", { s: remaining })}
          </div>
          <div className="text-white/40">{t("flow.challenge.singleUse", { a: attempt + 1 })}</div>
          {/* Always available — a fresh single-use code on demand (no lock-out). */}
          <button
            className="btn-ghost mt-2 !py-1.5 text-xs"
            onClick={() => reissue()}
            disabled={busy}
          >
            {t("flow.challenge.newCode")}
          </button>
        </div>
      </div>

      {/* Type today's code — text-verified server-side (single-use). Not photographed. */}
      <div className="mt-6">
        <label htmlFor="challenge-code" className="text-sm text-white/60">
          {t("flow.challenge.typeCodeLabel")}
        </label>
        <input
          id="challenge-code"
          value={typedCode}
          onChange={(e) => setTypedCode(e.target.value.toUpperCase())}
          disabled={busy || expired}
          maxLength={12}
          autoComplete="off"
          spellCheck={false}
          placeholder={challenge.code}
          aria-label={t("flow.challenge.typeCodeLabel")}
          className="mt-1.5 w-full rounded-xl border border-white/15 bg-asli-ink px-4 py-3 font-mono text-2xl tracking-[0.3em] text-white outline-none placeholder:text-white/20 focus-visible:ring-2 focus-visible:ring-asli-violet"
        />
      </div>

      <div className="mt-5">
        {photo ? (
          <div className="space-y-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.previewUrl}
              alt="live capture"
              className="mx-auto max-h-72 rounded-xl border border-white/10"
            />
            {busy && (
              <StreamingChecklist
                items={checks.map((c) => ({ ...c, label: t(CHECK_LABEL[c.id]) }))}
              />
            )}
            <div className="flex gap-3">
              <button
                className="btn-ghost"
                onClick={() => {
                  setPhoto(null);
                  setTypedCode("");
                }}
                disabled={busy}
              >
                {t("flow.challenge.retake")}
              </button>
              <button className="btn-primary flex-1" onClick={verify} disabled={busy || expired}>
                {busy ? t("flow.challenge.verifying") : t("flow.challenge.verify")}
              </button>
            </div>
          </div>
        ) : (
          <CameraCapture code={challenge.code} onCapture={handleCapture} />
        )}
      </div>

      {note && (
        <p className="mt-4 rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {note}
        </p>
      )}

      {/* Two-strikes escape hatch: after the challenge keeps failing, offer to continue unverified
          rather than trap a genuine seller. Clearly warned; publishes without the ✓ badge + review. */}
      {canContinueUnverified && (
        <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
          <p className="text-sm font-semibold text-amber-200">{t("flow.challenge.continueTitle")}</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-100/70">
            {t("flow.challenge.continueWarning")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="btn-ghost min-h-[44px]"
              onClick={() => {
                setPhoto(null);
                setTypedCode("");
                setNote(null);
              }}
              disabled={busy || continuing}
            >
              {t("flow.challenge.retakeAgain")}
            </button>
            <button
              className="min-h-[44px] rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/25 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              onClick={() => void continueUnverified()}
              disabled={busy || continuing}
            >
              {continuing ? t("flow.challenge.continuing") : t("flow.challenge.continueBtn")}
            </button>
          </div>
        </div>
      )}

      {/* Stuck here? Save the draft and come back to it, or start a fresh listing — the possession
          proof you've done so far is kept with the draft. */}
      <WizardNav />
    </div>
  );
}
