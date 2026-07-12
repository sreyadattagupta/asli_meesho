import { getSessionUser } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { fail, ok } from "@/lib/api";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return fail(401, "unauthenticated", "Sign in required.");
    let kycStatus;
    if (user.sellerId) {
      const repo = await repoReady();
      kycStatus = (await repo.getSeller(user.sellerId))?.kycStatus;
    }
    return ok({ role: user.role, name: user.name, sellerId: user.sellerId, kycStatus });
  } catch {
    return fail(500, "internal", "Something went wrong.");
  }
}
