import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionUser = {
  id: "", auth0Sub: "", email: "e@x.com", name: "E", role: "buyer", createdAt: "",
};

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, getSessionUser: vi.fn(async () => sessionUser) };
});

import { POST } from "@/app/api/users/role/route";
import { repoReady } from "@/lib/db";

describe("POST /api/users/role", () => {
  beforeEach(async () => {
    // fresh DB user per test — the mocked session points at it
    const repo = await repoReady();
    const u = await repo.createUser({
      auth0Sub: `test|${crypto.randomUUID()}`, email: "e@x.com", name: "E", role: "buyer",
    });
    sessionUser.id = u.id;
    sessionUser.auth0Sub = u.auth0Sub;
    sessionUser.role = "buyer";
  });

  it("sets seller role and creates a seller record", async () => {
    const res = await POST(new Request("http://x/api/users/role", {
      method: "POST", body: JSON.stringify({ role: "seller" }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.role).toBe("seller");
    expect(body.user.sellerId).toBeTruthy();
  });

  it("400s on bad role", async () => {
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ role: "root" }) }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_role");
  });
});
