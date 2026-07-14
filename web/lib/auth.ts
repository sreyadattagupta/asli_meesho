import { cookies, headers } from "next/headers";
import { repoReady } from "./db";
import { verifySession, SESSION_COOKIE } from "./session";
import type { Role, User } from "./db/types";

// Strictly-gated E2E/demo auth bypass. NEVER active in production; requires the flag AND an
// explicit role (header `x-test-role` for Playwright, cookie `x-test-role` for manual browser use).
const BYPASS = process.env.AUTH_TEST_BYPASS === "1" && process.env.NODE_ENV !== "production";

async function bypassUser(role: Role): Promise<User> {
  const repo = await repoReady();
  const sub = `test|${role}`;
  let u = await repo.getUserByAuth0Sub(sub);
  if (!u) u = await repo.createUser({ auth0Sub: sub, email: `${role}@asli.demo`, name: `Demo ${role}`, role });
  if (role === "seller" && !u.sellerId) {
    const s = await repo.createSeller({
      userId: u.id, name: u.name, shopName: `${u.name}'s Shop`, trustScore: 40,
      trustBand: "low", kycStatus: "pending", isNew: true, passes: 0, fails: 0,
    });
    u = await repo.setUserRole(u.id, "seller", s.id);
  } else if (u.role !== role) {
    u = await repo.setUserRole(u.id, role, u.sellerId);
  }
  return u;
}

/** Our DB user for the current session (email+password signed JWT cookie); or the dev bypass user. */
export async function getSessionUser(): Promise<User | null> {
  if (BYPASS) {
    const [h, c] = await Promise.all([headers(), cookies()]);
    const role = h.get("x-test-role") ?? c.get("x-test-role")?.value;
    if (role === "seller" || role === "buyer" || role === "admin") return bypassUser(role);
  }
  const c = await cookies();
  const session = verifySession(c.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const repo = await repoReady();
  return repo.getUserByAuth0Sub(session.sub); // subject is `email|<email>`
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/** Per-route RBAC re-check (defense in depth — middleware only checks authentication). */
export async function requireRole(role: Role): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "unauthenticated", "Sign in required.");
  if (user.role !== role) throw new HttpError(403, "forbidden", `Requires ${role} role.`);
  return user;
}
