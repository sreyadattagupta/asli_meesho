// Seller dashboard — the landing page for every authenticated seller (spec §2). Every figure is
// computed from this seller's own rows (features/seller/overview.ts).
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSeller } from "@/lib/guards";
import { repoReady } from "@/lib/db";
import { buildOverview } from "@/features/seller/overview";
import { RevenueChart } from "@/features/seller/RevenueChart";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/nav/PageHeader";
import { PackagePlus } from "lucide-react";

export default async function SellerDashboard() {
  const user = await requireSeller();

  const repo = await repoReady();
  const seller = await repo.getSeller(user.sellerId);
  if (!seller) redirect("/onboarding");

  const listings = await repo.listListings({ sellerId: user.sellerId });
  const priceById = new Map(listings.map((l) => [l.id, l.price]));
  const orders = (await Promise.all(listings.map((l) => repo.listOrdersByListing(l.id))))
    .flat()
    .map((order) => ({ order, price: priceById.get(order.listingId) ?? 0 }));

  const o = buildOverview(seller, listings, orders);
  // trustScore is already 0-100 (lib/engines/trust.ts bandFor: >=70 high, >=45 medium) — not a 0-1
  // probability. Multiplying by 100 renders "4,000%".
  const trustPct = Math.round(o.trust.score);

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Welcome back, ${seller.shopName}`}
        subtitle="Your listings, your numbers, your trust record."
        action={
          <Link href="/seller/create-listing" className="btn-primary">
            Create listing →
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-4"><StatTile label="Listings" value={o.listings.total} /></div>
        <div className="card p-4"><StatTile label="Active" value={o.listings.active} /></div>
        <div className="card p-4"><StatTile label="Pending" value={o.listings.pending} /></div>
        <div className="card p-4"><StatTile label="Approved" value={o.listings.approved} /></div>
        <div className="card p-4"><StatTile label="Rejected" value={o.listings.rejected} /></div>
        <div className="card p-4"><StatTile label="Orders" value={o.orders.count} /></div>
        <div className="card p-4"><StatTile label="Revenue" value={o.orders.revenue} suffix=" ₹" /></div>
        <div className="card p-4"><StatTile label="Trust score" value={trustPct} suffix="%" /></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="card p-5">
          <h2 className="text-sm font-bold text-white/80">Revenue · last 7 days</h2>
          <p className="mb-4 text-xs text-white/35">From delivered and in-flight orders on your listings.</p>
          <RevenueChart series={o.revenueSeries} />
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-bold text-white/80">Your trust record</h2>
          <p className="mb-4 text-xs text-white/35">
            Built by the agents, not self-reported. It sets how strict your next check is.
          </p>
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-white/45">Band</dt>
              <dd className="font-semibold capitalize text-white">{o.trust.band}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-white/45">Checks passed</dt>
              <dd className="font-mono text-asli-green">{o.trust.passes}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-white/45">Checks failed</dt>
              <dd className="font-mono text-asli-red">{o.trust.fails}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-white/45">KYC</dt>
              <dd className="font-semibold capitalize text-white/80">{o.kycStatus}</dd>
            </div>
          </dl>
        </section>
      </div>

      {o.listings.total === 0 && (
        <EmptyState
          icon={PackagePlus}
          title="No listings yet"
          hint="Your first listing goes through possession proof and auto-sizing — about two minutes."
          action={<Link href="/seller/create-listing" className="btn-primary">Create your first listing →</Link>}
        />
      )}
    </div>
  );
}
