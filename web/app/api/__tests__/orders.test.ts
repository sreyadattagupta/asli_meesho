// Orders API — mock commerce (labelled simulated). Ownership + lifecycle.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/db/types";

const sessionUser: User = {
  id: "", auth0Sub: "", email: "b@x.com", name: "B", role: "buyer", createdAt: "",
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

import { POST as CREATE } from "@/app/api/orders/route";
import { GET as GET_ONE } from "@/app/api/orders/[id]/route";
import { POST as ADVANCE } from "@/app/api/orders/[id]/advance/route";
import { repoReady } from "@/lib/db";

const address = { name: "B", line1: "12 MG Road", city: "Pune", pincode: "411001" };
let listingId = "";

function create(body: unknown): Promise<Response> {
  return CREATE(new Request("http://x/api/orders", { method: "POST", body: JSON.stringify(body) }));
}
const withId = (id: string) => ({ params: Promise.resolve({ id }) });

describe("orders API", () => {
  beforeEach(async () => {
    const repo = await repoReady();
    const u = await repo.createUser({
      auth0Sub: `test|${crypto.randomUUID()}`, email: "b@x.com", name: "B", role: "buyer",
    });
    Object.assign(sessionUser, u, { role: "buyer" });
    const live = await repo.listListings({ status: "live", verified: true });
    listingId = live[0].id;
  });

  it("creates an order and links the listing promise", async () => {
    const res = await create({ listingId, paymentMethod: "cod", address });
    expect(res.status).toBe(200);
    const { orderId } = await res.json();
    expect(orderId).toBeTruthy();
    const repo = await repoReady();
    const order = await repo.getOrder(orderId);
    expect(order?.status).toBe("placed");
    expect(order?.buyerUserId).toBe(sessionUser.id);
  });

  it("400s on bad address", async () => {
    const res = await create({ listingId, paymentMethod: "cod", address: { name: "B" } });
    expect(res.status).toBe(400);
  });

  it("404s on unknown listing", async () => {
    const res = await create({ listingId: "nope", paymentMethod: "cod", address });
    expect(res.status).toBe(404);
  });

  it("GET returns own order; other buyer gets 404", async () => {
    const { orderId } = await (await create({ listingId, paymentMethod: "upi_mock", address })).json();
    const mine = await GET_ONE(new Request("http://x"), withId(orderId));
    expect(mine.status).toBe(200);
    expect((await mine.json()).order.id).toBe(orderId);

    const repo = await repoReady();
    const other = await repo.createUser({
      auth0Sub: `test|${crypto.randomUUID()}`, email: "o@x.com", name: "O", role: "buyer",
    });
    Object.assign(sessionUser, other, { role: "buyer" });
    const theirs = await GET_ONE(new Request("http://x"), withId(orderId));
    expect(theirs.status).toBe(404);
  });

  it("advance walks placed→shipped→delivered and stays delivered", async () => {
    const { orderId } = await (await create({ listingId, paymentMethod: "cod", address })).json();
    expect((await (await ADVANCE(new Request("http://x"), withId(orderId))).json()).order.status).toBe("shipped");
    expect((await (await ADVANCE(new Request("http://x"), withId(orderId))).json()).order.status).toBe("delivered");
    const again = await (await ADVANCE(new Request("http://x"), withId(orderId))).json();
    expect(again.order.status).toBe("delivered");
    expect(again.order.deliveredAt).toBeTruthy();
  });
});
