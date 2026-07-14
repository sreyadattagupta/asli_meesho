import { z } from "zod";
import { NextResponse } from "next/server";
import { accounts, normEmail, hashPassword } from "@/lib/mongo";
import { ensureRepoUser, emailSub } from "@/lib/account";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";
import { fail } from "@/lib/api";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().trim().min(1),
  // Self-registration is public + unauthenticated → NEVER allow "admin" here (privilege escalation).
  // Admin is provisioned only via the admin-only PATCH /api/admin/users/:id or the local dev-login bypass.
  role: z.enum(["seller", "buyer"]),
});

/** Create an account in MongoDB (reject duplicates), provision the app user, set the session cookie. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(400, "invalid_body", "Name, valid email and a 6+ char password are required.");
  const { password, name, role } = parsed.data;
  const email = normEmail(parsed.data.email);

  const col = await accounts();
  if (await col.findOne({ email })) return fail(409, "email_taken", "An account with this email already exists.");

  const { passwordHash, salt } = hashPassword(password);
  await col.insertOne({ email, passwordHash, salt, name, role, createdAt: new Date().toISOString() });

  const user = await ensureRepoUser(email, name, role);
  const res = NextResponse.json({ user });
  res.cookies.set(SESSION_COOKIE, signSession(emailSub(email)), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE,
  });
  return res;
}
