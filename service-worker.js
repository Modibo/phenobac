// service-worker.js — coquille hors-ligne + installabilité PWA.
// Met en cache l'interface (HTML/icônes) pour que l'app s'ouvre sans réseau.
// Les appels d'API (interprétation, licences…) passent toujours par le réseau.
//
// Stratégie : « cache d'abord, puis rafraîchissement en tâche de fond »
// (stale-while-revalidate). L'application s'ouvre instantanément, y compris sur
// un réseau lent, ET la version suivante est récupérée sans intervention : au
// lancement d'après, le client a la dernière version.
//
// ATTENTION : avec un cache purement « cache d'abord » (sans revalidation), un
// laboratoire qui a installé l'application ne reçoit PLUS AUCUNE mise à jour —
// ni correctif d'interprétation, ni nouvelle espèce. C'est inacceptable pour un
// produit payant : ne revenez pas à cette stratégie.

const VERSION = "v2";                 // à incrémenter à chaque livraison
const CACHE = "phenobac-" + VERSION;

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

// Récupère sur le réseau et met à jour le cache. Ne rejette jamais :
// hors-ligne, on se contente de garder ce qui est déjà en cache.
function revalidate(req, key) {
  return fetch(req).then((resp) => {
    if (resp && resp.status === 200 && (resp.type === "basic" || resp.type === "default")) {
      const copy = resp.clone();
      caches.open(CACHE).then((c) => c.put(key || req, copy)).catch(() => {});
    }
    return resp;
  }).catch(() => null);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Ne jamais mettre en cache les appels d'API : toujours le réseau.
  if (url.pathname.includes("/functions/") || url.pathname.startsWith("/api/")) return;

  // Navigation : on répond depuis le cache (instantané), et on rafraîchit derrière.
  if (req.mode === "navigate") {
    e.respondWith(
      caches.match("/phenobac.html").then((cached) => {
        const fresh = revalidate(new Request("/phenobac.html", { cache: "reload" }), "/phenobac.html");
        return cached || fresh.then((r) => r || fetch(req));
      }).catch(() => fetch(req))
    );
    return;
  }

  // Autres ressources same-origin : même principe.
  e.respondWith(
    caches.match(req).then((cached) => {
      const fresh = revalidate(req);
      if (cached) { e.waitUntil(fresh); return cached; }
      return fresh.then((r) => r || fetch(req));
    })
  );
});
