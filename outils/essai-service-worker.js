/* ============================================================
   essai-service-worker.js — la mise à jour atteint-elle la paillasse ?

   CE QUE CE BANC PROTÈGE

   PhénoBac s'installe comme application et sert ses fichiers depuis un cache.
   C'est ce qui lui permet de fonctionner à Mopti quand la connexion tombe.
   C'est aussi ce qui peut figer un laboratoire sur des seuils périmés —
   sans aucun signe, avec l'assurance de la dernière version. Un seuil corrigé
   qui n'arrive pas est pire qu'un seuil absent : on l'applique.

   Rien n'éprouvait service-worker.js. Un contrôle de texte vérifiait que les
   maillons étaient PRÉSENTS ; il ne pouvait pas dire s'ils FONCTIONNAIENT.
   La mutation qui remplaçait « keys.filter(…) » par « [].filter(…) » — plus
   aucun ancien cache détecté, donc plus aucun onglet prévenu — passait
   inaperçue.

   On exécute donc le vrai fichier, avec un faux navigateur : un cache en
   mémoire, des clients, un réseau que l'on pilote. Et l'on regarde ce qu'il
   fait, pas ce qu'il contient.

   Avec Node :             node outils/essai-service-worker.js
   Sans Node, sur macOS :  …/jsc outils/essai-service-worker.js
   ============================================================ */

var KO = 0, OK = 0;
function dire(s) { (typeof console === "object" ? console.log : print)(s); }
function verif(ok, txt) { ok ? OK++ : KO++; dire((ok ? "  ok   " : "  ÉCHEC") + "  " + txt); }

function source() {
  if (typeof readFile === "function") return readFile("service-worker.js");
  return require("fs").readFileSync(
    require("path").join(__dirname, "..", "service-worker.js"), "utf8");
}

/* ---------- Le faux navigateur ---------- */

function Reponse(corps, opts) {
  opts = opts || {};
  var h = opts.headers || {};
  return {
    status: opts.status === undefined ? 200 : opts.status,
    type: opts.type || "basic",
    corps: corps,
    headers: { get: function (k) { return h[k.toLowerCase()]; } },
    clone: function () { return this; }
  };
}

/* Un vrai cache range sous l'URL ABSOLUE : addAll(["/moteur.js"]) et une
   requête vers https://site/moteur.js désignent la même entrée. Le faux cache
   doit faire de même — sans cela il ne retrouvait jamais l'ancienne version,
   « inchangé » pour l'éternité, et le banc accusait le service worker de ne
   pas prévenir les onglets alors qu'il le fait. */
function cle(req) {
  var u = typeof req === "string" ? req : req.url;
  return String(u).replace(/^https?:\/\/[^/]+/, "") || "/";
}

function Navigateur(reseau) {
  // LE RÉSEAU DOIT RESTER MODIFIABLE APRÈS LE CHARGEMENT. charger() passe
  // fetch au service worker par VALEUR : remplacer N.environnement.fetch
  // ensuite n'avait aucun effet sur le worker déjà chargé, et les épreuves
  // « le serveur a changé » et « le réseau est coupé » interrogeaient en
  // réalité le réseau du début. La première accusait le service worker d'un
  // défaut qui n'était que le mien ; la seconde passait par accident.
  // On garde donc un aiguillage stable, et c'est N.reseau qui change.
  var N = {
    reseau: reseau,
    caches: {},                 // nom → { clé → réponse }
    messages: [],               // ce que les onglets ont reçu
    claimApple: 0, skipApple: 0,
    demandes: []                // ce qui a été demandé au réseau
  };

  function Cache(nom) {
    return {
      addAll: function (chemins) {
        // cache.addAll() est ATOMIQUE : un seul 404 et RIEN n'est mis en cache.
        // Le faux cache doit se comporter comme le vrai, sinon le banc
        // affirmerait une robustesse que l'application n'a pas.
        var obtenus = [];
        for (var i = 0; i < chemins.length; i++) {
          var r = N.reseau(chemins[i]);
          if (!r || r.status !== 200) return Promise.reject(new Error("404 " + chemins[i]));
          obtenus.push([chemins[i], r]);
        }
        obtenus.forEach(function (p) { N.caches[nom][p[0]] = p[1]; });
        return Promise.resolve();
      },
      match: function (k) { return Promise.resolve(N.caches[nom][cle(k)]); },
      put: function (k, r) { N.caches[nom][cle(k)] = r; return Promise.resolve(); }
    };
  }

  N.environnement = {
    self: {
      _ecouteurs: {},
      addEventListener: function (t, f) { (this._ecouteurs[t] = this._ecouteurs[t] || []).push(f); },
      skipWaiting: function () { N.skipApple++; return Promise.resolve(); },
      clients: {
        claim: function () { N.claimApple++; return Promise.resolve(); },
        matchAll: function () {
          return Promise.resolve([{ postMessage: function (m) { N.messages.push(m); } }]);
        }
      }
    },
    caches: {
      open: function (nom) { N.caches[nom] = N.caches[nom] || {}; return Promise.resolve(Cache(nom)); },
      keys: function () { return Promise.resolve(Object.keys(N.caches)); },
      delete: function (nom) { delete N.caches[nom]; return Promise.resolve(true); },
      match: function (k) {
        for (var nom in N.caches) if (N.caches[nom][cle(k)]) return Promise.resolve(N.caches[nom][cle(k)]);
        return Promise.resolve(undefined);
      }
    },
    fetch: function (req) {
      N.demandes.push(cle(req));
      var r = N.reseau(cle(req));
      return r ? Promise.resolve(r) : Promise.reject(new Error("réseau coupé"));
    },
    Requete: function (url, o) { return { url: url, method: "GET", mode: (o && o.mode) || "no-cors" }; },
    // jsc n'a pas URL : on n'en garde que ce que le service worker en lit.
    Url: function (u) {
      var sansOrigine = String(u).replace(/^https?:\/\/[^/]+/, "");
      return { pathname: sansOrigine.split("?")[0] };
    }
  };
  return N;
}

