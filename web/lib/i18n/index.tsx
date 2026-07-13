"use client";

// Hand-rolled EN/HI i18n (zero deps). translate() is the pure core; useT wraps the store locale.
import { createContext, useCallback, useContext } from "react";
import type { ReactNode } from "react";
import { en, type I18nKey } from "./en";
import { hi } from "./hi";
import { useLocaleStore } from "@/lib/store";

export type Locale = "en" | "hi";

export type I18nVars = Record<string, string | number>;

/** Pure lookup — hi missing key ⇒ en fallback; {name} placeholders filled from vars (unit-tested). */
export function translate(locale: Locale, key: I18nKey, vars?: I18nVars): string {
  const raw = locale === "hi" ? hi[key] ?? en[key] : en[key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

const I18nContext = createContext<Locale>("en");

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useLocaleStore((s) => s.locale);
  return <I18nContext.Provider value={locale}>{children}</I18nContext.Provider>;
}

export function useT(): (key: I18nKey, vars?: I18nVars) => string {
  const locale = useContext(I18nContext);
  return useCallback((key: I18nKey, vars?: I18nVars) => translate(locale, key, vars), [locale]);
}
