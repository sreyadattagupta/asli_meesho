import { cookies, headers } from "next/headers";
import { auth0, authConfigured } from "./auth0";
import { repoReady } from "./db";
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

/** Our DB user for the current Auth0 session; auto-provisioned on first login. */
export async function getSessionUser(): Promise<User | null> {
  if (BYPASS) {
    const [h, c] = await Promise.all([headers(), cookies()]);
    const role = h.get("x-test-role") ?? c.get("x-test-role")?.value;
    if (role === "seller" || role === "buyer" || role === "admin") return bypassUser(role);
  }
  if (!authConfigured) return null; // tenant env not filled — treat as signed-out
  const session = await auth0.getSession();
  if (!session) return null;
  const repo = await repoReady();
  const sub = session.user.sub!;
  const existing = await repo.getUserByAuth0Sub(sub);
  if (existing) return existing;
  return repo.createUser({
    auth0Sub: sub,
    email: session.user.email ?? "",
    name: session.user.name ?? "Guest",
    role: "buyer", // provisional until /onboarding confirms
  });
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
