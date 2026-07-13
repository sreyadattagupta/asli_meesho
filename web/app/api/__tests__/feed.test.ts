// Marketplace feed — verified-first ranking (simulated PRISM-style boost), live only.
import { describe, expect, it } from "vitest";
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
});
