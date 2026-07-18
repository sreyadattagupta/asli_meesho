import { notFound } from "next/navigation";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { BuyBox } from "@/components/buyer/BuyBox";
import { SizeChartTable } from "@/components/buyer/SizeChartTable";
import { TrustPanel } from "@/components/buyer/TrustPanel";
import { ProductBackLink, ProductInfoHeader } from "@/components/buyer/ProductDetailHeader";
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
      ? { href: "/seller/listings", toListings: true }
      : { href: "/buyer/dashboard", toListings: false };

  return (
    <div className="buyer-surface">
      <div className="mx-auto max-w-6xl px-4 py-5">
        <ProductBackLink href={back.href} toListings={back.toListings} />

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
            <ProductInfoHeader
              title={listing.title}
              category={listing.category}
              description={listing.description}
              trustBand={trustBand}
            />

            <BuyBox listing={listing} />
            <SizeChartTable listing={listing} measurement={bundle.measurement} />
            <TrustPanel bundle={bundle} />
          </div>
        </div>
      </div>
    </div>
  );
}
