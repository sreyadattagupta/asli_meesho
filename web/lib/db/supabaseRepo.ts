// Supabase (managed Postgres) Repo — deployed backend behind the same seam.
// Server-side only: SUPABASE_SERVICE_ROLE_KEY bypasses RLS (deny-all, no policies).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Repo } from "./repo";
import type {
  User, Role, Seller, Listing, ListingStatus, ProductImage, ImageMeta, Challenge,
  AuthenticityCheck, SizeMeasurement, Order, PromiseRecord, TrustEvent,
  Review, AuditEntry, Message,
} from "./types";

type Row = Record<string, unknown>;

/** Storage bucket for product imagery — public read (these are shop photos), server-side write. */
const IMAGE_BUCKET = "product-images";

// ---- camelCase ↔ snake_case mappers ------------------------------------

const userFromDb = (r: Row): User => ({
  id: r.id as string, auth0Sub: r.auth0_sub as string, email: r.email as string,
  name: r.name as string, role: r.role as Role,
  sellerId: (r.seller_id as string | null) ?? undefined,
  createdAt: r.created_at as string,
});

const sellerFromDb = (r: Row): Seller => ({
  id: r.id as string, userId: (r.user_id as string | null) ?? undefined,
  name: r.name as string, shopName: r.shop_name as string,
  trustScore: Number(r.trust_score), trustBand: r.trust_band as Seller["trustBand"],
  kycStatus: r.kyc_status as Seller["kycStatus"],
  kycDocUrl: (r.kyc_doc_url as string | null) ?? undefined,
  isNew: Boolean(r.is_new), passes: Number(r.passes), fails: Number(r.fails),
  createdAt: r.created_at as string,
  businessName: (r.business_name as string | null) ?? undefined,
  gst: (r.gst as string | null) ?? undefined,
  pan: (r.pan as string | null) ?? undefined,
  address: (r.address as string | null) ?? undefined,
  mobile: (r.mobile as string | null) ?? undefined,
  bankLast4: (r.bank_last4 as string | null) ?? undefined,
});

const sellerToDb = (s: Partial<Seller>): Row => {
  const r: Row = {};
  if (s.userId !== undefined) r.user_id = s.userId;
  if (s.name !== undefined) r.name = s.name;
  if (s.shopName !== undefined) r.shop_name = s.shopName;
  if (s.trustScore !== undefined) r.trust_score = s.trustScore;
  if (s.trustBand !== undefined) r.trust_band = s.trustBand;
  if (s.kycStatus !== undefined) r.kyc_status = s.kycStatus;
  if (s.kycDocUrl !== undefined) r.kyc_doc_url = s.kycDocUrl;
  if (s.isNew !== undefined) r.is_new = s.isNew;
  if (s.passes !== undefined) r.passes = s.passes;
  if (s.fails !== undefined) r.fails = s.fails;
  if (s.businessName !== undefined) r.business_name = s.businessName;
  if (s.gst !== undefined) r.gst = s.gst;
  if (s.pan !== undefined) r.pan = s.pan;
  if (s.address !== undefined) r.address = s.address;
  if (s.mobile !== undefined) r.mobile = s.mobile;
  if (s.bankLast4 !== undefined) r.bank_last4 = s.bankLast4;
  return r;
};

const listingFromDb = (r: Row): Listing => ({
  id: r.id as string, sellerId: r.seller_id as string, title: r.title as string,
  description: r.description as string, price: Number(r.price),
  // Nullable columns stay undefined rather than becoming 0 — `stock: null` means "not tracked",
  // and Number(null) === 0 would silently render every legacy listing as sold out.
  mrp: r.mrp == null ? undefined : Number(r.mrp),
  category: r.category as string, status: r.status as ListingStatus,
  flowStep: r.flow_step as string, verified: Boolean(r.verified),
  sizeChart: (r.size_chart as Record<string, number> | null) ?? undefined,
  rankBoost: Number(r.rank_boost),
  stock: r.stock == null ? undefined : Number(r.stock),
  sku: (r.sku as string | null) ?? undefined,
  createdAt: r.created_at as string,
});

