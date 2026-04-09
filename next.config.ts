import path from "node:path";
import type { NextConfig } from "next";

const repoRoot = __dirname;

const nextConfig: NextConfig = {
  // Exclude Node.js-only packages from Turbopack bundling (Windows symlink fix)
  serverExternalPackages: ["pg", "pg-native", "pg-pool", "pg-protocol"],
  outputFileTracingRoot: repoRoot,
  turbopack: {
    root: repoRoot,
  },
};

export default nextConfig;
