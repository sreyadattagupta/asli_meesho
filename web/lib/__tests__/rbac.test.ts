// RBAC defense-in-depth matrix — every gated route rejects the wrong role at the handler.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role, User } from "@/lib/db/types";

let current: User | null = null;
const user = (role: Role): User => ({
  id: `u-${role}`, auth0Sub: role, email: `${role}@x.com`, name: role,
  role, sellerId: role === "seller" ? "s1" : undefined, createdAt: "",
});

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    getSessionUser: vi.fn(async () => current),
    requireRole: vi.fn(async (role: string) => {
      if (!current) throw new actual.HttpError(401, "unauthenticated", "Sign in required.");
      if (current.role !== role) throw new actual.HttpError(403, "forbidden", `Requires ${role} role.`);
      return current;
    }),
  };
});

import { GET as METRICS } from "@/app/api/admin/metrics/route";
import { GET as QUEUE } from "@/app/api/review/queue/route";
import { GET as ADMIN_USERS } from "@/app/api/admin/users/route";
import { POST as CREATE_LISTING } from "@/app/api/listings/route";

type Case = { name: string; call: () => Promise<Response>; allow: Role };
const listingBody = () =>
  new Request("http://x", { method: "POST", body: JSON.stringify({ title: "A valid title", price: 200, category: "kurtis" }) });

const cases: Case[] = [
  { name: "GET /admin/metrics", call: () => METRICS(), allow: "admin" },
  { name: "GET /review/queue", call: () => QUEUE(), allow: "admin" },
  { name: "GET /admin/users", call: () => ADMIN_USERS(), allow: "admin" },
  { name: "POST /listings", call: () => CREATE_LISTING(listingBody()), allow: "seller" },
];
const roles: (Role | "anon")[] = ["anon", "seller", "buyer", "admin"];

describe("RBAC matrix", () => {
  beforeEach(() => { current = null; });

  for (const c of cases) {
    for (const role of roles) {
      it(`${c.name} — ${role} → ${role === c.allow ? "allowed" : role === "anon" ? "401" : "403"}`, async () => {
        current = role === "anon" ? null : user(role);
        const res = await c.call();
        if (role === c.allow) {
          expect(res.status).toBeLessThan(400);
        } else if (role === "anon") {
          expect(res.status).toBe(401);
        } else {
          expect(res.status).toBe(403);
        }
      });
    }
  }
});
