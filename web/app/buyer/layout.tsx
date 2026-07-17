// Buyer marketplace shell.
//
// No role guard here, and that is deliberate: the grid and product detail are the storefront, which
// is public. Anonymous shoppers browse it, the landing page links into it, and a seller opens their
// own live listing from My Listings to see what buyers see. The buyer's PERSONAL pages — checkout,
// orders, profile — guard themselves with requireBuyer(), and middleware demands a session before
// they render at all.
import type { ReactNode } from "react";
import { BuyerNav } from "@/components/nav/BuyerNav";

export default function BuyerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="buyer-surface min-h-[calc(100vh-3.5rem)]">
      <BuyerNav />
      {children}
    </div>
  );
}
