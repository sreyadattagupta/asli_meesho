import { getSessionUser, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { participantThread } from "@/lib/messages";
import { messageSendSchema } from "@/lib/validation";
import { rateLimited } from "@/lib/rateLimit";
import { fail, ok } from "@/lib/api";

async function caller() {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "unauthenticated", "Sign in required.");
  return user;
}

/** One thread. Reading it marks the other party's messages as read. */
export async function GET(req: Request) {
  try {
    const user = await caller();
    const orderId = new URL(req.url).searchParams.get("orderId");
    if (!orderId) return fail(400, "invalid_query", "orderId is required.");

    // Proves participation, or 404s — see lib/messages.ts for why 404 and not 403.
    const thread = await participantThread(orderId, user);
    const repo = await repoReady();
    await repo.markThreadRead(orderId, user.id);

    return ok({
      orderId,
      listingTitle: thread.listingTitle,
      status: thread.order.status,
      messages: thread.messages,
      me: user.id,
    });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}

/** Send a message on an order you are a party to. */
export async function POST(req: Request) {
  try {
    const user = await caller();
    const parsed = messageSendSchema.safeParse(await req.json());
    if (!parsed.success) return fail(400, "invalid_body", "A message of 1–2000 characters is required.");

    // Per-user, not per-IP: two sellers behind one shop's NAT shouldn't throttle each other, and the
    // thing worth limiting here is one account flooding a thread.
    if (rateLimited(`messages:${user.id}`, 20, 60_000)) {
      return fail(429, "rate_limited", "Slow down a moment, then send again.");
    }

    const thread = await participantThread(parsed.data.orderId, user);
    const repo = await repoReady();
    const message = await repo.addMessage({
      orderId: thread.order.id,
      // Taken from the ORDER, never from the request body: a client-supplied listingId would let a
      // participant of one order file a message against someone else's listing.
      listingId: thread.order.listingId,
      fromUserId: user.id,
      body: parsed.data.body.trim(),
    });
    return ok({ message });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
