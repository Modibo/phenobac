// netlify/functions/lib/deliver.js
// Envoi de la clé au client par SMS, et relances avant expiration.
// Module partagé (sous-dossier lib/), pas un endpoint.
//
// Comme pour le paiement, aucun format de passerelle n'est codé en dur : les
// passerelles SMS diffèrent sur tout (verbe, encodage du corps, nom des champs,
// façon de signaler un échec). Tout se règle par variables d'environnement.
//
// ================================ PROFILS =================================
//   SMS_PROFILE = generic | twilio | africastalking     (défaut : generic)
// Un profil ne fournit que des valeurs par défaut : toute variable SMS_*
// renseignée dans .env l'emporte sur lui.
//
// ============================== RÉGLAGES ==================================
//   SMS_API_URL        URL de l'API ({sid} est remplacé par SMS_API_USER)
//   SMS_METHOD         POST | GET                      (défaut POST)
//   SMS_BODY_FORMAT    json | form | query             (défaut json)
//   SMS_AUTH           bearer | basic | header | none  (défaut bearer)
//   SMS_AUTH_HEADER    nom de l'en-tête si SMS_AUTH=header
//   SMS_API_KEY        jeton, mot de passe (basic), ou valeur d'en-tête
//   SMS_API_USER       identifiant (basic), ou SID
//   SMS_SENDER         expéditeur affiché
//   SMS_FIELD_TO / SMS_FIELD_FROM / SMS_FIELD_TEXT     noms des champs
//   SMS_EXTRA          champs supplémentaires, en JSON (ex. {"username":"x"})
//   SMS_SUCCESS_MATCH  fragment attendu dans la réponse pour valider l'envoi
//   SMS_COUNTRY_CODE   indicatif par défaut des numéros locaux (défaut +223)
//   SMS_DRY_RUN        "1" : n'envoie rien, journalise le SMS qui serait parti
//   SITE_URL           pour envoyer un lien court plutôt que la clé entière

const PROFILES = {
  // Vérifiés d'après la documentation de chaque fournisseur : à confirmer sur
  // un premier envoi réel (voir SMS_DRY_RUN et l'endpoint send-test-sms).
  twilio: {
    SMS_API_URL: "https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
    SMS_METHOD: "POST", SMS_BODY_FORMAT: "form", SMS_AUTH: "basic",
    SMS_FIELD_TO: "To", SMS_FIELD_FROM: "From", SMS_FIELD_TEXT: "Body"
  },
  africastalking: {
    SMS_API_URL: "https://api.africastalking.com/version1/messaging",
    SMS_METHOD: "POST", SMS_BODY_FORMAT: "form", SMS_AUTH: "header",
    SMS_AUTH_HEADER: "apiKey",
    SMS_FIELD_TO: "to", SMS_FIELD_FROM: "from", SMS_FIELD_TEXT: "message"
  },
  generic: {}
};

const PROFILE = PROFILES[(process.env.SMS_PROFILE || "generic").toLowerCase()] || PROFILES.generic;

function cfg(name, fallback) {
  const v = process.env[name];
  if (v !== undefined && v !== "") return v;
  if (PROFILE[name] !== undefined && PROFILE[name] !== "") return PROFILE[name];
  return fallback;
}

const SITE_URL = (process.env.SITE_URL || "").replace(/\/+$/, "");
const DRY_RUN = process.env.SMS_DRY_RUN === "1";
const COUNTRY = cfg("SMS_COUNTRY_CODE", "+223");

/* ------------------------------------------------------------- numéros */

// Un numéro peut arriver en "+22370000000", "22370000000", "70 00 00 00"…
// Les passerelles veulent du E.164 : on normalise, sinon l'envoi échoue pour
// une raison qui n'a rien à voir avec la configuration.
function normalizePhone(raw) {
  let s = String(raw || "").trim().replace(/[\s().-]/g, "");
  if (!s) return "";
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("+")) return /^\+\d{8,15}$/.test(s) ? s : "";
  if (/^\d{8,15}$/.test(s)) {
    const cc = COUNTRY.replace(/\D/g, "");
    // déjà préfixé de l'indicatif, mais sans le "+"
    if (cc && s.startsWith(cc) && s.length > cc.length + 6) return "+" + s;
    return COUNTRY + s;
  }
  return "";
}

function isPhone(contact) {
  return normalizePhone(contact) !== "";
}

