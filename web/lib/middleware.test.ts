import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";

// The middleware verifies with Web Crypto (edge runtime); the signer here mirrors lib/session.ts
// (node:crypto) so the test proves the two agree on the same token format.
import crypto from "crypto";

// middleware.ts resolves SECRET at module load, so the env must be set BEFORE it is imported —
// hence the dynamic import in beforeAll rather than a static one at the top.
type Middleware = (typeof import("../middleware"))["middleware"];
let middleware: Middleware;

const SECRET = "test-secret-for-middleware";
const b64url = (s: crypto.BinaryLike | string) => Buffer.from(s as string).toString("base64url");

function sign(sub: string, expOffsetSec: number, secret = SECRET): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ sub, iat: now, exp: now + expOffsetSec }));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function req(cookie?: string) {
  const r = new NextRequest("http://localhost:3000/sell");
  if (cookie) r.cookies.set("asli_session", cookie);
  return r;
}

const redirectsToLogin = (res: Response) =>
  res.status >= 300 && res.status < 400 && (res.headers.get("location") ?? "").includes("/login");

beforeAll(async () => {
  process.env.SESSION_SECRET = SECRET;
  ({ middleware } = await import("../middleware"));
});

describe("middleware session gate", () => {
  it("lets a validly signed, unexpired session through", async () => {
    const res = await middleware(req(sign("email|a@b.test", 3600)));
    expect(redirectsToLogin(res)).toBe(false);
  });

  it("redirects when there is no cookie at all", async () => {
    expect(redirectsToLogin(await middleware(req()))).toBe(true);
  });

  it("redirects a cookie signed with the wrong secret", async () => {
    // The real bug: presence-only checks admit any string. A cookie from another environment (or a
    // forged one) rendered the seller UI while every route under it 401'd.
    const foreign = sign("email|a@b.test", 3600, "some-other-environments-secret");
    expect(redirectsToLogin(await middleware(req(foreign)))).toBe(true);
  });

  it("redirects an expired session", async () => {
    expect(redirectsToLogin(await middleware(req(sign("email|a@b.test", -60))))).toBe(true);
  });

  it("redirects a garbage cookie value", async () => {
    expect(redirectsToLogin(await middleware(req("not-a-jwt")))).toBe(true);
  });

  it("leaves public routes alone", async () => {
    const r = new NextRequest("http://localhost:3000/shop");
    expect(redirectsToLogin(await middleware(r))).toBe(false);
  });
});
