// Who may read or write an order's message thread.
//
// Single source for the participant rule, because it is the only thing standing between a thread and
// any other signed-in user who can guess an order id. Both message routes and the thread UI go
// through here rather than re-deriving it — a second copy is a second chance to get it wrong.
import { repoReady } from "./db";
import { HttpError } from "./auth";
import type { Message, Order, User } from "./db/types";

export interface Thread {
  order: Order;
  /** The listing the order is against — carries the seller's identity. */
  listingTitle: string;
  sellerId: string;
  messages: Message[];
}

/**
 * Load an order and prove the caller is one of its two parties.
 *
 * Exactly two people have business in a thread: the buyer who placed the order, and the seller who
 * owns the listing it was placed against. An admin is NOT a participant — reading a buyer's
 * correspondence is not part of reviewing a listing, and if T&S ever needs it that should be a
 * deliberate, audited feature rather than a side effect of the role check.
 *
 * 404, not 403, for a non-participant: a 403 confirms the order id exists, which turns this into an
 * id oracle. Same reasoning as ownedListing in the listings route.
 */
export async function participantThread(orderId: string, user: User): Promise<Thread> {
  const repo = await repoReady();
  const order = await repo.getOrder(orderId);
  if (!order) throw new HttpError(404, "not_found", "Order not found.");

  const listing = await repo.getListing(order.listingId);
  if (!listing) throw new HttpError(404, "not_found", "Order not found.");

  const isBuyer = user.role === "buyer" && order.buyerUserId === user.id;
  const isSeller = user.role === "seller" && !!user.sellerId && listing.sellerId === user.sellerId;
  if (!isBuyer && !isSeller) throw new HttpError(404, "not_found", "Order not found.");

  return {
    order,
    listingTitle: listing.title,
    sellerId: listing.sellerId,
    messages: await repo.listMessages(orderId),
  };
}

/** Orders the user is a party to — the set their inbox and unread count are drawn from. */
export async function participantOrders(user: User): Promise<Order[]> {
  const repo = await repoReady();
  if (user.role === "buyer") return repo.listOrdersByBuyer(user.id);
  if (user.role === "seller" && user.sellerId) {
    const listings = await repo.listListings({ sellerId: user.sellerId });
    return (await Promise.all(listings.map((l) => repo.listOrdersByListing(l.id)))).flat();
  }
  return [];
}

/** Unread messages waiting for this user — those the OTHER party sent on their own orders. */
export async function unreadCount(user: User): Promise<number> {
  const repo = await repoReady();
  const orders = await participantOrders(user);
  if (orders.length === 0) return 0;
  const messages = await repo.listMessagesForOrders(orders.map((o) => o.id));
  return messages.filter((m) => !m.readAt && m.fromUserId !== user.id).length;
}
