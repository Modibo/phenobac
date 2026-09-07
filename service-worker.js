// service-worker.js — coquille hors-ligne + installabilité PWA.
// Met en cache l'interface (HTML/icônes) pour que l'app s'ouvre sans réseau.
// Les appels d'API (interprétation, licences…) passent toujours par le réseau.

const CACHE = "phenobac-v1";
const SHELL = [
  "/", "/phenobac.html", "/manifest.webmanifest",
  "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Ne jamais mettre en cache les appels d'API : toujours le réseau.
  if (url.pathname.includes("/functions/") || url.pathname.startsWith("/api/")) return;

  // Navigation : on sert l'interface depuis le cache, réseau en secours.
  if (req.mode === "navigate") {
    e.respondWith(
      caches.match("/phenobac.html")
        .then((r) => r || caches.match("/"))
        .then((r) => r || fetch(req))
        .catch(() => fetch(req))
    );
    return;
  }

  // Autres ressources : cache d'abord, réseau ensuite (et on met en cache le same-origin).
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((resp) => {
      if (url.origin === location.origin && resp && resp.status === 200) {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return resp;
    }).catch(() => cached))
  );
});
