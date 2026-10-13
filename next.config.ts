import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloud Run runs the minimal standalone server (see Dockerfile).
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  // The dev "N" badge would show in QA screenshots and demo footage.
  devIndicators: false,
  // A second dev server (the voice relay E2E stack, scripts/e2e-relay-stack.ts) needs its own folder: Next.js
  // allows one dev server per folder (.next-e2e-relay, outside .next, which `next build` empties). Unset everywhere else.
  ...(process.env.KIBO_DIST_DIR ? { distDir: process.env.KIBO_DIST_DIR } : {}),
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
      {
        // The in-app QR scanner is the only page that may use the camera. Later entries win for the same header.
        source: "/app/scan",
        headers: [{ key: "Permissions-Policy", value: "microphone=(self), camera=(self)" }],
      },
      {
        // The service worker is always fetched fresh, so a fix reaches phones on their next visit.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
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
