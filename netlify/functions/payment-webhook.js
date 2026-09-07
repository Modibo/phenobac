// netlify/functions/payment-webhook.js
// Émission AUTOMATIQUE d'une licence à la réception d'un paiement mobile money confirmé.
// Le prestataire (PayDunya, Orange Money, Moov, agrégateur…) appelle cette URL en webhook.
//
// Variables d'environnement :
//   PHENOBAC_SECRET          secret de signature des licences (identique aux autres fonctions)
//   PHENOBAC_WEBHOOK_SECRET  secret partagé pour authentifier l'appel du PSP
//
// Stockage : la licence est enregistrée sous la référence de paiement (Netlify Blobs),
// puis récupérée par le client sur la page de succès (claim-license.js / success.html).

const crypto = require("crypto");
const { getStore } = require("./lib/store");
const { deliver } = require("./lib/deliver");

const SECRET = process.env.PHENOBAC_SECRET || "";
const WEBHOOK_SECRET = process.env.PHENOBAC_WEBHOOK_SECRET || "";

// Montant payé (FCFA / XOF) -> durée de la licence en jours. À aligner sur vos tarifs.
const PRICE_MAP = { 5000: 30, 13000: 90, 48000: 365 };

/* ---- signature de licence (identique à issue-license) ---- */
function mintLicense(sub, days) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub, plan: "premium", iat: now, exp: now + days * 86400, jti: crypto.randomBytes(8).toString("hex") };
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(p).digest("base64url");
  return { license: p + "." + sig, exp: payload.exp };
}

/* ============================================================
   À ADAPTER À VOTRE PRESTATAIRE
   ============================================================ */

// 1) Authentifier l'appel. Selon le PSP : jeton partagé en entête (simple),
//    signature HMAC du corps, ou reconfirmation via l'API du PSP (le plus sûr).
function authenticate(event) {
  if (!WEBHOOK_SECRET) return false;
  const token = event.headers["x-webhook-token"] || event.headers["X-Webhook-Token"] || "";
  const a = Buffer.from(token), b = Buffer.from(WEBHOOK_SECRET);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// 2) Extraire les champs utiles (les noms varient d'un PSP à l'autre).
function parsePayment(body) {
  const d = body.data || body;
  return {
    status:   d.status,                                   // ex. "SUCCESS", "completed", "paid"
    amount:   Number(d.amount),                           // en FCFA (XOF)
    ref:      d.reference || d.transaction_id || d.token,  // identifiant unique du paiement
    contact:  (d.customer && (d.customer.phone || d.customer.email)) || d.phone || d.email || ""
  };
}

const JSONH = { "Content-Type": "application/json" };
const ok = (obj) => ({ statusCode: 200, headers: JSONH, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: JSONH, body: JSON.stringify({ error: "method" }) };
  if (!SECRET) return { statusCode: 500, headers: JSONH, body: JSON.stringify({ error: "server_not_configured" }) };
  if (!authenticate(event)) return { statusCode: 401, headers: JSONH, body: JSON.stringify({ error: "unauthorized" }) };

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch (e) {
    return { statusCode: 400, headers: JSONH, body: JSON.stringify({ error: "bad_json" }) };
  }

  const pay = parsePayment(body);
  const success = ["SUCCESS", "success", "completed", "COMPLETED", "paid", "PAID"].includes(String(pay.status));

  // On répond toujours 200 pour éviter que le PSP ne relance en boucle,
  // mais on n'émet la licence que si le paiement est réussi et le montant reconnu.
  if (!success) return ok({ ok: true, issued: false, reason: "not_success" });
  if (!pay.ref) return ok({ ok: true, issued: false, reason: "no_reference" });

  const days = PRICE_MAP[pay.amount];
  if (!days) return ok({ ok: true, issued: false, reason: "unknown_amount", amount: pay.amount });

  const sub = pay.contact || pay.ref;
  const store = getStore("phenobac-licenses");

  // idempotence : si un webhook est rejoué, on ne réémet pas
  const existing = await store.get(pay.ref, { type: "json" }).catch(() => null);
  if (!existing) {
    const { license, exp } = mintLicense(sub, days);
    await store.setJSON(pay.ref, { license, sub, exp, amount: pay.amount, days, contact: pay.contact, at: Date.now() });
    // Envoi direct de la clé au client (SMS). Sans échec bloquant :
    // s'il n'y a pas de téléphone ou si la passerelle n'est pas configurée,
    // le client récupère sa clé sur success.html via sa référence.
    const sms = await deliver(pay.contact, { license, exp, ref: pay.ref });
    await store.setJSON(pay.ref, { license, sub, exp, amount: pay.amount, days, contact: pay.contact, at: Date.now(), sms });
    return ok({ ok: true, issued: true, reference: pay.ref, sms: sms.sent });
  }

  return ok({ ok: true, issued: true, reference: pay.ref, sms: !!(existing.sms && existing.sms.sent) });
};
