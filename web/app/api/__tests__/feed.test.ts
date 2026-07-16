// Marketplace feed — verified-first ranking (simulated PRISM-style boost), live only.
import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/listings/route";
import { repoReady } from "@/lib/db";

function get(query = ""): Promise<Response> {
  return GET(new Request(`http://x/api/listings${query}`));
}

describe("GET /api/listings (marketplace feed)", () => {
  it("returns only live listings, verified first", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const { listings } = await res.json();
    expect(listings.length).toBeGreaterThanOrEqual(10);
    // live only — no drafts, blocked, escalated, or the seed marker
    const repo = await repoReady();
    for (const item of listings) {
      const full = await repo.getListing(item.id);
      expect(full?.status).toBe("live");
    }
    expect(listings.some((l: { title: string }) => l.title.startsWith("__seed"))).toBe(false);
    // verified block strictly precedes unverified block
    const firstUnverified = listings.findIndex((l: { verified: boolean }) => !l.verified);
    if (firstUnverified !== -1) {
      expect(listings.slice(firstUnverified).every((l: { verified: boolean }) => !l.verified)).toBe(true);
    }
    expect(listings[0].verified).toBe(true);
  });

  it("filter=verified narrows to verified only", async () => {
    const res = await get("?filter=verified");
    const { listings } = await res.json();
    expect(listings.length).toBeGreaterThan(0);
    expect(listings.every((l: { verified: boolean }) => l.verified)).toBe(true);
  });

  it("card fields present: image, deterministic rating, seller band", async () => {
    const { listings } = await (await get()).json();
    const item = listings[0];
    expect(item.imageUrl).toMatch(/^\//);
    expect(item.rating).toBeGreaterThanOrEqual(3.5);
    expect(item.rating).toBeLessThanOrEqual(5);
    expect(["high", "medium", "low"]).toContain(item.sellerBand);
    // deterministic — same listing, same rating on refetch
    const again = (await (await get()).json()).listings[0];
    expect(again.rating).toBe(item.rating);
  });

  it("never inlines image bytes into the feed payload", async () => {
    // /api/sizing persists flat-lays as `data:image/jpeg;base64,...` straight into product_images.url
    // (avg ~937 KB each in prod). The feed used to `select()` every column for every listing, so it
    // shipped megabytes of base64 per request — 60-90s on Supabase — and would have embedded a ~1 MB
    // string into each card. Cards must reference an image URL the browser can lazy-load and cache.
    const body = await (await get()).text();
    expect(body).not.toContain("data:image");
    expect(body.length).toBeLessThan(64 * 1024);
    for (const l of JSON.parse(body).listings) {
      expect(l.imageUrl.startsWith("data:")).toBe(false);
    }
  });

  it("builds the feed in a bounded number of repo calls (no N+1)", async () => {
    // One query per listing for images + one per seller meant 1 + 2N round-trips. Against a remote
    // Postgres that is the whole latency budget; keep the feed batched.
    const repo = await repoReady();
    const spy = vi.spyOn(repo, "listImages");
    await get();
    expect(spy).not.toHaveBeenCalled(); // per-listing image fetch is the N+1
    spy.mockRestore();
  });
});
