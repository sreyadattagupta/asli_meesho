import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Star, Store } from "lucide-react";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { BuyBox } from "@/components/buyer/BuyBox";
import { SizeChartTable } from "@/components/buyer/SizeChartTable";
import { TrustPanel } from "@/components/buyer/TrustPanel";
import { getListingBundle } from "@/lib/listing";

export const dynamic = "force-dynamic";

// Product detail — gallery, AI-measured size chart, seller trust, explainable trust panel.
export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const bundle = await getListingBundle(id);
  if (!bundle || bundle.listing.status !== "live") notFound();
  const { listing, images, trustBand } = bundle;
  const gallery = images.filter((i) => i.kind === "catalog");
  const hero = gallery[0]?.url ?? "/mock/kurtis-1.svg";

  // A seller who opened this from their portal is standing in the buyer surface, which has no seller
  // nav — "Back to shop" would strand them a second time. Send them back where they came from.
  const back =
    from === "seller"
      ? { href: "/seller/products", label: "Back to your products" }
      : { href: "/shop", label: "Back to shop" };

  return (
    <div className="buyer-surface">
      <div className="mx-auto max-w-6xl px-4 py-5">
        <Link
          href={back.href}
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-meesho-pink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> {back.label}
        </Link>

        <div className="mt-3 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          {/* gallery */}
          <div className="buyer-card overflow-hidden">
            <div className="relative aspect-square bg-zinc-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={hero} alt={listing.title} className="h-full w-full object-cover" />
              {listing.verified && (
                <span className="absolute left-3 top-3">
                  <VerifiedBadge />
                </span>
              )}
            </div>
          </div>

          {/* facts + purchase */}
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-bold leading-snug text-zinc-900 sm:text-2xl">
                {listing.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                <span className="inline-flex items-center gap-1 rounded-full bg-asli-green/10 px-2 py-0.5 font-semibold text-asli-green">
                  <Star className="h-3.5 w-3.5 fill-current" aria-hidden /> 4.3
                </span>
                <span className="inline-flex items-center gap-1 text-zinc-500">
                  <Store className="h-3.5 w-3.5" aria-hidden />
                  {trustBand === "high" ? "High-trust seller" : trustBand === "medium" ? "Established seller" : "New seller"}
                </span>
                <span className="capitalize text-zinc-400">{listing.category}</span>
              </div>
              {listing.description && (
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">{listing.description}</p>
              )}
            </div>

            <BuyBox listing={listing} />
            <SizeChartTable listing={listing} measurement={bundle.measurement} />
            <TrustPanel bundle={bundle} />
          </div>
        </div>
      </div>
    </div>
  );
}
