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
import { GET as GET_ONE, PATCH } from "@/app/api/listings/[id]/route";
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

  it("creates an UNTITLED draft from an empty body", async () => {
    // The wizard posts {} the moment the catalog photo is chosen: the row has to exist for the
    // agents to write checks against, but the seller types the title later (after Agent 1 and 2).
    const res = await post({});
    expect(res.status).toBe(200);
    const repo = await repoReady();
    const listing = await repo.getListing((await res.json()).listingId);
    expect(listing?.title).toBe("");
    expect(listing?.status).toBe("draft");
  });

  it("400s on a body that is present but invalid", async () => {
    const res = await post({ price: -5 });
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

  describe("PATCH — MRP must beat the selling price", () => {
    // A struck-through price at or below what you actually charge is a fake discount. The database
    // has the same constraint; these cover the API answering with something the seller can act on
    // rather than letting the violation escape as a 500.
    const patch = async (id: string, body: unknown) =>
      PATCH(new Request(`http://x/api/listings/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
        { params: Promise.resolve({ id }) });

    it("accepts an MRP above the price", async () => {
      const { listingId } = await (await post(validBody)).json();
      const res = await patch(listingId, { price: 749, mrp: 1299, stock: 3, sku: "K-1" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.mrp).toBe(1299);
      expect(body.stock).toBe(3);
    });

    it("400s when both arrive in one PATCH and the MRP is lower", async () => {
      const { listingId } = await (await post(validBody)).json();
      const res = await patch(listingId, { price: 749, mrp: 100 });
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_mrp");
    });

    it("400s when only the MRP is sent and the STORED price is higher", async () => {
      // The half-PATCH zod cannot see: price comes from the row, so the rule needs the merged view.
      const { listingId } = await (await post(validBody)).json(); // price 349
      const res = await patch(listingId, { mrp: 200 });
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_mrp");
    });

    it("400s when only the PRICE is sent and it rises above the stored MRP", async () => {
      const { listingId } = await (await post(validBody)).json();
      await patch(listingId, { mrp: 500 });
      const res = await patch(listingId, { price: 900 });
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_mrp");
    });
  });

  it("GET 404s for unknown id", async () => {
    const res = await GET_ONE(
      new Request("http://x/api/listings/nope"),
      { params: Promise.resolve({ id: "nope" }) },
    );
    expect(res.status).toBe(404);
  });
});
