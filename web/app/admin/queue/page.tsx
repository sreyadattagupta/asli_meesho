"use client";

// Review queue — escalated listings with full agent context; approve/reject feeds trust.
import { useEffect, useState } from "react";
import { CheckCircle2, ShieldAlert, Inbox } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { ReviewDetailDrawer } from "@/components/admin/ReviewDetailDrawer";
import type { ReviewQueueItem } from "@/app/api/review/queue/route";

export default function QueuePage() {
  const { toast } = useToast();
  const [items, setItems] = useState<ReviewQueueItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [active, setActive] = useState<ReviewQueueItem | null>(null);

  const load = async () => {
    setErr(null); setForbidden(false);
    try {
      const res = await fetch("/api/review/queue");
      if (res.status === 401 || res.status === 403) { setForbidden(true); return; }
      const body = await res.json();
      if (!res.ok) { setErr(body?.error?.message ?? "Couldn't load the queue."); return; }
      setItems(body.items as ReviewQueueItem[]);
    } catch {
      setErr("Network hiccup — retry.");
    }
  };
  useEffect(() => { void load(); }, []);

  const onDecided = (reviewId: string, decision: "approved" | "rejected") => {
    setItems((prev) => prev?.filter((i) => i.review.id !== reviewId) ?? prev);
    setActive(null);
    toast({ kind: "success", message: decision === "approved" ? "Listing approved — now live." : "Listing rejected." });
  };

  if (forbidden) {
    return <EmptyState icon={ShieldAlert} title="Admin access required" hint="Switch to the Admin persona from the header." />;
  }
  if (err) {
    return (
      <Card className="p-6 text-center">
        <p role="alert" className="text-sm text-white/70">{err}</p>
        <button onClick={load} className="btn-primary mt-3 px-5 py-2 text-sm">Retry</button>
      </Card>
    );
  }
  if (!items) {
    return <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>;
  }
  if (items.length === 0) {
    return <EmptyState icon={CheckCircle2} title="Queue clear" hint="No listings are waiting for human review right now." />;
  }

  return (
    <>
      <p className="mb-3 flex items-center gap-2 text-sm text-white/50">
        <Inbox className="h-4 w-4" aria-hidden /> {items.length} listing{items.length > 1 ? "s" : ""} awaiting review
      </p>
      <ul className="space-y-3">
        {items.map((item) => {
          const escalation = item.checks.filter((c) => c.action === "ESCALATE_HUMAN").at(-1);
          const catalog = item.images.find((i) => i.kind === "catalog")?.url ?? "/mock/kurtis-1.svg";
          return (
            <li key={item.review.id}>
              <button
                onClick={() => setActive(item)}
                className="flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-asli-violet/40 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={catalog} alt="" className="h-16 w-16 rounded-xl border border-white/10 object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{item.listing?.title ?? "Listing"}</p>
                  <p className="truncate text-sm text-white/50">{item.seller?.shopName} · ₹{item.listing?.price}</p>
                  {escalation && <p className="mt-1 truncate text-xs text-white/40">{escalation.reason}</p>}
                </div>
                <Badge variant="trigger">review</Badge>
              </button>
            </li>
          );
        })}
      </ul>

      {active && <ReviewDetailDrawer item={active} onClose={() => setActive(null)} onDecided={onDecided} />}
    </>
  );
}
