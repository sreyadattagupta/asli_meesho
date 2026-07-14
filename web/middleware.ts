import { NextRequest, NextResponse } from "next/server";

// Session cookie name — literal here (must not import lib/session, which uses node:crypto and would
// break the edge middleware bundle). Kept in sync with lib/session.ts SESSION_COOKIE.
const SESSION_COOKIE = "asli_session";

const AUTHED = [/^\/sell/, /^\/admin/, /^\/checkout/, /^\/orders/, /^\/onboarding/];

// Strictly-gated E2E/demo bypass — never active in production; requires the flag AND an explicit
// x-test-role (header for Playwright, cookie for manual use). Mirrors lib/auth.ts getSessionUser.
const BYPASS = process.env.AUTH_TEST_BYPASS === "1" && process.env.NODE_ENV !== "production";

export function middleware(req: NextRequest) {
  if (BYPASS && (req.headers.get("x-test-role") ?? req.cookies.get("x-test-role")?.value)) {
    return NextResponse.next(); // authenticated by the test bypass
  }

  if (AUTHED.some((r) => r.test(req.nextUrl.pathname))) {
    // Presence check only — signature/expiry are verified per-route by requireRole (node runtime).
    if (!req.cookies.get(SESSION_COOKIE)?.value) {
      const login = new URL("/login", req.url);
      login.searchParams.set("returnTo", req.nextUrl.pathname);
      return NextResponse.redirect(login);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|mock|proof).*)"],
};
