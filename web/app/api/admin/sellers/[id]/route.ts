import { requireRole, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { fail, ok } from "@/lib/api";
import type { Listing, Seller, TrustEvent } from "@/lib/db/types";

export interface Seller360 {
  seller: Seller;
  events: TrustEvent[];
  listings: Listing[];
}

/** Seller 360 — trust band, KYC, event history (sparkline source), and their listings. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("admin");
    const { id } = await params;
    const repo = await repoReady();
    const seller = await repo.getSeller(id);
    if (!seller) return fail(404, "not_found", "Seller not found.");
    const [events, listings] = await Promise.all([
      repo.listTrustEvents(id),
      repo.listListings({ sellerId: id }),
    ]);
    return ok<Seller360>({ seller, events, listings });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
