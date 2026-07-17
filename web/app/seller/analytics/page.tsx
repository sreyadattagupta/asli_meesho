// Seller analytics. Every figure is aggregated from this seller's own listings, orders and trust
// events — there is no fixed demo number on this page.
import { requireSeller } from "@/lib/guards";
import { redirect } from "next/navigation";
import { repoReady } from "@/lib/db";
import { buildOverview } from "@/features/seller/overview";
import { RevenueChart } from "@/features/seller/RevenueChart";
import { PageHeader } from "@/components/nav/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { BarChart3 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SellerAnalytics() {
  const user = await requireSeller();
  const repo = await repoReady();

  const seller = await repo.getSeller(user.sellerId);
  if (!seller) redirect("/onboarding");

  const listings = await repo.listListings({ sellerId: user.sellerId });
  const priceById = new Map(listings.map((l) => [l.id, l.price]));
  const orders = (await Promise.all(listings.map((l) => repo.listOrdersByListing(l.id))))
    .flat()
    .map((order) => ({ order, price: priceById.get(order.listingId) ?? 0 }));

  const o = buildOverview(seller, listings, orders, 14);
  const trustEvents = await repo.listTrustEvents(user.sellerId);

  // Category mix, biggest first — which shelf this shop actually sells from.
  const byCategory = new Map<string, number>();
  for (const l of listings) byCategory.set(l.category, (byCategory.get(l.category) ?? 0) + 1);
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);

  // Conversion, not vanity: orders per live listing. Guarded against divide-by-zero.
  const conversion = o.listings.active > 0 ? o.orders.count / o.listings.active : 0;
  const avgOrder = o.orders.count > 0 ? Math.round(o.orders.revenue / o.orders.count) : 0;
  const verifiedShare =
    o.listings.total > 0 ? Math.round((o.listings.approved / o.listings.total) * 100) : 0;

  if (o.listings.total === 0) {
    return (
      <>
        <PageHeader title="Analytics" subtitle="How your shop is doing." />
        <EmptyState
          icon={BarChart3}
          title="Nothing to measure yet"
          hint="Your numbers appear here once you've published a listing and taken your first order."
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Analytics" subtitle="Everything below is counted from your own listings and orders." />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-4">
          <StatTile label="Revenue" value={o.orders.revenue} suffix=" ₹" />
        </div>
        <div className="card p-4">
          <StatTile label="Avg order" value={avgOrder} suffix=" ₹" />
        </div>
        <div className="card p-4">
          <StatTile label="Verified" value={verifiedShare} suffix="%" />
        </div>
        <div className="card p-4">
          <StatTile label="Orders / listing" value={Math.round(conversion * 100)} suffix="%" />
        </div>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-bold text-white/80">Revenue · last 14 days</h2>
        <p className="mb-4 text-xs text-white/35">From delivered and in-flight orders on your listings.</p>
        <RevenueChart series={o.revenueSeries} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-bold text-white/80">What you sell</h2>
          <p className="mb-4 text-xs text-white/35">Listings by category.</p>
          <ul className="space-y-2.5">
            {categories.map(([category, count]) => (
              <li key={category} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-xs capitalize text-white/50">{category}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-asli-violet"
                    style={{ width: `${(count / listings.length) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right font-mono text-xs text-white/60">{count}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-bold text-white/80">Trust movements</h2>
          <p className="mb-4 text-xs text-white/35">
            Every change to your score, and what caused it. Written by the agents and reviewers.
          </p>
          {trustEvents.length === 0 ? (
            <p className="text-xs text-white/35">
              No movements yet — your score changes when a check passes, fails, or a reviewer decides.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {trustEvents
                .slice()
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, 8)
                .map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-white/70">{e.reason}</p>
                      <p className="text-[10px] uppercase tracking-wide text-white/25">
                        {e.source} · {e.createdAt.slice(0, 10)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 font-mono text-sm font-bold ${
                        e.delta >= 0 ? "text-asli-green" : "text-asli-red"
                      }`}
                    >
                      {e.delta >= 0 ? "+" : ""}
                      {e.delta}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
