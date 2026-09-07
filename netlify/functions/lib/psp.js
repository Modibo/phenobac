// netlify/functions/lib/psp.js
// Connecteur de prestataire de paiement (PSP), paramétrable par variables
// d'environnement. Module partagé (sous-dossier lib/), pas un endpoint.
//
// Il n'y a pas de format universel de webhook. Plutôt que de coder en dur celui
// d'un prestataire donné — qui change et diffère d'un compte à l'autre —, ce
// module couvre les trois façons dont les PSP authentifient réellement leurs
// appels, et une extraction de champs tolérante que l'on affine par
// configuration après avoir vu un vrai webhook.
//
// ============================ AUTHENTIFICATION ============================
//   WEBHOOK_AUTH = token | hmac | confirm        (défaut : token)
//
//   token    Jeton partagé dans un en-tête. Le plus simple ; suffisant si le
//            jeton est long et le transport en HTTPS.
//              WEBHOOK_AUTH_HEADER   en-tête porteur   (défaut x-webhook-token)
//              PHENOBAC_WEBHOOK_SECRET   valeur attendue
//
//   hmac     Le PSP signe le corps de la requête. Plus solide : un rejeu avec
//            un corps modifié est rejeté.
//              WEBHOOK_AUTH_HEADER    en-tête portant la signature
//              WEBHOOK_HMAC_ENCODING  hex | base64      (défaut hex)
//              WEBHOOK_HMAC_PREFIX    préfixe éventuel  (ex. "sha256=")
//              PHENOBAC_WEBHOOK_SECRET   clé de signature
//
//   confirm  On ignore ce que dit le webhook et on rappelle l'API du PSP pour
//            demander l'état réel de la transaction. C'est la méthode la plus
//            sûre : même un faux webhook parfaitement formé ne peut pas faire
//            émettre de licence.
//              WEBHOOK_CONFIRM_URL      URL, avec {ref} là où va la référence
//              WEBHOOK_CONFIRM_AUTH     valeur de l'en-tête Authorization
//              WEBHOOK_CONFIRM_STATUS   chemin du statut dans la réponse
//              WEBHOOK_CONFIRM_AMOUNT   chemin du montant dans la réponse
//
// ============================== EXTRACTION ===============================
// Par défaut, on cherche les noms de champs les plus répandus, à n'importe
// quelle profondeur. Si votre PSP en emploie d'autres, désignez-les par un
// chemin pointé plutôt que de modifier ce fichier :
//   WEBHOOK_FIELD_STATUS   ex. "data.transaction.state"
//   WEBHOOK_FIELD_AMOUNT   ex. "data.amount.value"
//   WEBHOOK_FIELD_REF      ex. "data.invoice.token"
//   WEBHOOK_FIELD_CONTACT  ex. "data.customer.msisdn"
//   WEBHOOK_SUCCESS_VALUES valeurs signifiant « payé », séparées par des virgules
//
// Le corps est accepté en JSON comme en application/x-www-form-urlencoded :
// plusieurs PSP postent un formulaire, pas du JSON.

const crypto = require("crypto");

const SECRET = process.env.PHENOBAC_WEBHOOK_SECRET || "";
const MODE = (process.env.WEBHOOK_AUTH || "token").toLowerCase();
const AUTH_HEADER = (process.env.WEBHOOK_AUTH_HEADER || "x-webhook-token").toLowerCase();

const SUCCESS_VALUES = (process.env.WEBHOOK_SUCCESS_VALUES ||
  "success,successful,completed,complete,paid,payment_succeeded,accepted,ok,00,000,1,true")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

/* ------------------------------------------------------------------ corps */

// Décode le corps, qu'il soit en JSON ou en formulaire encodé.
// Renvoie toujours un objet ; {} si rien n'est exploitable.
function parseBody(raw, headers) {
  const body = String(raw || "");
  if (!body.trim()) return {};
  const ctype = String((headers && (headers["content-type"] || headers["Content-Type"])) || "").toLowerCase();

  if (ctype.includes("form-urlencoded") || (!ctype.includes("json") && !body.trim().startsWith("{") && body.includes("="))) {
    const out = {};
    for (const [k, v] of new URLSearchParams(body)) {
      // "customer[phone]=..." devient customer.phone
      out[k.replace(/\[(.*?)\]/g, ".$1")] = v;
    }
    return out;
  }
  try { return JSON.parse(body); } catch (e) { return {}; }
}

/* ---------------------------------------------------------------- champs */

