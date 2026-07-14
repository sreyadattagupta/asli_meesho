import { z } from "zod";
import { NextResponse } from "next/server";
import { accounts, normEmail, verifyPassword } from "@/lib/mongo";
import { ensureRepoUser, emailSub } from "@/lib/account";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";
import { fail } from "@/lib/api";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

/** Verify email + password against MongoDB, sync the app user, set the signed session cookie. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(400, "invalid_body", "Email and password are required.");
  const email = normEmail(parsed.data.email);

  const col = await accounts();
  const doc = await col.findOne({ email });
  // Same message for unknown-email and wrong-password — do not reveal which accounts exist.
  if (!doc || !verifyPassword(parsed.data.password, doc)) {
    return fail(401, "bad_credentials", "Wrong email or password.");
  }

  const user = await ensureRepoUser(email, doc.name, doc.role);
  const res = NextResponse.json({ user });
  res.cookies.set(SESSION_COOKIE, signSession(emailSub(email)), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE,
  });
  return res;
}
