// netlify/functions/lib/deliver.js
// Envoi direct de la clé au client (SMS). Utilisé par payment-webhook.js.
// Ce fichier est un module partagé (sous-dossier lib/), pas un endpoint.
//
// Variables d'environnement :
//   SMS_API_URL   URL de l'API de votre passerelle SMS
//   SMS_API_KEY   clé/API token de la passerelle
//   SMS_SENDER    nom d'expéditeur affiché (ex. "PhenoBac") — selon ce que la passerelle autorise
//   SITE_URL      URL publique du site (ex. https://phenobac.netlify.app) pour envoyer un lien court
//
// Par défaut, le SMS contient un LIEN court vers success.html?ref=... (la clé y est déjà
// stockée) : plus court et moins cher qu'un token complet. Sans SITE_URL, la clé est
// envoyée en clair (peut occuper plusieurs segments SMS).

const SMS_API_URL = process.env.SMS_API_URL || "";
const SMS_API_KEY = process.env.SMS_API_KEY || "";
const SMS_SENDER  = process.env.SMS_SENDER  || "PhenoBac";
const SITE_URL    = (process.env.SITE_URL   || "").replace(/\/$/, "");

// Détecte un numéro de téléphone (E.164 ou local). Sinon on ne tente pas de SMS.
function isPhone(contact) {
  return /^\+?\d[\d\s().-]{6,}$/.test(String(contact || "").trim());
}

function fmtDate(exp) {
  return new Date(exp * 1000).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Construit le texte du SMS : lien court si SITE_URL est défini, sinon la clé brute.
function buildSMS({ license, exp, ref }) {
  const date = fmtDate(exp);
  if (SITE_URL && ref) {
    return `PhenoBac Premium active (valable jusqu'au ${date}). Recuperez votre cle: ${SITE_URL}/success.html?ref=${encodeURIComponent(ref)}`;
  }
  return `PhenoBac Premium active (jusqu'au ${date}). Cle: ${license} — Ouvrez PhenoBac > Debloquer > collez la cle.`;
}

// ============================================================
// À ADAPTER À VOTRE PASSERELLE SMS.
// Modèle générique : POST JSON { to, from, message } + clé API en entête.
// Adaptez l'URL, l'entête d'auth et le format du corps à votre fournisseur.
// ============================================================
async function sendSMS(to, message) {
  if (!SMS_API_URL || !SMS_API_KEY) return { sent: false, reason: "sms_not_configured" };
  try {
    const r = await fetch(SMS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + SMS_API_KEY },
      body: JSON.stringify({ to, from: SMS_SENDER, message })
    });
    if (!r.ok) return { sent: false, reason: "gateway_error", status: r.status };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: "network" };
  }
}

// Point d'entrée : envoie la clé si on a un téléphone ; sinon, le client
// récupérera sa clé sur success.html (aucune erreur bloquante).
async function deliver(contact, data) {
  if (!isPhone(contact)) return { sent: false, reason: "no_phone" };
  return sendSMS(contact, buildSMS(data));
}

// Message de relance avant expiration.
function buildReminderSMS({ exp, days }) {
  const date = fmtDate(exp);
  const where = SITE_URL ? " sur " + SITE_URL : "";
  const j = days <= 1 ? "demain" : ("dans " + days + " jours");
  return `PhenoBac : votre licence Premium expire ${j} (le ${date}). Pensez a la renouveler${where}. Merci !`;
}

// Envoie une relance si on a un téléphone.
async function remind(contact, data) {
  if (!isPhone(contact)) return { sent: false, reason: "no_phone" };
  return sendSMS(contact, buildReminderSMS(data));
}

module.exports = { deliver, sendSMS, buildSMS, isPhone, remind, buildReminderSMS };
