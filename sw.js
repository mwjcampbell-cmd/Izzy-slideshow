const CACHE_NAME = "izzy-frame-v5";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./frame_bg.png",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k === CACHE_NAME ? null : caches.delete(k))));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // App shell: cache-first for same-origin requests
  if (url.origin === location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);
      if (cached) return cached;

      const res = await fetch(event.request);
      // Cache successful responses
      if (res && res.ok) cache.put(event.request, res.clone());
      return res;
    })());
    return;
  }

  // Cross-origin (Google APIs + images): network-first, fallback to cache.
  // IMPORTANT: do NOT override request mode (images are often no-cors/opaque).
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);

    try {
      const res = await fetch(event.request);

      // Cache images (including opaque) for smoother playback
      const ct = (res && res.headers) ? (res.headers.get("content-type") || "") : "";
      if (res && (ct.startsWith("image/") || res.type === "opaque")) {
        cache.put(event.request, res.clone());
      }
      return res;
    } catch (e) {
      if (cached) return cached;
      throw e;
    }
  })());
});
