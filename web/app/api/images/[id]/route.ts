import { repoReady } from "@/lib/db";
import { fail } from "@/lib/api";

/**
 * Serve one product image by id. Public — these are marketplace catalog photos.
 *
 * Images captured through the seller flow are persisted as inline `data:image/...;base64,...` in
 * product_images.url (~937 KB each in production). Embedding those in the feed made every card carry
 * a megabyte of JSON. Here they are decoded once and returned as real bytes, so the browser can
 * lazy-load and cache them like any other image. Seeded listings store a static path instead
 * (/mock/*.svg) — those redirect, keeping one URL shape for every card.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const repo = await repoReady();
  const image = await repo.getImage(id);
  if (!image) return fail(404, "not_found", "Image not found.");

  if (!image.url.startsWith("data:")) {
    // Static asset (seed data) — hand it back to the CDN rather than proxying bytes through here.
    return Response.redirect(new URL(image.url, _req.url), 302);
  }

  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(image.url);
  if (!match) return fail(422, "bad_image", "Stored image is not a readable data URL.");
  const [, mime, isBase64, payload] = match;
  const bytes = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(bytes.byteLength),
      // Image rows are immutable once written (a new capture writes a new row + id).
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
