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

const VERSION = "v48";                 // à incrémenter à chaque livraison
const CACHE = "phenobac-" + VERSION;

const SHELL = [
  // moteur.js EN PREMIER dans l'intention sinon dans l'ordre : sans lui en
  // cache, l'application s'ouvrirait hors ligne sans pouvoir interpréter,
  // c'est-à-dire sans faire ce pour quoi elle existe.
  "/", "/phenobac.html", "/base-connaissances.js", "/posologie.js", "/rendu-cible.js", "/moteur.js",
  "/manifest.webmanifest",
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

// Prévient les onglets ouverts qu'une version plus récente a été récupérée.
// Sans cela, l'utilisateur travaille sur la version précédente jusqu'à ce
// qu'il recharge de lui-même — or une livraison peut corriger des seuils.
function prevenirOnglets() {
  self.clients.matchAll({ type: "window" }).then((cs) => {
    cs.forEach((c) => c.postMessage({ type: "phenobac-maj" }));
  }).catch(() => {});
}

// Récupère sur le réseau et met à jour le cache. Ne rejette jamais :
// hors-ligne, on garde ce qui est déjà en cache. Si le contenu récupéré diffère
// de celui en cache, les onglets ouverts en sont informés.
function revalidate(req, key) {
  const cle = key || req;
  return caches.open(CACHE).then((c) =>
    c.match(cle).then((ancien) =>
      fetch(req).then((resp) => {
        if (resp && resp.status === 200 && (resp.type === "basic" || resp.type === "default")) {
          // Un serveur qui n'envoie ni etag ni last-modified rendrait toute
          // comparaison vide : « inchangé » pour l'éternité, et la barre de
          // mise à jour ne s'afficherait jamais. La taille du corps est un
          // repère grossier, mais il vaut mieux que pas de repère du tout.
          const marque = (r) => r.headers.get("etag") || r.headers.get("last-modified")
                             || r.headers.get("content-length") || "";
          const change = !!ancien && marque(ancien) !== marque(resp);
          c.put(cle, resp.clone()).catch(() => {});
          if (change) prevenirOnglets();
        }
        return resp;
      }).catch(() => null)
    )
  ).catch(() => null);
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
