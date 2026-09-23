// ImageForge service worker: the tools are local, so after the first visit they work offline.
//
// The shell and the codecs (public/wasm) are precached. Everything else the app fetches from its own
// origin and that never changes its contents for a given URL — the hashed bundles, the wasm, the
// bundled artifacts — is cached the first time it is seen. Navigations go to the network first so a
// new build is picked up, and fall back to the cached shell when there is no network at all.
const CACHE = "imageforge-v1";
const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/wasm/imageforge.wasm",
  "/wasm/kptools.wasm",
  "/wasm/lz4.wasm",
  "/wasm/bzip2.wasm",
];
const RUNTIME_PREFIXES = ["/wasm/", "/artifacts/", "/assets/", "/icons/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/").then((cached) => cached || Response.error())));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && RUNTIME_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
