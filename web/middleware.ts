import { NextRequest, NextResponse } from "next/server";

// Session cookie name — literal here (must not import lib/session, which uses node:crypto and would
// break the edge middleware bundle). Kept in sync with lib/session.ts SESSION_COOKIE.
const SESSION_COOKIE = "asli_session";

// /seller is listed separately even though /^\/sell/ already matches it by prefix — that overlap is
// an accident, and renaming /sell would silently unprotect the whole seller portal.
const AUTHED = [/^\/sell/, /^\/seller/, /^\/admin/, /^\/checkout/, /^\/orders/, /^\/onboarding/];

// Strictly-gated E2E/demo bypass — never active in production; requires the flag AND an explicit
// x-test-role (header for Playwright, cookie for manual use). Mirrors lib/auth.ts getSessionUser.
const BYPASS = process.env.AUTH_TEST_BYPASS === "1" && process.env.NODE_ENV !== "production";

// Must match lib/session.ts SECRET resolution — a different fallback here would verify against the
// wrong key and redirect every valid session.
const SECRET = process.env.SESSION_SECRET || process.env.AUTH0_SECRET || "dev-insecure-change-me";

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * Verify the session the same way lib/session.ts does, but with Web Crypto so it runs on the edge.
 *
 * This used to be a presence check ("is the cookie there?"), which admits ANY string: a cookie signed
 * by another environment's secret, a forged one, or an expired one all rendered the gated UI while
 * every route beneath it 401'd from requireRole. Not an auth hole — the routes were still safe — but
 * the user got a broken shell instead of a clean redirect to login. Verify here too.
 */
async function sessionIsValid(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [h, b, sig] = token.split(".");
  if (!h || !b || !sig) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlToBytes(sig),
      new TextEncoder().encode(`${h}.${b}`),
    );
    if (!ok) return false;
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(b))) as {
      sub?: string;
      exp?: number;
    };
    if (!payload.sub) return false;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false; // malformed token ⇒ treat as signed out, never as authenticated
  }
}

export async function middleware(req: NextRequest) {
  if (BYPASS && (req.headers.get("x-test-role") ?? req.cookies.get("x-test-role")?.value)) {
    return NextResponse.next(); // authenticated by the test bypass
  }

  if (AUTHED.some((r) => r.test(req.nextUrl.pathname))) {
    // Signature + expiry checked here; requireRole (node runtime) still re-checks per route and owns
    // the role decision — this gate only keeps signed-out users out of the shell.
    if (!(await sessionIsValid(req.cookies.get(SESSION_COOKIE)?.value))) {
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
