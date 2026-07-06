// LISION Portal — Minimal Service Worker
// Caches static assets only. Not offline-first.
// Cache version is based on build date — updated on each deploy.

const CACHE_VERSION = "20260703";
const CACHE_NAME = `lision-portal-v${CACHE_VERSION}`;
const STATIC_ASSETS = [
  "/portal",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("lision-portal-") && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Network-first for API calls
  if (event.request.url.includes("/api/")) return;

  // Network-first; no cache-miss deve retornar undefined (senão o browser lança
  // "Failed to convert value to 'Response'"). Garante sempre uma Response válida.
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then((cached) => cached || Response.error())
    )
  );
});
