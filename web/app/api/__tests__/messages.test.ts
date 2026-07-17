// Message threads are order-scoped, and the participant rule is the only thing between a thread and
// any other signed-in user who can guess an order id. These tests are that rule.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/db/types";

// The caller each route sees. Reassigned per test to play buyer / seller / outsider.
let caller: User | null = null;

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, getSessionUser: vi.fn(async () => caller) };
});

const { GET, POST } = await import("@/app/api/messages/route");
const { GET: THREADS } = await import("@/app/api/messages/threads/route");
const { GET: COUNT } = await import("@/app/api/notifications/count/route");
const { repoReady } = await import("@/lib/db");
const { resetRateLimiter } = await import("@/lib/rateLimit");

const post = (body: unknown) =>
  POST(new Request("http://x/api/messages", { method: "POST", body: JSON.stringify(body) }));
const get = (orderId: string) => GET(new Request(`http://x/api/messages?orderId=${orderId}`));

let buyer: User;
let seller: User;
let outsider: User;
let orderId: string;

beforeEach(async () => {
  resetRateLimiter();
  const repo = await repoReady();

  const sellerRow = await repo.createSeller({
    name: "S", shopName: "S Shop", trustScore: 50, trustBand: "medium",
    kycStatus: "verified", isNew: false, passes: 1, fails: 0,
  });
  const sellerUser = await repo.createUser({
    auth0Sub: `test|s|${crypto.randomUUID()}`, email: "s@x.test", name: "S", role: "seller",
  });
  seller = await repo.setUserRole(sellerUser.id, "seller", sellerRow.id);

  buyer = await repo.createUser({
    auth0Sub: `test|b|${crypto.randomUUID()}`, email: "b@x.test", name: "B", role: "buyer",
  });
  // A second buyer with no part in the order — the "can anyone else read this?" case.
  outsider = await repo.createUser({
    auth0Sub: `test|o|${crypto.randomUUID()}`, email: "o@x.test", name: "O", role: "buyer",
  });

  const listing = await repo.createListing({
    sellerId: sellerRow.id, title: "Cotton Kurti", description: "", price: 349,
    category: "kurtis", status: "live", flowStep: "live", verified: true, rankBoost: 1,
  });
  const order = await repo.createOrder({
    listingId: listing.id, buyerUserId: buyer.id,
    address: { name: "B", line1: "1 St", city: "Pune", pincode: "411001" },
    paymentMethod: "cod", status: "placed",
  });
  orderId = order.id;
});

describe("messages — who may read a thread", () => {
  it("lets the buyer who placed the order read it", async () => {
    caller = buyer;
    const res = await get(orderId);
    expect(res.status).toBe(200);
  });

  it("lets the seller who owns the listing read it", async () => {
    caller = seller;
    const res = await get(orderId);
    expect(res.status).toBe(200);
  });

  it("404s an unrelated buyer — not 403, which would confirm the id exists", async () => {
    caller = outsider;
    const res = await get(orderId);
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });

  it("401s a signed-out caller", async () => {
    caller = null;
    expect((await get(orderId)).status).toBe(401);
  });
});

describe("messages — sending", () => {
  it("stores a participant's message and returns it", async () => {
    caller = buyer;
    const res = await post({ orderId, body: "Is this the same black kurti as the photo?" });
    expect(res.status).toBe(200);
    const { message } = await res.json();
    expect(message.fromUserId).toBe(buyer.id);
    expect(message.orderId).toBe(orderId);
  });

  it("refuses a non-participant", async () => {
    caller = outsider;
    expect((await post({ orderId, body: "hello" })).status).toBe(404);
  });

  it("rejects an empty or whitespace-only message", async () => {
    caller = buyer;
    expect((await post({ orderId, body: "   " })).status).toBe(400);
  });

  it("ignores a client-supplied listingId — the order decides", async () => {
    // Accepting it would let a participant of one order file a message against another's listing.
    caller = buyer;
    const res = await post({ orderId, body: "hi", listingId: "some-other-listing" });
    const { message } = await res.json();
    const repo = await repoReady();
    const order = await repo.getOrder(orderId);
    expect(message.listingId).toBe(order!.listingId);
  });

  it("throttles a flood from one account", async () => {
    caller = buyer;
    for (let i = 0; i < 20; i++) await post({ orderId, body: `m${i}` });
    expect((await post({ orderId, body: "one too many" })).status).toBe(429);
  });
});

describe("unread counts", () => {
  it("counts the other party's messages, never your own", async () => {
    caller = buyer;
    await post({ orderId, body: "from the buyer" });

    // The buyer just sent it, so nothing is waiting for them.
    caller = buyer;
    expect((await (await COUNT()).json()).count).toBe(0);

    // The seller has one unread, and is pointed at their inbox.
    caller = seller;
    const body = await (await COUNT()).json();
    expect(body.count).toBe(1);
    expect(body.href).toBe("/seller/messages");
  });

  it("drops to zero once the thread is opened", async () => {
    caller = buyer;
    await post({ orderId, body: "hello?" });

    caller = seller;
    await get(orderId); // reading marks the other party's messages read
    expect((await (await COUNT()).json()).count).toBe(0);
  });
});

describe("inbox", () => {
  it("lists the order as a thread even before anyone has written", async () => {
    // A seller must be able to open a conversation with a buyer who hasn't messaged first.
    caller = seller;
    const { threads } = await (await THREADS()).json();
    const mine = threads.find((t: { orderId: string }) => t.orderId === orderId);
    expect(mine).toBeTruthy();
    expect(mine.lastMessage).toBeNull();
  });

  it("shows an unrelated buyer nothing", async () => {
    caller = outsider;
    const { threads } = await (await THREADS()).json();
    expect(threads.find((t: { orderId: string }) => t.orderId === orderId)).toBeUndefined();
  });
});
