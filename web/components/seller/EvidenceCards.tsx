"use client";

// Real reverse-search evidence (component 5 output): per-match thumbnail, title, price, source.
// TRIGGER + evidence only (invariant #1) — never a verdict; the seller still proves possession next.
import { Badge } from "@/components/ui/Badge";
import type { Agent1Evidence } from "@/lib/agent1Client";

export function EvidenceCards({
  evidence,
  explanation,
  degraded,
}: {
  evidence: Agent1Evidence[];
  explanation?: string;
  degraded?: boolean;
}) {
  if (!evidence || evidence.length === 0) {
    return (
      <p className="text-sm text-white/50">
        {degraded
          ? "Live web search is temporarily unavailable — retry, or continue to proof."
          : "No web matches found — this image looks original."}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {explanation && <p className="text-sm text-white/70">{explanation}</p>}
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {evidence.map((e, i) => (
          <li
            key={`${e.link}-${i}`}
            className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3"
          >
            {e.thumbnail && (
              // remote thumbnails from arbitrary hosts — plain <img>, not next/image
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={e.thumbnail}
                alt=""
                width={56}
                height={56}
                loading="lazy"
                className="h-14 w-14 shrink-0 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{e.title ?? "(untitled)"}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-white/60">
                <Badge variant={e.category === "marketplace" ? "trigger" : "neutral"}>
                  {e.platform}
                </Badge>
                {e.price != null && (
                  <span>
                    {e.currency ?? "₹"}
                    {e.price}
                  </span>
                )}
              </div>
              <a
                href={e.link}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block truncate text-xs text-asli-violet hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
              >
                View source
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
