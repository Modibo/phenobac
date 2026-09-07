// netlify/functions/claim-license.js
// Récupère la licence émise pour une référence de paiement (déposée par payment-webhook.js).
// Appelée par la page de succès après le retour du client depuis le prestataire.
//
// GET /.netlify/functions/claim-license?ref=REFERENCE
//
// Variables d'environnement :
//   CLAIM_WINDOW_HOURS   durée pendant laquelle une clé reste récupérable par sa
//                        référence (défaut 48). Passé ce délai, le client utilise
//                        la clé reçue par SMS, ou vous la lui réémettez.
//
// La référence de paiement vaut mot de passe le temps de la récupération : c'est
// le seul élément que le client possède au retour du prestataire. Certains
// prestataires numérotent les transactions de façon prévisible (OM-2026-001,
// OM-2026-002…) ; sans fenêtre de validité, quelqu'un pourrait énumérer les
// références et moissonner les licences vendues. La fenêtre borne ce risque à
// quelques heures autour du paiement.

const { getStore } = require("./lib/store");
const { cors } = require("./lib/http");

const WINDOW_MS = Math.max(1, parseInt(process.env.CLAIM_WINDOW_HOURS || "48", 10)) * 3600 * 1000;

exports.handler = async (event) => {
  const CORS = cors(event, { methods: "GET, OPTIONS" });
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };

  const ref = (event.queryStringParameters || {}).ref || "";
  if (!ref) return { statusCode: 400, headers: CORS, body: JSON.stringify({ found: false, error: "no_ref" }) };

  const store = getStore("phenobac-licenses");
  const rec = await store.get(ref, { type: "json" }).catch(() => null);

  // 404 = paiement pas encore confirmé (le webhook peut arriver avec un léger délai).
  if (!rec || !rec.license) return { statusCode: 404, headers: CORS, body: JSON.stringify({ found: false }) };

  // Fenêtre de récupération dépassée : la clé existe toujours et reste valide,
  // mais elle ne se retire plus avec la seule référence.
  const age = Date.now() - (rec.at || 0);
  if (rec.at && age > WINDOW_MS) {
    console.warn("[phenobac] récupération hors fenêtre pour la référence", ref);
    return {
      statusCode: 410,
      headers: CORS,
      body: JSON.stringify({ found: false, reason: "claim_window_closed" })
    };
  }

  // Trace des récupérations (utile en cas de litige). N'échoue jamais la réponse.
  try {
    await store.setJSON(ref, Object.assign({}, rec, {
      claims: (rec.claims || 0) + 1,
      lastClaimAt: Date.now()
    }));
  } catch (e) { /* traçabilité best-effort */ }

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ found: true, license: rec.license, exp: rec.exp }) };
};
