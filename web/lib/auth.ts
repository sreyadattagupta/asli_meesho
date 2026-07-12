import { auth0, authConfigured } from "./auth0";
import { repoReady } from "./db";
import type { Role, User } from "./db/types";

/** Our DB user for the current Auth0 session; auto-provisioned on first login. */
export async function getSessionUser(): Promise<User | null> {
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
