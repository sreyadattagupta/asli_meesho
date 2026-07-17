// T&S reports. The dashboard shows today's numbers; this is where they leave the building — a
// reviewer exporting the screening record for a weekly review or an audit.
import { requireRole } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { PageHeader } from "@/components/nav/PageHeader";
import { ReportTable } from "@/features/admin/ReportTable";
import type { ListingReportRow } from "@/features/admin/ReportTable";

export const dynamic = "force-dynamic";

export default async function AdminReports() {
  // The layout already guards /admin, but this page reads every seller's data — re-check here too
  // (CLAUDE.md §11: gate the shell, re-check where the data is).
  await requireRole("admin");
  const repo = await repoReady();

  const [listings, sellers] = await Promise.all([repo.listListings(), repo.listSellers()]);
  const shopById = new Map(sellers.map((s) => [s.id, s.shopName]));
  const checkLists = await Promise.all(listings.map((l) => repo.listChecks(l.id)));

  const rows: ListingReportRow[] = listings.map((listing, i) => {
    const checks = checkLists[i];
    const decision = checks.filter((c) => c.agent === "orchestrator").at(-1);
    const possession = checks.filter((c) => c.agent === "possession").at(-1);
    return {
      listingId: listing.id,
      title: listing.title || "(untitled draft)",
      shop: shopById.get(listing.sellerId) ?? listing.sellerId,
      category: listing.category,
      status: listing.status,
      verified: listing.verified,
      price: listing.price,
      action: decision?.action ?? null,
      // The bar the orchestrator required, and what the agent actually scored — the two numbers a
      // reviewer needs to judge whether a decision was reasonable.
      requiredConfidence: decision?.requiredConfidence ?? null,
      confidence: possession?.confidence ?? null,
      createdAt: listing.createdAt,
    };
  });

  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        subtitle="Every listing that has been through the agents, and what was decided."
      />
      <ReportTable rows={rows} />
    </div>
  );
}
