import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude Node.js-only packages from Turbopack bundling (Windows symlink fix)
  serverExternalPackages: ["pg", "pg-native", "pg-pool", "pg-protocol"],
};

export default nextConfig;
