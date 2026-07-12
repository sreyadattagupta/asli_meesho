"use client";

// Google sign-in via Auth0 Universal Login (v4 /auth/login route).
import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useT } from "@/lib/i18n";
import { fadeSlideUp } from "@/lib/motion";

export default function LoginPage() {
  const t = useT();
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col justify-center px-4 py-10">
      <motion.div variants={fadeSlideUp} initial="hidden" animate="show">
        <Card className="flex flex-col items-center gap-5 p-8 text-center">
          <ShieldCheck className="h-10 w-10 text-asli-violet" aria-hidden />
          <div>
            <h1 className="text-xl font-black tracking-tight">{t("login.title")}</h1>
            <p className="mt-1 text-sm text-white/50">{t("app.tagline")}</p>
          </div>
          <a
            href="/auth/login?returnTo=/onboarding"
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-zinc-900 transition hover:brightness-95 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet"
          >
            {/* Google "G" — inline SVG, no external asset */}
            <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            {t("login.google")}
          </a>
          <p className="text-xs text-white/40">{t("login.privacy")}</p>
        </Card>
      </motion.div>
    </main>
  );
}
