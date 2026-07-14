// Bridges a Mongo account to the app-repo User the rest of the system reads. The session subject is
// `email|<email>`; the User row (and, for sellers, a Seller row) is created on first sign-in so
// listings / orders / trust all keep flowing through the existing repo unchanged.
import { repoReady } from "./db";
import type { Role, User } from "./db/types";

export const emailSub = (email: string) => `email|${email}`;

/** Find-or-create the repo User for this account; provisions a cold-start Seller row for sellers. */
export async function ensureRepoUser(email: string, name: string, role: Role): Promise<User> {
  const repo = await repoReady();
  const sub = emailSub(email);
  let user = await repo.getUserByAuth0Sub(sub);
  if (!user) user = await repo.createUser({ auth0Sub: sub, email, name, role });

  if (role === "seller" && !user.sellerId) {
    const seller = await repo.createSeller({
      userId: user.id, name: user.name, shopName: `${user.name}'s Shop`, trustScore: 40,
      trustBand: "low", kycStatus: "pending", isNew: true, passes: 0, fails: 0,
    });
    user = await repo.setUserRole(user.id, "seller", seller.id);
  } else if (user.role !== role) {
    user = await repo.setUserRole(user.id, role, user.sellerId);
  }
  return user;
}
