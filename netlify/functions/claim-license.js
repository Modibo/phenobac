// netlify/functions/claim-license.js
// Récupère la licence émise pour une référence de paiement (déposée par payment-webhook.js).
// Appelée par la page de succès après le retour du client depuis le prestataire.
//
// GET /.netlify/functions/claim-license?ref=REFERENCE

const { getStore } = require("./lib/store");

const CORS = {
  "Access-Control-Allow-Origin": "*",        // en prod : restreindre à l'origine de votre site
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json"
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };

  const ref = (event.queryStringParameters || {}).ref || "";
  if (!ref) return { statusCode: 400, headers: CORS, body: JSON.stringify({ found: false, error: "no_ref" }) };

  const store = getStore("phenobac-licenses");
  const rec = await store.get(ref, { type: "json" }).catch(() => null);

  // 404 = paiement pas encore confirmé (le webhook peut arriver avec un léger délai).
  if (!rec) return { statusCode: 404, headers: CORS, body: JSON.stringify({ found: false }) };

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ found: true, license: rec.license, exp: rec.exp }) };
};
