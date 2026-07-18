import { Suspense } from "react";
import { ProductCard } from "@/components/buyer/ProductCard";
import { ShopHeader } from "@/components/buyer/ShopHeader";
import { ShopEmptyState } from "@/components/buyer/ShopEmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { buildFeed } from "@/lib/feed";

export const dynamic = "force-dynamic"; // feed reflects the live repo, never a build snapshot

async function FeedGrid({ filter }: { filter: string }) {
  const listings = await buildFeed(filter === "verified" ? "verified" : null);

  if (listings.length === 0) {
    return <ShopEmptyState />;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {listings.map((item) => (
        <ProductCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4" aria-busy>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="buyer-card overflow-hidden">
          <Skeleton className="aspect-square rounded-none bg-zinc-100" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-4 w-3/4 bg-zinc-100" />
            <Skeleton className="h-4 w-1/3 bg-zinc-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

// BUYER marketplace — Meesho light retail skin; verified-first ranking (simulated PRISM boost).
export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "all" } = await searchParams;

  return (
    // The buyer-surface wrapper and the nav live in app/buyer/layout.tsx — every buyer page gets them.
    <div>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <ShopHeader filter={filter} />

        <div className="mt-5">
          <Suspense key={filter} fallback={<GridSkeleton />}>
            <FeedGrid filter={filter} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
