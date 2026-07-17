// Where each role lives, and which paths it owns. Single source for post-auth routing, the portal
// guards (lib/guards.ts), and the returnTo allowlist — so "seller signs in ⇒ seller dashboard" is
// stated once instead of re-derived in every login path, layout, and redirect.
//
// Pure: no icons, no server imports. Client (LoginClient), server (guards), and tests all read it.
import type { Role } from "./db/types";

export const ROLE_HOME: Record<Role, string> = {
  seller: "/seller/dashboard",
  buyer: "/buyer/dashboard",
  admin: "/admin/dashboard",
};

export const ROLE_LABEL: Record<Role, string> = {
  seller: "seller portal",
  buyer: "marketplace",
  admin: "admin console",
};

/** Path prefixes each role owns. A path under someone else's prefix is off-limits (spec §6). */
export const ROLE_PREFIXES: Record<Role, string[]> = {
  seller: ["/seller"],
  buyer: ["/buyer"],
  admin: ["/admin"],
};

/** Every prefix owned by SOME role — anything else is shared (landing, login, /api/*). */
const OWNED: string[] = Object.values(ROLE_PREFIXES).flat();

function underPrefix(path: string, prefix: string): boolean {
  // Exact or a real segment boundary. Plain startsWith would let "/sellers-guide" match "/seller".
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Does `role` own `path`? False for another role's portal; true for shared paths. */
export function ownsPath(role: Role, path: string): boolean {
  const owner = OWNED.find((p) => underPrefix(path, p));
  if (!owner) return true; // shared page — every role may open it
  return ROLE_PREFIXES[role].includes(owner);
}

/**
 * Validate a `?returnTo=` before anyone is sent to it.
 *
 * Two failure modes this closes:
 *  - Open redirect: "//evil.com" and "https://evil.com" are both accepted by a naive
 *    `router.push(returnTo)`. Only same-origin absolute paths pass.
 *  - Cross-portal strand: a seller bounced off a buyer URL used to be handed straight back to that
 *    buyer URL after signing in, where the portal guard bounced them again. Send them to their own
 *    home instead of into a loop.
 */
export function safeReturnTo(returnTo: string | null | undefined, role: Role): string {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) return ROLE_HOME[role];
  const path = returnTo.split(/[?#]/)[0];
  return ownsPath(role, path) ? returnTo : ROLE_HOME[role];
}
