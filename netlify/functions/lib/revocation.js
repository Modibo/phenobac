// netlify/functions/lib/revocation.js
// Liste de révocation des licences (Netlify Blobs). Module partagé.
//
// Une licence signée est normalement valide jusqu'à son expiration. Pour la
// bloquer avant (clé compromise, remboursement…), on ajoute son identifiant
// à une liste consultée lors de la vérification.
//
// Deux granularités :
//   - par licence  : identifiant unique "jti" présent dans chaque clé émise
//   - par client   : "sub" (bloque toutes les licences d'un même client)

const { getStore } = require("./store");
const STORE = "phenobac-revocations";
function store() { return getStore(STORE); }

// clé de stockage sûre pour un sub (e-mail, téléphone, texte libre)
function subKey(sub) { return "sub:" + Buffer.from(String(sub)).toString("base64url"); }
function jtiKey(jti) { return "jti:" + String(jti); }

// décode la charge utile d'une clé (base64url) sans vérifier la signature
function decodePayload(token) {
  try {
    const p = String(token).split(".")[0];
    return JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch (e) { return null; }
}

// une licence (par son token) est-elle révoquée ? (jti OU sub)
async function isRevoked(token) {
  const pl = decodePayload(token);
  if (!pl) return false;
  if (pl.jti) {
    const j = await store().get(jtiKey(pl.jti), { type: "json" }).catch(() => null);
    if (j) return true;
  }
  if (pl.sub) {
    const s = await store().get(subKey(pl.sub), { type: "json" }).catch(() => null);
    if (s) return true;
  }
  return false;
}

async function revoke({ jti, sub, reason }) {
  const at = Date.now();
  if (jti) await store().setJSON(jtiKey(jti), { type: "jti", value: jti, sub: sub || null, reason: reason || "", at });
  else if (sub) await store().setJSON(subKey(sub), { type: "sub", value: sub, reason: reason || "", at });
  else return { ok: false, reason: "no_target" };
  return { ok: true };
}

async function restore({ jti, sub }) {
  const key = jti ? jtiKey(jti) : (sub ? subKey(sub) : null);
  if (!key) return { ok: false, reason: "no_target" };
  await store().delete(key).catch(() => {});
  return { ok: true };
}

async function list() {
  const out = [];
  const res = await store().list().catch(() => ({ blobs: [] }));
  for (const b of (res.blobs || [])) {
    const rec = await store().get(b.key, { type: "json" }).catch(() => null);
    if (rec) out.push(rec);
  }
  out.sort((a, b) => (b.at || 0) - (a.at || 0));
  return out;
}

module.exports = { decodePayload, isRevoked, revoke, restore, list };
