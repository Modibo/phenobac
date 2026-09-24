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

dire("\nSeuils relevés dans le communiqué complet");
// Le document des DIFFÉRENCES n'annonce pour les corynébactéries que le seuil
// « R », « commun à 2 mg/L ». Le tableau du communiqué donne les deux : S ≤ 1
// et R > 2. Retenir 2 des deux côtés rendait sensible une souche que le
// CA-SFM classe intermédiaire — l'erreur va dans le mauvais sens.
categorie("Corynebacterium, cotrimoxazole 2 mg/L, CA-SFM",
          mic("coryne", { SXT: "2" }, {}, "casfm"), "SXT", "I");
categorie("Corynebacterium, cotrimoxazole 1 mg/L, CA-SFM",
          mic("coryne", { SXT: "1" }, {}, "casfm"), "SXT", "S");
// Staphylocoques : bande intermédiaire jusqu'à 2 mg/L, absente de l'EUCAST.
categorie("S. aureus, cotrimoxazole 2 mg/L, EUCAST",
          mic("saureus", { SXT: "2" }, {}, "eucast"), "SXT", "R");
categorie("S. aureus, cotrimoxazole 2 mg/L, CA-SFM",
          mic("saureus", { SXT: "2" }, {}, "casfm"), "SXT", "I");
categorie("SCN, cotrimoxazole 2 mg/L, CA-SFM",
          mic("sepidermidis", { SXT: "2" }, {}, "casfm"), "SXT", "I");

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

// La ZIT est-elle détectée ? Elle porte sur une valeur de CMI définie.
function zitDetectee(titre, entree, abx, attendu) {
  var A = E.runInterpretation(entree).interpretation;
  var got = (A.zit || []).some(function (x) { return x.abx === abx; });
  var ok = got === attendu;
  ok ? OK++ : KO++;
  dire((ok ? "  ok   " : "  ÉCHEC") + "  " + titre + " — " + abx + (got ? " en ZIT" : " hors ZIT") +
       (ok ? "" : " (attendu " + (attendu ? "en ZIT" : "hors ZIT") + ")"));
}

dire("\nMolécules ajoutées — seuils et restrictions d'espèce");
// Témocilline : l'EUCAST n'affiche qu'une valeur, qui sépare « sensible à
// forte posologie » de « résistant ». Le CA-SFM autorise la posologie
// standard dans les infections urinaires sans signe de gravité (p. 7).
categorie("E. coli, témocilline 8 mg/L, EUCAST", mic("ecoli", { TEM: "8" }, {}, "eucast"), "TEM", "I");
categorie("E. coli, témocilline 8 mg/L, CA-SFM systémique", mic("ecoli", { TEM: "8" }, {}, "casfm"), "TEM", "I");
categorie("E. coli, témocilline 8 mg/L, CA-SFM urinaire", mic("ecoli", { TEM: "8" }, { urin: "Oui" }, "casfm"), "TEM", "S");
// Céfidérocol : même valeur dans les deux référentiels chez les entérobactéries.
categorie("E. coli, céfidérocol 2 mg/L", mic("ecoli", { FDC: "2" }, {}, "eucast"), "FDC", "S");
categorie("P. aeruginosa, céfidérocol 4 mg/L", mic("paeru", { FDC: "4" }, {}, "eucast"), "FDC", "R");
// Daptomycine : 1 mg/L chez le staphylocoque (EUCAST), 2 mg/L chez
// l'entérocoque où l'EUCAST ne propose rien (CA-SFM, p. 12).
categorie("S. aureus, daptomycine 1 mg/L", mic("saureus", { DAP: "1" }, {}, "eucast"), "DAP", "S");
categorie("E. faecium, daptomycine 2 mg/L", mic("efaecium", { DAP: "2" }, {}, "casfm"), "DAP", "S");
categorie("E. faecium, daptomycine 4 mg/L", mic("efaecium", { DAP: "4" }, {}, "casfm"), "DAP", "R");
zitDetectee("E. faecium, daptomycine 4 mg/L, CA-SFM", mic("efaecium", { DAP: "4" }, {}, "casfm"), "DAP", true);
// Minocycline : 0,5 mg/L chez le staphylocoque ; chez Acinetobacter et
// S. maltophilia le CA-SFM retient l'ECOFF à 2 mg/L, sans catégorie S.
categorie("S. aureus, minocycline 0,5 mg/L", mic("saureus", { MIN: "0,5" }, {}, "eucast"), "MIN", "S");
categorie("Acinetobacter, minocycline 1 mg/L", mic("acineto", { MIN: "1" }, {}, "casfm"), "MIN", "I");
categorie("Acinetobacter, minocycline 4 mg/L", mic("acineto", { MIN: "4" }, {}, "casfm"), "MIN", "R");
// Moxifloxacine : valeurs EUCAST par espèce, et 2 mg/L chez les anaérobies
// où l'EUCAST ne publie rien.
categorie("Pneumocoque, moxifloxacine 0,5 mg/L", mic("pneumocoque", { MXF: "0,5" }, {}, "eucast"), "MXF", "S");
categorie("H. influenzae, moxifloxacine 0,25 mg/L", mic("haemophilus", { MXF: "0,25" }, {}, "eucast"), "MXF", "R");
categorie("B. fragilis, moxifloxacine 2 mg/L, CA-SFM", mic("bfragilis", { MXF: "2" }, {}, "casfm"), "MXF", "S");

