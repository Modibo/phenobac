// netlify/functions/verify-license.js
// Vérifie une licence PhénoBac signée (HMAC-SHA256).
// Le secret ne quitte JAMAIS le serveur : impossible de forger une clé côté client.
//
// Variables d'environnement (Netlify > Site settings > Environment variables) :
//   PHENOBAC_SECRET   secret de signature (chaîne longue et aléatoire)
//
// Appel : POST { "license": "<token>" }  ->  { valid, plan, sub, exp, reason }

const crypto = require("crypto");
const { isRevoked } = require("./lib/revocation");
const { cors } = require("./lib/http");
const SECRET = process.env.PHENOBAC_SECRET || "";

function sign(payloadB64) {
  return crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
}

function verify(token) {
  if (!SECRET) return { valid: false, reason: "server_not_configured" };
  if (typeof token !== "string" || !token.includes(".")) return { valid: false, reason: "malformed" };

  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return { valid: false, reason: "malformed" };

  // comparaison à temps constant pour éviter les attaques temporelles
  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: "bad_signature" };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch (e) {
    return { valid: false, reason: "bad_payload" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp) {
    return { valid: false, reason: "expired", exp: payload.exp };
  }

  return {
    valid: true,
    plan: payload.plan || "premium",
    sub: payload.sub || null,
    exp: payload.exp || null
  };
}

// Les origines autorisées viennent de SITE_URL / ALLOWED_ORIGINS (voir lib/http.js).

exports.handler = async (event) => {
  const CORS = cors(event);
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ valid: false, reason: "method" }) };
  }

  let license = "";
  try { license = (JSON.parse(event.body || "{}").license) || ""; } catch (e) {}

  const result = verify(String(license).trim());
  if (result.valid && await isRevoked(license)) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ valid: false, reason: "revoked" }) };
  }
  return { statusCode: 200, headers: CORS, body: JSON.stringify(result) };
};
