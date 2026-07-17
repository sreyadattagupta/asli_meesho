"use client";

// Role-aware landing CTA: signed-out → /login; signed-in → the current persona's home.
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useSessionStore } from "@/lib/store";
import { ROLE_HOME } from "@/lib/roles";
import type { Role } from "@/lib/db/types";
import type { I18nKey } from "@/lib/i18n/en";

// Destination comes from ROLE_HOME (lib/roles.ts) — the same map the login redirect and the portal
// guards use, so the CTA cannot drift to a route that bounces the user straight back.
const ctaKey: Record<Role, I18nKey> = {
  seller: "landing.cta.seller",
  buyer: "landing.cta.buyer",
  admin: "landing.cta.admin",
};

export function LandingCta() {
  const t = useT();
  const { status, user } = useSessionStore();
  const dest =
    status === "authed" && user
      ? { href: ROLE_HOME[user.role], key: ctaKey[user.role] }
      : { href: "/login", key: "landing.cta.signedout" as I18nKey };
  return (
    <Link href={dest.href} className="btn-primary text-lg">
      {t(dest.key)} →
    </Link>
  );
}
