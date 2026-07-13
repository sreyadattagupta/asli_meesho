// Admin metrics — exact numbers over the seeded repo.
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

import { GET } from "@/app/api/admin/metrics/route";

describe("GET /api/admin/metrics", () => {
  it("computes tiles from seeded data", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const m = await res.json();
    expect(m.verified).toBe(7); // live ∧ verified seed listings
    expect(m.blocked).toBe(1);
    expect(m.avgTrust).toBe(61); // (88+55+40)/3
    expect(m.escalationRate).toBeCloseTo(0.2); // 2 pending / 10 orchestrator decisions
    expect(m.returnsPrevented).toBe(4); // round(7 * 0.5)
  });

  it("403s for non-admins", async () => {
    sessionUser.role = "buyer";
    const res = await GET();
    expect(res.status).toBe(403);
    sessionUser.role = "admin";
  });
});
