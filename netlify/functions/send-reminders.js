// netlify/functions/send-reminders.js
// Relance automatique avant expiration. À exécuter une fois par jour.
//   - VPS : cron de l'hôte qui appelle cette URL avec l'entête X-Cron-Secret.
//   - Netlify : fonction planifiée (schedule dans netlify.toml).
//
// Variables d'environnement :
//   PHENOBAC_CRON_SECRET   secret pour autoriser l'appel HTTP (sinon PHENOBAC_ADMIN_TOKEN)
//   REMINDER_DAYS          fenêtre en jours (défaut 5)

const { getStore } = require("./lib/store");
const { decodePayload } = require("./lib/revocation");
const { remind } = require("./lib/deliver");
const { safeEqual } = require("./lib/http");

const CRON_SECRET = process.env.PHENOBAC_CRON_SECRET || process.env.PHENOBAC_ADMIN_TOKEN || "";
const WINDOW_DAYS = Math.max(1, parseInt(process.env.REMINDER_DAYS || "5", 10));
const JSONH = { "Content-Type": "application/json" };

async function readRevoked() {
  const store = getStore("phenobac-revocations");
  const res = await store.list().catch(() => ({ blobs: [] }));
  const jti = new Set(), sub = new Set();
  for (const b of (res.blobs || [])) {
    const r = await store.get(b.key, { type: "json" }).catch(() => null);
    if (r && r.type === "jti") jti.add(r.value);
    else if (r && r.type === "sub") sub.add(r.value);
  }
  return { jti, sub };
}

exports.handler = async (event) => {
  if (!CRON_SECRET) return { statusCode: 500, headers: JSONH, body: JSON.stringify({ error: "server_not_configured" }) };

  // Autorisation : secret en entête (cron HTTP, VPS), ou invocation planifiée
  // Netlify. ATTENTION : « le corps contient next_run » n'est une preuve que sur
  // Netlify, où seule la plateforme peut déclencher la fonction planifiée. Hors
  // Netlify, l'endpoint est public : sans ce garde-fou, n'importe qui pourrait
  // POSTer {"next_run":1} et déclencher un envoi de SMS en masse (à vos frais).
  let scheduled = false;
  if (process.env.NETLIFY) {
    try { const b = JSON.parse(event.body || "{}"); if (b && b.next_run) scheduled = true; } catch (e) {}
  }
  const secret = (event.headers && (event.headers["x-cron-secret"] || event.headers["X-Cron-Secret"])) || "";
  if (!scheduled && !safeEqual(secret, CRON_SECRET)) {
    return { statusCode: 401, headers: JSONH, body: JSON.stringify({ error: "unauthorized" }) };
  }

  const now = Math.floor(Date.now() / 1000);
  const store = getStore("phenobac-licenses");
  const { blobs } = await store.list().catch(() => ({ blobs: [] }));
  const revoked = await readRevoked();

  let scanned = 0, due = 0, sent = 0, skipped = 0;

  for (const b of (blobs || [])) {
    const rec = await store.get(b.key, { type: "json" }).catch(() => null);
    if (!rec) continue;
    scanned++;

    const pl = rec.license ? decodePayload(rec.license) : null;
    const jti = rec.jti || (pl && pl.jti) || null;
    const sub = rec.sub || (pl && pl.sub) || null;
    const exp = rec.exp || (pl && pl.exp) || 0;
    const contact = rec.contact || sub;

    if (!exp) continue;
    const daysLeft = Math.ceil((exp - now) / 86400);

    // dans la fenêtre, pas encore expirée, pas déjà relancée, pas révoquée
    if (daysLeft <= 0 || daysLeft > WINDOW_DAYS) continue;
    if (rec.reminded) continue;
    if ((jti && revoked.jti.has(jti)) || (sub && revoked.sub.has(sub))) continue;

    due++;
    const res = await remind(contact, { exp, days: daysLeft });
    // On marque comme relancée même sans téléphone, pour ne pas rescanner en boucle
    // (le suivi reste visible dans le tableau de bord « à expirer »).
    await store.setJSON(b.key, { ...rec, reminded: Date.now(), remindedResult: res });
    if (res.sent) sent++; else skipped++;
  }

  return { statusCode: 200, headers: JSONH, body: JSON.stringify({ ok: true, window_days: WINDOW_DAYS, scanned, due, sent, skipped }) };
};
