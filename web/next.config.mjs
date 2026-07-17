import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Legacy → canonical route map.
 *
 * The portals moved to role-prefixed paths (/seller/*, /buyer/*, /admin/*). Everything below is a
 * URL that already shipped: the CLAUDE.md demo script, the deployed links, and the Playwright specs
 * point at the old ones, so they redirect rather than 404.
 *
 * `permanent: false` (307) on purpose. A 308 is cached by the browser essentially forever — if one
 * of these targets turns out wrong, a permanent redirect is unfixable on machines that already hit
 * it. Revisit once the routes have settled.
 */
const legacyRedirects = [
  { source: "/sell", destination: "/seller/create-listing" }, // ?listing= is forwarded automatically
  { source: "/seller", destination: "/seller/dashboard" },
  { source: "/seller/products", destination: "/seller/listings" },
  { source: "/shop", destination: "/buyer/dashboard" },
  { source: "/shop/:id", destination: "/buyer/listings/:id" },
  { source: "/checkout", destination: "/buyer/checkout" },
  { source: "/orders/:id", destination: "/buyer/orders/:id" },
  { source: "/admin", destination: "/admin/dashboard" },
  { source: "/admin/queue", destination: "/admin/review" },
].map((r) => ({ ...r, permanent: false }));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the tracing root to web/ — a stray lockfile in the user home dir confuses inference.
  outputFileTracingRoot: __dirname,
  async redirects() {
    return legacyRedirects;
  },
};
export default nextConfig;
