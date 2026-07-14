// Server-side image loading for the agent pipelines. Resolves a stored image reference to a Blob
// the VlmProvider can post. ONLY two shapes are accepted, by design (defence in depth):
//   • a data: URL (buyer/seller upload — decoded in-process, no I/O), or
//   • a site-relative /public path (our own assets).
// External/absolute URLs are rejected outright, so this can never be turned into an SSRF gadget,
// and /public paths are containment-checked (+ symlink re-check) so they can never traverse out of
// the public directory. Extensions are whitelisted.
import path from "node:path";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";

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

  // Only a site-relative /public path is allowed — never an external/absolute URL (no SSRF surface).
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
