import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/db/types";

const sessionUser: User = {
  id: "", auth0Sub: "", email: "s@x.com", name: "S", role: "seller", createdAt: "",
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

import { POST } from "@/app/api/listings/route";
import { GET as GET_ONE } from "@/app/api/listings/[id]/route";
import { repoReady } from "@/lib/db";

const validBody = { title: "Cotton Kurti — Rose", price: 349, category: "kurtis" };

function post(body: unknown): Promise<Response> {
  return POST(new Request("http://x/api/listings", { method: "POST", body: JSON.stringify(body) }));
}

describe("listings API", () => {
  beforeEach(async () => {
    const repo = await repoReady();
    const seller = await repo.createSeller({
      name: "S", shopName: "S Shop", trustScore: 40, trustBand: "low",
      kycStatus: "pending", isNew: true, passes: 0, fails: 0,
    });
    const u = await repo.createUser({
      auth0Sub: `test|${crypto.randomUUID()}`, email: "s@x.com", name: "S", role: "seller",
    });
    const linked = await repo.setUserRole(u.id, "seller", seller.id);
    Object.assign(sessionUser, linked);
  });

  it("creates a draft and returns listingId + flowStep upload", async () => {
    const res = await post(validBody);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listingId).toBeTruthy();
    expect(body.flowStep).toBe("upload");
    const repo = await repoReady();
    const listing = await repo.getListing(body.listingId);
    expect(listing?.status).toBe("draft");
    expect(listing?.sellerId).toBe(sessionUser.sellerId);
  });

  it("400s on invalid body", async () => {
    const res = await post({ title: "x" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_body");
  });

  it("403s for non-seller role", async () => {
    const prev = sessionUser.role;
    sessionUser.role = "buyer";
    const res = await post(validBody);
    sessionUser.role = prev;
    expect(res.status).toBe(403);
  });

  it("GET returns the bundle with trust score", async () => {
    const created = await (await post(validBody)).json();
    const res = await GET_ONE(
      new Request(`http://x/api/listings/${created.listingId}`),
      { params: Promise.resolve({ id: created.listingId }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listing.id).toBe(created.listingId);
    expect(Array.isArray(body.images)).toBe(true);
    expect(Array.isArray(body.checks)).toBe(true);
    expect(typeof body.trustScore).toBe("number");
  });

  it("GET 404s for unknown id", async () => {
    const res = await GET_ONE(
      new Request("http://x/api/listings/nope"),
      { params: Promise.resolve({ id: "nope" }) },
    );
    expect(res.status).toBe(404);
  });
});
