// SerpAPI Google Lens client — reverse-image search across the whole web.
//
// INVARIANT #1: this is a TRIGGER, not a verdict. "Seen elsewhere" only triggers
// the possession challenge. NEVER auto-block on a hit — honest resellers use
// supplier catalog photos and legitimately appear elsewhere (incl. on Flipkart,
// Myntra, Amazon, Meesho). We SURFACE where the image was seen; we never punish it.
//
// Google Lens indexes those marketplaces, so a single Lens query already finds a
// listing on Flipkart/Myntra/etc. if the photo is there — we just classify the
// hits into named platforms. With SERPAPI_KEY set we run the real search; the
// bytes go to a keyless temp host (catbox.moe) first so SerpAPI can fetch by URL.
// No key (or any failure) → built-in mock that names real marketplaces for the demo.

import crypto from "crypto";

export interface PlatformHit {
  name: string; // "Flipkart", "Myntra", … or the bare domain for generic sites
  category: "marketplace" | "web";
  count: number; // how many matches came from this platform
  url: string; // one sample URL on that platform
}

export interface ReverseImageResult {
  triggered: boolean; // image seen elsewhere → run the challenge
  matchCount: number;
  platforms: PlatformHit[]; // named platforms the image appears on
  sources: string[]; // sample raw URLs (kept for detail view)
  mocked: boolean;
}

// domain fragment → display name. Order doesn't matter; first substring hit wins.
const MARKETPLACES: Array<{ match: string; name: string }> = [
  { match: "flipkart", name: "Flipkart" },
  { match: "myntra", name: "Myntra" },
  { match: "amazon", name: "Amazon" },
  { match: "meesho", name: "Meesho" },
  { match: "ajio", name: "AJIO" },
  { match: "snapdeal", name: "Snapdeal" },
  { match: "nykaa", name: "Nykaa" },
  { match: "tatacliq", name: "Tata CLiQ" },
  { match: "indiamart", name: "IndiaMART" },
  { match: "shopsy", name: "Shopsy" },
  { match: "limeroad", name: "LimeRoad" },
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Classify one match link/source into a named platform. */
function classify(link: string, source?: string): PlatformHit {
  const host = hostOf(link);
  const hay = `${host} ${source ?? ""}`.toLowerCase();
  const known = MARKETPLACES.find((m) => hay.includes(m.match));
  if (known) {
    return { name: known.name, category: "marketplace", count: 1, url: link };
  }
  // fall back to the site's own name (SerpAPI `source`) or its domain.
  return { name: source?.trim() || host, category: "web", count: 1, url: link };
}

/** Collapse per-match platform hits into a deduped, count-aggregated list. */
function aggregate(hits: PlatformHit[]): PlatformHit[] {
  const byName = new Map<string, PlatformHit>();
  for (const h of hits) {
    const existing = byName.get(h.name);
    if (existing) existing.count += 1;
    else byName.set(h.name, { ...h });
  }
  // marketplaces first, then by count.
  return [...byName.values()].sort((a, b) => {
    if (a.category !== b.category) return a.category === "marketplace" ? -1 : 1;
    return b.count - a.count;
  });
}

const cache = new Map<string, ReverseImageResult>();

function hash(image: Buffer): string {
  return crypto.createHash("sha256").update(image).digest("hex");
}

export async function reverseImageSearch(
  image: Buffer,
): Promise<ReverseImageResult> {
  const key = hash(image);
  const cached = cache.get(key);
  if (cached) return cached;

  const apiKey = process.env.SERPAPI_KEY;
  let result: ReverseImageResult;

  if (apiKey) {
    try {
      result = await querySerpApi(image, apiKey);
    } catch (e) {
      console.error("[reverseImage] SerpAPI failed, falling back to mock:", e);
      result = mockResult();
    }
  } else {
    result = mockResult();
  }

  cache.set(key, result);
  return result;
}

// Demo fallback — always "triggers", and names real marketplaces so the pitch
// shows the cross-platform check. This is the demo default; production swaps the
// mock for embedding similarity (Qdrant) but keeps the same platform classifier.
function mockResult(): ReverseImageResult {
  const sources = [
    "https://www.flipkart.com/p/itm123",
    "https://www.myntra.com/product/456",
    "https://www.meesho.com/s/p/789",
    "https://supplier-catalog.example/product/123",
  ];
  const platforms = aggregate(sources.map((u) => classify(u)));
  return {
    triggered: true,
    matchCount: sources.length,
    platforms,
    sources,
    mocked: true,
  };
}

// Real SerpAPI Google Lens call.
async function querySerpApi(
  image: Buffer,
  apiKey: string,
): Promise<ReverseImageResult> {
  const imageUrl = await uploadTempImage(image);

  const params = new URLSearchParams({
    engine: "google_lens",
    url: imageUrl,
    api_key: apiKey,
  });
  const res = await fetch(`https://serpapi.com/search.json?${params}`);
  if (!res.ok) throw new Error(`SerpAPI ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as {
    visual_matches?: Array<{ link?: string; source?: string }>;
  };
  const matches = (data.visual_matches ?? []).filter((m) => !!m.link);
  const platforms = aggregate(
    matches.map((m) => classify(m.link as string, m.source)),
  );
  const sources = matches.map((m) => m.link as string).slice(0, 8);

  return {
    triggered: matches.length > 0,
    matchCount: matches.length,
    platforms,
    sources,
    mocked: false,
  };
}

// Upload image bytes to a no-key temp host so SerpAPI can fetch them by URL.
// Returns a direct image URL (e.g. https://files.catbox.moe/abcd.jpg).
async function uploadTempImage(image: Buffer): Promise<string> {
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append(
    "fileToUpload",
    new Blob([new Uint8Array(image)], { type: "image/jpeg" }),
    "catalog.jpg",
  );

  const res = await fetch("https://catbox.moe/user/api.php", {
    method: "POST",
    body: form,
  });
  const url = (await res.text()).trim();
  if (!res.ok || !url.startsWith("http")) {
    throw new Error(`temp upload failed: ${res.status} ${url}`);
  }
  return url;
}
