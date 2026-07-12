import crypto from "crypto";
import { NextRequest } from "next/server";
import { getTrigger } from "@/lib/trigger";
import { repoReady } from "@/lib/db";
import { fail, ok } from "@/lib/api";

// POST: catalog image → reverse-image TRIGGER (invariant #1 — never a verdict).
// With a listingId, persists the catalog image + an audit entry against the draft.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("catalog");
    if (!(file instanceof Blob)) return fail(400, "catalog_required", "Catalog image required.");
    const listingId = typeof form.get("listingId") === "string" ? (form.get("listingId") as string) : undefined;

    const buf = Buffer.from(await file.arrayBuffer());
    const imageHash = crypto.createHash("sha256").update(buf).digest("hex");
    const result = await getTrigger(imageHash, buf);

    if (listingId) {
      const repo = await repoReady();
      const listing = await repo.getListing(listingId);
      if (listing) {
        // data URL keeps the demo self-contained (no blob storage service in the declared stack)
        const url = `data:${file.type || "image/jpeg"};base64,${buf.toString("base64")}`;
        await repo.addImage({ listingId, url, imageHash, kind: "catalog" });
        await repo.updateListing(listingId, { flowStep: result.triggered ? "challenge" : "sizing" });
        await repo.appendAudit({
          listingId, actor: "trigger", event: "reverse_image_checked",
          data: { triggered: result.triggered, matchCount: result.matchCount, source: result.source },
        });
      }
    }

    // `mocked` kept for the existing client shape; equivalent to source === "mock".
    return ok({ ...result, mocked: result.source === "mock" });
  } catch {
    return fail(500, "internal", "Image check failed.");
  }
}
