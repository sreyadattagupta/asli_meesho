// Admin role management — list + patch, RBAC-gated.
import { describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/db/types";

const sessionUser: User = {
  id: "admin1", auth0Sub: "a", email: "a@x.com", name: "Admin", role: "admin", createdAt: "",
};

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    getSessionUser: vi.fn(async () => sessionUser),
    requireRole: vi.fn(async (role: string) => {
      if (sessionUser.role !== role) throw new actual.HttpError(403, "forbidden", `Requires ${role} role.`);
      return sessionUser;
    }),
  };
});

import { GET } from "@/app/api/admin/users/route";
import { PATCH } from "@/app/api/admin/users/[id]/route";
import { repoReady } from "@/lib/db";

const patch = (id: string, body: unknown) =>
  PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });

describe("admin users API", () => {
  it("lists users for admins", async () => {
    const repo = await repoReady();
    await repo.createUser({ auth0Sub: `t|${crypto.randomUUID()}`, email: "x@x.com", name: "X", role: "buyer" });
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).users.length).toBeGreaterThan(0);
  });

  it("promotes a buyer to seller and provisions a seller record", async () => {
    const repo = await repoReady();
    const u = await repo.createUser({ auth0Sub: `t|${crypto.randomUUID()}`, email: "s@x.com", name: "S", role: "buyer" });
    const res = await patch(u.id, { role: "seller" });
    expect(res.status).toBe(200);
    const { user } = await res.json();
    expect(user.role).toBe("seller");
    expect(user.sellerId).toBeTruthy();
  });

  it("400s on an invalid role", async () => {
    const repo = await repoReady();
    const u = await repo.createUser({ auth0Sub: `t|${crypto.randomUUID()}`, email: "z@x.com", name: "Z", role: "buyer" });
    expect((await patch(u.id, { role: "root" })).status).toBe(400);
  });

  it("non-admin → 403", async () => {
    sessionUser.role = "buyer";
    expect((await GET()).status).toBe(403);
    sessionUser.role = "admin";
  });
});
