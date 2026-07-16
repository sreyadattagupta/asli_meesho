"use client";

// Seller business profile form. Loading / success / error with retry on every submit (invariant #10).
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Seller } from "@/lib/db/types";

const FIELDS = [
  { key: "businessName", label: "Business name", placeholder: "Priya Textiles Pvt Ltd", hint: "" },
  { key: "shopName", label: "Shop name", placeholder: "Priya's Ethnic Studio", hint: "Shown to buyers" },
  { key: "gst", label: "GST", placeholder: "27AAPFU0939F1ZV", hint: "15 characters" },
  { key: "pan", label: "PAN", placeholder: "AAPFU0939F", hint: "10 characters" },
  { key: "mobile", label: "Mobile", placeholder: "9876543210", hint: "10 digits" },
  { key: "bankLast4", label: "Bank account (last 4)", placeholder: "4321", hint: "We only keep the last four" },
  { key: "address", label: "Address", placeholder: "Shop 4, MG Road, Surat, Gujarat", hint: "" },
] as const;

type Key = (typeof FIELDS)[number]["key"];

export function ProfileForm({ seller }: { seller: Seller }) {
  const router = useRouter();
  const [form, setForm] = useState<Record<Key, string>>({
    businessName: seller.businessName ?? "",
    shopName: seller.shopName ?? "",
    gst: seller.gst ?? "",
    pan: seller.pan ?? "",
    mobile: seller.mobile ?? "",
    bankLast4: seller.bankLast4 ?? "",
    address: seller.address ?? "",
  });
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setState("saving");
    setErr(null);
    try {
      const res = await fetch("/api/seller/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) {
        setErr(body?.error?.message ?? "Couldn't save. Check the details and retry.");
        setState("idle");
        return;
      }
      setState("saved");
      router.refresh();
    } catch {
      setErr("Network hiccup — retry.");
      setState("idle");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-xs font-semibold text-white/55">{f.label}</span>
            <input
              value={form[f.key]}
              onChange={(e) => { setForm({ ...form, [f.key]: e.target.value }); setState("idle"); }}
              placeholder={f.placeholder}
              className="min-h-[44px] w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-white outline-none placeholder:text-white/25 focus:ring-2 focus:ring-asli-violet"
            />
            {f.hint && <span className="mt-1 block text-[10px] text-white/25">{f.hint}</span>}
          </label>
        ))}
      </div>

      {err && <p role="alert" className="text-xs text-asli-red">{err}</p>}
      {state === "saved" && <p role="status" className="text-xs text-asli-green">Profile saved.</p>}

      <button onClick={save} disabled={state === "saving"} className="btn-primary">
        {state === "saving" ? "Saving…" : "Save profile"}
      </button>
    </div>
  );
}
