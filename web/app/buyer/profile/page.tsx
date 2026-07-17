// Buyer account page. Everything here is read from the buyer's own rows — the order counts are
// computed, not decorative.
import Link from "next/link";
import { requireBuyer } from "@/lib/guards";
import { repoReady } from "@/lib/db";
import { ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BuyerProfile() {
  const user = await requireBuyer();
  const repo = await repoReady();

  const orders = await repo.listOrdersByBuyer(user.id);
  const delivered = orders.filter((o) => o.status === "delivered").length;
  const inFlight = orders.length - delivered;

  // The address the buyer last checked out with — we don't keep an address book, and inventing a
  // "saved addresses" panel with nothing behind it would be a placeholder.
  const lastAddress = orders
    .slice()
    .sort((a, b) => b.placedAt.localeCompare(a.placedAt))[0]?.address;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-zinc-900">Your account</h1>
        <p className="mt-0.5 text-sm text-zinc-500">Who you are on Asli, and what you&apos;ve bought.</p>
      </div>

      <section className="buyer-card p-5">
        <h2 className="text-sm font-bold text-zinc-800">Account</h2>
        <dl className="mt-3 space-y-2.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-400">Name</dt>
            <dd className="truncate font-semibold text-zinc-900">{user.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-400">Email</dt>
            <dd className="truncate text-zinc-700">{user.email}</dd>
          </div>
        </dl>
      </section>

      <section className="buyer-card p-5">
        <h2 className="text-sm font-bold text-zinc-800">Orders</h2>
        <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
          <div>
            <dt className="text-xs text-zinc-400">Total</dt>
            <dd className="font-mono text-2xl font-bold text-zinc-900">{orders.length}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">In flight</dt>
            <dd className="font-mono text-2xl font-bold text-amber-600">{inFlight}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">Delivered</dt>
            <dd className="font-mono text-2xl font-bold text-green-600">{delivered}</dd>
          </div>
        </dl>
        <Link
          href="/buyer/orders"
          className="mt-4 inline-flex min-h-[44px] items-center text-sm font-semibold text-meesho-pink hover:underline"
        >
          See all orders →
        </Link>
      </section>

      {lastAddress && (
        <section className="buyer-card p-5">
          <h2 className="text-sm font-bold text-zinc-800">Last delivery address</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            {lastAddress.name}
            <br />
            {lastAddress.line1}
            <br />
            {lastAddress.city} — {lastAddress.pincode}
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            Taken from your most recent order. You can change it at checkout.
          </p>
        </section>
      )}

      <section className="buyer-card flex items-start gap-3 p-5">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-asli-green" aria-hidden />
        <div>
          <h2 className="text-sm font-bold text-zinc-800">Why ✓ Asli Verified matters</h2>
          <p className="mt-1 text-sm text-zinc-500">
            A verified listing means the seller photographed the actual item next to a live code
            before it went up, and the size chart was measured from that photo rather than typed in.
            That is what the badge on your orders is recording.
          </p>
        </div>
      </section>
    </div>
  );
}
