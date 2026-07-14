// TriggerSource seam. The real reverse-image search now lives in the Agent 1 engine
// (vlm-service /agent1/verify — live SerpAPI Lens + evidence extraction), reached from the
// route via `agent1Client`. This module only carries the explicit offline-dev mock: it is
// reachable ONLY when TRIGGER_SOURCE=mock, never as an automatic fallback (invariant: no
// fabricated data on real paths). Whatever the source, the result is a TRIGGER, not a verdict.

export interface PlatformHit {
  name: string;
  category: "marketplace" | "web";
  count: number;
  url: string;
}

export interface TriggerResult {
  triggered: boolean;
  matchCount: number;
  platforms: PlatformHit[];
  source: "mock";
  sources: string[];
}

/** True only when the operator explicitly opts into offline-dev mock data. */
export function isMockMode(): boolean {
  return (process.env.TRIGGER_SOURCE ?? "") === "mock";
}

/** Explicit offline-dev fallback — labelled `mock`; names real marketplaces so the flow reads true. */
export function mockTrigger(): TriggerResult {
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
