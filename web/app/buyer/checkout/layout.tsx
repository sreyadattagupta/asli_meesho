// Checkout is a client component and cannot read the session, so the guard lives here.
//
// Without it a signed-in seller could open the checkout form, fill it in, and only discover at
// submit that POST /api/orders 403s them. The order route is the real gate; this is what stops the
// page rendering to someone it isn't for (CLAUDE.md §11 — gate the shell, re-check the route).
import type { ReactNode } from "react";
import { requireBuyer } from "@/lib/guards";

export default async function CheckoutLayout({ children }: { children: ReactNode }) {
  await requireBuyer();
  return <>{children}</>;
}
