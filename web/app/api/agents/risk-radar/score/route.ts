import { z } from "zod";
import { getSessionUser, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import { scoreSeller, type SellerSignals } from "@/lib/engines/riskRadar";

const DAY = 86_400_000;

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
    const signals: SellerSignals = {
      passes: seller.passes,
      fails: seller.fails,
      isNew: seller.isNew,
      kycVerified: seller.kycStatus === "verified",
      imageReuseCount: 0, // advisory; populated by the trigger source at listing time
      recentEvents: events.map((e) => ({ delta: e.delta, ageDays: (now - Date.parse(e.createdAt)) / DAY })),
    };
    const result = scoreSeller(signals);
    await repo.updateSeller(seller.id, { trustScore: result.trustScore, trustBand: result.band });
    return ok(result);
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
