// netlify/functions/stats.js
// Agrégats de ventes pour le tableau de bord. RÉSERVÉ À VOUS (jeton admin).
// Lit les licences émises (phenobac-licenses) et les révocations (phenobac-revocations).
//
// POST {}  (Authorization: Bearer ADMIN)  ->  { totals, revenue, series, upcoming, recent }

const { decodePayload } = require("./lib/revocation");
const { getStore } = require("./lib/store");

const ADMIN = process.env.PHENOBAC_ADMIN_TOKEN || "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
const J = (code, obj) => ({ statusCode: code, headers: CORS, body: JSON.stringify(obj) });

async function readAll(store) {
  const out = [];
  const res = await store.list().catch(() => ({ blobs: [] }));
  for (const b of (res.blobs || [])) {
    const rec = await store.get(b.key, { type: "json" }).catch(() => null);
    if (rec) out.push(rec);
  }
  return out;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return J(405, { error: "method" });

  const auth = event.headers["authorization"] || event.headers["Authorization"] || "";
  if (!ADMIN || auth !== "Bearer " + ADMIN) return J(401, { error: "unauthorized" });

  const licenses = await readAll(getStore("phenobac-licenses"));
  const revs = await readAll(getStore("phenobac-revocations"));

  const revJti = new Set(), revSub = new Set();
  for (const r of revs) {
    if (r.type === "jti") revJti.add(r.value);
    else if (r.type === "sub") revSub.add(r.value);
  }

  const now = Math.floor(Date.now() / 1000);
  let active = 0, expired = 0, revoked = 0, revenue = 0, revenueActive = 0;
  const byMonth = {};
  const upcoming = [], recent = [];

  for (const rec of licenses) {
    const pl = rec.license ? decodePayload(rec.license) : null;
    const jti = rec.jti || (pl && pl.jti) || null;
    const sub = rec.sub || (pl && pl.sub) || "—";
    const exp = rec.exp || (pl && pl.exp) || 0;
    const at = rec.at || ((pl && pl.iat) ? pl.iat * 1000 : 0);
    const amount = Number(rec.amount) || 0;
    const source = rec.source || "auto";

    const isRevoked = (jti && revJti.has(jti)) || revSub.has(sub);
    const isExpired = exp && exp < now;
    if (isRevoked) revoked++;
    else if (isExpired) expired++;
    else { active++; revenueActive += amount; }

    revenue += amount;

    const d = new Date(at || 0);
    const mk = at ? d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") : "?";
    (byMonth[mk] = byMonth[mk] || { count: 0, revenue: 0 });
    byMonth[mk].count++; byMonth[mk].revenue += amount;

    if (!isRevoked && !isExpired && exp && (exp - now) < 30 * 86400) {
      upcoming.push({ sub, exp, days: Math.max(0, Math.ceil((exp - now) / 86400)) });
    }
    recent.push({ sub, amount, days: rec.days || null, at, source, revoked: isRevoked, expired: isExpired });
  }

  upcoming.sort((a, b) => a.exp - b.exp);
  recent.sort((a, b) => (b.at || 0) - (a.at || 0));
  const series = Object.keys(byMonth).filter(k => k !== "?").sort()
    .map(k => ({ month: k, count: byMonth[k].count, revenue: byMonth[k].revenue }));

  return J(200, {
    ok: true,
    totals: { count: licenses.length, active, expired, revoked },
    revenue, revenueActive,
    series,
    upcoming: upcoming.slice(0, 60),
    recent: recent.slice(0, 60)
  });
};
