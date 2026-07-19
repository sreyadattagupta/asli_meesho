// Server-side image loading for the agent pipelines. Resolves a stored image reference to a Blob
// the VlmProvider can post. THREE shapes are accepted, by design (defence in depth):
//   • a data: URL (buyer/seller upload — decoded in-process, no I/O),
//   • a site-relative /public path (our own assets), or
//   • an object in OUR OWN Supabase Storage bucket — origin-allowlisted, never arbitrary hosts.
// Everything else is rejected, so this can never be turned into an SSRF gadget, and /public paths
// are containment-checked (+ symlink re-check) so they can never traverse out of the public
// directory. Extensions are whitelisted.
//
// The Supabase case is not a loosening — it is the missing half. With DATA_BACKEND=supabase every
// stored image IS an absolute storage URL, so rejecting absolute URLs outright meant Agent 4 could
// never load the frozen catalog image: the delivery check threw before the VLM was ever called and
// silently degraded to "couldn't verify". Confirmed in production — the request never reached the
// CV service at all.
import path from "node:path";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";

/** Origin of our own Supabase project, or null when unconfigured (local/in-memory runs). */
function supabaseOrigin(): string | null {
  const raw = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

/** True only for a PUBLIC object in our own bucket — same origin, https, public-object path. */
function isOwnPublicStorageUrl(ref: string): boolean {
  const origin = supabaseOrigin();
  if (!origin) return false;
  let u: URL;
  try {
    u = new URL(ref);
  } catch {
    return false;
  }
  // Compare parsed origins — never string-prefix matching, which "…supabase.co.evil.com" defeats.
  return u.origin === origin && u.pathname.startsWith("/storage/v1/object/public/");
}

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
};

function mimeForOrThrow(ref: string): string {
  const type = MIME[path.extname(ref).toLowerCase()];
  if (!type) throw new Error(`unsupported image type: ${ref}`);
  return type;
}

export async function loadImageBlob(ref: string): Promise<Blob> {
  if (ref.startsWith("data:")) {
    const comma = ref.indexOf(",");
    const meta = ref.slice(5, comma); // e.g. "image/jpeg;base64"
    const isB64 = meta.includes("base64");
    const type = meta.split(";")[0] || "image/jpeg";
    const data = ref.slice(comma + 1);
    const bytes = isB64
      ? Uint8Array.from(Buffer.from(data, "base64"))
      : new TextEncoder().encode(decodeURIComponent(data));
    return new Blob([bytes], { type });
  }

  // Our own Supabase Storage object: allowlisted by parsed origin, fetched without following a
  // redirect elsewhere (a 3xx to another host would re-open the SSRF hole the allowlist closes).
  if (isOwnPublicStorageUrl(ref)) {
    const res = await fetch(ref, { redirect: "error" });
    if (!res.ok) throw new Error(`image fetch ${res.status} for ${ref}`);
    return res.blob();
  }

  // Anything else must be a site-relative /public path — never an arbitrary absolute URL.
  if (!ref.startsWith("/") || ref.startsWith("//") || ref.includes("\\")) {
    throw new Error(`unsupported image ref: ${ref}`);
  }
  const type = mimeForOrThrow(ref);

  // Path-traversal containment: the resolved path must stay under /public.
  const publicDir = path.resolve(process.cwd(), "public");
  const full = path.resolve(publicDir, `.${ref}`);
  if (full !== publicDir && !full.startsWith(publicDir + path.sep)) {
    throw new Error(`invalid image path: ${ref}`);
  }

  // Filesystem first (works locally, in tests, and in the bundled lambda).
  try {
    const { readFile, realpath } = await import("node:fs/promises");
    // Re-check after symlink resolution so a symlinked file can't escape /public.
    const real = await realpath(full);
    if (real !== publicDir && !real.startsWith(publicDir + path.sep)) {
      throw new Error(`invalid image path: ${ref}`);
    }
    const buf = await readFile(real);
    return new Blob([Uint8Array.from(buf)], { type });
  } catch (e) {
    // A containment failure is fatal; a plain not-found falls back to the CDN (same origin only).
    if (e instanceof Error && e.message.startsWith("invalid image path")) throw e;
    const res = await fetch(`${BASE}${ref}`);
    if (!res.ok) throw new Error(`image fetch ${res.status} for ${ref}`);
    return res.blob();
  }
}
