// Domain types — every entity from CLAUDE.md §7. Locked contract for all phases.
export type Role = "seller" | "buyer" | "admin";
export type ListingStatus = "draft" | "pending" | "live" | "blocked" | "escalated" | "rejected" | "archived";
export type KycStatus = "pending" | "submitted" | "verified";
export type OrderStatus = "placed" | "shipped" | "delivered";
export type ImageKind = "catalog" | "live" | "flatlay" | "delivery" | "kyc";
export type PaymentMethod = "cod" | "upi_mock";
export type TrustBand = "high" | "medium" | "low";

export interface User { id: string; auth0Sub: string; email: string; name: string; role: Role; sellerId?: string; createdAt: string; }
// Business fields are optional: they arrive when the seller completes their profile, and every
// existing row predates them. `bankLast4` is deliberately the ONLY bank data we keep — a demo has no
// business holding a full account number, and not storing it is cheaper than protecting it.
export interface Seller { id: string; userId?: string; name: string; shopName: string; trustScore: number; trustBand: TrustBand; kycStatus: KycStatus; kycDocUrl?: string; isNew: boolean; passes: number; fails: number; createdAt: string; businessName?: string; gst?: string; pan?: string; address?: string; mobile?: string; bankLast4?: string; }
export interface Listing { id: string; sellerId: string; title: string; description: string; price: number; category: string; status: ListingStatus; flowStep: string; verified: boolean; sizeChart?: Record<string, number>; rankBoost: number; createdAt: string; }
export interface ProductImage { id: string; listingId: string; url: string; imageHash: string; embeddingId?: string; kind: ImageKind; }
/** ProductImage without the `url` blob — what list views are allowed to load. See Repo.listImageMeta. */
export type ImageMeta = Pick<ProductImage, "id" | "listingId" | "kind">;
export interface Challenge { code: string; listingId?: string; issuedAt: string; expiresAt: string; usedAt?: string; }
export interface AuthenticityCheck { id: string; listingId: string; agent: string; payload: Record<string, unknown>; confidence: number; action: string; requiredConfidence: number; reason: string; createdAt: string; }
// mappedSize is null when the garment was measured but the fitted model grades no size for it (an
// ungraded category, or the sizing dimension was not recovered) — never a fabricated label.
export interface SizeMeasurement { id: string; listingId: string; chestCm: number; lengthCm: number; waistCm: number; referenceUsed: string; confidence: number; mappedSize: string | null; }
export interface Order { id: string; listingId: string; buyerUserId: string; address: Record<string, string>; paymentMethod: PaymentMethod; status: OrderStatus; placedAt: string; deliveredAt?: string; }
export interface PromiseRecord { id: string; listingId: string; orderId?: string; frozen: Record<string, unknown>; deliveryPhotoUrl?: string; kept?: boolean; confidence?: number; checkedAt?: string; }
export interface TrustEvent { id: string; sellerId: string; delta: number; reason: string; source: string; createdAt: string; }
export interface Review { id: string; listingId: string; status: "pending" | "approved" | "rejected"; reviewerNote?: string; reviewerUserId?: string; decidedAt?: string; }
export interface AuditEntry { id: number; listingId?: string; actor: string; event: string; data: Record<string, unknown>; createdAt: string; }
