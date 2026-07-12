"use client";

// Global header: wordmark + language toggle + persona switcher (authed) + user menu.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LogOut } from "lucide-react";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { PersonaSwitcher } from "@/components/ui/PersonaSwitcher";
import { useT } from "@/lib/i18n";
import { useLocaleStore, useSessionStore } from "@/lib/store";
import type { Role } from "@/lib/db/types";
import type { ReactNode } from "react";

const roleHome: Record<Role, string> = { seller: "/sell", buyer: "/shop", admin: "/admin" };

export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const router = useRouter();
  const { locale, toggleLocale } = useLocaleStore();
  const { status, user, fetchSession, setUser } = useSessionStore();

  useEffect(() => { void fetchSession(); }, [fetchSession]);

  const switchPersona = async (role: Role) => {
    if (!user || role === user.role) return;
    try {
      const res = await fetch("/api/users/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) return;
      const body = (await res.json()) as { user: { role: Role; name: string; sellerId?: string } };
      setUser({ ...user, role: body.user.role, sellerId: body.user.sellerId });
      router.push(roleHome[role]);
    } catch {
      // network hiccup — stay on current persona
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0715]/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <Link
            href="/"
            className="text-lg font-black tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
          >
            {t("app.wordmark")}
          </Link>
          <div className="flex items-center gap-2">
            {status === "authed" && user && (
              <PersonaSwitcher current={user.role} onSwitch={(r) => void switchPersona(r)} />
            )}
            <LanguageToggle locale={locale} onToggle={toggleLocale} />
            {status === "authed" && user ? (
              <a
                href="/auth/logout"
                aria-label={t("nav.signout")}
                className="flex min-h-[36px] items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
              >
                <span className="hidden max-w-[10ch] truncate sm:inline">{user.name}</span>
                <LogOut className="h-3.5 w-3.5" aria-hidden />
              </a>
            ) : status === "anon" ? (
              <Link
                href="/login"
                className="flex min-h-[36px] items-center rounded-full bg-asli-violet px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
              >
                {t("nav.signin")}
              </Link>
            ) : null}
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
