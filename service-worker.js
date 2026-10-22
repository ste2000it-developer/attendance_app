const CACHE_NAME = "ste2000-attendance-v2-admin";
const APP_SHELL = [
  "./",
  "./index.html",
  "./attendance.html",
  "./admin.html",
  "./admin.css",
  "./admin.js",
  "./style.css",
  "./attendance.css",
  "./app.js",
  "./attendance.js",
  "./firebase.js",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  // Prefer fresh admin assets; serve cached versions during network outages.
  const url = new URL(request.url);
  const isAdminAsset = url.origin === self.location.origin &&
    ["admin.html", "admin.css", "admin.js"].some((name) => url.pathname.endsWith("/" + name));

  if (isAdminAsset) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || Response.error())
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then((networkResponse) => {
          const responseClone = networkResponse.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });

          return networkResponse;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
