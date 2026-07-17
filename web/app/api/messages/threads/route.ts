import { getSessionUser, HttpError } from "@/lib/auth";
import { repoReady } from "@/lib/db";
import { participantOrders } from "@/lib/messages";
import { fail, ok } from "@/lib/api";

export interface ThreadSummary {
  orderId: string;
  listingId: string;
  listingTitle: string;
  orderStatus: string;
  lastMessage: string | null;
  lastAt: string | null;
  unread: number;
}

/**
 * The caller's inbox: one row per order they are a party to.
 *
 * Includes orders with no messages yet — that is the point. A seller should be able to open a thread
 * with a buyer who hasn't written first, and a "start a conversation" row is the only way to offer
 * that without inventing a compose screen that has to pick a recipient from nowhere.
 */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "unauthenticated", "Sign in required.");

    const orders = await participantOrders(user);
    if (orders.length === 0) return ok({ threads: [] });

    const repo = await repoReady();
    // One query for every thread's messages, then group in memory — an inbox of N orders must not
    // become N round trips.
    const messages = await repo.listMessagesForOrders(orders.map((o) => o.id));
    const listings = await Promise.all(orders.map((o) => repo.getListing(o.listingId)));

    const threads: ThreadSummary[] = orders.map((order, i) => {
      const mine = messages.filter((m) => m.orderId === order.id);
      const last = mine.at(-1) ?? null;
      return {
        orderId: order.id,
        listingId: order.listingId,
        listingTitle: listings[i]?.title || "Untitled listing",
        orderStatus: order.status,
        lastMessage: last?.body ?? null,
        lastAt: last?.createdAt ?? null,
        unread: mine.filter((m) => !m.readAt && m.fromUserId !== user.id).length,
      };
    });

    // Unread first, then most recent — the inbox is a queue of what needs answering, and a thread
    // with no messages yet has nothing to sort by.
    threads.sort((a, b) => {
      if ((b.unread > 0 ? 1 : 0) !== (a.unread > 0 ? 1 : 0)) return b.unread - a.unread;
      return (b.lastAt ?? "").localeCompare(a.lastAt ?? "");
    });

    return ok({ threads });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    return fail(500, "internal", "Something went wrong.");
  }
}
