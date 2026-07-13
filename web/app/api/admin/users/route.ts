import { requireRole, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { fail, ok } from "@/lib/api";

/** All users for the role-management table. Admin-only. */
export async function GET() {
  try {
    await requireRole("admin");
    const repo = await repoReady();
    return ok({ users: await repo.listUsers() });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
