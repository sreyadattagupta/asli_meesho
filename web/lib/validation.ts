// Zod schemas — one per mutating route (CLAUDE.md §11).
import { z } from "zod";

export const roleSelectSchema = z.object({ role: z.enum(["seller", "buyer", "admin"]) });

export const listingCreateSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(2000).default(""),
  price: z.number().int().min(1).max(100000),
  category: z.enum(["sarees", "kurtis", "footwear", "jewellery"]),
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
    category: z.enum(["sarees", "kurtis", "footwear", "jewellery"]).optional(),
    status: z.enum(["live", "draft"]).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

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
