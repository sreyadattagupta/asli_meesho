"use client";

// One typed client for writing the wizard's draft fields back to the listing row.
//
// Two callers, one payload shape: the "Save Draft" button on every step, and the Preview step just
// before it publishes. Keeping the field-filtering here means those two can't drift into saving
// different things.
import type { SellerDraft } from "./store";

/** Normalized failure — every caller renders the message and offers a retry. */
export class DraftSaveError extends Error {}

/**
 * PATCH the fields the seller has actually filled in.
 *
 * Empty values are omitted rather than sent: the route's schema enforces `title.min(3)`, so posting
 * a half-typed title would 400 and take the rest of the save down with it. A draft is allowed to be
 * incomplete — the publish route is where completeness is enforced.
 */
export async function saveDraftFields(listingId: string, draft: SellerDraft): Promise<void> {
  const patch = {
    ...(draft.title.trim().length >= 3 ? { title: draft.title.trim() } : {}),
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    price: draft.price,
    category: draft.category,
    ...(draft.mrp > 0 ? { mrp: draft.mrp } : {}),
    stock: draft.stock,
    ...(draft.sku.trim() ? { sku: draft.sku.trim() } : {}),
  };

  let res: Response;
  try {
    res = await fetch(`/api/listings/${listingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch {
    throw new DraftSaveError("Network hiccup — nothing was saved.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new DraftSaveError(body?.error?.message ?? "Could not save this listing.");
  }
}
