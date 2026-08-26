import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Server Actions carry file uploads for the document module.
    serverActions: { bodySizeLimit: "12mb" },
  },
  typedRoutes: false,
};

export default nextConfig;
