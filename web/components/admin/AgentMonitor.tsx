"use client";

// Monitoring-as-a-feature — live provider / trigger / backend health with status dots.
import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import type { AgentMonitor as Monitor } from "@/app/api/admin/agents/route";

const DOT = { ok: "bg-asli-green", warn: "bg-asli-amber", bad: "bg-asli-red" } as const;

function Dot({ state }: { state: keyof typeof DOT }) {
  return <span className={`h-2 w-2 rounded-full ${DOT[state]} shadow-[0_0_8px_currentColor]`} aria-hidden />;
}

export function AgentMonitor() {
  const [data, setData] = useState<Monitor | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setErr(null);
    try {
      const res = await fetch("/api/admin/agents");
      const body = await res.json();
      if (!res.ok) { setErr(body?.error?.message ?? "Couldn't load agent status."); return; }
      setData(body as Monitor);
    } catch {
      setErr("Network hiccup — retry.");
    }
  };
  useEffect(() => { void load(); }, []);

  const vlmState: keyof typeof DOT = !data ? "warn" : data.vlmHealthy ? "ok" : data.degraded ? "warn" : "bad";

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4 text-asli-violet" aria-hidden />
        <h2 className="text-sm font-bold">Agent monitor</h2>
        {data?.degraded && (
          <span className="pill bg-asli-amber/15 text-asli-amber">degraded</span>
        )}
      </div>

      {err ? (
        <div className="text-center">
          <p role="alert" className="text-xs text-white/60">{err}</p>
          <button onClick={load} className="mt-2 btn-ghost px-4 py-2 text-xs">Retry</button>
        </div>
      ) : !data ? (
        <Skeleton className="h-20 w-full" />
      ) : (
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-white/50">VLM provider</dt>
            <dd className="flex items-center gap-2 font-semibold capitalize">
              <Dot state={vlmState} />
              {data.vlmProvider}
              {data.vlmLatencyMs !== null && (
                <span className="text-xs font-normal text-white/40">{data.vlmLatencyMs} ms</span>
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-white/50">Trigger source</dt>
            <dd className="flex items-center gap-2 font-semibold">
              <Dot state={data.triggerSource === "mock" ? "warn" : "ok"} />
              {data.triggerSource}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-white/50">Data backend</dt>
            <dd className="flex items-center gap-2 font-semibold">
              <Dot state="ok" />
              {data.dataBackend}
            </dd>
          </div>
          {data.cvMethod && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-white/50">CV method</dt>
              <dd className="flex items-center gap-2 font-semibold">
                <Dot state={data.cvMethod === "clip" ? "ok" : data.cvMethod === "phash" ? "warn" : "bad"} />
                {data.cvMethod}
                {data.vlmBackend && (
                  <span className="text-xs font-normal text-white/40">via {data.vlmBackend}</span>
                )}
              </dd>
            </div>
          )}
          {data.ocrAvailable !== undefined && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-white/50">Code OCR</dt>
              <dd className="flex items-center gap-2 font-semibold">
                <Dot state={data.ocrAvailable ? "ok" : "warn"} />
                {data.ocrAvailable ? "PaddleOCR" : "VLM-only"}
              </dd>
            </div>
          )}
          {data.calibrationVersion && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-white/50">Calibration</dt>
              <dd className="font-semibold text-white/70">{data.calibrationVersion}</dd>
            </div>
          )}
        </dl>
      )}
    </Card>
  );
}
