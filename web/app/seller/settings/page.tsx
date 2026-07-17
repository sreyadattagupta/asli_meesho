// Seller settings. Deliberately short: it holds the preferences that genuinely exist and do
// something (language, voice guidance, account), rather than a wall of switches wired to nothing.
import Link from "next/link";
import { requireSeller } from "@/lib/guards";
import { PageHeader } from "@/components/nav/PageHeader";
import { SettingsPanel } from "@/features/seller/SettingsPanel";

export default async function SellerSettings() {
  const user = await requireSeller();
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle="How the seller flow behaves for you." />

      <SettingsPanel />

      <section className="card p-5">
        <h2 className="text-sm font-bold text-white/80">Account</h2>
        <dl className="mt-3 space-y-2.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-white/45">Name</dt>
            <dd className="truncate font-semibold text-white">{user.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/45">Email</dt>
            <dd className="truncate text-white/70">{user.email}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-white/35">
          Your shop details, GST and payout information live on your{" "}
          <Link href="/seller/profile" className="underline hover:text-white/60">
            profile
          </Link>
          .
        </p>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-bold text-white/80">Sign out</h2>
        <p className="mt-1 text-xs text-white/35">
          Ends this session on this device. Your listings and trust record are unaffected.
        </p>
        {/* A plain <a>: logout is a server route that clears the cookie and redirects. A client
            navigation would leave the stale session in memory. */}
        <a href="/api/auth/logout" className="btn-ghost mt-3 inline-flex min-h-[44px] items-center">
          Sign out
        </a>
      </section>
    </div>
  );
}
