import { z } from "zod";
import { getSessionUser, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { scoreSeller, type SellerSignals } from "@/lib/engines/riskRadar";
import type { Listing } from "@/lib/db/types";

const DAY = 86_400_000;

/** Mean z-score of a seller's listing prices against each listing's category norm. */
function avgPriceZScore(sellerListings: Listing[], allListings: Listing[]): number | undefined {
  if (sellerListings.length === 0) return undefined;
  const byCat = new Map<string, number[]>();
  for (const l of allListings) {
    const arr = byCat.get(l.category) ?? [];
    arr.push(l.price);
    byCat.set(l.category, arr);
  }
  const zs: number[] = [];
  for (const l of sellerListings) {
    const prices = byCat.get(l.category) ?? [];
    if (prices.length < 3) continue; // too few peers for a meaningful norm
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const sd = Math.sqrt(prices.reduce((a, b) => a + (b - mean) ** 2, 0) / prices.length);
    if (sd > 0) zs.push((l.price - mean) / sd);
  }
  if (zs.length === 0) return undefined;
  return zs.reduce((a, b) => a + b, 0) / zs.length;
}

/** Agent 3 — recompute a seller's trust from live signals; persists the authoritative score. */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail(401, "unauthenticated", "Sign in required.");
    if (user.role !== "seller" && user.role !== "admin") {
      return fail(403, "forbidden", "Seller or admin only.");
    }
    const parsed = z.object({ sellerId: z.string().min(1) }).safeParse(await req.json());
    if (!parsed.success) return fail(400, "invalid_body", "sellerId is required.");
    // A seller may only score their own profile; admins may score anyone.
    if (user.role === "seller" && parsed.data.sellerId !== user.sellerId) {
      return fail(403, "forbidden", "Sellers can only score their own profile.");
    }

    const repo = await repoReady();
    const seller = await repo.getSeller(parsed.data.sellerId);
    if (!seller) return fail(404, "not_found", "Seller not found.");

    const events = await repo.listTrustEvents(seller.id);
    const now = Date.now();

    // Listing-derived signals from persisted state (no hardcoded placeholders).
    const sellerListings = await repo.listListings({ sellerId: seller.id });
    const allListings = await repo.listListings();

    // Image reuse: strongest reverse-image trigger seen across this seller's possession checks.
    let imageReuseCount = 0;
    for (const l of sellerListings) {
      for (const c of await repo.listChecks(l.id)) {
        if (c.agent === "possession") {
          imageReuseCount = Math.max(imageReuseCount, Number(c.payload["matchCount"] ?? 0));
        }
      }
    }

    // Price anomaly: seller's mean listing price vs its category's mean/σ (z-score).
    const priceZScore = avgPriceZScore(sellerListings, allListings);

    // Velocity: listings created by this seller in the last 24h.
    const listingVelocityPerDay = sellerListings.filter(
      (l) => now - Date.parse(l.createdAt) <= DAY,
    ).length;

    const signals: SellerSignals = {
      passes: seller.passes,
      fails: seller.fails,
      isNew: seller.isNew,
      kycVerified: seller.kycStatus === "verified",
      imageReuseCount,
      recentEvents: events.map((e) => ({ delta: e.delta, ageDays: (now - Date.parse(e.createdAt)) / DAY })),
      priceZScore,
      listingVelocityPerDay,
    };
    const result = scoreSeller(signals);
    await repo.updateSeller(seller.id, { trustScore: result.trustScore, trustBand: result.band });
    return ok(result);
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
