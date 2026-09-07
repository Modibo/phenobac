// netlify/functions/issue-license.js
// Génère une licence signée. RÉSERVÉ À VOUS (protégé par un jeton admin).
// Vous l'appelez après avoir reçu un paiement, puis vous envoyez la clé au client.
//
// Variables d'environnement :
//   PHENOBAC_SECRET        même secret que verify-license.js
//   PHENOBAC_ADMIN_TOKEN   jeton secret que vous seul connaissez
//
// Exemple d'appel (depuis votre machine) :
//   curl -X POST https://VOTRE-SITE.netlify.app/.netlify/functions/issue-license \
//     -H "Authorization: Bearer VOTRE_ADMIN_TOKEN" \
//     -H "Content-Type: application/json" \
//     -d '{ "sub": "labo-mopti@exemple.ml", "days": 365 }'
//
// Réponse : { "license": "<token à donner au client>", "sub": "...", "exp": ... }

const crypto = require("crypto");
const { getStore } = require("./lib/store");
const SECRET = process.env.PHENOBAC_SECRET || "";
const ADMIN = process.env.PHENOBAC_ADMIN_TOKEN || "";

function sign(payloadB64) {
  return crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
}

// En prod, remplacez "*" par l'origine exacte de votre page admin.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "method" }) };
  }

  const auth = event.headers["authorization"] || event.headers["Authorization"] || "";
  if (!ADMIN || auth !== "Bearer " + ADMIN) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: "unauthorized" }) };
  }
  if (!SECRET) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "server_not_configured" }) };
  }

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch (e) {}

  const sub = (body.sub || "client").toString().slice(0, 120);
  const days = Math.max(1, parseInt(body.days || 30, 10));
  const amount = Math.max(0, parseInt(body.amount || 0, 10)); // FCFA, pour la comptabilité
  const now = Math.floor(Date.now() / 1000);

  const payload = { sub, plan: "premium", iat: now, exp: now + days * 86400, jti: crypto.randomBytes(8).toString("hex") };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = payloadB64 + "." + sign(payloadB64);

  // enregistrer la vente (pour le tableau de bord). N'échoue pas l'émission si le store est indisponible.
  try {
    await getStore("phenobac-licenses").setJSON("manual:" + payload.jti, {
      license: token, sub, exp: payload.exp, days, amount, contact: sub, at: Date.now(), source: "manual", jti: payload.jti
    });
  } catch (e) { /* stockage best-effort */ }

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({ license: token, sub, plan: "premium", exp: payload.exp, jti: payload.jti })
  };
};
