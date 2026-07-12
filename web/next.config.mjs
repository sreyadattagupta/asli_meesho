import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the tracing root to web/ — a stray lockfile in the user home dir confuses inference.
  outputFileTracingRoot: __dirname,
};
export default nextConfig;
