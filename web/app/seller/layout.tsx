// Seller portal shell. Middleware already gates /seller on a valid session; every page and route
// underneath re-checks the role server-side (defense in depth, CLAUDE.md §11).
import Link from "next/link";
import type { ReactNode } from "react";
import { SellerNav } from "@/features/seller/SellerNav";

export default function SellerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Seller portal</h1>
            <p className="text-sm text-white/40">Your listings, your numbers, your trust record.</p>
          </div>
          <Link href="/sell" className="btn-primary">
            Create listing →
          </Link>
        </div>
        <SellerNav />
      </header>
      {children}
    </div>
  );
}
