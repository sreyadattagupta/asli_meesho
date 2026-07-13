"use client";

// Order tracking — timeline (simulated logistics) + Promise Keeper card on delivery.
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { TrackingTimeline } from "@/components/buyer/TrackingTimeline";
import { PromiseKeeperCard } from "@/components/buyer/PromiseKeeperCard";
import type { Listing, Order, PromiseRecord } from "@/lib/db/types";

interface OrderBundle {
  order: Order;
  listing: Listing | null;
  imageUrl: string | null;
  promise: PromiseRecord | null;
}

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [bundle, setBundle] = useState<OrderBundle | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch(`/api/orders/${id}`);
      const body = await res.json();
      if (!res.ok) {
        setErr(body?.error?.message ?? "Couldn't load this order.");
        return;
      }
      setBundle(body as OrderBundle);
    } catch {
      setErr("Network hiccup — retry.");
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function advance() {
    setAdvancing(true);
    try {
      const res = await fetch(`/api/orders/${id}/advance`, { method: "POST" });
      if (res.ok) {
        const { order } = await res.json();
        setBundle((b) => (b ? { ...b, order } : b));
      }
    } finally {
      setAdvancing(false);
    }
  }

  return (
    <div className="buyer-surface">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link
          href="/shop"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to shop
        </Link>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-zinc-900">Your order</h1>

        {err ? (
          <div className="buyer-card mt-4 p-6 text-center">
            <p role="alert" className="text-sm text-zinc-600">{err}</p>
            <button
              onClick={load}
              className="mt-3 min-h-[44px] rounded-xl bg-meesho-pink px-5 py-2.5 text-sm font-semibold text-white"
            >
              Retry
            </button>
          </div>
        ) : !bundle ? (
          <div className="mt-4 space-y-4" aria-busy>
            <Skeleton className="h-24 w-full bg-zinc-100" />
            <Skeleton className="h-56 w-full bg-zinc-100" />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* product summary */}
            <div className="buyer-card flex items-center gap-4 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bundle.imageUrl ?? "/mock/kurtis-1.svg"}
                alt={bundle.listing?.title ?? "Product"}
                className="h-20 w-20 rounded-xl border border-zinc-100 object-cover"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-800">
                  {bundle.listing?.title ?? "Listing"}
                </p>
                <p className="text-sm font-bold text-zinc-900">₹{bundle.listing?.price}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
                  {bundle.listing?.verified && <VerifiedBadge size="sm" />}
                  <span className="uppercase">{bundle.order.paymentMethod === "cod" ? "COD" : "UPI (mock)"}</span>
                </div>
              </div>
            </div>

            <TrackingTimeline order={bundle.order} advancing={advancing} onAdvance={advance} />

            {bundle.order.status === "delivered" && (
              <PromiseKeeperCard orderId={bundle.order.id} promise={bundle.promise} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
