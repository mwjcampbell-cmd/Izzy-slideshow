
const CACHE_NAME = "izzy-frame-v2";
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
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  if (url.origin === location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const res = await fetch(event.request);
      cache.put(event.request, res.clone());
      return res;
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const res = await fetch(event.request, { mode: "cors" });
      const ct = res.headers.get("content-type") || "";
      if (ct.startsWith("image/")) cache.put(event.request, res.clone());
      return res;
    } catch {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      throw new Error("offline");
    }
  })());
});
