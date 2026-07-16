// In-memory Repo implementation — local dev + tests, zero setup.
import type { Repo } from "./repo";
import type {
  User, Role, Seller, Listing, ListingStatus, ProductImage, ImageMeta, Challenge,
  AuthenticityCheck, SizeMeasurement, Order, PromiseRecord, TrustEvent,
  Review, AuditEntry,
} from "./types";

/** Shared id generator — SupabaseRepo mappers reuse it for client-side ids. */
export function newId(): string { return crypto.randomUUID(); }
const now = () => new Date().toISOString();

export class InMemoryRepo implements Repo {
  private users = new Map<string, User>();
  private sellers = new Map<string, Seller>();
  private listings = new Map<string, Listing>();
  private images = new Map<string, ProductImage>();
  private challenges = new Map<string, Challenge>();
  private checks = new Map<string, AuthenticityCheck>();
  private measurements = new Map<string, SizeMeasurement>();
  private orders = new Map<string, Order>();
  private promises = new Map<string, PromiseRecord>();
  private trustEvents = new Map<string, TrustEvent>();
  private reviews = new Map<string, Review>();
  private audit: AuditEntry[] = [];

  // ---- users ----
  async getUserByAuth0Sub(sub: string): Promise<User | null> {
    return [...this.users.values()].find(u => u.auth0Sub === sub) ?? null;
  }
  async createUser(u: Omit<User, "id" | "createdAt">): Promise<User> {
    const user: User = { ...u, id: newId(), createdAt: now() };
    this.users.set(user.id, user);
    return user;
  }
  async setUserRole(id: string, role: Role, sellerId?: string): Promise<User> {
    const u = this.users.get(id);
    if (!u) throw new Error("user not found");
    const updated: User = { ...u, role, sellerId: sellerId ?? u.sellerId };
    this.users.set(id, updated);
    return updated;
  }
  async listUsers(): Promise<User[]> {
    return [...this.users.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  // ---- sellers ----
  async getSeller(id: string): Promise<Seller | null> {
    return this.sellers.get(id) ?? null;
  }
  async listSellers(): Promise<Seller[]> {
    return [...this.sellers.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async createSeller(s: Omit<Seller, "id" | "createdAt">): Promise<Seller> {
    const seller: Seller = { ...s, id: newId(), createdAt: now() };
    this.sellers.set(seller.id, seller);
    return seller;
  }
  async updateSeller(id: string, patch: Partial<Seller>): Promise<Seller> {
    const s = this.sellers.get(id);
    if (!s) throw new Error("seller not found");
    const updated = { ...s, ...patch, id: s.id };
    this.sellers.set(id, updated);
    return updated;
  }

  // ---- listings ----
  async createListing(l: Omit<Listing, "id" | "createdAt">): Promise<Listing> {
    const listing: Listing = { ...l, id: newId(), createdAt: now() };
    this.listings.set(listing.id, listing);
    return listing;
  }
  async getListing(id: string): Promise<Listing | null> {
    return this.listings.get(id) ?? null;
  }
  async listListings(filter?: { verified?: boolean; sellerId?: string; status?: ListingStatus }): Promise<Listing[]> {
    return [...this.listings.values()]
      .filter(l => filter?.verified === undefined || l.verified === filter.verified)
      .filter(l => !filter?.sellerId || l.sellerId === filter.sellerId)
      .filter(l => !filter?.status || l.status === filter.status)
      .sort((a, b) =>
        Number(b.verified) - Number(a.verified) || b.rankBoost - a.rankBoost ||
        b.createdAt.localeCompare(a.createdAt));
  }
  async updateListing(id: string, patch: Partial<Listing>): Promise<Listing> {
    const l = this.listings.get(id);
    if (!l) throw new Error("listing not found");
    const updated = { ...l, ...patch, id: l.id };
    this.listings.set(id, updated);
    return updated;
  }

  // ---- images ----
  async addImage(i: Omit<ProductImage, "id">): Promise<ProductImage> {
    const img: ProductImage = { ...i, id: newId() };
    this.images.set(img.id, img);
    return img;
  }
  async listImages(listingId: string): Promise<ProductImage[]> {
    return [...this.images.values()].filter(i => i.listingId === listingId);
  }
  async getImage(id: string): Promise<ProductImage | null> {
    return this.images.get(id) ?? null;
  }
  async listImageMeta(listingIds: string[]): Promise<ImageMeta[]> {
    const want = new Set(listingIds);
    // Mirrors the Supabase impl: metadata only, never the `url` blob.
    return [...this.images.values()]
      .filter(i => want.has(i.listingId))
      .map(({ id, listingId, kind }) => ({ id, listingId, kind }));
  }

  // ---- challenges (invariant #3: dynamic, time-bound, single-use) ----
  async issueChallenge(code: string, ttlSeconds: number): Promise<Challenge> {
    const c: Challenge = {
      code, issuedAt: now(),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    };
    this.challenges.set(code, c);
    return c;
  }
  async claimChallenge(code: string, listingId: string): Promise<Challenge | null> {
    const c = this.challenges.get(code);
    if (!c || c.usedAt || Date.parse(c.expiresAt) <= Date.now()) return null;
    const claimed = { ...c, usedAt: now(), listingId };
    this.challenges.set(code, claimed);
    return claimed;
  }

  // ---- checks + measurements ----
  async addCheck(c: Omit<AuthenticityCheck, "id" | "createdAt">): Promise<AuthenticityCheck> {
    const check: AuthenticityCheck = { ...c, id: newId(), createdAt: now() };
    this.checks.set(check.id, check);
    return check;
  }
  async listChecks(listingId: string): Promise<AuthenticityCheck[]> {
    return [...this.checks.values()]
      .filter(c => c.listingId === listingId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async addMeasurement(m: Omit<SizeMeasurement, "id">): Promise<SizeMeasurement> {
    const meas: SizeMeasurement = { ...m, id: newId() };
    this.measurements.set(meas.id, meas);
    return meas;
  }
  async getMeasurement(listingId: string): Promise<SizeMeasurement | null> {
    return [...this.measurements.values()].find(m => m.listingId === listingId) ?? null;
  }

  // ---- orders + promises ----
  async createOrder(o: Omit<Order, "id" | "placedAt">): Promise<Order> {
    const order: Order = { ...o, id: newId(), placedAt: now() };
    this.orders.set(order.id, order);
    return order;
  }
  async getOrder(id: string): Promise<Order | null> {
    return this.orders.get(id) ?? null;
  }
  async listOrdersByBuyer(buyerUserId: string): Promise<Order[]> {
    return [...this.orders.values()]
      .filter(o => o.buyerUserId === buyerUserId)
      .sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  }
  async advanceOrder(id: string): Promise<Order> {
    const o = this.orders.get(id);
    if (!o) throw new Error("order not found");
    const next: Order =
      o.status === "placed" ? { ...o, status: "shipped" }
      : o.status === "shipped" ? { ...o, status: "delivered", deliveredAt: now() }
      : o;
    this.orders.set(id, next);
    return next;
  }
  async upsertPromise(p: Omit<PromiseRecord, "id">): Promise<PromiseRecord> {
    const existing = [...this.promises.values()].find(x => x.listingId === p.listingId);
    const rec: PromiseRecord = { ...p, id: existing?.id ?? newId() };
    this.promises.set(rec.id, rec);
    return rec;
  }
  async getPromiseByListing(listingId: string): Promise<PromiseRecord | null> {
    return [...this.promises.values()].find(p => p.listingId === listingId) ?? null;
  }

  // ---- trust + reviews + audit ----
  async addTrustEvent(e: Omit<TrustEvent, "id" | "createdAt">): Promise<TrustEvent> {
    const evt: TrustEvent = { ...e, id: newId(), createdAt: now() };
    this.trustEvents.set(evt.id, evt);
    return evt;
  }
  async listTrustEvents(sellerId: string): Promise<TrustEvent[]> {
    return [...this.trustEvents.values()]
      .filter(e => e.sellerId === sellerId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async createReview(r: Omit<Review, "id">): Promise<Review> {
    const review: Review = { ...r, id: newId() };
    this.reviews.set(review.id, review);
    return review;
  }
  async listPendingReviews(): Promise<Review[]> {
    return [...this.reviews.values()].filter(r => r.status === "pending");
  }
  async decideReview(id: string, status: "approved" | "rejected", note: string, reviewerUserId: string): Promise<Review> {
    const r = this.reviews.get(id);
    if (!r) throw new Error("review not found");
    if (r.status !== "pending") throw new Error("review already decided");
    const decided: Review = { ...r, status, reviewerNote: note, reviewerUserId, decidedAt: now() };
    this.reviews.set(id, decided);
    return decided;
  }
  async appendAudit(a: Omit<AuditEntry, "id" | "createdAt">): Promise<AuditEntry> {
    const entry: AuditEntry = { ...a, id: this.audit.length + 1, createdAt: now() };
    this.audit.push(entry);
    return entry;
  }
  async listAudit(listingId: string): Promise<AuditEntry[]> {
    return this.audit.filter(a => a.listingId === listingId);
  }
}
