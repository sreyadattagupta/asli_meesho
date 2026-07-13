"use client";

// Seller KYC onboarding (simulated verification) — feeds the cold-start trust prior.
import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { FileCheck2, Upload } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StreamingChecklist } from "@/components/ui/StreamingChecklist";
import { fadeSlideUp } from "@/lib/motion";

type ItemState = "pending" | "active" | "done" | "failed";
const STEP_IDS = ["reading", "verifying", "activating"] as const;
const LABELS: Record<(typeof STEP_IDS)[number], string> = {
  reading: "Reading document",
  verifying: "Verifying identity",
  activating: "Activating seller account",
};

export function KycOnboarding({ onDone }: { onDone: () => void }) {
  const [shopName, setShopName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, ItemState>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (id: string, s: ItemState) => setStates((prev) => ({ ...prev, [id]: s }));

  async function submit() {
    if (shopName.trim().length < 2) { setErr("Enter your shop name (2+ characters)."); return; }
    if (!file) { setErr("Upload a document image to verify."); return; }
    setErr(null); setRunning(true);
    set("reading", "active");

    const form = new FormData();
    form.set("shopName", shopName.trim());
    form.set("doc", file);
    try {
      // Perceived streaming synced to the ~1.2s server verify.
      const pending = fetch("/api/kyc/submit", { method: "POST", body: form });
      await new Promise((r) => setTimeout(r, 450));
      set("reading", "done"); set("verifying", "active");
      const res = await pending;
      const body = await res.json();
      if (!res.ok) {
        set("verifying", "failed");
        setErr(body?.error?.message ?? "Verification failed — retry.");
        setRunning(false);
        return;
      }
      set("verifying", "done"); set("activating", "active");
      await new Promise((r) => setTimeout(r, 400));
      set("activating", "done");
      await new Promise((r) => setTimeout(r, 300));
      onDone();
    } catch {
      set("verifying", "failed");
      setErr("Network hiccup — retry.");
      setRunning(false);
    }
  }

  return (
    <motion.div variants={fadeSlideUp} initial="hidden" animate="show">
      <Card className="p-5">
        <div className="mb-1 flex items-center gap-2">
          <FileCheck2 className="h-5 w-5 text-asli-violet" aria-hidden />
          <h2 className="text-lg font-bold">Seller KYC</h2>
          <Badge variant="neutral">simulated</Badge>
        </div>
        <p className="text-sm text-white/60">
          Verify your shop to start listing. This cold-start check feeds Risk Radar&apos;s trust prior.
        </p>

        {!running ? (
          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="shop" className="text-xs font-semibold text-white/60">Shop name</label>
              <input
                id="shop" value={shopName} onChange={(e) => setShopName(e.target.value)}
                placeholder="Priya's Ethnic Studio"
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
              />
            </div>
            <div>
              <span className="text-xs font-semibold text-white/60">Identity / business document</span>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="mt-1 flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-3 py-2.5 text-sm text-white/60 transition hover:border-asli-violet/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
              >
                <Upload className="h-4 w-4" aria-hidden />
                {file ? file.name : "Upload JPEG / PNG / WebP (≤8 MB)"}
              </button>
              <input
                ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {err && <p role="alert" className="text-xs text-asli-red">{err}</p>}
            <Button onClick={submit} className="w-full">Verify &amp; continue</Button>
          </div>
        ) : (
          <div className="mt-4">
            <StreamingChecklist
              items={STEP_IDS.map((id) => ({ id, label: LABELS[id], state: states[id] ?? "pending" }))}
            />
            {err && (
              <div className="mt-3">
                <p role="alert" className="text-xs text-asli-red">{err}</p>
                <Button variant="ghost" onClick={submit} className="mt-2 w-full">Retry</Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </motion.div>
  );
}
