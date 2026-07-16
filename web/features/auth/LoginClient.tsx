"use client";

// Email + password sign-in / create-account (accounts stored in MongoDB), plus a dev-only persona
// bypass.
//
// The portal picker is INTENT, never authorization. On create-account it sets the role. On sign-in
// the role comes back from the account and wins outright — a picker that granted "Admin" to whoever
// clicked it would be privilege escalation with extra steps. When the two disagree we say so and
// route to the account's real portal rather than dumping the user on a page they can't open.
import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Lock, User as UserIcon, ShieldCheck, Store, ShoppingBag, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { useT } from "@/lib/i18n";
import { useSessionStore } from "@/lib/store";
import { fadeSlideUp } from "@/lib/motion";
import type { Role } from "@/lib/db/types";

const PORTALS = [
  { role: "seller", label: "Seller", blurb: "List and verify", icon: Store },
  { role: "buyer", label: "Buyer", blurb: "Shop verified", icon: ShoppingBag },
  { role: "admin", label: "Admin", blurb: "Review and monitor", icon: Shield },
] as const;

// Public create-account may only pick non-privileged roles (admin is provisioned admin-side / dev-only).
const REGISTER_ROLES: readonly Role[] = ["seller", "buyer"];

const ROLE_HOME: Record<Role, string> = { seller: "/seller", buyer: "/shop", admin: "/admin" };
const ROLE_LABEL: Record<Role, string> = { seller: "seller portal", buyer: "marketplace", admin: "admin console" };

const inputCls =
  "min-h-[44px] flex-1 bg-transparent text-white outline-none placeholder:text-white/30";
const fieldCls =
  "flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 focus-within:ring-2 focus-within:ring-asli-violet";

function returnTo(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("returnTo");
}

export function LoginClient({ devLogin = false }: { devLogin?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [intent, setIntent] = useState<Role>("seller");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Create-account cannot self-provision admin; fall back to seller if that portal is selected.
  const registerRole: Role = REGISTER_ROLES.includes(intent) ? intent : "seller";

  async function submit() {
    setErr(null);
    setNotice(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErr("Enter a valid email."); return; }
    if (password.length < 6) { setErr("Password must be at least 6 characters."); return; }
    if (mode === "register" && !name.trim()) { setErr("Enter your name."); return; }
    setBusy(true);
    try {
      const path = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        mode === "login" ? { email, password } : { email, password, name, role: registerRole };
      const res = await fetch(path, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) { setErr(body?.error?.message ?? "Something went wrong."); return; }

      const actual = (body.user?.role as Role) ?? "buyer";
      if (mode === "login" && actual !== intent) {
        // Don't strand them on a portal their account can't open — explain and take them to theirs.
        setNotice(`This account is a ${actual}. Opening the ${ROLE_LABEL[actual]}.`);
      }
      // Re-read the session before navigating. AppShell fetches it once on mount and lives in the
      // root layout, so it never remounts on a client navigation — without this the header kept
      // offering "Sign in" to a signed-in user. router.refresh() only re-renders server components;
      // it cannot repopulate this client store.
      await useSessionStore.getState().fetchSession();
      const dest = returnTo() ?? ROLE_HOME[actual];
      router.push(dest);
      router.refresh();
    } catch { setErr("Network hiccup — retry."); } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col justify-center px-4 py-10">
      <motion.div variants={fadeSlideUp} initial="hidden" animate="show">
        <Card className="flex flex-col items-center gap-5 p-8 text-center">
          <ShieldCheck className="h-10 w-10 text-asli-violet" aria-hidden />
          <div>
            <h1 className="text-xl font-black tracking-tight">{t("login.title")}</h1>
            <p className="mt-1 text-sm text-white/50">{t("app.tagline")}</p>
          </div>

          {/* Which portal you're heading for. On sign-in this only shapes the copy — the account decides. */}
          <div className="w-full text-left">
            <p className="mb-1.5 text-xs font-semibold text-white/60">
              {mode === "login" ? "Where are you headed?" : "I am a"}
            </p>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Portal">
              {PORTALS.map(({ role: r, label, blurb, icon: Icon }) => {
                const disabled = mode === "register" && !REGISTER_ROLES.includes(r);
                const active = intent === r && !disabled;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setIntent(r)}
                    disabled={disabled}
                    aria-pressed={active}
                    title={disabled ? "Admin accounts are provisioned by an admin" : undefined}
                    className={`flex min-h-[76px] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet disabled:cursor-not-allowed disabled:opacity-30 ${
                      active
                        ? "border-asli-violet bg-asli-violet/15 text-white"
                        : "border-white/15 text-white/70 hover:bg-white/5"
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    <span className="text-sm font-semibold">{label}</span>
                    <span className="text-[10px] leading-tight text-white/40">{blurb}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex w-full rounded-xl border border-white/10 bg-white/[0.03] p-1 text-sm">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m} onClick={() => { setMode(m); setErr(null); setNotice(null); }}
                className={`min-h-[40px] flex-1 rounded-lg font-semibold transition ${
                  mode === m ? "bg-asli-violet text-white" : "text-white/60 hover:text-white"
                }`}
              >
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <div className="w-full space-y-3 text-left">
            {mode === "register" && (
              <div className={fieldCls}>
                <UserIcon className="h-4 w-4 text-white/40" aria-hidden />
                <input
                  aria-label="Full name" autoComplete="name" value={name}
                  onChange={(e) => setName(e.target.value)} placeholder="Your name"
                  className={inputCls}
                />
              </div>
            )}
            <div className={fieldCls}>
              <Mail className="h-4 w-4 text-white/40" aria-hidden />
              <input
                aria-label="Email" type="email" autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className={inputCls}
              />
            </div>
            <div className={fieldCls}>
              <Lock className="h-4 w-4 text-white/40" aria-hidden />
              <input
                aria-label="Password" type="password" value={password}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                onChange={(e) => setPassword(e.target.value)} placeholder="Password"
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className={inputCls}
              />
            </div>

            {mode === "register" && intent === "admin" && (
              <p className="text-[11px] text-asli-amber">
                Admin accounts are provisioned by an admin — creating this account as a seller.
              </p>
            )}

            <button
              onClick={submit} disabled={busy}
              className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-asli-violet px-5 py-3 font-semibold text-white transition hover:brightness-110 active:scale-[0.97] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
            >
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </div>

          {err && <p role="alert" className="text-xs text-asli-red">{err}</p>}
          {notice && <p role="status" className="text-xs text-asli-amber">{notice}</p>}
          <p className="text-xs text-white/40">{t("login.privacy")}</p>

          {devLogin && (
            <div className="w-full border-t border-white/10 pt-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-asli-amber">
                Dev access · skips login (local only)
              </p>
              <div className="grid grid-cols-3 gap-2">
                {PORTALS.map(({ role: r, label }) => (
                  <a
                    key={r} href={`/api/dev-login?role=${r}`}
                    className="flex min-h-[44px] items-center justify-center rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>
          )}
        </Card>
      </motion.div>
    </main>
  );
}
