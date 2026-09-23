// glass.js — mise au format GLASS des résultats versés à la surveillance.
//
// GLASS est le système mondial de surveillance de la résistance aux
// antibiotiques de l'OMS. Son manuel technique (GLASS-AMR, annexes 3 à 5)
// définit un jeu de variables au niveau individuel, et surtout des LISTES DE
// CODES fermées : un pathogène, un prélèvement ou un antibiotique hors liste
// n'est pas recevable.
//
//   https://cdn.who.int/media/docs/default-source/antimicrobial-resistance/
//   amr-spc-sel-glass/.../glass-amr-manual-technical-document.pdf
//
// Trois conséquences, qui expliquent la forme de ce fichier :
//
//   1. GLASS ne couvre QUE des germes prioritaires — treize codes — là où
//      PhénoBac en interprète trente-sept. Les autres ne sont pas perdus :
//      ils sont conservés dans le registre local, et seulement écartés de
//      l'export GLASS. Un fichier d'export qui inventerait un code pour
//      Enterococcus faecium serait refusé, et à juste titre.
//
//   2. La liste d'antibiotiques est également fermée, et volontairement
//      courte. La vancomycine, la clindamycine, le linézolide et la
//      doxycycline n'y figurent pas : ils restent au registre local.
//
//   3. Deux variables de GLASS — ESBL et ResultCarbapenemases — demandent
//      précisément ce que le moteur de PhénoBac détermine. Là où la plupart
//      des laboratoires déclarent « inconnu », l'application peut répondre.
//      C'est le seul endroit où elle apporte à la surveillance autre chose
//      qu'une transcription.

/* ---------- Germes : PhénoBac -> code GLASS (annexe 4) ---------- */
const PATHOGENE = {
  ecoli: "ESCCOL",
  kpneu: "KLEPNE",
  saureus: "STAAUR",
  pneumocoque: "STRPNE",
  salmonella: "SALSPP",
  shigella: "SHISPP",
  acineto: "ACISPP",
  paeru: "PSEAER",
  haemophilus: "HAEINF",
  ngonorrhoeae: "NEIGON",
  nmeningitidis: "NEIMEN"
};

/* ---------- Prélèvements : libellé de l'application -> code GLASS ----------
   « Pus / plaie », « Cathéter » et « Autre » n'ont pas d'équivalent : GLASS
   ne surveille que les sites listés ci-dessous. Ces isolats restent au
   registre local. */
const PRELEVEMENT = {
  "Hémoculture": "BLOOD",
  "ECBU (urines)": "URINE",
  "LCR": "CSF",
  "Prélèvement respiratoire": "LOWRESP",
  "Selles": "STOOL",
  "Prélèvement génital": "UROGENITAL"
};

/* ---------- Antibiotiques : code PhénoBac -> code GLASS (annexe 4) ----------
   GLASS ne distingue pas l'amoxicilline de l'ampicilline : les deux relèvent
   du code AMP, comme dans les tableaux de l'EUCAST, qui les traitent
   ensemble. */
const ANTIBIOTIQUE = {
  AMX: "AMP", AMP: "AMP", AMC: "AMC", TZP: "TZP", FOX: "FOX",
  CTX: "CTX", CAZ: "CAZ", FEP: "FEP", ETP: "ETP", IPM: "IPM", MEM: "MEM",
  CIP: "CIP", LVX: "LVX", GEN: "GEN", AMK: "AMK", SXT: "SXT", COL: "COL",
  PEN: "PEN", OXA: "OXA", E: "ERY", AZM: "AZM", RD: "RIF",
  MIN: "MNO", CAF: "CHL"
};

/* ---------- Valeurs codées des variables de stratification (annexe 4) ---------- */
const GENRES = ["M", "F", "O", "UNK"];
const ORIGINES = ["HO", "CO", "UNK"];          // hospitalière, communautaire
const TYPES_PATIENT = ["INPAT", "OUTPAT", "UNK"];

// Tranches d'âge de GLASS. Le calcul se fait ici plutôt que côté saisie : un
// âge en années est moins ambigu à saisir qu'une tranche, et la découpe doit
// suivre le manuel, pas l'habitude du laboratoire.
const TRANCHES = [
  [0, 0, "<1"], [1, 4, "01-04"], [5, 14, "05-14"], [15, 24, "15-24"],
  [25, 34, "25-34"], [35, 44, "35-44"], [45, 54, "45-54"], [55, 64, "55-64"],
  [65, 74, "65-74"], [75, 84, "75-84"], [85, 200, "85+"]
];

function trancheAge(ans) {
  // Number("") vaut 0 : sans ce garde, un âge non renseigné serait classé
  // « nourrisson » et gonflerait la tranche des moins d'un an.
  if (ans === "" || ans === null || ans === undefined) return "UNK";
  const n = Number(ans);
  if (!isFinite(n) || n < 0) return "UNK";
  const t = TRANCHES.find(([a, b]) => n >= a && n <= b);
  return t ? t[2] : "UNK";
}

function code(valeur, permis, defaut) {
  const v = String(valeur || "").trim().toUpperCase();
  return permis.indexOf(v) !== -1 ? v : defaut;
}

