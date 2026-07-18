"use client";

import { Store } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useT } from "@/lib/i18n";

/** Localized "no products yet" state for the storefront feed. */
export function ShopEmptyState() {
  const t = useT();
  return (
    <EmptyState icon={Store} skin="light" title={t("shop.empty.title")} hint={t("shop.empty.hint")} />
  );
}
