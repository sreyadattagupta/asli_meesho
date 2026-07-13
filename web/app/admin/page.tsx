"use client";

// T&S dashboard — live tiles + agent monitor. Complements Project Suraksha (post-listing).
import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { StatTile } from "@/components/ui/StatTile";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { AgentMonitor } from "@/components/admin/AgentMonitor";
import type { AdminMetrics } from "@/app/api/admin/metrics/route";

export default function AdminDashboard() {
  const [m, setM] = useState<AdminMetrics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = async () => {
    setErr(null); setForbidden(false);
    try {
      const res = await fetch("/api/admin/metrics");
      if (res.status === 401 || res.status === 403) { setForbidden(true); return; }
      const body = await res.json();
      if (!res.ok) { setErr(body?.error?.message ?? "Couldn't load metrics."); return; }
      setM(body as AdminMetrics);
    } catch {
      setErr("Network hiccup — retry.");
    }
  };
  useEffect(() => { void load(); }, []);

  if (forbidden) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Admin access required"
        hint="Switch to the Admin persona from the header to open the Trust & Safety console."
      />
    );
  }

  return (
    <div className="space-y-6">
      {err ? (
        <Card className="p-6 text-center">
          <p role="alert" className="text-sm text-white/70">{err}</p>
          <button onClick={load} className="btn-primary mt-3 px-5 py-2 text-sm">Retry</button>
        </Card>
      ) : !m ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile label="Listings verified" value={m.verified} />
            <StatTile label="Thieves blocked" value={m.blocked} />
            <StatTile label="Avg trust score" value={m.avgTrust} />
            <StatTile label="Escalation rate" value={Math.round(m.escalationRate * 100)} suffix="%" />
            <StatTile label="Returns prevented" value={m.returnsPrevented} />
          </div>
          <p className="text-xs text-white/40">
            <span className="pill mr-1 bg-asli-amber/15 text-asli-amber">estimated</span>
            Returns prevented uses the 40–60% sizing-returns midpoint [S9]. Escalation-rate target
            &lt;5% at production volume.
          </p>
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <AgentMonitor />
        </div>
        <Card className="p-5 lg:col-span-2">
          <h2 className="text-sm font-bold">Prevention at the point of listing</h2>
          <p className="mt-2 text-sm text-white/60">
            Asli verifies possession and real sizing <em>before</em> a listing goes live — complementing
            Project Suraksha, which acts after listings are already live. Escalations here are the &lt;5%
            of listings the automated agents could not clear with confidence.
          </p>
        </Card>
      </div>
    </div>
  );
}
