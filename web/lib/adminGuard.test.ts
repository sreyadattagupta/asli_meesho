// The admin console's role guard. A buyer or seller with a valid session must never be served the
// reviewer UI: middleware only proves you are signed in, so the layout is the choke point.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@/lib/db/types";

let caller: User | null = null;
const redirects: string[] = [];

vi.mock("@/lib/auth", () => ({ getSessionUser: async () => caller }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirects.push(to);
    // next/navigation's redirect throws to halt rendering; mimic that so the layout stops here.
    throw new Error(`REDIRECT:${to}`);
  },
}));

const AdminLayout = (await import("@/app/admin/layout")).default;

const user = (role: User["role"]): User => ({
  id: "u1", auth0Sub: `email|${role}`, email: `${role}@x.test`, name: role, role, createdAt: "",
});

async function render() {
  // The layout is an async server component; invoking it runs the guard.
  return AdminLayout({ children: null });
}

beforeEach(() => { caller = null; redirects.length = 0; });

describe("admin layout role guard", () => {
  it("redirects a signed-out visitor to login", async () => {
    await expect(render()).rejects.toThrow(/REDIRECT/);
    expect(redirects[0]).toBe("/login?returnTo=/admin");
  });

  it("keeps a BUYER out of the admin console", async () => {
    caller = user("buyer");
    await expect(render()).rejects.toThrow(/REDIRECT/);
    expect(redirects[0]).toBe("/shop"); // their own home, not a dead end
  });

  it("keeps a SELLER out of the admin console", async () => {
    caller = user("seller");
    await expect(render()).rejects.toThrow(/REDIRECT/);
    expect(redirects[0]).toBe("/seller");
  });

  it("lets an admin through", async () => {
    caller = user("admin");
    await expect(render()).resolves.toBeTruthy();
    expect(redirects).toHaveLength(0);
  });
});
