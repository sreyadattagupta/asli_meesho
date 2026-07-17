// Seller business profile — the details a real marketplace collects, plus the read-only trust and
// KYC state the agents and reviewers own.
import { redirect } from "next/navigation";
import { requireSeller } from "@/lib/guards";
import { repoReady } from "@/lib/db";
import { ProfileForm } from "@/features/seller/ProfileForm";
import { PageHeader } from "@/components/nav/PageHeader";

const KYC_STYLE: Record<string, string> = {
  verified: "bg-asli-green/10 text-asli-green ring-asli-green/25",
  submitted: "bg-asli-amber/10 text-asli-amber ring-asli-amber/25",
  pending: "bg-white/5 text-white/50 ring-white/15",
};

export default async function SellerProfile() {
  const user = await requireSeller();

  const repo = await repoReady();
  const seller = await repo.getSeller(user.sellerId);
  if (!seller) redirect("/onboarding");

  return (
    <div className="space-y-4">
      <PageHeader title="Profile" subtitle="Your shop details, and the trust record the agents keep on you." />
      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-white/80">Business details</h2>
            <p className="text-xs text-white/35">Used for payouts and invoicing.</p>
          </div>
          <span className={`pill ring-1 ${KYC_STYLE[seller.kycStatus] ?? KYC_STYLE.pending}`}>
            KYC {seller.kycStatus}
          </span>
        </div>
        <ProfileForm seller={seller} />
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-bold text-white/80">Verification &amp; trust</h2>
        <p className="mb-4 text-xs text-white/35">
          Read-only: these are written by the agents and reviewers, never by you. That is what makes
          them worth anything to a buyer.
        </p>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-white/35">Trust score</dt>
            <dd className="font-mono text-lg font-bold text-white">{Math.round(seller.trustScore)}</dd>
          </div>
          <div>
            <dt className="text-xs text-white/35">Band</dt>
            <dd className="font-semibold capitalize text-white/80">{seller.trustBand}</dd>
          </div>
          <div>
            <dt className="text-xs text-white/35">Checks passed</dt>
            <dd className="font-mono text-lg font-bold text-asli-green">{seller.passes}</dd>
          </div>
          <div>
            <dt className="text-xs text-white/35">Checks failed</dt>
            <dd className="font-mono text-lg font-bold text-asli-red">{seller.fails}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
