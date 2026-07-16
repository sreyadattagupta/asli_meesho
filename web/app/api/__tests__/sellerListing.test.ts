// Seller listing CRUD — ownership and privilege boundaries.
// These are the tests that matter for a multi-tenant portal: everything else is cosmetics.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { repoReady } from "@/lib/db";
import type { User } from "@/lib/db/types";

let caller: User | null = null;

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    requireRole: async (role: string) => {
      if (!caller) throw new actual.HttpError(401, "unauthenticated", "Sign in required.");
      if (caller.role !== role) throw new actual.HttpError(403, "forbidden", `Requires ${role} role.`);
      return caller;
    },
  };
});

const { PATCH, DELETE } = await import("../listings/[id]/route");

const req = (body?: unknown) =>
  new Request("http://x/api/listings/x", {
    method: "PATCH",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function seedTwoSellers() {
  const repo = await repoReady();
  const mine = await repo.createSeller({
    name: "Mine", shopName: "Mine", trustScore: 50, trustBand: "medium",
    kycStatus: "verified", isNew: false, passes: 0, fails: 0,
  });
  const theirs = await repo.createSeller({
    name: "Theirs", shopName: "Theirs", trustScore: 50, trustBand: "medium",
    kycStatus: "verified", isNew: false, passes: 0, fails: 0,
  });
  const listing = await repo.createListing({
    sellerId: theirs.id, title: "Someone else's kurti", description: "", price: 499,
    category: "kurtis", status: "live", flowStep: "live", verified: true, rankBoost: 0,
  });
  const own = await repo.createListing({
    sellerId: mine.id, title: "My kurti", description: "", price: 399,
    category: "kurtis", status: "draft", flowStep: "upload", verified: false, rankBoost: 0,
  });
  return { repo, mine, theirs, listing, own };
}

beforeEach(() => { caller = null; });

describe("PATCH /api/listings/:id", () => {
  it("404s on another seller's listing — and does not mutate it", async () => {
    const { repo, mine, listing } = await seedTwoSellers();
    caller = { id: "u1", auth0Sub: "email|a", email: "a@b.c", name: "A", role: "seller", sellerId: mine.id, createdAt: "" };
    const res = await PATCH(req({ price: 1 }), ctx(listing.id));
    expect(res.status).toBe(404); // 404 not 403 — a 403 would confirm the id exists
    expect((await repo.getListing(listing.id))?.price).toBe(499);
  });

  it("rejects a seller trying to mark their own listing verified", async () => {
    // The ✓ badge is the agents' to give. If a PATCH could set it, the product has no premise.
    const { repo, mine, own } = await seedTwoSellers();
    caller = { id: "u1", auth0Sub: "email|a", email: "a@b.c", name: "A", role: "seller", sellerId: mine.id, createdAt: "" };
    const res = await PATCH(req({ verified: true }), ctx(own.id));
    expect(res.status).toBe(400);
    expect((await repo.getListing(own.id))?.verified).toBe(false);
  });

  it("lets a seller edit their own listing", async () => {
    const { repo, mine, own } = await seedTwoSellers();
    caller = { id: "u1", auth0Sub: "email|a", email: "a@b.c", name: "A", role: "seller", sellerId: mine.id, createdAt: "" };
    const res = await PATCH(req({ price: 429, status: "live" }), ctx(own.id));
    expect(res.status).toBe(200);
    const after = await repo.getListing(own.id);
    expect(after?.price).toBe(429);
    expect(after?.status).toBe("live");
  });

  it("401s when signed out", async () => {
    const { own } = await seedTwoSellers();
    expect((await PATCH(req({ price: 1 }), ctx(own.id))).status).toBe(401);
  });
});

describe("DELETE /api/listings/:id", () => {
  it("archives instead of deleting, so orders and the audit trail survive", async () => {
    const { repo, mine, own } = await seedTwoSellers();
    caller = { id: "u1", auth0Sub: "email|a", email: "a@b.c", name: "A", role: "seller", sellerId: mine.id, createdAt: "" };
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx(own.id));
    expect(res.status).toBe(200);
    const after = await repo.getListing(own.id);
    expect(after).not.toBeNull();          // row still there for orders/audit to reference
    expect(after?.status).toBe("archived"); // and gone from the live feed
  });

  it("404s on another seller's listing", async () => {
    const { repo, mine, listing } = await seedTwoSellers();
    caller = { id: "u1", auth0Sub: "email|a", email: "a@b.c", name: "A", role: "seller", sellerId: mine.id, createdAt: "" };
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx(listing.id));
    expect(res.status).toBe(404);
    expect((await repo.getListing(listing.id))?.status).toBe("live");
  });
});
