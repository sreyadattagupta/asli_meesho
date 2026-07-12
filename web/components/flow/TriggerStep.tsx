"use client";

import { useSellerStore } from "@/lib/store";

// Step 2 — reverse-image result. TRIGGER ONLY (invariant #1). Never a verdict.
// We name the platforms the photo was seen on (Flipkart / Myntra / Amazon /
// Meesho / …) via Google Lens — informative, never a block.
export default function TriggerStep() {
  const { trigger, setChallenge, setStep } = useSellerStore();

  async function issueAndGo() {
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
            ⚡ TRIGGER — not a verdict
          </span>
          <h2 className="mt-3 text-2xl font-bold">
            {trigger.triggered
              ? `This photo appears on ${trigger.matchCount} place${trigger.matchCount === 1 ? "" : "s"} online`
              : "Photo looks original"}
          </h2>
          <p className="mt-1 max-w-lg text-sm text-white/50">
            We checked this image across the web — Google, Flipkart, Myntra,
            Amazon, Meesho and more. That’s normal for a reseller using a
            supplier’s photo, so we don’t block you. We just ask you to prove you
            physically hold the item.
          </p>
        </div>
        {trigger.mocked && (
          <span className="pill bg-white/5 text-white/40">demo / mock</span>
        )}
      </div>

      {trigger.platforms.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-white/40">
            Seen on
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
              Found on {marketplaces.length} marketplace
              {marketplaces.length === 1 ? "" : "s"}
              {otherCount > 0 ? ` + ${otherCount} other site${otherCount === 1 ? "" : "s"}` : ""}.
              Prove possession to list it here anyway.
            </p>
          )}
        </div>
      )}

      <button className="btn-primary mt-6" onClick={issueAndGo}>
        Prove possession — get today’s code →
      </button>
    </div>
  );
}
