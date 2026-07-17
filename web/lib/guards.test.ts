// The portal guards. Middleware only proves a session exists, so these are the choke point that
// keeps one role out of another's pages — a buyer with a valid cookie must never be served the
// reviewer UI, and a seller must never be served the buyer's.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@/lib/db/types";

let caller: User | null = null;
let pathname = "/seller/dashboard";
const redirects: string[] = [];

vi.mock("@/lib/auth", () => ({ getSessionUser: async () => caller }));
vi.mock("next/headers", () => ({
  // Mirrors what middleware.ts stamps on every request.
  headers: async () => new Headers({ "x-pathname": pathname }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirects.push(to);
    // next/navigation's redirect throws to halt rendering; mimic that so the guard stops here.
    throw new Error(`REDIRECT:${to}`);
  },
}));

const { requirePortal, requireSeller, requireBuyer } = await import("@/lib/guards");

const user = (role: User["role"], sellerId?: string): User => ({
  id: "u1", auth0Sub: `email|${role}`, email: `${role}@x.test`, name: role, role, sellerId, createdAt: "",
});

beforeEach(() => {
  caller = null;
  redirects.length = 0;
  pathname = "/seller/dashboard";
});

describe("requirePortal", () => {
  it("sends a signed-out visitor to login, carrying the page they wanted", async () => {
    pathname = "/admin/review";
    await expect(requirePortal("admin")).rejects.toThrow(/REDIRECT/);
    expect(redirects[0]).toBe("/login?returnTo=%2Fadmin%2Freview");
  });

  it("keeps a BUYER out of the admin console", async () => {
    caller = user("buyer");
    await expect(requirePortal("admin")).rejects.toThrow(/REDIRECT/);
    expect(redirects[0]).toBe("/buyer/dashboard"); // their own home, not a dead end
  });

  it("keeps a SELLER out of the admin console", async () => {
    caller = user("seller", "s1");
    await expect(requirePortal("admin")).rejects.toThrow(/REDIRECT/);
    expect(redirects[0]).toBe("/seller/dashboard");
  });

  it("keeps a BUYER out of the seller portal", async () => {
    caller = user("buyer");
    await expect(requirePortal("seller")).rejects.toThrow(/REDIRECT/);
    expect(redirects[0]).toBe("/buyer/dashboard");
  });

  it("lets the matching role through", async () => {
    caller = user("admin");
    await expect(requirePortal("admin")).resolves.toMatchObject({ role: "admin" });
    expect(redirects).toHaveLength(0);
  });
});

describe("requireSeller", () => {
  it("sends a seller with no seller row to onboarding", async () => {
    // Role is right, but every seller page reads user.sellerId — there is nothing to render yet.
    caller = user("seller", undefined);
    await expect(requireSeller()).rejects.toThrow(/REDIRECT/);
    expect(redirects[0]).toBe("/onboarding");
  });

  it("lets a fully onboarded seller through", async () => {
    caller = user("seller", "s1");
    await expect(requireSeller()).resolves.toMatchObject({ sellerId: "s1" });
    expect(redirects).toHaveLength(0);
  });
});

describe("requireBuyer — the buyer's own pages", () => {
  it("sends an anonymous visitor to login", async () => {
    pathname = "/buyer/orders";
    await expect(requireBuyer()).rejects.toThrow(/REDIRECT/);
    expect(redirects[0]).toBe("/login?returnTo=%2Fbuyer%2Forders");
  });

  it("keeps a SELLER out of a buyer's order history", async () => {
    caller = user("seller", "s1");
    await expect(requireBuyer()).rejects.toThrow(/REDIRECT/);
    expect(redirects[0]).toBe("/seller/dashboard");
  });

  it("lets the buyer in", async () => {
    caller = user("buyer");
    await expect(requireBuyer()).resolves.toMatchObject({ role: "buyer" });
    expect(redirects).toHaveLength(0);
  });
});