function charger(N) {
  var e = N.environnement;
  (new Function("self", "caches", "fetch", "Request", "URL", source()))(
    e.self, e.caches, e.fetch, e.Requete, e.Url);
  return function (type, evt) {
    var attendus = [], reponse = null;
    evt = evt || {};
    evt.waitUntil = function (p) { attendus.push(p); };
    evt.respondWith = function (p) { reponse = p; };
    (e.self._ecouteurs[type] || []).forEach(function (f) { f(evt); });
    // ATTENDRE LA RÉPONSE D'ABORD. Le service worker appelle waitUntil() DEPUIS
    // la promesse de respondWith() — « je sers le cache, et je rafraîchis
    // derrière ». Prendre la photo des attentes avant d'avoir la réponse rate
    // donc exactement le rafraîchissement, c'est-à-dire la seule chose qui
    // prévient les onglets. Mon premier coureur faisait cela, et le banc
    // accusait le service worker d'un défaut qui n'était que le sien.
    return Promise.resolve(reponse).then(function (r) {
      return Promise.all(attendus).then(function () { return r; });
    });
  };
}

/* Un réseau qui sert tout, avec l'etag qu'on lui dicte. */
function reseauComplet(etag) {
  return function (u) { return Reponse("corps de " + u, { headers: { etag: etag || "a" } }); };
}

