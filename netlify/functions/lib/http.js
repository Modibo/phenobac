// netlify/functions/lib/http.js
// En-têtes CORS verrouillés + authentification admin à temps constant.
// Module partagé (sous-dossier lib/), pas un endpoint.
//
// Variables d'environnement :
//   SITE_URL          URL publique du site (ex. https://phenobac.votre-domaine.ovh)
//   ALLOWED_ORIGINS   origines autorisées, séparées par des virgules.
//                     Vide -> repli sur SITE_URL. "*" -> ouvert à tous (déconseillé).
//
// Sans SITE_URL ni ALLOWED_ORIGINS, on retombe sur "*" : l'API reste
// fonctionnelle, mais un avertissement est écrit dans les journaux au démarrage.

const crypto = require("crypto");

const SITE_URL = (process.env.SITE_URL || "").replace(/\/+$/, "");
const RAW = (process.env.ALLOWED_ORIGINS || "").trim();

const LIST = RAW
  ? RAW.split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean)
  : (SITE_URL ? [SITE_URL] : []);

const OPEN = LIST.includes("*") || LIST.length === 0;

if (OPEN) {
  console.warn(
    "[phenobac] CORS ouvert (Access-Control-Allow-Origin: *). " +
    "Renseignez SITE_URL ou ALLOWED_ORIGINS pour réserver l'API à votre site."
  );
}

// Renvoie l'origine à autoriser pour cette requête.
// Origine connue -> on la renvoie telle quelle ; inconnue -> la première autorisée,
// ce qui fait échouer la requête côté navigateur (comportement voulu).
function pickOrigin(event) {
  if (OPEN) return "*";
  const h = (event && event.headers) || {};
  const origin = String(h.origin || h.Origin || "").replace(/\/+$/, "");
  return (origin && LIST.includes(origin)) ? origin : LIST[0];
}

// En-têtes CORS pour une requête donnée. `opts.methods` et `opts.headers`
// permettent d'ajuster par endpoint (GET, en-tête Authorization…).
function cors(event, opts) {
  const o = opts || {};
  return {
    "Access-Control-Allow-Origin": pickOrigin(event),
    "Vary": "Origin",
    "Access-Control-Allow-Headers": o.headers || "Content-Type",
    "Access-Control-Allow-Methods": o.methods || "POST, OPTIONS",
    "Content-Type": "application/json"
  };
}

// Comparaison à temps constant (évite de révéler un secret par la durée).
function safeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

// L'appel porte-t-il le jeton d'administration ?
function adminOk(event) {
  const ADMIN = process.env.PHENOBAC_ADMIN_TOKEN || "";
  if (!ADMIN) return false;
  const h = (event && event.headers) || {};
  const auth = h["authorization"] || h["Authorization"] || "";
  return safeEqual(auth, "Bearer " + ADMIN);
}

module.exports = { cors, adminOk, safeEqual, ALLOWED_ORIGINS: LIST, OPEN };
