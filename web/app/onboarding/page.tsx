"use client";

// First-login role selection — demo provision (prod: Admin invite-only, Seller KYC-gated).
import { motion } from "framer-motion";
import { ShieldHalf, ShoppingBag, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { KycOnboarding } from "@/components/seller/KycOnboarding";
import { useT } from "@/lib/i18n";
import { fadeSlideUp, staggerChildren } from "@/lib/motion";
import { useSessionStore } from "@/lib/store";
import type { Role } from "@/lib/db/types";
import type { LucideIcon } from "lucide-react";
import type { I18nKey } from "@/lib/i18n/en";

const roleHome: Record<Role, string> = { seller: "/sell", buyer: "/shop", admin: "/admin" };

const cards: { role: Role; icon: LucideIcon; titleKey: I18nKey; hintKey: I18nKey }[] = [
  { role: "seller", icon: Store, titleKey: "onboarding.seller", hintKey: "onboarding.seller.hint" },
  { role: "buyer", icon: ShoppingBag, titleKey: "onboarding.buyer", hintKey: "onboarding.buyer.hint" },
  { role: "admin", icon: ShieldHalf, titleKey: "onboarding.admin", hintKey: "onboarding.admin.hint" },
];

export default function OnboardingPage() {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const { user, setUser } = useSessionStore();
  const [busy, setBusy] = useState<Role | null>(null);
  const [phase, setPhase] = useState<"role" | "kyc">("role");

  const pick = async (role: Role) => {
    setBusy(role);
    try {
      const res = await fetch("/api/users/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast({ kind: "error", message: body?.error?.message ?? t("state.error") });
        return;
      }
      const body = (await res.json()) as { user: { role: Role; name: string; sellerId?: string } };
      setUser({ ...(user ?? { name: body.user.name }), role: body.user.role, name: body.user.name, sellerId: body.user.sellerId });
      // Sellers complete KYC before entering the flow; buyers/admins go straight to their home.
      if (role === "seller") { setPhase("kyc"); return; }
      router.push(roleHome[role]);
    } catch {
      toast({ kind: "error", message: t("state.error") });
    } finally {
      setBusy(null);
    }
  };

  if (phase === "kyc") {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-xl flex-col justify-center gap-6 px-4 py-10">
        <div>
          <h1 className="text-2xl font-black tracking-tight">One more step</h1>
          <p className="mt-1 text-sm text-white/60">Verify your shop to unlock listing.</p>
        </div>
        <KycOnboarding onDone={() => router.push("/sell")} />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-xl flex-col justify-center gap-6 px-4 py-10">
      <motion.div variants={fadeSlideUp} initial="hidden" animate="show">
        <h1 className="text-2xl font-black tracking-tight">{t("onboarding.title")}</h1>
        <p className="mt-1 text-sm text-white/60">{t("onboarding.subtitle")}</p>
      </motion.div>
      <motion.div className="grid gap-3 sm:grid-cols-3" variants={staggerChildren} initial="hidden" animate="show">
        {cards.map(({ role, icon: Icon, titleKey, hintKey }) => (
          <motion.button
            key={role}
            variants={fadeSlideUp}
            onClick={() => void pick(role)}
            disabled={busy !== null}
            aria-busy={busy === role}
            className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet disabled:opacity-60"
          >
            <Card className="flex h-full flex-col gap-2 p-4 transition hover:-translate-y-0.5 hover:border-asli-violet/40 hover:bg-white/[0.06]">
              <Icon className="h-6 w-6 text-asli-violet" aria-hidden />
              <span className="font-bold">{t(titleKey)}</span>
              <span className="text-xs text-white/50">{t(hintKey)}</span>
              {busy === role && <span className="text-xs text-asli-violet">{t("state.loading")}</span>}
            </Card>
          </motion.button>
        ))}
      </motion.div>
      <motion.p variants={fadeSlideUp} initial="hidden" animate="show" className="text-xs text-white/40">
        {t("onboarding.disclaimer")}
      </motion.p>
    </main>
  );
}
