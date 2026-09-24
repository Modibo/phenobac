// surveillance.js — registre local des isolats versés à la surveillance,
// et export au format GLASS de l'OMS.
//
// RIEN n'est enregistré sans un geste explicite du biologiste : l'endpoint
// d'interprétation, lui, n'écrit toujours rien. Le versement est une action
// séparée, déclenchée à la validation, et le contenu de ce qui part est
// affiché à l'utilisateur avant l'envoi.
//
// Ce qui est conservé : espèce, antibiogramme, prélèvement, code du
// laboratoire, date, et un compteur patient ANONYME que le laboratoire
// maîtrise. Jamais de nom, jamais de numéro d'échantillon — ceux-là restent
// dans le navigateur et ne servent qu'au compte rendu.

const { getStore } = require("./lib/store");
const { cors, adminOk } = require("./lib/http");
const G = require("./lib/glass");

const REGISTRE = "phenobac-surveillance";

function reponse(CORS, statut, corps) {
  return { statusCode: statut, headers: CORS, body: JSON.stringify(corps) };
}

// Un versement n'est recevable que s'il porte de quoi être exploité.
function valider(c) {
  if (!c || typeof c !== "object") return "corps illisible";
  if (!c.organism || typeof c.organism !== "string") return "espèce manquante";
  if (!c.laboratoire || !String(c.laboratoire).trim()) return "code du laboratoire manquant";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(c.date || ""))) return "date attendue au format AAAA-MM-JJ";
  const r = c.resultats;
  if (!r || typeof r !== "object" || !Object.keys(r).length) return "antibiogramme vide";
  const mauvais = Object.keys(r).filter(k => ["S", "I", "R"].indexOf(String(r[k]).toUpperCase()) === -1);
  if (mauvais.length) return "catégorie invalide pour : " + mauvais.slice(0, 4).join(", ");
  return null;
}

exports.handler = async (event) => {
  const CORS = cors(event);
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return reponse(CORS, 405, { error: "method" });

  let body = {};
  try { body = JSON.parse(event.body || "{}"); }
  catch (e) { return reponse(CORS, 400, { error: "bad_json" }); }

  const store = getStore(REGISTRE);
  const action = String(body.action || "verser");

  /* ---------- verser un isolat ---------- */
  if (action === "verser") {
    const faute = valider(body.isolat);
    if (faute) return reponse(CORS, 400, { error: "invalide", message: faute });

    const i = body.isolat;
    const cle = "iso_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    const enreg = {
      cle,
      recu: new Date().toISOString(),
      organism: String(i.organism),
      prelevement: String(i.prelevement || ""),
      resultats: i.resultats,
      phenotype: String(i.phenotype || ""),
      ctx: i.ctx || {},
      referentiel: String(i.referentiel || ""),
      laboratoire: String(i.laboratoire).trim().slice(0, 32),
      pays: String(i.pays || "MLI").toUpperCase().slice(0, 3),
      patient: String(i.patient || "").trim().slice(0, 32),
      isolat: String(i.isolat || "").trim().slice(0, 32),
      genre: String(i.genre || "UNK"),
      age: (i.age === "" || i.age === undefined || i.age === null) ? "" : Number(i.age),
      typePatient: String(i.typePatient || "UNK"),
      date: String(i.date)
    };
    await store.setJSON(cle, enreg);

    // Dire au laboratoire si l'isolat entrera dans l'export GLASS : un germe
    // ou un site hors périmètre est conservé localement, et il vaut mieux
    // l'annoncer que de le laisser croire transmis.
    const dansGlass = G.enregistrements(enreg).length > 0;
    return reponse(CORS, 200, {
      ok: true, cle,
      glass: dansGlass,
      message: dansGlass
        ? "Isolat enregistré et retenu pour l'export GLASS."
        : "Isolat enregistré au registre local. Hors périmètre GLASS : l'OMS ne surveille que certains germes et certains sites."
    });
  }

  /* ---------- exporter (réservé à l'administration) ---------- */
  if (action === "exporter" || action === "compter") {
    if (!adminOk(event)) return reponse(CORS, 401, { error: "unauthorized" });

    // Période de collecte. Une date illisible est REFUSÉE, jamais ignorée :
    // un filtre silencieusement inopérant exporterait précisément ce qu'on
    // cherchait à écarter, et l'erreur ne se verrait qu'après transmission.
    const JOUR = /^\d{4}-\d{2}-\d{2}$/;
    const depuis = body.depuis === undefined || body.depuis === null ? "" : String(body.depuis).trim();
    const jusqu  = body.jusqu_a === undefined || body.jusqu_a === null ? "" : String(body.jusqu_a).trim();
    if ((depuis && !JOUR.test(depuis)) || (jusqu && !JOUR.test(jusqu)))
      return reponse(CORS, 400, { error: "invalide",
        message: "dates attendues au format AAAA-MM-JJ (« depuis », « jusqu_a »)" });
    if (depuis && jusqu && depuis > jusqu)
      return reponse(CORS, 400, { error: "invalide",
        message: "« depuis » est postérieur à « jusqu_a »" });

    const res = await store.list().catch(() => ({ blobs: [] }));
    const tous = [];
    for (const b of (res.blobs || [])) {
      const rec = await store.get(b.key, { type: "json" }).catch(() => null);
      if (rec && typeof rec === "object") tous.push(rec);
    }

    // Le filtre s'applique AVANT la déduplication : un isolat écarté parce
    // qu'il précède la période ne doit plus masquer celui du même patient à
    // l'intérieur de la période.
    const isolats = G.filtrerPeriode(tous, depuis, jusqu);

    if (action === "compter") {
      const dedup = G.dedupliquer(isolats);
      const retenus = dedup.filter(i => G.enregistrements(i).length);
      return reponse(CORS, 200, {
        ok: true,
        // Le registre entier ET la période : sans les deux, on ne verrait pas
        // ce que le filtre écarte, et on le croirait sans effet.
        totalRegistre: tous.length,
        periode: (depuis || jusqu) ? { depuis: depuis || null, jusqu_a: jusqu || null } : null,
        total: isolats.length,
        apresDeduplication: dedup.length,
        dansGlass: retenus.length
      });
    }

    // GLASS ne retient que le premier isolat par patient, espèce, site et
    // période : la déduplication est faite ici, pas laissée à l'utilisateur.
    const gardes = body.dedupliquer === false ? isolats : G.dedupliquer(isolats);
    const lignes = [];
    gardes.forEach(i => { G.enregistrements(i).forEach(l => lignes.push(l)); });

    // Le nom du fichier porte la période : deux exports côte à côte dans un
    // dossier doivent se distinguer sans qu'on ait à les ouvrir.
    const suffixe = (depuis || jusqu)
      ? "-" + (depuis || "debut") + "_" + (jusqu || "fin")
      : "";
    return {
      statusCode: 200,
      headers: Object.assign({}, CORS, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="phenobac-glass' + suffixe + '.csv"'
      }),
      body: G.versCsv(lignes)
    };
  }

  return reponse(CORS, 400, { error: "action inconnue" });
};
