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
