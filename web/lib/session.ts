// Signed-JWT session (HS256) — replaces Auth0. Hand-rolled with node:crypto so we add no new
// dependency (the PPT's "JWT" claim stays honest). Node runtime only (routes / server components);
// the middleware checks cookie presence by name and does NOT import this (edge has no node:crypto).
import crypto from "crypto";

export const SESSION_COOKIE = "asli_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const SECRET =
  process.env.SESSION_SECRET || process.env.AUTH0_SECRET || "dev-insecure-change-me";

const b64url = (s: Buffer | string) => Buffer.from(s).toString("base64url");

/** Sign a session token carrying the user's stable subject (`email|<email>`). */
export function signSession(sub: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ sub, iat: now, exp: now + SESSION_MAX_AGE }));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

/** Verify signature + expiry; returns the subject or null. Timing-safe signature compare. */
export function verifySession(token: string | undefined): { sub: string } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, b, s] = parts;
  const expected = crypto.createHmac("sha256", SECRET).update(`${h}.${b}`).digest("base64url");
  const sBuf = Buffer.from(s);
  const eBuf = Buffer.from(expected);
  if (sBuf.length !== eBuf.length || !crypto.timingSafeEqual(sBuf, eBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(b, "base64url").toString()) as { sub?: string; exp?: number };
    if (!payload.sub) return null;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}