// Lit une valeur par chemin pointé : get(o, "data.customer.phone").
function get(obj, path) {
  if (!path) return undefined;
  let cur = obj;
  for (const part of String(path).split(".")) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

// Cherche une valeur parmi plusieurs noms possibles, à n'importe quelle
// profondeur. `names` est une liste de PRÉFÉRENCE : un "reference" trouvé
// profondément l'emporte sur un "id" de surface, car le nom précis est un
// meilleur indice que la position. À nom égal, le moins profond gagne.
function findAny(obj, names) {
  const wanted = names.map((n) => n.toLowerCase());
  let best = null;   // { rank, depth, value }

  const queue = [{ node: obj, depth: 0 }];
  let visited = 0;
  while (queue.length && visited < 2000) {
    const { node, depth } = queue.shift(); visited++;
    if (!node || typeof node !== "object") continue;

    for (const k of Object.keys(node)) {
      const v = node[k];
      if (v && typeof v === "object") { queue.push({ node: v, depth: depth + 1 }); continue; }
      if (v === null || v === undefined || String(v) === "") continue;
      const rank = wanted.indexOf(k.toLowerCase());
      if (rank === -1) continue;
      if (!best || rank < best.rank || (rank === best.rank && depth < best.depth)) {
        best = { rank, depth, value: v };
      }
    }
  }
  return best ? best.value : undefined;
}

// Un montant peut arriver en "5 000", "5000.00", 5000 ou "XOF 5000".
function toAmount(v) {
  if (v === null || v === undefined) return NaN;
  const n = Number(String(v).replace(/[^\d.,-]/g, "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

function parsePayment(body) {
  const pick = (envVar, names) => {
    const path = process.env[envVar];
    const byPath = path ? get(body, path) : undefined;
    return byPath !== undefined ? byPath : findAny(body, names);
  };

  const status = pick("WEBHOOK_FIELD_STATUS",
    ["status", "state", "payment_status", "transaction_status", "statut", "code", "result"]);
  const amount = pick("WEBHOOK_FIELD_AMOUNT",
    ["amount", "total_amount", "montant", "value", "cpm_amount", "amount_paid"]);
  const ref = pick("WEBHOOK_FIELD_REF",
    ["reference", "transaction_id", "trans_id", "token", "order_id", "invoice_token",
     "cpm_trans_id", "payment_id", "id", "external_id"]);
  const contact = pick("WEBHOOK_FIELD_CONTACT",
    ["phone", "msisdn", "phone_number", "telephone", "customer_phone", "email",
     "customer_email", "cel_phone_num"]);

  return {
    status: status === undefined ? "" : String(status),
    amount: toAmount(amount),
    ref: ref === undefined ? "" : String(ref),
    contact: contact === undefined ? "" : String(contact)
  };
}

function isSuccess(status) {
  return SUCCESS_VALUES.includes(String(status).trim().toLowerCase());
}

/* -------------------------------------------------------- authentification */

function safeEqual(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

function header(event, name) {
  const h = (event && event.headers) || {};
  const want = String(name).toLowerCase();
  for (const k of Object.keys(h)) if (k.toLowerCase() === want) return String(h[k] || "");
  return "";
}

function authToken(event) {
  if (!SECRET) return { ok: false, reason: "webhook_secret_missing" };
  return safeEqual(header(event, AUTH_HEADER), SECRET)
    ? { ok: true }
    : { ok: false, reason: "bad_token" };
}

// Signature du corps BRUT : c'est pourquoi server.js lit le corps en texte et
// ne le re-sérialise jamais. Re-sérialiser changerait les espaces et l'ordre
// des clés, et la signature ne correspondrait plus.
function authHmac(event) {
  if (!SECRET) return { ok: false, reason: "webhook_secret_missing" };
  const enc = (process.env.WEBHOOK_HMAC_ENCODING || "hex").toLowerCase() === "base64" ? "base64" : "hex";
  const prefix = process.env.WEBHOOK_HMAC_PREFIX || "";
  const expected = prefix + crypto.createHmac("sha256", SECRET).update(String(event.body || ""), "utf8").digest(enc);
  const got = header(event, AUTH_HEADER);
  return safeEqual(got, expected) ? { ok: true } : { ok: false, reason: "bad_signature" };
}

// Reconfirmation auprès du PSP : on ne croit que sa réponse.
async function authConfirm(payment) {
  const tpl = process.env.WEBHOOK_CONFIRM_URL || "";
  if (!tpl) return { ok: false, reason: "confirm_url_missing" };
  if (!payment.ref) return { ok: false, reason: "no_reference" };

  const url = tpl.replace("{ref}", encodeURIComponent(payment.ref));
  const headers = { "Accept": "application/json" };
  if (process.env.WEBHOOK_CONFIRM_AUTH) headers["Authorization"] = process.env.WEBHOOK_CONFIRM_AUTH;

  let data;
  try {
    const r = await fetch(url, { headers });
    if (!r.ok) return { ok: false, reason: "confirm_http_" + r.status };
    data = await r.json();
  } catch (e) {
    // Injoignable : on ne peut ni confirmer ni infirmer. On refuse — le PSP
    // rejouera, ou la vente sera rattrapée à la main.
    return { ok: false, reason: "confirm_unreachable" };
  }

  const statusPath = process.env.WEBHOOK_CONFIRM_STATUS;
  const amountPath = process.env.WEBHOOK_CONFIRM_AMOUNT;
  const status = statusPath ? get(data, statusPath)
    : findAny(data, ["status", "state", "payment_status", "transaction_status"]);
  if (!isSuccess(status)) return { ok: false, reason: "confirm_not_success" };

  // Le montant confirmé par le PSP prime sur celui annoncé dans le webhook.
  const amount = toAmount(amountPath ? get(data, amountPath) : findAny(data, ["amount", "montant", "total_amount"]));
  return { ok: true, amount: Number.isFinite(amount) ? amount : undefined };
}

// Authentifie l'appel selon le mode configuré.
// `payment` sert au mode "confirm", qui a besoin de la référence.
async function authenticate(event, payment) {
  if (MODE === "hmac") return authHmac(event);
  if (MODE === "confirm") return authConfirm(payment || {});
  return authToken(event);
}

module.exports = { parseBody, parsePayment, isSuccess, authenticate, MODE, get, findAny, toAmount };
