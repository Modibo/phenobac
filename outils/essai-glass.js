/* ============================================================
   essai-glass.js — l'export de surveillance est-il conforme au
   manuel GLASS de l'OMS ?

   GLASS refuse un fichier qui porte un code hors liste. Un export
   invalide ne serait pas « approximatif » : il serait rejeté, et le
   laboratoire l'apprendrait après coup. D'où ces contrôles, qui
   portent sur la SPÉCIFICATION plutôt que sur le code — listes de
   codes fermées, tranches d'âge du manuel, déduplication, ordre des
   colonnes.

   Avec Node :            node outils/essai-glass.js
   Sans Node, sur macOS : jsc outils/essai-glass.js
   ============================================================ */

var G, OK = 0, KO = 0;
function dire(s) { (typeof console === "object" ? console.log : print)(s); }
function verif(titre, cond) { cond ? OK++ : KO++; dire((cond ? "  ok   " : "  ÉCHEC") + "  " + titre); }

if (typeof require === "function" && typeof module === "object" && module.exports) {
  G = require("../netlify/functions/lib/glass");
} else {
  var mod = { exports: {} };
  (new Function("module", "exports", readFile("netlify/functions/lib/glass.js")))(mod, mod.exports);
  G = mod.exports;
}

/* ---------- listes de codes fermées (annexe 4 du manuel) ---------- */
dire("\nLes codes employés appartiennent aux listes du manuel");
var PATHOGENES_GLASS = ["ACISPP","ESCCOL","HAEINF","KLEPNE","NEIGON","NEIMEN","PSEAER",
                        "SALSPP","SALPAR","SALTYP","SHISPP","STAAUR","STRPNE"];
var SPECIMENS_GLASS = ["BLOOD","CSF","URINE","STOOL","LOWRESP","UROGENITAL","ANORECTAL","PHARYNGEAL"];
var ANTIBIOTIQUES_GLASS = ["AMK","AMC","AMP","AZM","FEP","CFM","CTX","FOX","CAZ","CRO","CXM","CHL",
                           "CIP","CLR","COL","SXT","DOR","ERY","ETP","GEN","IPM","LVX","MEC","MEM",
                           "MNO","NIT","OXA","PEN","TZP","RIF","SPT","TGC","TOB"];

function tous(obj, permis) {
  return Object.keys(obj).every(function (k) { return permis.indexOf(obj[k]) !== -1; });
}
verif("germes : " + Object.keys(G.PATHOGENE).length + " correspondances, toutes dans la liste GLASS",
      tous(G.PATHOGENE, PATHOGENES_GLASS));
verif("prélèvements : " + Object.keys(G.PRELEVEMENT).length + " correspondances, toutes dans la liste",
      tous(G.PRELEVEMENT, SPECIMENS_GLASS));
verif("antibiotiques : " + Object.keys(G.ANTIBIOTIQUE).length + " correspondances, toutes dans la liste",
      tous(G.ANTIBIOTIQUE, ANTIBIOTIQUES_GLASS));
// GLASS ne distingue pas amoxicilline et ampicilline : les deux donnent AMP.
verif("amoxicilline et ampicilline donnent toutes deux AMP",
      G.ANTIBIOTIQUE.AMX === "AMP" && G.ANTIBIOTIQUE.AMP === "AMP");

/* ---------- périmètre : ce qui sort, ce qui reste au registre local ---------- */
dire("\nLe périmètre de GLASS est respecté");
var base = { laboratoire: "MLI-MOP", pays: "MLI", patient: "P001", date: "2026-09-23",
             resultats: { AMX: "R", CTX: "R", CIP: "S", GEN: "S" } };
function avec(o) { var c = {}; for (var k in base) c[k] = base[k]; for (var k2 in o) c[k2] = o[k2]; return c; }

verif("E. coli d'hémoculture : retenu",
      G.enregistrements(avec({ organism: "ecoli", prelevement: "Hémoculture" })).length > 0);
// Enterococcus n'est pas un germe prioritaire de GLASS : inventer un code
// ferait rejeter le fichier entier.
verif("E. faecium : écarté, germe hors périmètre",
      G.enregistrements(avec({ organism: "efaecium", prelevement: "Hémoculture" })).length === 0);
verif("pus de plaie : écarté, site hors périmètre",
      G.enregistrements(avec({ organism: "ecoli", prelevement: "Pus / plaie" })).length === 0);

/* ---------- une ligne par couple isolat × antibiotique ---------- */
dire("\nLa granularité est celle du manuel");
var l = G.enregistrements(avec({ organism: "ecoli", prelevement: "Hémoculture" }));
// Quatre molécules testées, quatre lignes — la fosfomycine ou la vancomycine
// seraient écartées faute de code GLASS.
verif("4 antibiotiques testés donnent 4 lignes", l.length === 4);
var avecHorsListe = G.enregistrements(avec({ organism: "ecoli", prelevement: "Hémoculture",
  resultats: { AMX: "R", VA: "S", FOS: "S", MTZ: "R" } }));
