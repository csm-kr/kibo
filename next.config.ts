import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloud Run runs the minimal standalone server (see Dockerfile).
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  // The dev "N" badge would show in QA screenshots and demo footage.
  devIndicators: false,
  experimental: {
    // Playwright starts its dev servers one after another on the same .next/dev; reusing the compile cache there
    // made pages reload in a loop ("[Fast Refresh] rebuilding" on every connect). Off for those servers only.
    turbopackFileSystemCacheForDev: process.env.KIBO_DEV_CACHE !== "off",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The claim token travels in the URL fragment; never leak the page URL to other sites.
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "microphone=(self), camera=()" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
