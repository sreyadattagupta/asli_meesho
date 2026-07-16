// Bridges a Mongo account to the app-repo User the rest of the system reads. The session subject is
// `email|<email>`; the User row (and, for sellers, a Seller row) is created on first sign-in so
// listings / orders / trust all keep flowing through the existing repo unchanged.
//
// MongoDB owns the LINK, not just the credentials: the account doc carries the seller's `sellerId`
// and `shopName`. Everything a seller owns — listings, orders, measurements, trust events — is keyed
// by sellerId, so if that id lived only in the app store, rebuilding that store would mint a fresh
// one on the next sign-in and silently orphan every product the seller had listed. Reading it back
// from the account keeps "who signed in" and "whose products these are" the same answer across
// restarts and across backends.
import { accounts } from "./mongo";
import { repoReady } from "./db";
import type { Role, User } from "./db/types";

export const emailSub = (email: string) => `email|${email}`;

/**
 * Find-or-create the repo User for this account.
 *
 * For sellers the identity resolves in this order:
 *   1. the User row already carries a sellerId → use it;
 *   2. the Mongo account remembers one → RESTORE that seller (recreating the row under the same id
 *      if the app store no longer has it) so existing listings stay attached;
 *   3. neither → mint one and write it back to the account, so step 2 works next time.
 */
export async function ensureRepoUser(email: string, name: string, role: Role): Promise<User> {
  const repo = await repoReady();
  const sub = emailSub(email);
  let user = await repo.getUserByAuth0Sub(sub);
  if (!user) user = await repo.createUser({ auth0Sub: sub, email, name, role });

  if (role !== "seller") {
    if (user.role !== role) user = await repo.setUserRole(user.id, role, user.sellerId);
    return user;
  }
  if (user.sellerId) {
    return user.role === role ? user : repo.setUserRole(user.id, role, user.sellerId);
  }

  const col = await accounts();
  const doc = await col.findOne({ email });
  const shopName = doc?.shopName ?? `${name}'s Shop`;
  const remembered = doc?.sellerId;
  let sellerId = remembered;

  if (remembered) {
    // The account already knows this seller — make sure a row exists under that exact id.
    const existing = await repo.getSeller(remembered);
    if (!existing) {
      const restored = await repo.createSeller({
        id: remembered, userId: user.id, name, shopName, trustScore: 40, trustBand: "low",
        kycStatus: "pending", isNew: true, passes: 0, fails: 0,
      });
      sellerId = restored.id;
    }
  } else {
    const created = await repo.createSeller({
      userId: user.id, name, shopName, trustScore: 40, trustBand: "low",
      kycStatus: "pending", isNew: true, passes: 0, fails: 0,
    });
    sellerId = created.id;
    // Remember it against the login so this account keeps the same seller identity for good.
    await col.updateOne({ email }, { $set: { sellerId, shopName } });
  }

  return repo.setUserRole(user.id, "seller", sellerId);
}
