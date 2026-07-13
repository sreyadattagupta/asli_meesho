import Link from "next/link";
import { Star } from "lucide-react";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import type { FeedItem } from "@/lib/feed";

/** Marketplace grid card — Meesho light retail skin, ✓ Asli Verified payoff on top. */
export function ProductCard({ item }: { item: FeedItem }) {
  return (
    <Link
      href={`/shop/${item.id}`}
      className="buyer-card group block overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-meesho-pink"
    >
      <div className="relative aspect-square overflow-hidden bg-zinc-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.imageUrl}
          alt={item.title}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          loading="lazy"
        />
        {item.verified && (
          <span className="absolute left-2 top-2">
            <VerifiedBadge size="sm" />
          </span>
        )}
      </div>
      <div className="space-y-1.5 p-3">
        <h3 className="truncate text-sm font-medium text-zinc-800">{item.title}</h3>
        <div className="flex items-center justify-between gap-2">
          <span className="text-base font-bold text-zinc-900">₹{item.price}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-asli-green/10 px-1.5 py-0.5 text-[11px] font-semibold text-asli-green">
            <Star className="h-3 w-3 fill-current" aria-hidden />
            {item.rating}
            <span className="font-normal text-zinc-400">({item.ratingCount})</span>
          </span>
        </div>
        <div className="text-[11px] text-zinc-400">
          Free Delivery · COD
          {!item.verified && <span className="ml-1.5 text-zinc-300">· unverified</span>}
        </div>
      </div>
    </Link>
  );
}
