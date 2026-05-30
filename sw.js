// Minimal service worker: caches the app shell so it opens instantly.
// Search results are always fetched fresh (never cached).
const CACHE = "forage-v1";
const SHELL = ["/", "/index.html", "/manifest.json", "/apple-touch-icon.png", "/icon-192.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return; // never cache live data
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
