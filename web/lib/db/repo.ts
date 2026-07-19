// The dual-backend data seam. Both InMemoryRepo and SupabaseRepo must satisfy this exactly.
import type {
  User, Role, Seller, Listing, ListingStatus, ProductImage, ImageMeta, Challenge,
  AuthenticityCheck, SizeMeasurement, Order, PromiseRecord, TrustEvent,
  Review, AuditEntry, Message,
} from "./types";

export interface Repo {
  // users
  getUserByAuth0Sub(sub: string): Promise<User | null>;
  createUser(u: Omit<User, "id" | "createdAt">): Promise<User>;
  setUserRole(id: string, role: Role, sellerId?: string): Promise<User>;
  listUsers(): Promise<User[]>;
  // sellers
  getSeller(id: string): Promise<Seller | null>;
  listSellers(): Promise<Seller[]>;
  /**
   * Create a seller. `id` is optional and normally omitted — pass it only to RESTORE a known seller
   * identity (lib/account.ts, from the Mongo account) so the seller's existing listings stay theirs.
   */
  createSeller(s: Omit<Seller, "id" | "createdAt"> & { id?: string }): Promise<Seller>;
  updateSeller(id: string, patch: Partial<Seller>): Promise<Seller>;
  // listings
  createListing(l: Omit<Listing, "id" | "createdAt">): Promise<Listing>;
  getListing(id: string): Promise<Listing | null>;
  listListings(filter?: { verified?: boolean; sellerId?: string; status?: ListingStatus }): Promise<Listing[]>;
  updateListing(id: string, patch: Partial<Listing>): Promise<Listing>;
  // images
  addImage(i: Omit<ProductImage, "id">): Promise<ProductImage>;
  listImages(listingId: string): Promise<ProductImage[]>;
  /** One image row by id — the only place that should pull the (possibly multi-MB) `url` blob. */
  getImage(id: string): Promise<ProductImage | null>;
  /**
   * Image metadata for many listings in ONE query, deliberately WITHOUT `url`.
   *
   * `url` holds inline `data:image/...;base64,...` for anything captured through the seller flow
   * (~937 KB per catalog image in prod). Any list view that only needs "which image belongs to which
   * listing" must use this — selecting `url` across a feed ships megabytes and serialises the request.
   */
  listImageMeta(listingIds: string[]): Promise<ImageMeta[]>;
  // challenges (invariant #3)
  issueChallenge(code: string, ttlSeconds: number): Promise<Challenge>;
  /** Atomic single-use claim: null if unknown, expired, or already used. */
  claimChallenge(code: string, listingId: string): Promise<Challenge | null>;
  /**
   * Undo a claim when nothing was actually verified — i.e. the CV service was unreachable. The
   * seller's code is written on a paper slip inside their photo, so spending it on our own outage
   * forces them to rewrite the slip and reshoot. Safe to reverse precisely because no comparison
   * happened: a real pass or fail keeps the code burned, which is what stops replay and brute force.
   */
  releaseChallenge(code: string): Promise<void>;
  // checks + measurements
  addCheck(c: Omit<AuthenticityCheck, "id" | "createdAt">): Promise<AuthenticityCheck>;
  listChecks(listingId: string): Promise<AuthenticityCheck[]>;
  addMeasurement(m: Omit<SizeMeasurement, "id">): Promise<SizeMeasurement>;
  getMeasurement(listingId: string): Promise<SizeMeasurement | null>;
  // orders + promises
  createOrder(o: Omit<Order, "id" | "placedAt">): Promise<Order>;
  getOrder(id: string): Promise<Order | null>;
  listOrdersByBuyer(buyerUserId: string): Promise<Order[]>;
  /** Orders against one listing — the seller portal's revenue/order counts. */
  listOrdersByListing(listingId: string): Promise<Order[]>;
  advanceOrder(id: string): Promise<Order>; // placed→shipped→delivered (idempotent at delivered)
  upsertPromise(p: Omit<PromiseRecord, "id">): Promise<PromiseRecord>;
  getPromiseByListing(listingId: string): Promise<PromiseRecord | null>;
  // trust + reviews + audit
  addTrustEvent(e: Omit<TrustEvent, "id" | "createdAt">): Promise<TrustEvent>;
  listTrustEvents(sellerId: string): Promise<TrustEvent[]>;
  createReview(r: Omit<Review, "id">): Promise<Review>;
  listPendingReviews(): Promise<Review[]>;
  decideReview(id: string, status: "approved" | "rejected", note: string, reviewerUserId: string): Promise<Review>;
  appendAudit(a: Omit<AuditEntry, "id" | "createdAt">): Promise<AuditEntry>;
  listAudit(listingId: string): Promise<AuditEntry[]>;
  // messages (order-scoped buyer↔seller threads)
  addMessage(m: Omit<Message, "id" | "createdAt">): Promise<Message>;
  /** One thread, oldest → newest. */
  listMessages(orderId: string): Promise<Message[]>;
  /**
   * Every message on the given orders. One call, not one per order: an inbox with N threads would
   * otherwise fan out into N queries, and the seller's inbox is exactly that shape.
   */
  listMessagesForOrders(orderIds: string[]): Promise<Message[]>;
  /** Mark the OTHER party's messages in a thread as read. Returns how many changed. */
  markThreadRead(orderId: string, readerUserId: string): Promise<number>;
}
