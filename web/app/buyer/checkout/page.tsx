"use client";

// Mock checkout — labelled simulated, no real money moves (CLAUDE.md §2B).
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Banknote, CheckCircle2, QrCode } from "lucide-react";
import { z } from "zod";
import { Skeleton } from "@/components/ui/Skeleton";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import type { ListingBundle } from "@/lib/listing";
import type { PaymentMethod } from "@/lib/db/types";

const addressSchema = z.object({
  name: z.string().min(1, "Name is required"),
  line1: z.string().min(1, "Address line is required"),
  city: z.string().min(1, "City is required"),
  pincode: z.string().regex(/^\d{6}$/, "Pincode must be 6 digits"),
});

const FIELDS = [
  { key: "name", label: "Full name", placeholder: "Priya Sharma" },
  { key: "line1", label: "Address", placeholder: "12 MG Road, Shivaji Nagar" },
  { key: "city", label: "City", placeholder: "Pune" },
  { key: "pincode", label: "Pincode", placeholder: "411001", inputMode: "numeric" as const },
] as const;

function CheckoutInner() {
  const listingId = useSearchParams().get("listing");
  const router = useRouter();
  const [bundle, setBundle] = useState<ListingBundle | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [address, setAddress] = useState({ name: "", line1: "", city: "", pincode: "" });
  const [fieldErrs, setFieldErrs] = useState<Partial<Record<keyof typeof address, string>>>({});
  const [payment, setPayment] = useState<PaymentMethod>("cod");
  const [placing, setPlacing] = useState(false);
  const [placeErr, setPlaceErr] = useState<string | null>(null);

  useEffect(() => {
    if (!listingId) { setLoadErr("No listing selected."); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/listings/${listingId}`);
        if (!res.ok) throw new Error();
        const data = (await res.json()) as ListingBundle;
        if (!cancelled) setBundle(data);
      } catch {
        if (!cancelled) setLoadErr("Couldn't load the listing. Go back to the shop and retry.");
      }
    })();
    return () => { cancelled = true; };
  }, [listingId]);

  async function placeOrder() {
    const parsed = addressSchema.safeParse(address);
    if (!parsed.success) {
      const errs: typeof fieldErrs = {};
      for (const issue of parsed.error.issues) errs[issue.path[0] as keyof typeof address] = issue.message;
      setFieldErrs(errs);
      return;
    }
    setFieldErrs({});
    setPlacing(true);
    setPlaceErr(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, paymentMethod: payment, address: parsed.data }),
      });
      const body = await res.json();
      if (!res.ok) {
        setPlaceErr(body?.error?.message ?? "Order failed — retry.");
        return;
      }
      router.push(`/buyer/orders/${body.orderId}`);
    } catch {
      setPlaceErr("Network hiccup — retry.");
    } finally {
      setPlacing(false);
    }
  }

  if (loadErr) {
    return (
      <div className="buyer-card mx-auto max-w-md p-6 text-center">
        <p className="text-sm text-zinc-600">{loadErr}</p>
        <Link href="/buyer/dashboard" className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-meesho-pink px-5 py-2.5 font-semibold text-white">
          Back to shop
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-4 lg:grid-cols-[1fr_18rem]">
      {/* address + payment */}
      <div className="buyer-card space-y-4 p-5">
        <h2 className="text-sm font-bold text-zinc-800">Delivery address</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
              {f.label}
              <input
                value={address[f.key]}
                inputMode={"inputMode" in f ? f.inputMode : undefined}
                onChange={(e) => setAddress((a) => ({ ...a, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="min-h-[44px] rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-meesho-pink"
              />
              {fieldErrs[f.key] && <span role="alert" className="text-asli-red">{fieldErrs[f.key]}</span>}
            </label>
          ))}
        </div>

        <h2 className="pt-1 text-sm font-bold text-zinc-800">
          Payment
          <span className="ml-2 rounded-full bg-asli-amber/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-asli-amber">
            simulated — no real money
          </span>
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            { key: "cod", label: "Cash on Delivery", icon: Banknote },
            { key: "upi_mock", label: "UPI (mock)", icon: QrCode },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setPayment(key)}
              aria-pressed={payment === key}
              className={[
                "flex min-h-[48px] items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-meesho-pink",
                payment === key
                  ? "border-meesho-pink bg-meesho-pink/5 text-meesho-deep"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-meesho-pink/40",
              ].join(" ")}
            >
              <Icon className="h-4 w-4" aria-hidden /> {label}
              {payment === key && <CheckCircle2 className="ml-auto h-4 w-4 text-meesho-pink" aria-hidden />}
            </button>
          ))}
        </div>

        {placeErr && (
          <p role="alert" className="text-sm text-asli-red">
            {placeErr} <button className="underline" onClick={placeOrder}>Retry</button>
          </p>
        )}
        <button
          onClick={placeOrder}
          disabled={placing || !bundle}
          className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-meesho-pink px-5 py-3 font-semibold text-white transition hover:bg-meesho-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-meesho-deep"
        >
          {placing ? "Placing order…" : "Place order →"}
        </button>
      </div>

      {/* order summary */}
      <aside className="buyer-card h-fit p-4">
        <h2 className="text-sm font-bold text-zinc-800">Order summary</h2>
        {bundle ? (
          <div className="mt-3 space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bundle.images.find((i) => i.kind === "catalog")?.url ?? "/mock/kurtis-1.svg"}
              alt={bundle.listing.title}
              className="aspect-square w-full rounded-xl object-cover"
            />
            <p className="text-sm font-medium text-zinc-800">{bundle.listing.title}</p>
            {bundle.listing.verified && <VerifiedBadge size="sm" />}
            <div className="flex justify-between border-t border-zinc-100 pt-2 text-sm">
              <span className="text-zinc-500">Total</span>
              <span className="font-bold text-zinc-900">₹{bundle.listing.price}</span>
            </div>
            <p className="text-[11px] text-zinc-400">Free delivery · 7-day returns</p>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <Skeleton className="aspect-square w-full bg-zinc-100" />
            <Skeleton className="h-4 w-2/3 bg-zinc-100" />
          </div>
        )}
      </aside>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <div className="buyer-surface">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <Link
          href="/buyer/dashboard"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Continue shopping
        </Link>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-zinc-900">Checkout</h1>
        <div className="mt-4">
          <Suspense fallback={<Skeleton className="h-64 w-full bg-zinc-100" />}>
            <CheckoutInner />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
