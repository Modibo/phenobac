// netlify/functions/send-test-sms.js
// Envoi d'un SMS de test, pour calibrer la passerelle. RÉSERVÉ À VOUS (jeton admin).
//
// POST { "to": "+223XXXXXXXX", "text": "…" }   (Authorization: Bearer ADMIN)
//   -> { ok, sent, to, reason?, detail?, request }
//
// Renvoie ce qui a réellement été envoyé (URL, verbe, champs) et ce que la
// passerelle a répondu : c'est ce qu'il faut pour régler SMS_* sans tâtonner.
// Avec SMS_DRY_RUN=1, rien ne part et l'on voit quand même la requête construite.

const { sendSMS, buildRequest, normalizePhone, isConfigured, PROFILE_NAME, DRY_RUN } = require("./lib/deliver");
const { cors, adminOk } = require("./lib/http");

exports.handler = async (event) => {
  const CORS = cors(event, { headers: "Content-Type, Authorization", open: true });
  const J = (code, obj) => ({ statusCode: code, headers: CORS, body: JSON.stringify(obj) });

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return J(405, { error: "method" });
  if (!adminOk(event)) return J(401, { error: "unauthorized" });

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return J(400, { error: "bad_json" }); }

  const to = String(body.to || "").trim();
  if (!to) return J(400, { error: "no_recipient" });

  const num = normalizePhone(to);
  if (!num) return J(400, { error: "bad_phone", saisi: to, indication: "Numéro non reconnu. Vérifiez SMS_COUNTRY_CODE." });

  // Vérifier la configuration AVANT de construire la requête : sans URL,
  // la construction échoue sur « Invalid URL », message qui n'aide personne.
  if (!isConfigured()) {
    return J(400, {
      ok: false, profil: PROFILE_NAME, reason: "sms_not_configured",
      indication: "Renseignez au minimum SMS_API_URL et SMS_API_KEY dans .env (voir MISE-EN-VENTE.md § 3)."
    });
  }

  const text = String(body.text || "PhenoBac : SMS de test. Si vous lisez ceci, la passerelle est bien reglee.");

  // Aperçu de la requête construite, sans les en-têtes (ils portent la clé d'API).
  let apercu = null;
  try {
    const r = buildRequest(num, text);
    apercu = { method: r.method, url: r.url, fields: r.fields };
  } catch (e) {
    return J(500, { error: "bad_config", detail: String(e.message || e) });
  }

  const res = await sendSMS(num, text);
  return J(res.sent ? 200 : 502, {
    ok: res.sent,
    profil: PROFILE_NAME,
    dryRun: DRY_RUN,
    to: num,
    normalise: num !== to ? { saisi: to, envoye: num } : undefined,
    reason: res.reason,
    detail: res.detail,
    status: res.status,
    request: apercu
  });
};
