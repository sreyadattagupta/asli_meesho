"use client";

import { useSellerStore, useSessionStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { useVoiceGuide } from "@/lib/useVoiceGuide";

// Step 2 — reverse-image result. TRIGGER ONLY (invariant #1). Never a verdict.
// We name the platforms the photo was seen on (Flipkart / Myntra / Amazon /
// Meesho / …) via Google Lens — informative, never a block.
export default function TriggerStep() {
  const { trigger, setChallenge, setStep, listingId } = useSellerStore();
  const sellerId = useSessionStore((s) => s.user?.sellerId);
  const t = useT();
  useVoiceGuide("flow.trigger.voice");

  async function issueAndGo() {
    // Risk Radar fast lane: a trusted seller skips the live challenge entirely. We only run the
    // orchestrator early for eligible sellers — otherwise it would block a seller with no proof yet.
    if (sellerId && listingId) {
      try {
        const rr = await fetch("/api/agents/risk-radar/score", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sellerId }),
        });
        if (rr.ok && (await rr.json()).fastLaneEligible) {
          const aRes = await fetch("/api/asli/analyze", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ listingId }),
          });
          if (aRes.ok) {
            useSellerStore.getState().applyDecision(await aRes.json());
            return;
          }
        }
      } catch {
        // fall through to the standard challenge path
      }
    }
    const res = await fetch("/api/challenge"); // GET → fresh dynamic code
    const challenge = await res.json();
    setChallenge(challenge);
    setStep("challenge");
  }

  if (!trigger) return null;

  const marketplaces = trigger.platforms.filter((p) => p.category === "marketplace");
  const otherCount = trigger.platforms.length - marketplaces.length;

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="pill bg-asli-amber/15 text-asli-amber ring-1 ring-asli-amber/30">
            {t("flow.trigger.pill")}
          </span>
          <h2 className="mt-3 text-2xl font-bold">
            {trigger.triggered
              ? t("flow.trigger.headlineSeen", { n: trigger.matchCount })
              : t("flow.trigger.headlineClean")}
          </h2>
          <p className="mt-1 max-w-lg text-sm text-white/50">{t("flow.trigger.subtitle")}</p>
        </div>
        {trigger.mocked && (
          <span className="pill bg-white/5 text-white/40">demo / mock</span>
        )}
      </div>

      {trigger.platforms.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-white/40">
            {t("flow.trigger.seenOn")}
          </div>
          <div className="flex flex-wrap gap-2">
            {trigger.platforms.map((p) => (
              <a
                key={p.name}
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className={[
                  "pill ring-1 transition hover:brightness-125",
                  p.category === "marketplace"
                    ? "bg-asli-pink/15 text-asli-pink ring-asli-pink/30"
                    : "bg-white/5 text-white/50 ring-white/10",
                ].join(" ")}
              >
                {p.category === "marketplace" ? "🛒" : "🔗"} {p.name}
                {p.count > 1 && (
                  <span className="opacity-60">×{p.count}</span>
                )}
              </a>
            ))}
          </div>
          {marketplaces.length > 0 && (
            <p className="mt-3 text-xs text-white/40">
              {t("flow.trigger.marketNote", { m: marketplaces.length })}
              {otherCount > 0 ? ` (+${otherCount})` : ""}
            </p>
          )}
        </div>
      )}

      <button className="btn-primary mt-6" onClick={issueAndGo}>
        {t("flow.trigger.cta")}
      </button>
    </div>
  );
}
