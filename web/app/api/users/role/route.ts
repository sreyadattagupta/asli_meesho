// DEMO PROVISION (CLAUDE.md §2): any signed-in user may self-select seller/buyer/admin so
// judges can hop personas. Production would gate admin by invite and seller by KYC — this
// endpoint would then only accept "buyer" and route the rest through admin-only grants.
import { getSessionUser, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { roleSelectSchema } from "@/lib/validation";
import { fail, ok } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail(401, "unauthenticated", "Sign in required.");
    const parsed = roleSelectSchema.safeParse(await req.json());
    if (!parsed.success) return fail(400, "invalid_role", "Role must be seller, buyer or admin.");
    const repo = await repoReady();
    let sellerId = user.sellerId;
    if (parsed.data.role === "seller" && !sellerId) {
      const seller = await repo.createSeller({
        userId: user.id, name: user.name, shopName: `${user.name}'s Shop`,
        trustScore: 40, trustBand: "low", kycStatus: "pending",
        isNew: true, passes: 0, fails: 0,
      });
      sellerId = seller.id;
    }
    const updated = await repo.setUserRole(user.id, parsed.data.role, sellerId);
    await repo.appendAudit({ actor: user.id, event: "role_selected", data: { role: parsed.data.role } });
    return ok({ user: updated });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
