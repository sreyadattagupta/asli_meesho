"use client";

// Role-aware landing CTA: signed-out → /login; signed-in → the current persona's home.
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useSessionStore } from "@/lib/store";
import type { Role } from "@/lib/db/types";
import type { I18nKey } from "@/lib/i18n/en";

const target: Record<Role, { href: string; key: I18nKey }> = {
  seller: { href: "/sell", key: "landing.cta.seller" },
  buyer: { href: "/shop", key: "landing.cta.buyer" },
  admin: { href: "/admin", key: "landing.cta.admin" },
};

export function LandingCta() {
  const t = useT();
  const { status, user } = useSessionStore();
  const dest = status === "authed" && user ? target[user.role] : { href: "/login", key: "landing.cta.signedout" as I18nKey };
  return (
    <Link href={dest.href} className="btn-primary text-lg">
      {t(dest.key)} →
    </Link>
  );
}
