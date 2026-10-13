"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js, which only makes KIBO installable and shows an offline page for /app. Rendered by /app and
 * /assistant only, and only in production builds (a dev server's service worker would outlive the code it served).
 * The scope is /app, so /assistant, /api and the session streams never pass through it.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/app", updateViaCache: "none" }).catch(() => {
      // Not installable then; the web app works the same.
    });
  }, []);
  return null;
}
