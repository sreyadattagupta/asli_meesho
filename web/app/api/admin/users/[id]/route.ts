import { requireRole, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { roleSelectSchema } from "@/lib/validation";
import { fail, ok } from "@/lib/api";

/** Change a user's role (demo provision — production Admin is invite-only). Admin-only. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole("admin");
    const { id } = await params;
    const parsed = roleSelectSchema.safeParse(await req.json());
    if (!parsed.success) return fail(400, "invalid_role", "Role must be seller, buyer or admin.");
    const repo = await repoReady();

    const target = (await repo.listUsers()).find((u) => u.id === id);
    if (!target) return fail(404, "not_found", "User not found.");

    // Promoting to seller provisions a seller record if the user lacks one (mirrors self-onboarding).
    let sellerId = target.sellerId;
    if (parsed.data.role === "seller" && !sellerId) {
      const seller = await repo.createSeller({
        userId: target.id, name: target.name, shopName: `${target.name}'s Shop`,
        trustScore: 40, trustBand: "low", kycStatus: "pending", isNew: true, passes: 0, fails: 0,
      });
      sellerId = seller.id;
    }
    const updated = await repo.setUserRole(id, parsed.data.role, sellerId);
    await repo.appendAudit({
      actor: admin.id, event: "role_changed",
      data: { targetUserId: id, role: parsed.data.role },
    });
    return ok({ user: updated });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
