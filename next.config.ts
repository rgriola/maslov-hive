import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Next.js from bundling Three.js server-side (browser-only WebGL library)
  serverExternalPackages: ['three'],
};

export default nextConfig;
