/* ============================================================
   essai-referentiel.js — le choix du référentiel change-t-il
   réellement ce que le moteur rend ?

   Deux référentiels qui produiraient le même résultat seraient un
   mensonge d'interface. Ce banc vérifie, pour chaque différence
   déclarée dans REFERENTIEL-CASFM.md, que basculer d'EUCAST au
   CA-SFM change la catégorie ou la lecture interprétative — et que
   basculer en sens inverse la rétablit.

   Avec Node :             node outils/essai-referentiel.js
   Sans Node, sur macOS :  /System/Library/Frameworks/JavaScriptCore.framework/\
                             Versions/A/Helpers/jsc outils/essai-referentiel.js

   À lancer depuis la racine du dépôt.
   ============================================================ */

var E, KO = 0, OK = 0;

/* ---------- chargement du moteur, avec ou sans Node ---------- */
if (typeof require === "function" && typeof module === "object" && module.exports) {
  E = require("../netlify/functions/premium-interpret")._engine;
} else {
  // jsc : ni require ni process. On fournit le strict nécessaire ; rien de
  // ce qui est simulé ici n'intervient dans le calcul des catégories.
  var mod = { exports: {} };
  var faux = function (n) {
    if (n === "crypto") return {
      createHmac: function () { return { update: function () { return this; }, digest: function () { return ""; } }; },
      timingSafeEqual: function () { return false; }
    };
    if (n.indexOf("revocation") !== -1) return { isRevoked: function () { return false; } };
    if (n.indexOf("http") !== -1) return { cors: function () { return {}; } };
    return {};
  };
  var src = readFile("netlify/functions/premium-interpret.js");
  (new Function("module", "exports", "process", "require", src))(mod, mod.exports, { env: {} }, faux);
  E = mod.exports._engine;
}

function dire(s) { (typeof console === "object" ? console.log : print)(s); }

/* ---------- vérifications ---------- */

// La catégorie attendue pour un couple, sous un référentiel donné.
function categorie(titre, entree, abx, attendu) {
  var got = E.runInterpretation(entree).categories[abx];
  var ok = got === attendu;
  ok ? OK++ : KO++;
  dire((ok ? "  ok   " : "  ÉCHEC") + "  " + titre + " — " + abx + " = " + got + " (attendu " + attendu + ")");
}

// La lecture interprétative a-t-elle reporté ce couple en R ?
function reporte(titre, entree, abx, attendu) {
  var A = E.runInterpretation(entree).interpretation;
  var got = (A.rendu || []).some(function (x) { return x.abx === abx; });
  var ok = got === attendu;
  ok ? OK++ : KO++;
  dire((ok ? "  ok   " : "  ÉCHEC") + "  " + titre + " — " + abx +
       (got ? " reporté en R" : " non reporté") + (ok ? "" : " (attendu " + (attendu ? "reporté" : "non reporté") + ")"));
}

var mic = function (org, m, ctx, ref) { return { organism: org, mode: "mic", mic: m, ctx: ctx || {}, ref: ref }; };
var sir = function (org, r, ctx, ref) { return { organism: org, mode: "sir", results: r, ctx: ctx || {}, ref: ref }; };

dire("\nSeuils déplacés par le CA-SFM");
// p. 11 — vancomycine / S. aureus : 2 mg/L (EUCAST) contre 1 mg/L.
categorie("S. aureus, vancomycine 2 mg/L, EUCAST", mic("saureus", { VA: "2" }, {}, "eucast"), "VA", "S");
categorie("S. aureus, vancomycine 2 mg/L, CA-SFM", mic("saureus", { VA: "2" }, {}, "casfm"), "VA", "R");
// … et pas les staphylocoques à coagulase négative.
categorie("S. epidermidis, vancomycine 2 mg/L, CA-SFM", mic("sepidermidis", { VA: "2" }, {}, "casfm"), "VA", "S");
// p. 12 — pénicilline G / streptocoques A, C, G : 0,03 contre 0,06.
categorie("S. pyogenes, pénicilline G 0,06 mg/L, EUCAST", mic("spyogenes", { PEN: "0.06" }, {}, "eucast"), "PEN", "R");
categorie("S. pyogenes, pénicilline G 0,06 mg/L, CA-SFM", mic("spyogenes", { PEN: "0.06" }, {}, "casfm"), "PEN", "S");
// p. 6 — Acinetobacter : « sensible à forte posologie » conservée jusqu'à 2 mg/L.
categorie("Acinetobacter, cotrimoxazole 2 mg/L, EUCAST", mic("acineto", { SXT: "2" }, {}, "eucast"), "SXT", "R");
categorie("Acinetobacter, cotrimoxazole 2 mg/L, CA-SFM", mic("acineto", { SXT: "2" }, {}, "casfm"), "SXT", "I");
// p. 18 — Corynebacterium : valeur adaptée du CLSI M45.
categorie("Corynebacterium, cotrimoxazole 1 mg/L, EUCAST", mic("coryne", { SXT: "1" }, {}, "eucast"), "SXT", "I");
categorie("Corynebacterium, cotrimoxazole 1 mg/L, CA-SFM", mic("coryne", { SXT: "1" }, {}, "casfm"), "SXT", "S");
// p. 14 — gentamicine / N. gonorrhoeae : l'EUCAST écarte la molécule.
categorie("N. gonorrhoeae, gentamicine 8 mg/L, EUCAST", mic("ngonorrhoeae", { GEN: "8" }, {}, "eucast"), "GEN", undefined);
categorie("N. gonorrhoeae, gentamicine 8 mg/L, CA-SFM", mic("ngonorrhoeae", { GEN: "8" }, {}, "casfm"), "GEN", "S");