dire("\nZones d'incertitude technique communes aux deux référentiels");
// EUCAST ATU 16 mg/L, CA-SFM ZIT 16 mg/L : même valeur, même effet.
zitDetectee("Entérobactérie, pipéracilline-tazobactam 16 mg/L, EUCAST", mic("ecoli", { TZP: "16" }, {}, "eucast"), "TZP", true);
zitDetectee("Entérobactérie, pipéracilline-tazobactam 16 mg/L, CA-SFM", mic("ecoli", { TZP: "16" }, {}, "casfm"), "TZP", true);
zitDetectee("Entérobactérie, pipéracilline-tazobactam 8 mg/L", mic("ecoli", { TZP: "8" }, {}, "eucast"), "TZP", false);
// Un résultat franchement au-dessus de la ZIT n'est pas incertain ; un
// résultat censuré « ≤ » ne permet pas de l'exclure.
zitDetectee("Entérobactérie, > 16 mg/L", mic("ecoli", { TZP: ">16" }, {}, "eucast"), "TZP", false);
zitDetectee("Entérobactérie, ≤ 16 mg/L", mic("ecoli", { TZP: "<=16" }, {}, "eucast"), "TZP", true);
zitDetectee("Entérobactérie, ciprofloxacine 0,5 mg/L", mic("ecoli", { CIP: "0,5" }, {}, "eucast"), "CIP", true);
// La méningite et Salmonella ont chacune leur ligne, sans ZIT.
zitDetectee("Ciprofloxacine 0,5 mg/L en contexte méningé", mic("ecoli", { CIP: "0,5" }, { mening: "Oui" }, "eucast"), "CIP", false);
zitDetectee("Salmonella, ciprofloxacine 0,5 mg/L", mic("salmonella", { CIP: "0,5" }, {}, "eucast"), "CIP", false);
zitDetectee("Salmonella, pipéracilline-tazobactam 16 mg/L", mic("salmonella", { TZP: "16" }, {}, "eucast"), "TZP", true);

dire("\nZones d'incertitude technique propres au CA-SFM");
zitDetectee("S. aureus, vancomycine 2 mg/L, EUCAST", mic("saureus", { VA: "2" }, {}, "eucast"), "VA", false);
zitDetectee("S. aureus, vancomycine 2 mg/L, CA-SFM", mic("saureus", { VA: "2" }, {}, "casfm"), "VA", true);
zitDetectee("S. epidermidis, vancomycine 2 mg/L, CA-SFM", mic("sepidermidis", { VA: "2" }, {}, "casfm"), "VA", false);
zitDetectee("P. aeruginosa, colistine 4 mg/L, EUCAST", mic("paeru", { COL: "4" }, {}, "eucast"), "COL", false);
zitDetectee("P. aeruginosa, colistine 4 mg/L, CA-SFM", mic("paeru", { COL: "4" }, {}, "casfm"), "COL", true);

