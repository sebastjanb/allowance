/* Allowance PWA — service worker.
   Bump CACHE when you change any file in SHELL. */
/* Bump CACHE *and* the ?v= query on styles/config/app in index.html
   together whenever you change those files. */
const CACHE = "allowance-v10";
const SHELL = [
  "./", "./index.html", "./styles.css?v=6", "./app.js?v=6", "./config.js?v=6",
  "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png",
  "./icons/icon-180.png", "./icons/favicon.svg"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never intercept Firestore traffic — it does its own offline queueing.
  if (url.hostname.endsWith("googleapis.com") || url.hostname.endsWith("firebaseio.com")) return;

  // Firebase SDK modules from the CDN: stale-while-revalidate so the app can
  // cold-start with no network.
  if (url.hostname === "www.gstatic.com") {
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  // App shell: network-first so updates land, cache as the offline fallback.
  if (url.origin === location.origin) {
    // GitHub Pages serves index.html with max-age=600, so a plain fetch here
    // can be answered by the browser's HTTP cache and keep handing out an old
    // page — which then loads the old ?v= assets. Navigations must revalidate.
    const fresh = req.mode === "navigate"
      ? fetch(req.url, { cache: "reload", credentials: "same-origin" })
      : fetch(req);
    e.respondWith(
      fresh
        .then(r => {
          if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
          return r;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match("./index.html")))
    );
  }
});