// POS / NEG / UNK — GLASS n'accepte rien d'autre pour ESBL et carbapénémase.
function posNegUnk(v) {
  if (v === true || v === "POS") return "POS";
  if (v === false || v === "NEG") return "NEG";
  return "UNK";
}

/* ---------- Ce que le phénotype rendu par le moteur apporte à GLASS ----------
   Le manuel demande ESBL et ResultCarbapenemases. Le moteur les a déjà
   déterminés : on les transcrit, sans jamais inventer un « négatif » qu'on
   n'aurait pas établi — l'absence de preuve reste « inconnu ». */
function marqueurs(phenotype, ctx) {
  const nom = String(phenotype || "");
  const c = ctx || {};
  let esbl = "UNK", carba = "UNK";

  if (/BLSE/i.test(nom)) esbl = "POS";
  else if (c.syn === "Négatif") esbl = "NEG";

  if (/[Cc]arbapénémase confirmée/.test(nom)) carba = "POS";
  else if (typeof c.carba === "string" && c.carba.indexOf("Oui") === 0) carba = "POS";
  else if (typeof c.carba === "string" && c.carba.indexOf("Non") === 0) carba = "NEG";

  return { esbl: esbl, carba: carba };
}

/* ---------- Colonnes de l'export, dans l'ordre du manuel (annexe 3) ---------- */
const COLONNES = [
  "RecordId", "RecordType", "RecordTypeVersion", "Subject", "DataSource",
  "ReportingCountry", "Status", "LaboratoryCode", "PatientCounter", "Gender",
  "Age", "PatientType", "DateUsedForStatistics", "Specimen", "IsolateId",
  "Pathogen", "ESBL", "ResultCarbapenemases", "Antibiotic", "SIR"
];

/* ---------- Construction des enregistrements ----------
   GLASS raisonne par couple isolat × antibiotique : un isolat testé contre
   huit molécules donne huit lignes, chacune avec sa propre clé. */
function enregistrements(isolat) {
  const pathogene = PATHOGENE[isolat.organism];
  const prelevement = PRELEVEMENT[isolat.prelevement];
  if (!pathogene || !prelevement) return [];   // hors périmètre GLASS

  const pays = String(isolat.pays || "MLI").toUpperCase().slice(0, 3);
  const labo = String(isolat.laboratoire || "").trim().slice(0, 32);
  const date = String(isolat.date || "").slice(0, 10);
  const patient = String(isolat.patient || "").trim().slice(0, 32);
  const m = marqueurs(isolat.phenotype, isolat.ctx);

  const out = [];
  Object.keys(isolat.resultats || {}).forEach(k => {
    const ab = ANTIBIOTIQUE[k];
    const sir = String(isolat.resultats[k] || "").toUpperCase();
    if (!ab || ["S", "I", "R"].indexOf(sir) === -1) return;   // hors liste, ou non testé
    out.push({
      RecordId: [pays, labo, patient, pathogene, prelevement, ab, date].join("_"),
      RecordType: "AMRTEST",
      RecordTypeVersion: "3",
      Subject: "AMR",
      DataSource: "PHENOBAC",
      ReportingCountry: pays,
      Status: "NEW",
      LaboratoryCode: labo,
      PatientCounter: patient,
      Gender: code(isolat.genre, GENRES, "UNK"),
      Age: (isolat.age === "" || isolat.age === undefined || isolat.age === null)
             ? "" : String(Number(isolat.age)),
      PatientType: code(isolat.typePatient, TYPES_PATIENT, "UNK"),
      DateUsedForStatistics: date,
      Specimen: prelevement,
      IsolateId: String(isolat.isolat || "").slice(0, 32),
      Pathogen: pathogene,
      ESBL: m.esbl,
      ResultCarbapenemases: m.carba,
      Antibiotic: ab,
      SIR: sir
    });
  });
  return out;
}

/* ---------- Export ----------
   Point-virgule et BOM : les tableurs francophones ouvrent ainsi le fichier
   sans passer par un assistant d'importation, et les accents s'affichent. */
function versCsv(lignes) {
  const echapper = v => {
    const s = String(v === undefined || v === null ? "" : v);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const corps = lignes.map(l => COLONNES.map(c => echapper(l[c])).join(";"));
  return "﻿" + COLONNES.join(";") + "\n" + corps.join("\n") + (corps.length ? "\n" : "");
}

/* ---------- Déduplication ----------
   GLASS ne retient que le PREMIER isolat d'une espèce par patient, par
   prélèvement et par période. Sans cela, un patient hospitalisé longtemps
   et prélevé chaque semaine pèserait dix fois dans les taux de résistance,
   et les fausserait vers le haut — les souches répétées étant les plus
   résistantes. */
function dedupliquer(isolats) {
  const vus = new Map();
  const tries = isolats.slice().sort(
    (a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const gardes = [];
  tries.forEach(i => {
    const cle = [i.patient, i.organism, i.prelevement, String(i.date || "").slice(0, 4)].join("|");
    if (vus.has(cle)) return;
    vus.set(cle, true);
    gardes.push(i);
  });
  return gardes;
}

module.exports = {
  PATHOGENE, PRELEVEMENT, ANTIBIOTIQUE, COLONNES,
  trancheAge, marqueurs, enregistrements, versCsv, dedupliquer
};
