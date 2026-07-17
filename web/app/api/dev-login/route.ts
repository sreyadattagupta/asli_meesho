import { NextRequest, NextResponse } from "next/server";
import { ROLE_HOME } from "@/lib/roles";
import type { Role } from "@/lib/db/types";

// Dev-only persona bypass — sets the `x-test-role` cookie the auth bypass reads, then redirects to
// the persona's home. Strictly gated: active ONLY when AUTH_TEST_BYPASS=1 and NODE_ENV != production
// (same guard as lib/auth.ts). Never reachable in a production build.
const BYPASS = process.env.AUTH_TEST_BYPASS === "1" && process.env.NODE_ENV !== "production";

// ROLE_HOME, not a local map: this route used to land sellers straight on the listing wizard, so the
// one path a developer or judge takes most often was also the one that broke the rule the rest of
// the app follows — a seller arrives at their dashboard and starts the agents deliberately.
function isRole(r: string): r is Role {
  return r === "seller" || r === "buyer" || r === "admin";
}

export async function GET(req: NextRequest) {
  if (!BYPASS) {
    return NextResponse.json(
      { error: { code: "forbidden", message: "Dev login is disabled." } }, { status: 403 });
  }
  const role = req.nextUrl.searchParams.get("role") ?? "";
  if (!isRole(role)) {
    return NextResponse.json(
      { error: { code: "bad_role", message: "role must be seller, buyer or admin." } }, { status: 400 });
  }
  const res = NextResponse.redirect(new URL(ROLE_HOME[role], req.url));
  res.cookies.set("x-test-role", role, { path: "/", sameSite: "lax" });
  return res;
}
