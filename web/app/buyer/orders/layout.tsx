// Order history is the buyer's own data. The list page guards itself, but the tracking page
// ([id]) is a client component and cannot read the session — this covers both from one place.
import type { ReactNode } from "react";
import { requireBuyer } from "@/lib/guards";

export default async function BuyerOrdersLayout({ children }: { children: ReactNode }) {
  await requireBuyer();
  return <>{children}</>;
}
