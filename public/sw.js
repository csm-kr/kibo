// KIBO service worker: makes the phone app installable and shows /offline.html when /app opens with no network.
// Registered with scope /app (src/components/app/ServiceWorker.tsx). It caches only the offline page and never
// answers anything else: /api, session streams and /assistant always go straight to the network.

const CACHE = "kibo-offline-v1";
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.mode !== "navigate") return;
  const path = new URL(request.url).pathname;
  if (path !== "/app" && !path.startsWith("/app/")) return;
  // Network first; the cached page only when there is no network at all.
  event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
});
