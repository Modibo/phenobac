// netlify/functions/premium-interpret.js
// L'interprétation en API. Le RAISONNEMENT, lui, est dans moteur.js, que le
// navigateur charge aussi : l'application interprète donc sur le poste, et
// cette fonction sert les clients qui préfèrent l'API — ou qui n'exécutent
// pas de JavaScript.
//
// Un seul exemplaire du raisonnement existe. Ce fichier ne contient plus de
// règle d'interprétation, et ne peut donc plus diverger de ce que le
// laboratoire voit à l'écran.
//
// Variables d'environnement : PHENOBAC_SECRET (même secret que verify-license.js)
//
// Appel : POST {
//   license,
//   organism,                       // identifiant d'espèce, voir ORG dans moteur.js
//   mode: "sir" | "mic" | "diam",   // catégories, CMI en mg/L, ou diamètres en mm
//   results {ABX:"S|I|R"},          // si mode "sir"
//   mic  {ABX:"valeur mg/L"},       // si mode "mic"
//   diam {ABX:"valeur mm"},         // si mode "diam" — méthode des disques
//   bpOverride {"groupe:ABX":{S,R}},// seuils propres au laboratoire, s'il en a
//   ctx {...},                      // tests complémentaires, site, et § 9 :
//                                   // conditions de réalisation déclarées
//   ref: "eucast" | "casfm",        // référentiel appliqué ; défaut eucast
//   renduCible: true | false        // politique du laboratoire : rendre une
//                                   // partie seulement des antibiotiques testés
//                                   // (HAS 2023). Défaut false — sans décision,
//                                   // tout est rendu.
// }
// Réponse 200 : {
//   valid, plan,
//   interpretation: { sev, name, mech, alerts, rules, comment, rendu, ... },
//   categories,                     // catégorie retenue par antibiotique
//   rendues,                        // catégories modifiées par la lecture interprétative
//   referentiel                     // référentiel réellement appliqué
// }
// Réponse 402 : licence requise ou révoquée. Le client en fait « locked ».
//
// CE COMMENTAIRE EST VÉRIFIÉ. outils/verifier-raccord.py échoue s'il cesse de
// décrire la requête que la page envoie réellement : un contrat périmé est
// pire qu'absent, parce qu'il est cru.

const crypto = require("crypto");

// Référentiel des concentrations critiques employées par ce moteur.
// Doit rester identique à la constante REFERENTIEL de phenobac.html.
// Le raisonnement vit dans ../../moteur.js, chargé aussi par le navigateur.
// Cette fonction n'en est plus qu'une porte : elle vérifie la requête, appelle
// le moteur, et rend la réponse. Aucune règle d'interprétation ici.
const M = require("../../moteur");
const { REFERENTIELS, runInterpretation } = M;
const REFERENTIEL = REFERENTIELS.eucast;   // défaut, conservé pour compatibilité
const { isRevoked } = require("./lib/revocation");
const { cors } = require("./lib/http");
const SECRET = process.env.PHENOBAC_SECRET || "";
// PhénoBac est GRATUIT : toutes les espèces et le mode CMI sont ouverts.
// La vérification de licence reste dans le code (lib, endpoints, révocation)
// mais ne conditionne plus l'accès — elle resservira si un jour des licences
// d'établissement sont émises pour un usage institutionnel ou de formation.
const FREE_SPECIES = null;   // null = tout est gratuit

/* ---------- Vérification de licence (identique à verify-license) ---------- */
function verify(token) {
  if (!SECRET) return { valid: false, reason: "server_not_configured" };
  if (typeof token !== "string" || !token.includes(".")) return { valid: false, reason: "malformed" };
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return { valid: false, reason: "malformed" };
  const expected = crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { valid: false, reason: "bad_signature" };
  let payload;
  try { payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")); }
  catch (e) { return { valid: false, reason: "bad_payload" }; }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp) return { valid: false, reason: "expired", exp: payload.exp };
  return { valid: true, plan: payload.plan || "premium", sub: payload.sub || null, exp: payload.exp || null };
}

/* ======================= Handler ======================= */
// Origines autorisées : SITE_URL / ALLOWED_ORIGINS (voir lib/http.js).

exports.handler = async (event) => {
  const CORS = cors(event);
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "method" }) };

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch (e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "bad_json" }) };
  }

  // 1. porte : licence obligatoire SAUF pour les germes gratuits EN MODE S/I/R.
  // La saisie par CMI est vendue comme fonction Premium : elle est donc payante
  // pour toutes les espèces, y compris les gratuites.
  const isFree = (FREE_SPECIES === null)
    || (FREE_SPECIES.includes(body.organism) && String(body.mode || "sir") !== "mic");
  const token = String(body.license || "").trim();
  const lic = verify(token);
  const revoked = lic.valid ? await isRevoked(token) : false;
  if (!isFree && (!lic.valid || revoked)) {
    return { statusCode: 402, headers: CORS, body: JSON.stringify({ valid: false, reason: revoked ? "revoked" : lic.reason }) };
  }

  // 2. calcul (gratuit : ouvert ; premium : compte payant non révoqué)
  const out = runInterpretation(body);
  if (out.error) return { statusCode: 400, headers: CORS, body: JSON.stringify({ valid: true, error: out.error }) };

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({ valid: true, plan: (lic.valid && !revoked) ? lic.plan : "free", interpretation: out.interpretation, categories: out.categories, rendues: out.rendues, referentiel: out.referentiel || REFERENTIEL })
  };
};

// Exposé pour les tests hors-Netlify
// Exposé pour les essais hors-Netlify. Le moteur est repris tel quel : les
// bancs éprouvent donc le même objet que le navigateur exécute.
if (typeof module !== "undefined") module.exports._engine = Object.assign({}, M, { verify });
