"use client";

// Seller 360 — trust band, KYC, live trust history (sparkline), and listings.
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldAlert, BadgeCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { TrustSparkline } from "@/components/admin/TrustSparkline";
import type { Seller360 } from "@/app/api/admin/sellers/[id]/route";

const bandVariant = { high: "verified", medium: "progress", low: "trigger" } as const;

export default function Seller360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Seller360 | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setErr(null); setForbidden(false);
    try {
      const res = await fetch(`/api/admin/sellers/${id}`);
      if (res.status === 401 || res.status === 403) { setForbidden(true); return; }
      const body = await res.json();
      if (!res.ok) { setErr(body?.error?.message ?? "Couldn't load this seller."); return; }
      setData(body as Seller360);
    } catch {
      setErr("Network hiccup — retry.");
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (forbidden) return <EmptyState icon={ShieldAlert} title="Admin access required" hint="Switch to the Admin persona from the header." />;

  return (
    <div className="space-y-4">
      <Link href="/admin/review" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-white/50 hover:text-white/80">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back
      </Link>

      {err ? (
        <Card className="p-6 text-center">
          <p role="alert" className="text-sm text-white/70">{err}</p>
          <button onClick={load} className="btn-primary mt-3 px-5 py-2 text-sm">Retry</button>
        </Card>
      ) : !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black tracking-tight">{data.seller.shopName}</h2>
                <p className="text-sm text-white/50">{data.seller.name}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={bandVariant[data.seller.trustBand]}>{data.seller.trustBand} trust</Badge>
                <Badge variant={data.seller.kycStatus === "verified" ? "verified" : "neutral"}>
                  <BadgeCheck className="h-3 w-3" aria-hidden /> KYC {data.seller.kycStatus}
                </Badge>
              </div>
            </div>
            <div className="mt-4 flex items-end gap-6">
              <div>
                <p className="text-3xl font-black tabular-nums">{data.seller.trustScore}</p>
                <p className="text-xs text-white/40">trust score</p>
              </div>
              <div className="text-sm text-white/60">
                <span className="text-asli-green">{data.seller.passes} passes</span> ·{" "}
                <span className="text-asli-red">{data.seller.fails} fails</span>
              </div>
              <div className="ml-auto w-40">
                <TrustSparkline events={data.events} current={data.seller.trustScore} />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 text-sm font-bold">Trust events</h3>
            {data.events.length === 0 ? (
              <p className="text-sm text-white/40">No trust events yet.</p>
            ) : (
              <ul className="space-y-2">
                {[...data.events].reverse().map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-white/70">{e.reason}</span>
                    <span className={`shrink-0 font-semibold tabular-nums ${e.delta >= 0 ? "text-asli-green" : "text-asli-red"}`}>
                      {e.delta >= 0 ? "+" : ""}{e.delta}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 text-sm font-bold">Listings ({data.listings.length})</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-white/40">
                  <tr><th className="pb-2 pr-4 font-semibold">Title</th><th className="pb-2 pr-4 font-semibold">Status</th><th className="pb-2 font-semibold">Price</th></tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.listings.filter((l) => l.title !== "__seed_marker__").map((l) => (
                    <tr key={l.id}>
                      <td className="py-2 pr-4">{l.title}</td>
                      <td className="py-2 pr-4"><span className="capitalize text-white/60">{l.status}</span></td>
                      <td className="py-2 tabular-nums">₹{l.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
