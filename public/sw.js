const CACHE_NAME = "level-up-shell-v2";
const BASE = self.location.pathname.replace("sw.js", "");
const APP_SHELL = [BASE, BASE + "index.html", BASE + "offline.html", BASE + "manifest.webmanifest", BASE + "icons/level-up.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(BASE, clone));
          return response;
        })
        .catch(() => caches.match(BASE) || caches.match(BASE + "offline.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(BASE + "offline.html"));
    })
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag === "level-up-sync") {
    event.waitUntil(self.clients.matchAll().then((clients) => {
      clients.forEach((client) => client.postMessage({ type: "LEVEL_UP_BACKGROUND_SYNC" }));
    }));
  }
});
