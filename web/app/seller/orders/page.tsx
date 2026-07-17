// Orders placed against this seller's listings. Real rows: every order here belongs to a listing
// this seller owns, joined from the repo — there is no seller-side order index to read instead.
import Link from "next/link";
import { Receipt } from "lucide-react";
import { requireSeller } from "@/lib/guards";
import { repoReady } from "@/lib/db";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/nav/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import type { Order, OrderStatus } from "@/lib/db/types";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<OrderStatus, string> = {
  placed: "bg-asli-amber/15 text-asli-amber ring-asli-amber/30",
  shipped: "bg-asli-violet/15 text-asli-violet ring-asli-violet/30",
  delivered: "bg-asli-green/15 text-asli-green ring-asli-green/30",
};

export default async function SellerOrders() {
  const user = await requireSeller();
  const repo = await repoReady();

  // Scoped by the session's sellerId — a seller cannot see another shop's orders.
  const listings = await repo.listListings({ sellerId: user.sellerId });
  const byListing = new Map(listings.map((l) => [l.id, l]));
  const orders: Order[] = (
    await Promise.all(listings.map((l) => repo.listOrdersByListing(l.id)))
  ).flat();
  orders.sort((a, b) => b.placedAt.localeCompare(a.placedAt));

  const revenue = orders.reduce((sum, o) => sum + (byListing.get(o.listingId)?.price ?? 0), 0);
  const delivered = orders.filter((o) => o.status === "delivered").length;

  return (
    <>
      <PageHeader title="Orders" subtitle="Every order placed against your listings." />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="card p-4">
          <StatTile label="Orders" value={orders.length} />
        </div>
        <div className="card p-4">
          <StatTile label="Delivered" value={delivered} />
        </div>
        <div className="card p-4">
          <StatTile label="Revenue" value={revenue} suffix=" ₹" />
        </div>
      </div>

      <div className="card overflow-x-auto p-1">
        {orders.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No orders yet"
            hint="Orders land here as soon as a buyer checks out one of your listings."
            action={
              <Link href="/seller/listings" className="btn-primary">
                See your listings →
              </Link>
            }
          />
        ) : (
          <table className="w-full min-w-[38rem] text-left text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-white/30">
                <th className="px-3 py-3 font-semibold">Product</th>
                <th className="px-3 font-semibold">Placed</th>
                <th className="px-3 font-semibold">Payment</th>
                <th className="px-3 font-semibold">Status</th>
                <th className="px-3 text-right font-semibold">Value</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const listing = byListing.get(order.listingId);
                return (
                  <tr key={order.id} className="border-t border-white/5">
                    <td className="max-w-[16rem] truncate px-3 py-3">
                      {listing ? (
                        <Link
                          href={`/buyer/listings/${listing.id}?from=seller`}
                          className="font-medium text-white/80 hover:text-white hover:underline"
                        >
                          {listing.title || "Untitled listing"}
                        </Link>
                      ) : (
                        <span className="text-white/40">Listing removed</span>
                      )}
                    </td>
                    <td className="px-3 text-white/45">{order.placedAt.slice(0, 10)}</td>
                    <td className="px-3 text-xs uppercase text-white/45">
                      {order.paymentMethod === "cod" ? "COD" : "UPI (mock)"}
                    </td>
                    <td className="px-3">
                      <span className={`pill capitalize ring-1 ${STATUS_STYLE[order.status]}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-white/70">
                      ₹{listing?.price ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-3 text-[10px] uppercase tracking-wide text-white/25">
        Payments are simulated — no money moves in this demo.
      </p>
    </>
  );
}
