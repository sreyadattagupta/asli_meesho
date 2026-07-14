import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

/** Clear the session cookie and return to the login screen. */
export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