const listingToDb = (l: Partial<Listing>): Row => {
  const r: Row = {};
  if (l.sellerId !== undefined) r.seller_id = l.sellerId;
  if (l.title !== undefined) r.title = l.title;
  if (l.description !== undefined) r.description = l.description;
  if (l.price !== undefined) r.price = l.price;
  if (l.category !== undefined) r.category = l.category;
  if (l.status !== undefined) r.status = l.status;
  if (l.flowStep !== undefined) r.flow_step = l.flowStep;
  if (l.verified !== undefined) r.verified = l.verified;
  if (l.sizeChart !== undefined) r.size_chart = l.sizeChart;
  if (l.rankBoost !== undefined) r.rank_boost = l.rankBoost;
  if (l.mrp !== undefined) r.mrp = l.mrp;
  if (l.stock !== undefined) r.stock = l.stock;
  if (l.sku !== undefined) r.sku = l.sku;
  return r;
};

const imageFromDb = (r: Row): ProductImage => ({
  id: r.id as string, listingId: r.listing_id as string, url: r.url as string,
  imageHash: r.image_hash as string,
  embeddingId: (r.embedding_id as string | null) ?? undefined,
  kind: r.kind as ProductImage["kind"],
});

const challengeFromDb = (r: Row): Challenge => ({
  code: r.code as string,
  listingId: (r.listing_id as string | null) ?? undefined,
  issuedAt: r.issued_at as string, expiresAt: r.expires_at as string,
  usedAt: (r.used_at as string | null) ?? undefined,
});

const checkFromDb = (r: Row): AuthenticityCheck => ({
  id: r.id as string, listingId: r.listing_id as string, agent: r.agent as string,
  payload: (r.payload as Record<string, unknown>) ?? {},
  confidence: Number(r.confidence), action: r.action as string,
  requiredConfidence: Number(r.required_confidence), reason: r.reason as string,
  createdAt: r.created_at as string,
});

const measurementFromDb = (r: Row): SizeMeasurement => ({
  id: r.id as string, listingId: r.listing_id as string,
  chestCm: Number(r.chest_cm), lengthCm: Number(r.length_cm), waistCm: Number(r.waist_cm),
  referenceUsed: r.reference_used as string, confidence: Number(r.confidence),
  mappedSize: r.mapped_size as string,
});

const orderFromDb = (r: Row): Order => ({
  id: r.id as string, listingId: r.listing_id as string,
  buyerUserId: r.buyer_user_id as string,
  address: (r.address as Record<string, string>) ?? {},
  paymentMethod: r.payment_method as Order["paymentMethod"],
  status: r.status as Order["status"], placedAt: r.placed_at as string,
  deliveredAt: (r.delivered_at as string | null) ?? undefined,
});

const promiseFromDb = (r: Row): PromiseRecord => ({
  id: r.id as string, listingId: r.listing_id as string,
  orderId: (r.order_id as string | null) ?? undefined,
  frozen: (r.frozen as Record<string, unknown>) ?? {},
  deliveryPhotoUrl: (r.delivery_photo_url as string | null) ?? undefined,
  kept: (r.kept as boolean | null) ?? undefined,
  confidence: r.confidence === null || r.confidence === undefined ? undefined : Number(r.confidence),
  checkedAt: (r.checked_at as string | null) ?? undefined,
});

const trustEventFromDb = (r: Row): TrustEvent => ({
  id: r.id as string, sellerId: r.seller_id as string, delta: Number(r.delta),
  reason: r.reason as string, source: r.source as string,
  createdAt: r.created_at as string,
});

const reviewFromDb = (r: Row): Review => ({
  id: r.id as string, listingId: r.listing_id as string,
  status: r.status as Review["status"],
  reviewerNote: (r.reviewer_note as string | null) ?? undefined,
  reviewerUserId: (r.reviewer_user_id as string | null) ?? undefined,
  decidedAt: (r.decided_at as string | null) ?? undefined,
});

const auditFromDb = (r: Row): AuditEntry => ({
  id: Number(r.id), listingId: (r.listing_id as string | null) ?? undefined,
  actor: r.actor as string, event: r.event as string,
  data: (r.data as Record<string, unknown>) ?? {},
  createdAt: r.created_at as string,
});

const messageFromDb = (r: Row): Message => ({
  id: r.id as string, orderId: r.order_id as string, listingId: r.listing_id as string,
  fromUserId: r.from_user_id as string, body: r.body as string,
  createdAt: r.created_at as string,
  readAt: (r.read_at as string | null) ?? undefined,
});

// ---- repo ---------------------------------------------------------------

export class SupabaseRepo implements Repo {
  private sb: SupabaseClient;

