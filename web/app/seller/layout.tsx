// Seller portal shell, and the ROLE GUARD for every /seller/* page.
//
// Middleware only proves a session exists; requireSeller re-reads the role (and the seller row) from
// the database on each request, so a buyer who types a seller URL lands on their own home and a
// seller whose onboarding never finished lands on /onboarding instead of a page with nothing to show.
import type { ReactNode } from "react";
import { requireSeller } from "@/lib/guards";
import { PortalShell } from "@/components/nav/PortalShell";

export default async function SellerLayout({ children }: { children: ReactNode }) {
  await requireSeller();
  return <PortalShell role="seller">{children}</PortalShell>;
}