function fmtDate(exp) {
  return new Date(exp * 1000).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/* ------------------------------------------------------------- messages */

// Lien court si SITE_URL est défini (un seul segment SMS), sinon la clé brute.
function buildSMS({ license, exp, ref }) {
  const date = fmtDate(exp);
  if (SITE_URL && ref) {
    return `PhenoBac Premium active (valable jusqu'au ${date}). Recuperez votre cle: ${SITE_URL}/success.html?ref=${encodeURIComponent(ref)}`;
  }
  return `PhenoBac Premium active (jusqu'au ${date}). Cle: ${license} — Ouvrez PhenoBac > Debloquer > collez la cle.`;
}

function buildReminderSMS({ exp, days }) {
  const date = fmtDate(exp);
  const where = SITE_URL ? " sur " + SITE_URL : "";
  const j = days <= 1 ? "demain" : ("dans " + days + " jours");
  return `PhenoBac : votre licence Premium expire ${j} (le ${date}). Pensez a la renouveler${where}. Merci !`;
}

/* -------------------------------------------------------------- envoi */

function buildRequest(to, message) {
  const url0 = cfg("SMS_API_URL", "");
  const user = cfg("SMS_API_USER", "");
  const key = cfg("SMS_API_KEY", "");
  const url = new URL(url0.replace("{sid}", encodeURIComponent(user)));

  const fields = {};
  fields[cfg("SMS_FIELD_TO", "to")] = to;
  const from = cfg("SMS_SENDER", "");
  if (from) fields[cfg("SMS_FIELD_FROM", "from")] = from;
  fields[cfg("SMS_FIELD_TEXT", "message")] = message;

  try {
    const extra = JSON.parse(cfg("SMS_EXTRA", "{}"));
    if (extra && typeof extra === "object") Object.assign(fields, extra);
  } catch (e) {
    console.warn("[phenobac] SMS_EXTRA n'est pas un JSON valide — ignoré");
  }

  const headers = {};
  const auth = String(cfg("SMS_AUTH", "bearer")).toLowerCase();
  if (auth === "bearer") headers["Authorization"] = "Bearer " + key;
  else if (auth === "basic") headers["Authorization"] = "Basic " + Buffer.from(user + ":" + key).toString("base64");
  else if (auth === "header") headers[cfg("SMS_AUTH_HEADER", "X-API-Key")] = key;

  const method = String(cfg("SMS_METHOD", "POST")).toUpperCase();
  const format = String(cfg("SMS_BODY_FORMAT", "json")).toLowerCase();

  let body;
  if (method === "GET" || format === "query") {
    for (const k of Object.keys(fields)) url.searchParams.set(k, fields[k]);
  } else if (format === "form") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(fields).toString();
  } else {
    headers["Content-Type"] = "application/json";
    headers["Accept"] = "application/json";
    body = JSON.stringify(fields);
  }

  return { url: url.toString(), method, headers, body, fields };
}

// Envoie un SMS. Ne lève jamais : un échec d'envoi ne doit pas faire échouer
// l'émission de la licence — le client peut toujours récupérer sa clé sur
// success.html. L'échec est renvoyé, consigné, et visible au tableau de bord.
// Une passerelle est-elle renseignée ? (l'authentification "none" se passe de clé)
function isConfigured() {
  const auth = String(cfg("SMS_AUTH", "bearer")).toLowerCase();
  return !!cfg("SMS_API_URL", "") && (auth === "none" || !!cfg("SMS_API_KEY", ""));
}

async function sendSMS(to, message) {
  const num = normalizePhone(to);
  if (!num) return { sent: false, reason: "bad_phone" };
  if (!isConfigured()) return { sent: false, reason: "sms_not_configured" };

  let req;
  try { req = buildRequest(num, message); }
  catch (e) { return { sent: false, reason: "bad_config", detail: String(e.message || e) }; }

  if (DRY_RUN) {
    console.log("[phenobac] SMS_DRY_RUN — rien n'est envoyé.");
    console.log("[phenobac]   " + req.method + " " + req.url);
    console.log("[phenobac]   champs : " + JSON.stringify(req.fields));
    console.log("[phenobac]   texte  : " + message);
    return { sent: true, dryRun: true };
  }

  try {
    const r = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
    const text = await r.text().catch(() => "");
    if (!r.ok) {
      console.warn("[phenobac] passerelle SMS : HTTP " + r.status + " — " + text.slice(0, 300));
      return { sent: false, reason: "gateway_error", status: r.status, detail: text.slice(0, 300) };
    }
    // Certaines passerelles répondent 200 en signalant l'échec dans le corps.
    const match = cfg("SMS_SUCCESS_MATCH", "");
    if (match && !text.includes(match)) {
      console.warn("[phenobac] passerelle SMS : réponse inattendue — " + text.slice(0, 300));
      return { sent: false, reason: "unexpected_response", detail: text.slice(0, 300) };
    }
    return { sent: true, status: r.status };
  } catch (e) {
    return { sent: false, reason: "network", detail: String(e.message || e) };
  }
}

// Envoie la clé si on a un téléphone exploitable ; sinon le client la
// récupérera sur success.html (aucune erreur bloquante).
async function deliver(contact, data) {
  if (!isPhone(contact)) return { sent: false, reason: "no_phone" };
  return sendSMS(contact, buildSMS(data));
}

async function remind(contact, data) {
  if (!isPhone(contact)) return { sent: false, reason: "no_phone" };
  return sendSMS(contact, buildReminderSMS(data));
}

module.exports = {
  deliver, remind, sendSMS,
  buildSMS, buildReminderSMS, buildRequest,
  isPhone, normalizePhone, isConfigured,
  PROFILE_NAME: (process.env.SMS_PROFILE || "generic").toLowerCase(),
  DRY_RUN
};
