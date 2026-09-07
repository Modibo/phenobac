// netlify/functions/payment-webhook.js
// Émission AUTOMATIQUE d'une licence à la réception d'un paiement confirmé.
// Le prestataire (agrégateur mobile money, opérateur…) appelle cette URL.
//
// L'authentification et l'extraction des champs sont paramétrables et vivent
// dans lib/psp.js : aucun format de prestataire n'est codé en dur ici.
// Voir MISE-EN-VENTE.md § 2 pour le calibrage sur un paiement de test.
//
// Variables d'environnement :
//   PHENOBAC_SECRET           secret de signature des licences
//   PHENOBAC_WEBHOOK_SECRET   secret partagé avec le prestataire
//   PHENOBAC_PRICE_MAP        barème "montant:jours,…"
//   PHENOBAC_WEBHOOK_DEBUG    "1" pour journaliser le webhook reçu (calibrage)
//   WEBHOOK_*                 voir lib/psp.js
//
// Stockage : la licence est enregistrée sous la référence de paiement, puis
// récupérée par le client sur la page de succès (claim-license.js).

const crypto = require("crypto");
const { getStore } = require("./lib/store");
const { deliver } = require("./lib/deliver");
const psp = require("./lib/psp");

const SECRET = process.env.PHENOBAC_SECRET || "";
const DEBUG = process.env.PHENOBAC_WEBHOOK_DEBUG === "1";

// Montant payé (FCFA / XOF) -> durée de la licence en jours.
// DOIT rester aligné sur les tarifs affichés dans phenobac.html (PRICING).
const DEFAULT_PRICE_MAP = { 5000: 30, 48000: 365 };

function loadPriceMap() {
  const raw = (process.env.PHENOBAC_PRICE_MAP || "").trim();
  if (!raw) return DEFAULT_PRICE_MAP;
  const map = {};
  for (const part of raw.split(",")) {
    const [a, d] = part.split(":").map((x) => parseInt(String(x).trim(), 10));
    if (Number.isFinite(a) && Number.isFinite(d) && a > 0 && d > 0) map[a] = d;
  }
  return Object.keys(map).length ? map : DEFAULT_PRICE_MAP;
}
const PRICE_MAP = loadPriceMap();

/* ---- signature de licence (identique à issue-license) ---- */
function mintLicense(sub, days) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub, plan: "premium", iat: now, exp: now + days * 86400, jti: crypto.randomBytes(8).toString("hex") };
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(p).digest("base64url");
  return { license: p + "." + sig, exp: payload.exp };
}

const JSONH = { "Content-Type": "application/json" };
const ok = (obj) => ({ statusCode: 200, headers: JSONH, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: JSONH, body: JSON.stringify({ error: "method" }) };
  if (!SECRET) return { statusCode: 500, headers: JSONH, body: JSON.stringify({ error: "server_not_configured" }) };

  // 1. Décodage (JSON ou formulaire). Sans effet de bord : on peut le faire
  //    avant l'authentification, dont le mode "confirm" a besoin de la référence.
  const body = psp.parseBody(event.body, event.headers);
  const pay = psp.parsePayment(body);

  if (DEBUG) {
    // Calibrage uniquement : à laisser éteint en exploitation courante,
    // ces journaux contiennent les coordonnées du payeur.
    console.log("[phenobac] webhook reçu — corps :", String(event.body || "").slice(0, 2000));
    console.log("[phenobac] champs extraits :", JSON.stringify(pay));
  }

  // 2. Authentification. Rien n'est écrit avant ce point : sinon n'importe qui
  //    pourrait remplir le stockage en postant des requêtes non authentifiées.
  const auth = await psp.authenticate(event, pay);
  if (!auth.ok) {
    console.warn("[phenobac] webhook refusé :", auth.reason, "(mode", psp.MODE + ")");
    return { statusCode: 401, headers: JSONH, body: JSON.stringify({ error: "unauthorized", reason: auth.reason }) };
  }

  // En mode "confirm", le montant confirmé par le prestataire fait foi.
  if (auth.amount !== undefined) pay.amount = auth.amount;

  const store = getStore("phenobac-licenses");

  // 3. Le webhook n'a pas pu être décodé : on le conserve tel quel pour pouvoir
  //    le calibrer, plutôt que de le jeter. On répond 200 pour éviter que le
  //    prestataire ne relance en boucle.
  if (!pay.ref || !Number.isFinite(pay.amount)) {
    const key = "unparsed:" + Date.now() + ":" + crypto.randomBytes(4).toString("hex");
    try {
      await store.setJSON(key, {
        pending: true, reason: "unparsed", at: Date.now(),
        amount: Number.isFinite(pay.amount) ? pay.amount : 0,
        contact: pay.contact || "", ref: pay.ref || "",
        raw: String(event.body || "").slice(0, 4000)
      });
    } catch (e) { /* consignation best-effort */ }
    console.warn("[phenobac] webhook non décodé — champs manquants :",
      !pay.ref ? "référence" : "", !Number.isFinite(pay.amount) ? "montant" : "");
    return ok({ ok: true, issued: false, reason: "unparsed" });
  }

  // On répond toujours 200 au-delà de ce point, pour éviter les relances en
  // boucle, mais on n'émet que si le paiement est réussi et le montant reconnu.
  if (psp.MODE !== "confirm" && !psp.isSuccess(pay.status)) {
    return ok({ ok: true, issued: false, reason: "not_success", status: pay.status });
  }

  const days = PRICE_MAP[pay.amount];
  if (!days) {
    // Le client a payé, mais le montant ne correspond à aucun tarif connu
    // (tarif modifié, commission déduite par le prestataire, paiement partiel…).
    // On NE perd pas la vente : elle apparaît comme « à traiter » au tableau de
    // bord, et une licence est émise à la main via issue-license.
    try {
      await store.setJSON("pending:" + pay.ref, {
        pending: true, reason: "unknown_amount", amount: pay.amount,
        contact: pay.contact, sub: pay.contact || pay.ref, ref: pay.ref, at: Date.now()
      });
    } catch (e) { /* consignation best-effort */ }
    console.warn("[phenobac] paiement de montant inconnu :", pay.amount, "ref", pay.ref);
    return ok({ ok: true, issued: false, reason: "unknown_amount", amount: pay.amount });
  }

  const sub = pay.contact || pay.ref;

  // idempotence : si un webhook est rejoué, on ne réémet pas
  const existing = await store.get(pay.ref, { type: "json" }).catch(() => null);
  if (existing && existing.license) {
    return ok({ ok: true, issued: true, reference: pay.ref, sms: !!(existing.sms && existing.sms.sent) });
  }

  const { license, exp } = mintLicense(sub, days);
  await store.setJSON(pay.ref, { license, sub, exp, amount: pay.amount, days, contact: pay.contact, at: Date.now() });

  // Envoi direct de la clé au client (SMS), sans échec bloquant : sans
  // téléphone ou sans passerelle configurée, le client récupère sa clé sur
  // success.html grâce à sa référence.
  const sms = await deliver(pay.contact, { license, exp, ref: pay.ref });
  await store.setJSON(pay.ref, { license, sub, exp, amount: pay.amount, days, contact: pay.contact, at: Date.now(), sms });

  return ok({ ok: true, issued: true, reference: pay.ref, sms: sms.sent });
};
