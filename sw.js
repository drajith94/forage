// Forage service worker — network-first so updates always win.
// Bump CACHE version on every deploy to evict the old app shell.
const CACHE = "forage-v4";
const SHELL = ["/", "/index.html", "/manifest.json", "/apple-touch-icon.png", "/icon-192.png"];

self.addEventListener("install", (e) => {
  // Activate the new worker immediately instead of waiting
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return; // never cache live data

  // Network-first for navigation/HTML so the newest app always loads.
  if (e.request.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith(".html")) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match("/index.html")))
    );
    return;
  }

  // Cache-first for static assets (icons, manifest).
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
