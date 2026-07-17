// Zod schemas — one per mutating route (CLAUDE.md §11).
import { z } from "zod";

export const roleSelectSchema = z.object({ role: z.enum(["seller", "buyer", "admin"]) });

export const categorySchema = z.enum(["sarees", "kurtis", "footwear", "jewellery"]);

/**
 * A listing DRAFT — created the moment the seller picks a catalog photo, before the agents run.
 *
 * Everything is optional because at that point the seller has typed nothing: the wizard collects the
 * title, price and stock AFTER Agent 1 and Agent 2 have cleared the listing, so we are not making an
 * honest seller fill in three forms only to be told the photo can't be verified. The draft row still
 * has to exist first — the agents write their checks, images and challenge claims against its id.
 *
 * `title` may be empty here and ONLY here. The publish route re-validates it (listingPublishable)
 * before anything reaches the marketplace.
 */
export const listingCreateSchema = z.object({
  title: z.string().max(120).default(""),
  description: z.string().max(2000).default(""),
  price: z.number().int().min(1).max(100000).default(349),
  category: categorySchema.default("kurtis"),
});

/**
 * Seller edits to their own listing. Every field optional (PATCH), but the set is closed on purpose:
 * `verified`, `rankBoost` and `sellerId` are absent because the agents and the orchestrator own them.
 * A seller who could PATCH `verified: true` would mint the ✓ Asli Verified badge without proving
 * anything, which is the one thing this product exists to prevent.
 *
 * `status` is limited to the two a seller legitimately controls: publish (live) and unpublish
 * (draft). Blocked/escalated are decisions, not settings.
 */
export const listingUpdateSchema = z
  .object({
    title: z.string().min(3).max(120).optional(),
    description: z.string().max(2000).optional(),
    price: z.number().int().min(1).max(100000).optional(),
    // MRP is the struck-through "was" price. Bounded like price, and cross-checked against it at the
    // Pricing step — an MRP below the selling price is a fake discount, not a bargain.
    mrp: z.number().int().min(1).max(100000).optional(),
    category: categorySchema.optional(),
    stock: z.number().int().min(0).max(100000).optional(),
    sku: z.string().max(40).optional(),
    status: z.enum(["live", "draft"]).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

/** Fields the Details / Pricing / Inventory steps write. Same bounds as a seller edit. */
export const listingDetailsSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(2000).default(""),
  category: categorySchema,
});

/**
 * Send a message on an order's thread.
 *
 * `listingId` is deliberately absent: the route takes it from the order row. Accepting it from the
 * client would let a participant of one order attach a message to a listing they have no part in.
 * `.trim()` before the length check so a message of pure whitespace is empty, not valid.
 */
export const messageSendSchema = z.object({
  orderId: z.string().min(1),
  body: z.string().trim().min(1).max(2000),
});

/**
 * Seller business profile. Closed set: trustScore, trustBand, passes, fails and kycStatus are the
 * agents' and reviewers' to write — a seller who could PATCH their own trust score would skip the
 * checks that score exists to gate.
 *
 * GST/PAN are format-checked because a wrong-shaped one is a typo worth catching at the edge, not a
 * mystery later. Only the last four bank digits are accepted — enough for a seller to recognise
 * their payout account, and nothing worth stealing.
 */
export const sellerProfileSchema = z
  .object({
    businessName: z.string().min(2).max(120).optional(),
    shopName: z.string().min(2).max(120).optional(),
    gst: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/, "GST must look like 27AAPFU0939F1ZV.").optional().or(z.literal("")),
    pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "PAN must look like AAPFU0939F.").optional().or(z.literal("")),
    address: z.string().max(300).optional(),
    mobile: z.string().regex(/^[6-9][0-9]{9}$/, "Enter a 10-digit Indian mobile number.").optional().or(z.literal("")),
    bankLast4: z.string().regex(/^[0-9]{4}$/, "Last 4 digits only.").optional().or(z.literal("")),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

export const orderCreateSchema = z.object({
  listingId: z.string().min(1),
  paymentMethod: z.enum(["cod", "upi_mock"]),
  address: z.object({
    name: z.string().min(1), line1: z.string().min(1),
    city: z.string().min(1), pincode: z.string().regex(/^\d{6}$/),
  }),
});

export const reviewDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]), note: z.string().min(1).max(500),
});

export const kycSubmitSchema = z.object({ shopName: z.string().min(2).max(80) });
