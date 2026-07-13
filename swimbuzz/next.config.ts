import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  // Keep Turbopack rooted on this app, not a parent folder with another lockfile.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
