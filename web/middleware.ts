import { NextRequest, NextResponse } from "next/server";
import { auth0, authConfigured } from "./lib/auth0";

const AUTHED = [/^\/sell/, /^\/admin/, /^\/checkout/, /^\/orders/, /^\/onboarding/];

// Strictly-gated E2E/demo bypass — never active in production; requires the flag AND an explicit
// x-test-role (header for Playwright, cookie for manual use). Mirrors lib/auth.ts getSessionUser.
const BYPASS = process.env.AUTH_TEST_BYPASS === "1" && process.env.NODE_ENV !== "production";

export async function middleware(req: NextRequest) {
  if (BYPASS && (req.headers.get("x-test-role") ?? req.cookies.get("x-test-role")?.value)) {
    return NextResponse.next(); // authenticated by the test bypass
  }
  // Tenant env not filled yet — degrade to signed-out instead of hard-failing every request.
  if (!authConfigured) return NextResponse.next();

  const res = await auth0.middleware(req); // mounts /auth/*, refreshes session
  if (req.nextUrl.pathname.startsWith("/auth")) return res;

  if (AUTHED.some((r) => r.test(req.nextUrl.pathname))) {
    const session = await auth0.getSession(req);
    if (!session) {
      const login = new URL("/auth/login", req.url);
      login.searchParams.set("returnTo", req.nextUrl.pathname);
      return NextResponse.redirect(login);
    }
    // NOTE: role check happens server-side in pages/routes via requireRole —
    // middleware can't hit the DB cheaply on every request (edge runtime).
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|mock|proof).*)"],
};
