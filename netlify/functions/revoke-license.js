// netlify/functions/revoke-license.js
// Gestion de la liste de révocation. RÉSERVÉ À VOUS (jeton admin).
//
// POST { action: "revoke",  token | jti | sub, reason }
// POST { action: "restore", jti | sub }
// POST { action: "list" }
//
// Donner un "token" révoque cette licence précise (par son jti) ;
// donner un "sub" révoque toutes les licences de ce client.

const { decodePayload, revoke, restore, list } = require("./lib/revocation");

const ADMIN = process.env.PHENOBAC_ADMIN_TOKEN || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",          // en prod : restreindre à l'origine de la page admin
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
const J = (code, obj) => ({ statusCode: code, headers: CORS, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return J(405, { error: "method" });

  const auth = event.headers["authorization"] || event.headers["Authorization"] || "";
  if (!ADMIN || auth !== "Bearer " + ADMIN) return J(401, { error: "unauthorized" });

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return J(400, { error: "bad_json" }); }

  const action = body.action || "revoke";

  if (action === "list") {
    return J(200, { ok: true, revoked: await list() });
  }

  // résoudre la cible : token -> jti (+ sub pour affichage), sinon jti/sub fournis
  let jti = body.jti || null;
  let sub = body.sub || null;
  if (body.token) {
    const pl = decodePayload(body.token);
    if (!pl) return J(400, { error: "bad_token" });
    jti = pl.jti || jti;
    sub = sub || pl.sub || null;
  }

  if (action === "restore") {
    if (!jti && !sub) return J(400, { error: "no_target" });
    await restore({ jti, sub: jti ? null : sub });
    return J(200, { ok: true, restored: jti ? { jti } : { sub } });
  }

  // revoke
  if (!jti && !sub) return J(400, { error: "no_target" });
  const res = await revoke({ jti, sub, reason: body.reason || "" });
  if (!res.ok) return J(400, res);
  return J(200, { ok: true, revoked: jti ? { jti, sub } : { sub } });
};
