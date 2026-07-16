/**
 * One-shot: move inline `data:` image blobs out of product_images.url into Supabase Storage.
 *
 * Rows written before the Storage offload landed hold `data:image/jpeg;base64,...` directly in the
 * column (~937 KB each; 33.7 MB total in production). New writes go straight to Storage via
 * SupabaseRepo.addImage — this backfills the existing rows so reads stop paying for them.
 *
 * Idempotent: rows whose url is already an https:// reference are skipped, so it is safe to re-run.
 * Read-modify-write per row, no deletes — worst case a row keeps its inline url.
 *
 *   node scripts/migrate-image-blobs.mjs [--dry]
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^"|"$/g, "");
}

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "product-images";
const DRY = process.argv.includes("--dry");
if (!URL_ || !KEY) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const mb = (n) => (n / 1048576).toFixed(2);

const rows = await (await fetch(`${URL_}/rest/v1/product_images?select=id,kind,url`, { headers: H })).json();
const inline = rows.filter((r) => (r.url ?? "").startsWith("data:"));
console.log(`${rows.length} rows, ${inline.length} inline (${mb(inline.reduce((a, r) => a + r.url.length, 0))} MB)`);
if (DRY) { console.log("--dry: nothing written"); process.exit(0); }

let moved = 0, failed = 0, freed = 0;
for (const row of inline) {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(row.url);
  if (!m) { failed++; continue; }
  const [, mime, isBase64, payload] = m;
  const bytes = isBase64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
  const ext = (mime.split("/")[1] ?? "jpg").replace(/[^a-z0-9]/gi, "");
  const path = `${row.kind}/${randomUUID()}.${ext}`;

  const up = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { ...H, "Content-Type": mime, "Cache-Control": "31536000" },
    body: bytes,
  });
  if (!up.ok) { console.error(`  upload failed ${row.id}: ${up.status} ${await up.text()}`); failed++; continue; }

  const publicUrl = `${URL_}/storage/v1/object/public/${BUCKET}/${path}`;
  // Only rewrite the column AFTER the bytes are safely in Storage.
  const patch = await fetch(`${URL_}/rest/v1/product_images?id=eq.${row.id}`, {
    method: "PATCH",
    headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ url: publicUrl }),
  });
  if (!patch.ok) { console.error(`  patch failed ${row.id}: ${patch.status}`); failed++; continue; }
  moved++; freed += row.url.length;
  console.log(`  moved ${row.kind} ${row.id} -> ${path} (${mb(row.url.length)} MB)`);
}
console.log(`done: ${moved} moved, ${failed} failed, ${mb(freed)} MB removed from Postgres`);
