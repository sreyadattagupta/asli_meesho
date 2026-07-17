// The buyer's order history — their own rows only, straight from the repo.
import Link from "next/link";
import { Package, ChevronRight } from "lucide-react";
import { requireBuyer } from "@/lib/guards";
import { repoReady } from "@/lib/db";
import { EmptyState } from "@/components/ui/EmptyState";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import type { OrderStatus } from "@/lib/db/types";

export const dynamic = "force-dynamic"; // an order placed a second ago must be here

// Amber = in flight, green = arrived. Matches the verdict palette used everywhere else (§9).
const STATUS_STYLE: Record<OrderStatus, string> = {
  placed: "bg-asli-amber/10 text-amber-700 ring-amber-200",
  shipped: "bg-asli-violet/10 text-violet-700 ring-violet-200",
  delivered: "bg-asli-green/10 text-green-700 ring-green-200",
};

export default async function BuyerOrders() {
  const user = await requireBuyer();
  const repo = await repoReady();

  const orders = await repo.listOrdersByBuyer(user.id);
  // Newest first — the order you just placed is the one you came here to look at.
  orders.sort((a, b) => b.placedAt.localeCompare(a.placedAt));

  const listings = await Promise.all(orders.map((o) => repo.getListing(o.listingId)));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-black tracking-tight text-zinc-900">Your orders</h1>
      <p className="mt-0.5 text-sm text-zinc-500">
        Track delivery, and see whether each one arrived as promised.
      </p>

      {orders.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            icon={Package}
            skin="light"
            title="No orders yet"
            hint="Everything you buy shows up here with live tracking."
            action={
              <Link
                href="/buyer/dashboard"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-meesho-pink px-5 py-2.5 text-sm font-semibold text-white"
              >
                Start shopping →
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {orders.map((order, i) => {
            const listing = listings[i];
            return (
              <li key={order.id}>
                <Link
                  href={`/buyer/orders/${order.id}`}
                  className="buyer-card flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-meesho-pink"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-800">
                      {/* An archived listing keeps the order valid — the buyer still bought it. */}
                      {listing?.title || "Listing no longer available"}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                      <span className="font-bold text-zinc-900">₹{listing?.price ?? "—"}</span>
                      <span className="uppercase">
                        {order.paymentMethod === "cod" ? "COD" : "UPI (mock)"}
                      </span>
                      {listing?.verified && <VerifiedBadge size="sm" />}
                    </div>
                  </div>
                  <span
                    className={`pill capitalize ring-1 ${STATUS_STYLE[order.status]}`}
                  >
                    {order.status}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
