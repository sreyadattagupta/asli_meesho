// Seller product management — this seller's listings only, straight from the repo.
import { redirect } from "next/navigation";
import Link from "next/link";
import { PackagePlus } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { ProductRow } from "@/features/seller/ProductRow";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function SellerProducts() {
  const user = await getSessionUser();
  if (!user) redirect("/login?returnTo=/seller/products");
  if (user.role !== "seller") redirect("/login");
  if (!user.sellerId) redirect("/onboarding");

  const repo = await repoReady();
  // Scoped by the session's sellerId — a seller cannot list another shop's products.
  const all = await repo.listListings({ sellerId: user.sellerId });
  const listings = all.filter((l) => l.status !== "archived"); // archived rows stay for orders/audit

  const [measurements, checks] = await Promise.all([
    Promise.all(listings.map((l) => repo.getMeasurement(l.id))),
    Promise.all(listings.map((l) => repo.listChecks(l.id))),
  ]);

  return (
    <div className="card overflow-x-auto p-1">
      {listings.length === 0 ? (
        <EmptyState
          icon={PackagePlus}
          title="No products yet"
          hint="Every listing starts with possession proof and an auto-measured size chart."
          action={<Link href="/sell" className="btn-primary">Create listing →</Link>}
        />
      ) : (
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-white/30">
              <th className="px-3 py-3 font-semibold">Product</th>
              <th className="px-3 font-semibold">Status</th>
              <th className="px-3 font-semibold">Approval</th>
              <th className="px-3 font-semibold">Trust</th>
              <th className="px-3 font-semibold">Size chart</th>
              <th className="px-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {listings.map((l, i) => {
              // The agents' own confidence for this listing — the latest check wins.
              const latest = checks[i].at(-1);
              return (
                <ProductRow
                  key={l.id}
                  listing={l}
                  measurement={measurements[i]}
                  trustScore={latest ? latest.confidence : null}
                />
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
