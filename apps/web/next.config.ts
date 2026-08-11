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
  transpilePackages: [
    // Prefer not pulling workspace packages into web server routes; mobile uses @swimbuzz/*.
  ],
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Authorization, Content-Type, X-Requested-With",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
