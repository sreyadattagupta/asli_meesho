// TriggerSource seam — one contract over serpapi | qdrant | mock (invariant #1:
// whatever the source, the result is a TRIGGER for the possession challenge, never a verdict).
import { reverseImageSearch } from "./reverseImage";
import type { PlatformHit } from "./reverseImage";

export interface TriggerResult {
  triggered: boolean;
  matchCount: number;
  platforms: PlatformHit[];
  source: "serpapi" | "qdrant" | "mock";
  /** sample raw URLs for the detail view (serpapi/mock only). */
  sources: string[];
}

class TriggerUnavailable extends Error {}

export async function getTrigger(imageHash: string, bytes: Buffer): Promise<TriggerResult> {
  const configured = process.env.TRIGGER_SOURCE ?? "serpapi";
  switch (configured) {
    case "serpapi": {
      if (!process.env.SERPAPI_KEY) return mockTrigger(); // keyless ⇒ labelled mock fallback
      const r = await reverseImageSearch(bytes); // internal hash cache keeps free-tier usage down
      if (r.mocked) return mockTrigger(); // SerpAPI errored — reverseImage already fell back
      return { triggered: r.triggered, matchCount: r.matchCount, platforms: r.platforms, source: "serpapi", sources: r.sources };
    }
    case "qdrant": {
      try {
        return await qdrantTrigger(imageHash, bytes);
      } catch {
        return mockTrigger(); // embed service not up (lands Task 5.7) — degrade, stay labelled
      }
    }
    case "mock":
      return mockTrigger();
    default:
      console.warn(`[trigger] unknown TRIGGER_SOURCE "${configured}" — using mock`);
      return mockTrigger();
  }
}

/** Embedding-similarity trigger via the VLM service (Qdrant local mode). */
async function qdrantTrigger(imageHash: string, bytes: Buffer): Promise<TriggerResult> {
  const base = process.env.VLM_SERVICE_URL ?? "http://localhost:8000";
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }), "catalog.jpg");
  form.append("image_hash", imageHash);
  const res = await fetch(`${base}/vlm/similar`, { method: "POST", body: form, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new TriggerUnavailable(`embed service ${res.status}`);
  const data = (await res.json()) as { matches: { score: number; image_hash: string }[] };
  const strong = data.matches.filter((m) => m.score >= 0.9);
  return {
    triggered: strong.length > 0,
    matchCount: strong.length,
    platforms: strong.length > 0
      ? [{ name: "Asli catalog index", category: "web", count: strong.length, url: "" }]
      : [],
    source: "qdrant",
    sources: [],
  };
}

/** Demo fallback — labelled `mock`; names real marketplaces so the pitch reads true. */
function mockTrigger(): TriggerResult {
  const sources = [
    "https://www.flipkart.com/p/itm123",
    "https://www.myntra.com/product/456",
    "https://www.meesho.com/s/p/789",
    "https://supplier-catalog.example/product/123",
  ];
  return {
    triggered: true,
    matchCount: sources.length,
    platforms: [
      { name: "Flipkart", category: "marketplace", count: 1, url: sources[0] },
      { name: "Myntra", category: "marketplace", count: 1, url: sources[1] },
      { name: "Meesho", category: "marketplace", count: 1, url: sources[2] },
      { name: "supplier-catalog.example", category: "web", count: 1, url: sources[3] },
    ],
    source: "mock",
    sources,
  };
}