  constructor(url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY) {
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for DATA_BACKEND=supabase");
    this.sb = createClient(url, key, { auth: { persistSession: false } });
  }

  private async one<T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>, map: (r: Row) => T): Promise<T> {
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data) throw new Error("row not found");
    return map(data as Row);
  }

  private async maybe<T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>, map: (r: Row) => T): Promise<T | null> {
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ? map(data as Row) : null;
  }

  private async many<T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>, map: (r: Row) => T): Promise<T[]> {
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data as Row[]) ?? []).map(map);
  }

  // users
  getUserByAuth0Sub(sub: string) {
    return this.maybe(this.sb.from("users").select().eq("auth0_sub", sub).maybeSingle(), userFromDb);
  }
  createUser(u: Omit<User, "id" | "createdAt">) {
    return this.one(this.sb.from("users").insert({
      auth0_sub: u.auth0Sub, email: u.email, name: u.name, role: u.role,
      seller_id: u.sellerId ?? null,
    }).select().single(), userFromDb);
  }
  setUserRole(id: string, role: Role, sellerId?: string) {
    const patch: Row = { role };
    if (sellerId !== undefined) patch.seller_id = sellerId;
    return this.one(this.sb.from("users").update(patch).eq("id", id).select().single(), userFromDb);
  }
  listUsers() {
    return this.many(this.sb.from("users").select().order("created_at"), userFromDb);
  }

  // sellers
  getSeller(id: string) {
    return this.maybe(this.sb.from("sellers").select().eq("id", id).maybeSingle(), sellerFromDb);
  }
  listSellers() {
    return this.many(this.sb.from("sellers").select().order("created_at"), sellerFromDb);
  }
  createSeller(s: Omit<Seller, "id" | "createdAt"> & { id?: string }) {
    // `id` only when restoring a known seller identity; otherwise let Postgres default it.
    const row = s.id ? { ...sellerToDb(s), id: s.id } : sellerToDb(s);
    return this.one(this.sb.from("sellers").insert(row).select().single(), sellerFromDb);
  }
  updateSeller(id: string, patch: Partial<Seller>) {
    return this.one(this.sb.from("sellers").update(sellerToDb(patch)).eq("id", id).select().single(), sellerFromDb);
  }

  // listings
  createListing(l: Omit<Listing, "id" | "createdAt">) {
    return this.one(this.sb.from("listings").insert(listingToDb(l)).select().single(), listingFromDb);
  }
  getListing(id: string) {
    return this.maybe(this.sb.from("listings").select().eq("id", id).maybeSingle(), listingFromDb);
  }
  async listListings(filter?: { verified?: boolean; sellerId?: string; status?: ListingStatus }) {
    let q = this.sb.from("listings").select();
    if (filter?.verified !== undefined) q = q.eq("verified", filter.verified);
    if (filter?.sellerId) q = q.eq("seller_id", filter.sellerId);
    if (filter?.status) q = q.eq("status", filter.status);
    return this.many(
      q.order("verified", { ascending: false })
        .order("rank_boost", { ascending: false })
        .order("created_at", { ascending: false }),
      listingFromDb);
  }
  updateListing(id: string, patch: Partial<Listing>) {
    return this.one(this.sb.from("listings").update(listingToDb(patch)).eq("id", id).select().single(), listingFromDb);
  }

  // images
  async addImage(i: Omit<ProductImage, "id">) {
    const url = await this.offloadDataUrl(i.url, i.kind);
    return this.one(this.sb.from("product_images").insert({
      listing_id: i.listingId, url, image_hash: i.imageHash,
      embedding_id: i.embeddingId ?? null, kind: i.kind,
    }).select().single(), imageFromDb);
  }

  /**
   * Move an inline `data:` capture into Storage and return its public URL; pass anything else through.
   *
   * Callers hand us `data:image/jpeg;base64,...` because that is what a browser capture serialises to.
   * Writing it to a Postgres column made every row ~937 KB: 33.7 MB of image bytes sat in the table,
   * every read that touched `url` paid for it, and it could never be CDN-cached. Bytes belong in
   * Storage; the column holds a reference.
   *
   * Storage failure falls back to the inline URL — a slow image beats losing a seller's proof photo.
   */
  private async offloadDataUrl(url: string, kind: ProductImage["kind"]): Promise<string> {
    if (!url.startsWith("data:")) return url;
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(url);
    if (!m) return url;
    const [, mime, isBase64, payload] = m;
    try {
      const bytes = isBase64
        ? Buffer.from(payload, "base64")
        : Buffer.from(decodeURIComponent(payload), "utf8");
      const ext = (mime.split("/")[1] ?? "jpg").replace(/[^a-z0-9]/gi, "");
      const path = `${kind}/${crypto.randomUUID()}.${ext}`;
      const { error } = await this.sb.storage.from(IMAGE_BUCKET).upload(path, bytes, {
        contentType: mime,
        cacheControl: "31536000", // content-addressed by a fresh uuid per upload ⇒ never mutates
      });
      if (error) throw new Error(error.message);
      return this.sb.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
    } catch {
      return url;
    }
  }
  listImages(listingId: string) {
    return this.many(this.sb.from("product_images").select().eq("listing_id", listingId), imageFromDb);
  }
  getImage(id: string) {
    return this.maybe(this.sb.from("product_images").select().eq("id", id).maybeSingle(), imageFromDb);
  }
  async listImageMeta(listingIds: string[]): Promise<ImageMeta[]> {
    if (listingIds.length === 0) return [];
    // Explicit column list — a bare select() would drag every inline base64 `url` (~937 KB each).
    return this.many(
      this.sb.from("product_images").select("id,listing_id,kind").in("listing_id", listingIds),
      (r): ImageMeta => ({
        id: r.id as string,
        listingId: r.listing_id as string,
        kind: r.kind as ProductImage["kind"],
      }),
    );
  }

  // challenges (invariant #3 — atomic conditional update)
  issueChallenge(code: string, ttlSeconds: number) {
    return this.one(this.sb.from("challenges").insert({
      code, expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    }).select().single(), challengeFromDb);
  }
  async claimChallenge(code: string, listingId: string): Promise<Challenge | null> {
    const { data, error } = await this.sb
      .from("challenges")
      .update({ used_at: new Date().toISOString(), listing_id: listingId })
      .eq("code", code)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .select()
      .maybeSingle(); // atomic conditional update → 0 rows = unknown/used/expired
    if (error) throw new Error(error.message);
    return data ? challengeFromDb(data as Row) : null;
  }

  // checks + measurements
  addCheck(c: Omit<AuthenticityCheck, "id" | "createdAt">) {
    return this.one(this.sb.from("authenticity_checks").insert({
      listing_id: c.listingId, agent: c.agent, payload: c.payload,
      confidence: c.confidence, action: c.action,
      required_confidence: c.requiredConfidence, reason: c.reason,
    }).select().single(), checkFromDb);
  }
  listChecks(listingId: string) {
    return this.many(
      this.sb.from("authenticity_checks").select().eq("listing_id", listingId).order("created_at"),
      checkFromDb);
  }
  addMeasurement(m: Omit<SizeMeasurement, "id">) {
    return this.one(this.sb.from("size_measurements").insert({
      listing_id: m.listingId, chest_cm: m.chestCm, length_cm: m.lengthCm,
      waist_cm: m.waistCm, reference_used: m.referenceUsed,
      confidence: m.confidence, mapped_size: m.mappedSize,
    }).select().single(), measurementFromDb);
  }
  getMeasurement(listingId: string) {
    return this.maybe(
      this.sb.from("size_measurements").select().eq("listing_id", listingId).limit(1).maybeSingle(),
      measurementFromDb);
  }

  // orders + promises
  createOrder(o: Omit<Order, "id" | "placedAt">) {
    return this.one(this.sb.from("orders").insert({
      listing_id: o.listingId, buyer_user_id: o.buyerUserId, address: o.address,
      payment_method: o.paymentMethod, status: o.status,
      delivered_at: o.deliveredAt ?? null,
    }).select().single(), orderFromDb);
  }
  getOrder(id: string) {
    return this.maybe(this.sb.from("orders").select().eq("id", id).maybeSingle(), orderFromDb);
  }
  listOrdersByListing(listingId: string) {
    return this.many(
      this.sb.from("orders").select().eq("listing_id", listingId)
        .order("placed_at", { ascending: false }),
      orderFromDb);
  }
  listOrdersByBuyer(buyerUserId: string) {
    return this.many(
      this.sb.from("orders").select().eq("buyer_user_id", buyerUserId)
        .order("placed_at", { ascending: false }),
      orderFromDb);
  }
  async advanceOrder(id: string): Promise<Order> {
    const current = await this.getOrder(id);
    if (!current) throw new Error("order not found");
    if (current.status === "delivered") return current;
    const patch: Row = current.status === "placed"
      ? { status: "shipped" }
      : { status: "delivered", delivered_at: new Date().toISOString() };
    return this.one(this.sb.from("orders").update(patch).eq("id", id).select().single(), orderFromDb);
  }
  async upsertPromise(p: Omit<PromiseRecord, "id">): Promise<PromiseRecord> {
    const existing = await this.getPromiseByListing(p.listingId);
    const row: Row = {
      listing_id: p.listingId, order_id: p.orderId ?? null, frozen: p.frozen,
      delivery_photo_url: p.deliveryPhotoUrl ?? null, kept: p.kept ?? null,
      confidence: p.confidence ?? null, checked_at: p.checkedAt ?? null,
    };
    if (existing) {
      return this.one(this.sb.from("promises").update(row).eq("id", existing.id).select().single(), promiseFromDb);
    }
    return this.one(this.sb.from("promises").insert(row).select().single(), promiseFromDb);
  }
  getPromiseByListing(listingId: string) {
    return this.maybe(
      this.sb.from("promises").select().eq("listing_id", listingId).limit(1).maybeSingle(),
      promiseFromDb);
  }

  // trust + reviews + audit
  addTrustEvent(e: Omit<TrustEvent, "id" | "createdAt">) {
    return this.one(this.sb.from("trust_events").insert({
      seller_id: e.sellerId, delta: e.delta, reason: e.reason, source: e.source,
    }).select().single(), trustEventFromDb);
  }
  listTrustEvents(sellerId: string) {
    return this.many(
      this.sb.from("trust_events").select().eq("seller_id", sellerId).order("created_at"),
      trustEventFromDb);
  }
  createReview(r: Omit<Review, "id">) {
    return this.one(this.sb.from("reviews").insert({
      listing_id: r.listingId, status: r.status,
      reviewer_note: r.reviewerNote ?? null, reviewer_user_id: r.reviewerUserId ?? null,
      decided_at: r.decidedAt ?? null,
    }).select().single(), reviewFromDb);
  }
  listPendingReviews() {
    return this.many(this.sb.from("reviews").select().eq("status", "pending"), reviewFromDb);
  }
  async decideReview(id: string, status: "approved" | "rejected", note: string, reviewerUserId: string): Promise<Review> {
    // Conditional update: only a pending review can be decided (mirrors InMemory guard).
    const { data, error } = await this.sb.from("reviews")
      .update({ status, reviewer_note: note, reviewer_user_id: reviewerUserId, decided_at: new Date().toISOString() })
      .eq("id", id).eq("status", "pending")
      .select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("review already decided");
    return reviewFromDb(data as Row);
  }
  appendAudit(a: Omit<AuditEntry, "id" | "createdAt">) {
    return this.one(this.sb.from("audit_log").insert({
      listing_id: a.listingId ?? null, actor: a.actor, event: a.event, data: a.data,
    }).select().single(), auditFromDb);
  }
  listAudit(listingId: string) {
    return this.many(
      this.sb.from("audit_log").select().eq("listing_id", listingId).order("id"),
      auditFromDb);
  }

  // messages
  addMessage(m: Omit<Message, "id" | "createdAt">) {
    return this.one(this.sb.from("messages").insert({
      order_id: m.orderId, listing_id: m.listingId, from_user_id: m.fromUserId,
      body: m.body, read_at: m.readAt ?? null,
    }).select().single(), messageFromDb);
  }
  listMessages(orderId: string) {
    return this.many(
      this.sb.from("messages").select().eq("order_id", orderId).order("created_at"),
      messageFromDb);
  }
  async listMessagesForOrders(orderIds: string[]) {
    // `.in()` with an empty array is a query that can only return nothing — skip the round trip.
    if (orderIds.length === 0) return [];
    return this.many(
      this.sb.from("messages").select().in("order_id", orderIds).order("created_at"),
      messageFromDb);
  }
  async markThreadRead(orderId: string, readerUserId: string): Promise<number> {
    // `neq(from_user_id)` + `is(read_at, null)`: only the OTHER party's unread messages, matching
    // the InMemory guard. Re-marking already-read rows would churn read_at on every page view.
    const { data, error } = await this.sb.from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("order_id", orderId).neq("from_user_id", readerUserId).is("read_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    return (data ?? []).length;
  }
}
