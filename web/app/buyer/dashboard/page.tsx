import { Suspense } from "react";
import Link from "next/link";
import { ShieldCheck, Store } from "lucide-react";
import { ProductCard } from "@/components/buyer/ProductCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { buildFeed } from "@/lib/feed";

export const dynamic = "force-dynamic"; // feed reflects the live repo, never a build snapshot

const FILTERS = [
  { key: "all", label: "All products" },
  { key: "verified", label: "✓ Asli Verified" },
] as const;

async function FeedGrid({ filter }: { filter: string }) {
  const listings = await buildFeed(filter === "verified" ? "verified" : null);

  if (listings.length === 0) {
    return (
      <EmptyState
        icon={Store}
        skin="light"
        title="No products yet"
        hint="Verified listings appear here the moment sellers go live."
      />
    );
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Shop</h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-zinc-500">
              <ShieldCheck className="h-4 w-4 text-asli-green" aria-hidden />
              Verified listings rank first — possession proven, size measured.
            </p>
          </div>
          <nav className="flex gap-2" aria-label="Feed filter">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={f.key === "all" ? "/buyer/dashboard" : `/buyer/dashboard?filter=${f.key}`}
                aria-current={filter === f.key ? "page" : undefined}
                className={[
                  "min-h-[44px] rounded-full px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-meesho-pink",
                  filter === f.key
                    ? "bg-meesho-pink text-white"
                    : "border border-zinc-200 bg-white text-zinc-600 hover:border-meesho-pink/40",
                ].join(" ")}
              >
                {f.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-5">
          <Suspense key={filter} fallback={<GridSkeleton />}>
            <FeedGrid filter={filter} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
