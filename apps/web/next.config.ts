import type { NextConfig } from "next";
import path from "path";

// Repo root: next is hoisted here (node-linker=hoisted). Rooting Turbopack on
// apps/web alone fails because next/package.json is not under that directory.
const monorepoRoot = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  // Must match: Next prefers outputFileTracingRoot when they differ.
  // Relative CSS @imports break with a monorepo turbopack root — import
  // variables.css from layout.tsx instead of @import in globals.css.
  turbopack: {
    root: monorepoRoot,
  },
  outputFileTracingRoot: monorepoRoot,
  // Turbopack's tracing misses sharp's native libvips (@img/sharp-libvips-*/lib/*.so),
  // so sharp fails to load on Vercel (ERR_DLOPEN_FAILED). Include it explicitly.
  outputFileTracingIncludes: {
    "/api/meets/*": ["./node_modules/@img/**/*", "../../node_modules/@img/**/*"],
  },
  transpilePackages: [
    // Prefer not pulling workspace packages into web server routes; mobile uses @swimbuzz/*.
  ],
  // CORS for /api/* is handled in src/middleware.ts, which reflects only an
  // allowlisted origin instead of a static "*" (invalid alongside credentials
  // anyway, and not something route headers here could vary per-request).
};

export default nextConfig;
