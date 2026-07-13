import { requireRole, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { fail, ok } from "@/lib/api";

export interface AdminMetrics {
  verified: number;
  blocked: number;
  avgTrust: number;
  escalationRate: number; // pendingReviews / max(1, orchestrator decisions)
  returnsPrevented: number; // estimated — 40–60% sizing-returns midpoint [S9]
}

/** Trust & Safety dashboard tiles. Admin-only; derived live from the repo. */
export async function GET() {
  try {
    await requireRole("admin");
    const repo = await repoReady();
    const [listings, sellers, pending] = await Promise.all([
      repo.listListings(),
      repo.listSellers(),
      repo.listPendingReviews(),
    ]);

    const verified = listings.filter((l) => l.status === "live" && l.verified).length;
    const blocked = listings.filter((l) => l.status === "blocked").length;

    const avgTrust = sellers.length
      ? Math.round(sellers.reduce((s, x) => s + x.trustScore, 0) / sellers.length)
      : 0;

    // Orchestrator decisions across all listings = the population that was screened.
    const checkLists = await Promise.all(listings.map((l) => repo.listChecks(l.id)));
    const orchestratorDecisions = checkLists
      .flat()
      .filter((c) => c.agent === "orchestrator").length;
    const escalationRate = pending.length / Math.max(1, orchestratorDecisions);

    const returnsPrevented = Math.round(verified * 0.5);

    return ok<AdminMetrics>({ verified, blocked, avgTrust, escalationRate, returnsPrevented });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
