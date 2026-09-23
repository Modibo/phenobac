// server.js — PhénoBac auto-hébergé (VPS OVH).
// Réutilise TELLES QUELLES les fonctions écrites pour Netlify, via un adaptateur,
// et sert les pages statiques. Stockage local par fichier (voir lib/store.js).
//
//   npm install
//   cp .env.example .env   # puis renseigner les secrets
//   node server.js         # ou via systemd / pm2 (voir DEPLOY-VPS.md)

require("dotenv").config();
const express = require("express");
const path = require("path");

const { creerLimiteur } = require("./netlify/functions/lib/debit");

const app = express();
app.disable("x-powered-by");

// Caddy est la seule porte d'entrée : sans cela, req.ip vaudrait l'adresse du
// conteneur Caddy et tous les clients partageraient le même quota.
app.set("trust proxy", 1);

/* ------------------------------------------------------------
   En-têtes de sécurité.

   Posés ici plutôt que dans le Caddyfile : celui-ci sert trois sites sur
   cette machine, et une erreur d'édition les mettrait tous à terre. Ceux-ci
   voyagent avec le déploiement de PhénoBac.

   Sur la politique de sécurité du contenu : les scripts de l'application sont
   EN LIGNE dans la page. Sans empreinte ni nonce, « unsafe-inline » reste
   nécessaire, et une injection s'exécuterait donc malgré la politique. Ce
   n'est pas inutile pour autant : les directives connect-src, img-src et
   form-action verrouillent les canaux par lesquels une injection ferait
   sortir quoi que ce soit. Pour bloquer l'exécution elle-même, il faudrait
   extraire les scripts dans un fichier séparé et passer à « script-src
   'self' » — un changement de structure, à faire à froid.
   ------------------------------------------------------------ */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  // Les vues portent des attributs style="display:none" dans le balisage.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  // Rien ne part vers un autre hôte : ni requête, ni image, ni formulaire.
  "connect-src 'self'",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "worker-src 'self'",
  "manifest-src 'self'"
].join("; ");

app.use((req, res, next) => {
  res.set("Content-Security-Policy", CSP);
  // Pour les navigateurs qui ignorent encore frame-ancestors.
  res.set("X-Frame-Options", "DENY");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // L'application ne demande aucune de ces permissions.
  res.set("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=(), usb=()");
  next();
});

// Corps en texte brut : les handlers attendent event.body sous forme de chaîne
// (et cela préserve le corps exact, utile si vous vérifiez une signature de webhook).
app.use(express.text({ type: () => true, limit: "1mb" }));

// Adapte un handler Netlify (event -> {statusCode, headers, body}) en middleware Express.
function adapt(handler) {
  return async (req, res) => {
    const headers = {};
    for (const k in req.headers) headers[k.toLowerCase()] = req.headers[k];
    const event = {
      httpMethod: req.method,
      headers,
      body: typeof req.body === "string" ? req.body : "",
      queryStringParameters: req.query || {}
    };
    try {
      const r = await handler(event);
      if (r.headers) for (const h in r.headers) res.set(h, r.headers[h]);
      res.status(r.statusCode || 200).send(r.body || "");
    } catch (e) {
      console.error("Erreur handler:", e);
      res.status(500).json({ error: "server_error" });
    }
  };
}

// Les endpoints, montés sur les mêmes chemins que sur Netlify (aucun changement côté client)
// ET sur un alias /api/<name> plus lisible si vous préférez.
const FUNCTIONS = [
  "verify-license",
  "issue-license",
  "premium-interpret",
  "payment-webhook",
  "claim-license",
  "revoke-license",
  "stats",
  "send-reminders",
  "send-test-sms"
];
/* ------------------------------------------------------------
   Limitation de débit.

   Deux quotas, parce que deux usages : l'interprétation est appelée à chaque
   saisie (avec un debounce de 300 ms côté client) et doit rester large ; les
   endpoints d'administration et le webhook n'ont aucune raison d'être
   sollicités en rafale.

   Le dépassement renvoie 429 avec Retry-After — un code que le client
   distingue d'une panne, contrairement à une coupure sèche.
   ------------------------------------------------------------ */
const QUOTA_PUBLIC = Number(process.env.RATE_LIMIT_PUBLIC || 240);   // par minute et par IP
const QUOTA_SENSIBLE = Number(process.env.RATE_LIMIT_SENSIBLE || 60);

const OUVERT = ["premium-interpret", "verify-license", "claim-license"];
const limPublic = creerLimiteur({ limite: QUOTA_PUBLIC });
const limSensible = creerLimiteur({ limite: QUOTA_SENSIBLE });

function brider(limiteur, etiquette) {
  return (req, res, next) => {
    const r = limiteur(req.ip + "|" + etiquette);
    res.set("RateLimit-Remaining", String(Math.max(0, r.restant)));
    if (r.autorise) return next();
    res.set("Retry-After", String(Math.ceil(r.resetDans / 1000)));
    res.status(429).json({ error: "rate_limited",
      message: "Trop de requêtes. Réessayez dans " + Math.ceil(r.resetDans / 1000) + " s." });
  };
}

for (const name of FUNCTIONS) {
  const mod = require("./netlify/functions/" + name + ".js");
  const ouvert = OUVERT.includes(name);
  const garde = brider(ouvert ? limPublic : limSensible, ouvert ? "public" : "sensible");
  app.all("/.netlify/functions/" + name, garde, adapt(mod.handler));
  app.all("/api/" + name, garde, adapt(mod.handler));
}

// Pages publiques : placez phenobac.html et success.html dans public/
// (NE mettez PAS admin.html en public sans protection — voir DEPLOY-VPS.md).
const PUBLIC = path.join(__dirname, "public");
app.use(express.static(PUBLIC));
app.get("/", (req, res) => res.sendFile(path.join(PUBLIC, "phenobac.html")));

// Sonde de santé
app.get("/healthz", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("PhénoBac en écoute sur le port " + PORT + " (backend stockage: " + (require("./netlify/functions/lib/store").BACKEND) + ")"));