async function main() {

  /* ---------- 1. L'installation met la coquille en cache ---------- */
  dire("\nL'installation met la coquille en cache");
  (function () {})();
  var N = Navigateur(reseauComplet()), lancer = charger(N);
  await lancer("install");
  var noms = Object.keys(N.caches);
  verif(noms.length === 1 && /^phenobac-v/.test(noms[0]),
        "un cache est créé, nommé d'après la version (" + noms[0] + ")");
  var contenu = N.caches[noms[0]];
  ["/phenobac.html", "/moteur.js", "/base-connaissances.js", "/posologie.js", "/rendu-cible.js"]
    .forEach(function (c) {
      verif(!!contenu[c], c + " est en cache — sans lui, l'application s'ouvrirait sans pouvoir interpréter");
    });
  verif(N.skipApple === 1, "skipWaiting : la nouvelle version n'attend pas la fermeture des onglets");

  /* ---------- 2. Un seul 404 et le cache reste vide — SANS ERREUR ---------- */
  dire("\ncache.addAll() est atomique, et l'installation ne doit pas échouer pour autant");
  var manquant = Navigateur(function (u) {
    return u === "/rendu-cible.js" ? Reponse("", { status: 404 }) : Reponse("x", { headers: { etag: "a" } });
  });
  var lancer2 = charger(manquant);
  var aPlante = false;
  await lancer2("install").catch(function () { aPlante = true; });
  verif(!aPlante, "l'installation se termine sans rejet, même avec un fichier manquant");
  var vide = manquant.caches[Object.keys(manquant.caches)[0]] || {};
  verif(Object.keys(vide).length === 0,
        "… et le cache est ENTIÈREMENT vide : un seul 404 emporte les dix autres fichiers");

  /* ---------- 3. L'activation : prévenir, ou se taire ---------- */
  dire("\nUne mise à jour prévient les onglets ouverts ; une première installation se tait");
  var maj = Navigateur(reseauComplet()), lancerMaj = charger(maj);
  maj.caches["phenobac-v1"] = { "/phenobac.html": Reponse("vieux") };   // version précédente
  await lancerMaj("activate");
  verif(!maj.caches["phenobac-v1"], "le cache de la version précédente est supprimé");
  verif(maj.claimApple === 1, "clients.claim : les onglets déjà ouverts passent sous la nouvelle version");
  verif(maj.messages.length === 1, "un message part vers les onglets ouverts");
  verif((maj.messages[0] || {}).type === "phenobac-maj", "… et il dit qu'une version est arrivée");
  verif(/^v\d+$/.test((maj.messages[0] || {}).version || ""),
        "… en nommant la version (" + (maj.messages[0] || {}).version + ") : « recharger » sans savoir vers quoi se refuse");

  var neuf = Navigateur(reseauComplet()), lancerNeuf = charger(neuf);
  await lancerNeuf("activate");                       // aucun cache antérieur
  verif(neuf.messages.length === 0,
        "première installation : aucun message — annoncer « nouvelle version » à qui vient d'installer serait absurde");

  /* ---------- 4. Hors ligne, la page s'ouvre quand même ---------- */
  dire("\nHors ligne, la page s'ouvre depuis le cache");
  var coupe = Navigateur(reseauComplet()), lancerCoupe = charger(coupe);
  await lancerCoupe("install");
  coupe.reseau = function () { return null; };        // plus rien ne répond
  var rep = await lancerCoupe("fetch", { request: { url: "https://x/", method: "GET", mode: "navigate" } });
  var servi = await rep;
  verif(!!servi && /phenobac\.html/.test(servi.corps || ""),
        "navigation sans réseau : la page vient du cache");

  /* ---------- 5. Les appels d'API ne sont jamais mis en cache ---------- */
  dire("\nLes appels d'API passent toujours par le réseau");
  var api = Navigateur(reseauComplet()), lancerApi = charger(api);
  var r1 = await lancerApi("fetch", { request: { url: "https://x/api/licence", method: "GET", mode: "cors" } });
  verif(r1 === null, "/api/… : le service worker ne répond pas à la place du réseau");
  var r2 = await lancerApi("fetch", { request: { url: "https://x/.netlify/functions/interpret", method: "GET", mode: "cors" } });
  verif(r2 === null, "/functions/… : idem — une licence ou une interprétation ne se sert pas d'un cache");
  var r3 = await lancerApi("fetch", { request: { url: "https://x/moteur.js", method: "POST", mode: "cors" } });
  verif(r3 === null, "une requête POST n'est pas interceptée");

  /* ---------- 6. Le contenu change : les onglets l'apprennent ---------- */
  dire("\nUn fichier modifié sur le serveur prévient les onglets ouverts");
  var chg = Navigateur(reseauComplet("etag-1")), lancerChg = charger(chg);
  await lancerChg("install");
  chg.messages.length = 0;
  chg.reseau = reseauComplet("etag-2");               // le serveur a changé
  await lancerChg("fetch", { request: { url: "https://x/moteur.js", method: "GET", mode: "cors" } });
  verif(chg.messages.length >= 1, "etag différent : les onglets sont prévenus");

  var idem = Navigateur(reseauComplet("etag-1")), lancerIdem = charger(idem);
  await lancerIdem("install");
  idem.messages.length = 0;
  await lancerIdem("fetch", { request: { url: "https://x/moteur.js", method: "GET", mode: "cors" } });
  verif(idem.messages.length === 0,
        "etag identique : aucun message — une barre qui s'affiche sans raison finit par être ignorée");
}

function rapport() {
  dire("\n" + (KO ? KO + " échec(s) sur " + (OK + KO) + " contrôles."
                  : OK + " contrôles : la coquille tient hors ligne, et une correction de seuils"
                      + " atteint les onglets ouverts."));
  if (KO) {
    if (typeof process === "object" && process.exit) process.exit(1);
    throw new Error(KO + " échec(s)");
  }
}

/* LE RAPPORT DOIT ÊTRE SYNCHRONE, sous jsc comme sous Node.
   Appelé depuis un .then(), le « throw » du rapport devient une promesse
   rejetée que jsc signale sans changer son code de retour : le banc tombait
   au rouge à l'écran et au vert dans la chaîne. Un banc qui ne peut pas
   faire échouer une livraison ne protège rien. */
var course = main().then(function () {}, function (e) {
  KO++; dire("  ÉCHEC  exception : " + ((e && e.stack) || e));
});
if (typeof drainMicrotasks === "function") {
  drainMicrotasks();                 // jsc : les promesses sont déjà tenues
  rapport();                         // … donc on rapporte ici, au premier plan
} else {
  course.then(rapport);              // Node : process.exit fera le reste
}
