import { NextRequest, NextResponse } from "next/server";

// Dev-only persona bypass — sets the `x-test-role` cookie the auth bypass reads, then redirects to
// the persona's home. Strictly gated: active ONLY when AUTH_TEST_BYPASS=1 and NODE_ENV != production
// (same guard as lib/auth.ts). Never reachable in a production build.
const BYPASS = process.env.AUTH_TEST_BYPASS === "1" && process.env.NODE_ENV !== "production";

const HOME: Record<string, string> = { seller: "/sell", buyer: "/shop", admin: "/admin" };

export async function GET(req: NextRequest) {
  if (!BYPASS) {
    return NextResponse.json(
      { error: { code: "forbidden", message: "Dev login is disabled." } }, { status: 403 });
  }
  const role = req.nextUrl.searchParams.get("role") ?? "";
  if (!(role in HOME)) {
    return NextResponse.json(
      { error: { code: "bad_role", message: "role must be seller, buyer or admin." } }, { status: 400 });
  }
  const res = NextResponse.redirect(new URL(HOME[role], req.url));
  res.cookies.set("x-test-role", role, { path: "/", sameSite: "lax" });
  return res;
}
