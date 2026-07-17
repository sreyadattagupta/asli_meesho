// Portal guards for server components (layouts + pages).
//
// Why here and not in middleware: middleware runs on the edge and cannot reach the database, so the
// only role it could enforce is one baked into the cookie — a claim that goes stale the moment an
// admin changes someone's role. These guards re-read the `users` row on every request, so role
// detection is database-driven (spec §9) and a demoted user loses access on their next navigation.
//
// Middleware still gates authentication (cheap, before render); API routes still call requireRole
// (defense in depth, CLAUDE.md §11). This layer decides which PORTAL a signed-in user may see.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "./auth";
import { ROLE_HOME } from "./roles";
import type { Role, User } from "./db/types";

/** The path being rendered. Middleware stamps it — server layouts aren't given the pathname. */
async function currentPath(): Promise<string> {
  const h = await headers();
  return h.get("x-pathname") || "/";
}

async function loginWithReturn(): Promise<never> {
  redirect(`/login?returnTo=${encodeURIComponent(await currentPath())}`);
}

/**
 * Require a signed-in user of exactly `role`.
 *
 * Wrong role ⇒ their OWN home, never a 403 wall: a buyer who lands on /seller/orders wanted the
 * marketplace, and bouncing them to a dead end is worse than routing them somewhere useful.
 */
export async function requirePortal(role: Role): Promise<User> {
  const user = await getSessionUser();
  if (!user) await loginWithReturn();
  if (user!.role !== role) redirect(ROLE_HOME[user!.role]);
  return user!;
}

/**
 * Seller portal guard. Same as requirePortal("seller") plus the onboarding gate: a seller account
 * with no seller row has nothing to render — every seller page reads `user.sellerId`.
 */
export async function requireSeller(): Promise<User & { sellerId: string }> {
  const user = await requirePortal("seller");
  if (!user.sellerId) redirect("/onboarding");
  return user as User & { sellerId: string };
}

/**
 * The buyer's OWN pages — orders, checkout, profile. Personal data, so buyer-only.
 *
 * Note what this deliberately does NOT cover: the product grid and product detail. Those are the
 * storefront, and a storefront is public — anonymous shoppers browse it, the landing page links
 * straight into it, and a seller opens their own live listing from My Listings to check what buyers
 * see. "Routes belonging to another role" means someone's account pages, not the shop window.
 */
export async function requireBuyer(): Promise<User> {
  return requirePortal("buyer");
}

/** The signed-in user, or null. For public pages that render differently when someone is known. */
export async function optionalUser(): Promise<User | null> {
  return getSessionUser();
}
