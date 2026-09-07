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

const app = express();
app.disable("x-powered-by");

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
  "send-reminders"
];
for (const name of FUNCTIONS) {
  const mod = require("./netlify/functions/" + name + ".js");
  app.all("/.netlify/functions/" + name, adapt(mod.handler));
  app.all("/api/" + name, adapt(mod.handler));
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