dire("\nCe que la ZIT ne fait pas");
// Les seuils saisis par le biologiste ne sont pas ceux du comité : la ZIT
// publiée ne s'y rapporte plus.
zitDetectee("Seuils forcés par le biologiste",
  { organism: "ecoli", mode: "mic", mic: { TZP: "16" }, bpOverride: { "entero:TZP": { S: 16, R: 32 } }, ctx: {}, ref: "eucast" },
  "TZP", false);
// Sans CMI, il n'y a rien à situer.
zitDetectee("Saisie en S/I/R", sir("ecoli", { TZP: "I" }, {}, "eucast"), "TZP", false);

(function () {
  // PhénoBac ne dégrade jamais la catégorie de lui-même — l'EUCAST le permet
  // parmi d'autres options, le CA-SFM le déconseille ; la décision revient
  // au biologiste.
  var o = E.runInterpretation(mic("saureus", { VA: "2" }, {}, "casfm"));
  var ok = o.categories.VA === "R" && o.rendues.VA === "R";
  ok ? OK++ : KO++;
  dire((ok ? "  ok   " : "  ÉCHEC") + "  la catégorie en ZIT est conservée, jamais dégradée d'office");

  var txt = function (ref) {
    return (E.runInterpretation(mic("ecoli", { TZP: "16" }, {}, ref)).interpretation.rules || [])
      .map(function (x) { return x.txt; }).join(" ");
  };
  var ok2 = txt("casfm").indexOf("ne pas dégrader") !== -1;
  ok2 ? OK++ : KO++;
  dire((ok2 ? "  ok   " : "  ÉCHEC") + "  CA-SFM : la consigne de ne pas dégrader est rendue");
  var ok3 = txt("eucast").indexOf("est permis") !== -1;
  ok3 ? OK++ : KO++;
  dire((ok3 ? "  ok   " : "  ÉCHEC") + "  EUCAST : la dégradation est présentée comme permise");
})();

dire("\nCe qui sort du moteur ne doit pas pouvoir devenir du balisage");
(function () {
  // parseFloat s'arrête au premier caractère non numérique : « 16<img…> »
  // vaut 16 et tombe donc dans la zone d'incertitude technique. La valeur
  // saisie est reprise dans l'alerte — bornée, et échappée à l'affichage.
  var charge = "<img src=x onerror=alert(1)>";
  var A = E.runInterpretation(mic("ecoli", { TZP: "16" + charge }, {}, "eucast")).interpretation;
  var reprise = (A.alerts || []).filter(function (x) { return x.txt.indexOf("<img") !== -1; });
  var borne = reprise.every(function (x) { return x.txt.length < 400; });
  borne ? OK++ : KO++;
  dire((borne ? "  ok   " : "  ÉCHEC") + "  la CMI reprise dans l'alerte reste bornée");

  // Une valeur qui n'est pas une catégorie n'est jamais réinterprétée ni
  // recopiée : elle n'a pas de sens clinique et n'a rien à faire au rendu.
  var b2 = E.runInterpretation(sir("ecoli",
    { CTX: "R", CAZ: charge, AMX: "R" }, { syn: "Positif" }, "casfm")).interpretation;
  var propre = !(b2.rendu || []).some(function (x) { return String(x.brut).indexOf("<") !== -1; });
  propre ? OK++ : KO++;
  dire((propre ? "  ok   " : "  ÉCHEC") + "  une valeur qui n'est pas S, I ou R n'est pas recopiée");

  // Une clé héritée du prototype n'est pas une entrée du registre.
  var r = E.runInterpretation(mic("saureus", { VA: "2" }, {}, "toString"));
  var repli = r.referentiel && r.referentiel.cle === "eucast" && r.categories.VA === "S";
  repli ? OK++ : KO++;
  dire((repli ? "  ok   " : "  ÉCHEC") + "  « toString » comme référentiel retombe sur l'EUCAST");
})();

dire("\n" + (KO ? KO + " échec(s) sur " + (OK + KO) + " vérifications."
                : OK + " vérifications, aucune divergence inattendue."));
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
