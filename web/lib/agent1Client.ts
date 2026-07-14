// Thin typed client for the Agent 1 verification engine (vlm-service /agent1/verify).
// Normalizes transport/engine errors into Agent1Error so routes render loading/error/retry.
// The engine (Python) owns live reverse search, evidence extraction, cross-check and the
// deterministic trust score — this file only carries bytes there and types the reply back.
const BASE =
  process.env.AGENT1_SERVICE_URL ?? process.env.VLM_SERVICE_URL ?? "http://localhost:8000";

export interface Agent1Evidence {
  title: string | null;
  price: number | null;
  currency: string | null;
  thumbnail: string | null;
  source: string | null;
  link: string;
  platform: string;
  category: "marketplace" | "web";
}

export interface Agent1Result {
  triggered: boolean;
  trustScore: number;
  band: "high" | "medium" | "low";
  signals: Record<string, number>;
  evidence: Agent1Evidence[];
  platforms: { name: string; category: string; count: number; url: string }[];
  explanation: string;
  degraded: boolean;
}

export class Agent1Error extends Error {}

export async function verifyProduct(
  image: Blob,
  listing: { title?: string; price?: number; brand?: string; category?: string; listingId?: string },
): Promise<Agent1Result> {
  const form = new FormData();
  form.append("image", image, "catalog.jpg");
  form.append("title", listing.title ?? "");
  form.append("price", listing.price != null ? String(listing.price) : "");
  form.append("brand", listing.brand ?? "");
  form.append("category", listing.category ?? "");
  form.append("listingId", listing.listingId ?? "");

  let res: Response;
  try {
    res = await fetch(`${BASE}/agent1/verify`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(45000),
    });
  } catch (e) {
    throw new Agent1Error(`Agent 1 unreachable: ${(e as Error).message}`);
  }
  if (!res.ok) throw new Agent1Error(`Agent 1 error ${res.status}`);

  const d = await res.json();
  return {
    triggered: d.triggered,
    trustScore: d.trust_score,
    band: d.band,
    signals: d.signals ?? {},
    evidence: d.evidence ?? [],
    platforms: d.platforms ?? [],
    explanation: d.explanation ?? "",
    degraded: !!d.degraded,
  };
}