verif("les molécules hors liste GLASS ne produisent pas de ligne", avecHorsListe.length === 1);
verif("une catégorie vide ne produit pas de ligne",
      G.enregistrements(avec({ organism: "ecoli", prelevement: "Hémoculture",
        resultats: { AMX: "R", CTX: "" } })).length === 1);

/* ---------- la clé d'enregistrement suit le format recommandé ---------- */
dire("\nLa clé d'enregistrement suit le format recommandé");
verif("RecordId = pays_labo_patient_germe_site_antibiotique_date",
      l[0].RecordId === "MLI_MLI-MOP_P001_ESCCOL_BLOOD_AMP_2026-09-23");

/* ---------- ce que PhénoBac apporte : ESBL et carbapénémase ---------- */
dire("\nLes marqueurs que GLASS demande et que le moteur détermine");
verif("BLSE reconnue -> ESBL = POS", G.marqueurs("BLSE", {}).esbl === "POS");
verif("synergie négative -> ESBL = NEG", G.marqueurs("Souche sauvage", { syn: "Négatif" }).esbl === "NEG");
// Sans preuve, on ne déclare pas « négatif » : l'absence d'information est
// une information, et GLASS prévoit UNK pour cela.
verif("sans information -> ESBL = UNK", G.marqueurs("Souche sauvage", {}).esbl === "UNK");
verif("carbapénémase confirmée -> POS",
      G.marqueurs("Carbapénémase confirmée", { carba: "Oui — OXA-48" }).carba === "POS");
verif("carbapénémase non confirmée -> NEG",
      G.marqueurs("Suspicion de carbapénémase", { carba: "Non / non confirmée" }).carba === "NEG");
verif("suspicion sans réponse -> UNK",
      G.marqueurs("Suspicion de carbapénémase", {}).carba === "UNK");

/* ---------- tranches d'âge du manuel ---------- */
dire("\nLes tranches d'âge sont celles du manuel");
verif("nourrisson -> <1", G.trancheAge(0) === "<1");
verif("3 ans -> 01-04", G.trancheAge(3) === "01-04");
verif("40 ans -> 35-44", G.trancheAge(40) === "35-44");
verif("90 ans -> 85+", G.trancheAge(90) === "85+");
verif("âge absent -> UNK", G.trancheAge("") === "UNK");

/* ---------- déduplication ---------- */
dire("\nLa déduplication suit la règle de GLASS");
// Un patient prélevé chaque semaine pèserait dix fois dans les taux, et les
// fausserait vers le haut : seul le PREMIER isolat compte.
var repetes = [
  { patient: "P1", organism: "ecoli", prelevement: "Hémoculture", date: "2026-03-01" },
  { patient: "P1", organism: "ecoli", prelevement: "Hémoculture", date: "2026-02-01" },
  { patient: "P1", organism: "ecoli", prelevement: "ECBU (urines)", date: "2026-03-01" },
  { patient: "P2", organism: "ecoli", prelevement: "Hémoculture", date: "2026-03-01" }
];
var gardes = G.dedupliquer(repetes);
verif("deux prélèvements du même patient, même site : un seul gardé", gardes.length === 3);
verif("c'est le plus ancien qui est gardé",
      gardes.filter(function (g) { return g.patient === "P1" && g.prelevement === "Hémoculture"; })[0].date === "2026-02-01");
verif("un autre site du même patient compte séparément",
      gardes.filter(function (g) { return g.prelevement === "ECBU (urines)"; }).length === 1);

/* ---------- le fichier ---------- */
dire("\nLe fichier produit s'ouvre et se relit");
var csv = G.versCsv(l);
verif("l'ordre des colonnes est celui du manuel",
      csv.split("\n")[0].replace("﻿", "") === G.COLONNES.join(";"));
verif("le fichier porte la marque d'ordre des octets (accents dans un tableur)", csv.charAt(0) === "﻿");
verif("autant de lignes que d'enregistrements", csv.trim().split("\n").length === l.length + 1);
// Un point-virgule dans une valeur casserait le fichier s'il n'était pas protégé.
var piege = G.versCsv([{ RecordId: 'a;b', SIR: 'S' }]);
verif("une valeur contenant un point-virgule est protégée", piege.indexOf('"a;b"') !== -1);

dire("\n" + (KO ? KO + " échec(s) sur " + (OK + KO) + " contrôles."
                : OK + " contrôles, l'export est conforme au manuel GLASS."));
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
