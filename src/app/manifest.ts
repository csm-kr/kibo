import type { MetadataRoute } from "next";

// The installable phone app (served as /manifest.webmanifest). Installing is optional: a kiosk's QR link opens
// /assistant in the browser with no install (docs/PRD.md "Why the phone").
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KIBO",
    short_name: "KIBO",
    description: "Talk to your phone, and the kiosk orders for you.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#FBF7EF",
    theme_color: "#3446D4",
    lang: "en",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