dire("\nSeuils dépendants du site de prélèvement");
// p. 6 — le cotrimoxazole garde 2 mg/L dans l'urine, 0,5 mg/L ailleurs.
categorie("E. coli, cotrimoxazole 1 mg/L, CA-SFM systémique", mic("ecoli", { SXT: "1" }, {}, "casfm"), "SXT", "R");
categorie("E. coli, cotrimoxazole 1 mg/L, CA-SFM urinaire", mic("ecoli", { SXT: "1" }, { urin: "Oui" }, "casfm"), "SXT", "S");
categorie("E. coli, cotrimoxazole 1 mg/L, EUCAST urinaire", mic("ecoli", { SXT: "1" }, { urin: "Oui" }, "eucast"), "SXT", "R");
// p. 14 — méningite à méningocoque : seuil unique sur l'amoxicilline.
categorie("N. meningitidis, amoxicilline 0,5 mg/L, LCR, EUCAST", mic("nmeningitidis", { AMX: "0.5" }, { mening: "Oui" }, "eucast"), "AMX", "I");
categorie("N. meningitidis, amoxicilline 0,5 mg/L, LCR, CA-SFM", mic("nmeningitidis", { AMX: "0.5" }, { mening: "Oui" }, "casfm"), "AMX", "R");
categorie("N. meningitidis, amoxicilline 0,5 mg/L, hors LCR, CA-SFM", mic("nmeningitidis", { AMX: "0.5" }, { mening: "Non" }, "casfm"), "AMX", "I");

dire("\nLa saisie du biologiste prime sur le référentiel");
categorie("Seuil forcé à 4 mg/L, CA-SFM actif",
  { organism: "saureus", mode: "mic", mic: { VA: "2" }, bpOverride: { "staph:VA": { S: 4, R: 4 } }, ctx: {}, ref: "casfm" },
  "VA", "S");

dire("\nLecture interprétative — BLSE (p. 8)");
// L'EUCAST a cessé de réinterpréter les C3G ; le CA-SFM y est revenu en 2024.
var blse = { AMX: "R", AMC: "R", FOX: "S", CTX: "I", CAZ: "S", FEP: "S", IPM: "S" };
reporte("BLSE, EUCAST", sir("ecoli", blse, { syn: "Positif" }, "eucast"), "CAZ", false);
reporte("BLSE, CA-SFM", sir("ecoli", blse, { syn: "Positif" }, "casfm"), "CAZ", true);
reporte("BLSE, CA-SFM — céfépime laissé à la CMI", sir("ecoli", blse, { syn: "Positif" }, "casfm"), "FEP", false);

dire("\nLecture interprétative — carbapénémase (p. 8)");
var carba = { AMX: "R", AMC: "R", FOX: "R", CTX: "R", CAZ: "R", ETP: "R", IPM: "S", MEM: "I", COL: "S" };
reporte("Carbapénémase non confirmée, CA-SFM", sir("kpneu", carba, {}, "casfm"), "IPM", false);
reporte("Carbapénémase confirmée, CA-SFM", sir("kpneu", carba, { carba: "Oui — autre enzyme" }, "casfm"), "IPM", true);
reporte("Carbapénémase confirmée, EUCAST", sir("kpneu", carba, { carba: "Oui — autre enzyme" }, "eucast"), "IPM", false);
// OXA-48 : céfotaxime et ceftriaxone rendus R en plus (règle de 2023).
var oxa = { AMX: "R", AMC: "R", CTX: "S", ETP: "R", IPM: "S", MEM: "S" };
reporte("OXA-48 confirmée, CA-SFM", sir("kpneu", oxa, { carba: "Oui — OXA-48" }, "casfm"), "CTX", true);
reporte("Autre enzyme confirmée, CA-SFM", sir("kpneu", oxa, { carba: "Oui — autre enzyme" }, "casfm"), "CTX", false);

dire("\nUn antibiotique non testé n'est jamais rendu résistant");
reporte("Méropénème non testé, carbapénémase confirmée",
  sir("kpneu", { AMX: "R", CTX: "R", ETP: "R", IPM: "S" }, { carba: "Oui — autre enzyme" }, "casfm"), "MEM", false);

dire("\n" + (KO ? KO + " échec(s) sur " + (OK + KO) + " vérifications."
                : OK + " vérifications, aucune divergence inattendue."));
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
