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

/* ---------- la période de collecte ---------- */
dire("\nLa période de collecte écarte les essais de mise en route");

var reg = [
  { patient: "P9", organism: "ecoli", prelevement: "Hémoculture", date: "2026-07-01",
    laboratoire: "LAB", resultats: { CIP: "R" } },                    // essai
  { patient: "P9", organism: "ecoli", prelevement: "Hémoculture", date: "2026-10-05",
    laboratoire: "LAB", resultats: { CIP: "S" } },                    // vrai isolat
  { patient: "P8", organism: "kpneu", prelevement: "ECBU (urines)", date: "2026-11-20",
    laboratoire: "LAB", resultats: { GEN: "R" } }
];

verif("sans période, le registre entier est repris",
      G.filtrerPeriode(reg, "", "").length === 3);
verif("« depuis » écarte ce qui précède",
      G.filtrerPeriode(reg, "2026-10-01", "").length === 2);
verif("« jusqu_a » écarte ce qui suit",
      G.filtrerPeriode(reg, "", "2026-10-31").length === 2);
verif("les deux bornes délimitent un intervalle",
      G.filtrerPeriode(reg, "2026-10-01", "2026-10-31").length === 1);
verif("les bornes sont incluses",
      G.filtrerPeriode(reg, "2026-10-05", "2026-10-05").length === 1);
verif("un isolat sans date ne peut être situé, donc reste hors de toute période",
      G.filtrerPeriode([{ patient: "P7", date: "" }], "2026-01-01", "").length === 0);

// Le point décisif : le filtre passe AVANT la déduplication. Sinon l'essai
// de juillet, gardé comme « premier isolat » du patient P9, masquerait le
// vrai isolat d'octobre — et l'exclure reviendrait à exclure les deux.
(function () {
  var dansPeriode = G.filtrerPeriode(reg, "2026-10-01", "");
  var gardes = G.dedupliquer(dansPeriode);
  var p9 = gardes.filter(function (g) { return g.patient === "P9"; });
  verif("l'isolat d'octobre est retenu une fois l'essai de juillet écarté",
        p9.length === 1 && p9[0].date === "2026-10-05");

  // L'ordre inverse — dédupliquer puis filtrer — perdrait ce patient.
  var inverse = G.filtrerPeriode(G.dedupliquer(reg), "2026-10-01", "");
  verif("… alors que l'ordre inverse le perdrait (c'est pourquoi l'ordre compte)",
        inverse.filter(function (g) { return g.patient === "P9"; }).length === 0);
})();

/* ---------- le point d'entrée refuse une date illisible ---------- */
/* Un filtre de période qui accepterait « 2026-9-1 » puis l'ignorerait
   exporterait le registre entier en laissant croire au contraire. Le refus
   est donc contrôlé ici, sur le vrai gestionnaire, magasin simulé. */
dire("\nUne date illisible est refusée, jamais ignorée");
var enCours = [];
(function () {
  var registre = [
    { cle: "a", patient: "P1", organism: "ecoli", prelevement: "Hémoculture",
      date: "2026-07-01", laboratoire: "LAB", resultats: { CIP: "R" } },
    { cle: "b", patient: "P2", organism: "ecoli", prelevement: "Hémoculture",
      date: "2026-10-05", laboratoire: "LAB", resultats: { CIP: "S" } }
  ];
  var faux = function (n) {
    if (n.indexOf("store") !== -1) return { getStore: function () { return {
      list: function () { return Promise.resolve({ blobs: registre.map(function (r) { return { key: r.cle }; }) }); },
      get:  function (k) { return Promise.resolve(registre.filter(function (r) { return r.cle === k; })[0] || null); },
      setJSON: function () { return Promise.resolve(); }
    }; } };
    if (n.indexOf("http") !== -1) return {
      cors: function () { return {}; },
      adminOk: function () { return true; }
    };
    if (n.indexOf("glass") !== -1) return G;
    return {};
  };
  var mod = { exports: {} };
  var src = (typeof readFile === "function") ? readFile("netlify/functions/surveillance.js")
                                             : require("fs").readFileSync("netlify/functions/surveillance.js", "utf8");
  (new Function("module", "exports", "require", src))(mod, mod.exports, faux);
  var H = mod.exports.handler;

  var appel = function (corps) {
    return H({ httpMethod: "POST", headers: {}, body: JSON.stringify(corps) });
  };
  // Ces contrôles sont ASYNCHRONES. Sans les rassembler, le bilan final
  // s'imprimerait avant qu'ils aient répondu, et un échec passerait sans
  // faire échouer le banc — un garde-fou qui ne peut pas échouer n'en est
  // pas un.
  var attendre = function (p, suite) { enCours.push(p.then(suite)); };

  attendre(appel({ action: "compter", depuis: "2026-9-1" }), function (r) {
    verif("« 2026-9-1 » est refusé (mois et jour non complétés)", r.statusCode === 400);
  });
  attendre(appel({ action: "compter", depuis: "01/10/2026" }), function (r) {
    verif("une date à la française est refusée", r.statusCode === 400);
  });
  attendre(appel({ action: "compter", depuis: "2026-11-01", jusqu_a: "2026-10-01" }), function (r) {
    verif("une période à l'envers est refusée", r.statusCode === 400);
  });
  attendre(appel({ action: "compter", depuis: "2026-10-01" }), function (r) {
    var c = JSON.parse(r.body);
    verif("une période valide passe, et le registre entier reste annoncé",
          r.statusCode === 200 && c.total === 1 && c.totalRegistre === 2);
  });
  attendre(appel({ action: "compter" }), function (r) {
    var c = JSON.parse(r.body);
    verif("sans période, le compte porte sur tout le registre",
          c.total === 2 && c.periode === null);
  });
  attendre(appel({ action: "exporter", depuis: "2026-10-01" }), function (r) {
    verif("le nom du fichier porte la période",
          r.headers["Content-Disposition"].indexOf("2026-10-01_fin") !== -1);
    verif("l'export ne porte que la période demandée",
          r.body.trim().split("\n").length === 2);
  });
})();

function bilan() {
  dire("\n" + (KO ? KO + " échec(s) sur " + (OK + KO) + " contrôles."
                  : OK + " contrôles, l'export est conforme au manuel GLASS."));
  if (KO && typeof process === "object" && process.exit) process.exit(1);
  if (KO) throw new Error(KO + " échec(s)");
}

// Conclure DANS une promesse ne suffit pas : sous jsc, un « throw » à
// l'intérieur d'un .then() ne change pas le code de sortie, et le banc
// rendrait « tout va bien » avec des échecs affichés au-dessus. On vide
// donc la file des microtâches, puis on conclut au niveau supérieur, seul
// endroit où une exception compte. Node, lui, n'a pas drainMicrotasks
// mais honore process.exit dans une promesse.
var fin = function (e) {
  if (e) { KO++; dire("  ÉCHEC  le gestionnaire a levé une exception : " + e); }
  bilan();
};
if (typeof drainMicrotasks === "function") {
  Promise.all(enCours).catch(function (e) { KO++; dire("  ÉCHEC  " + e); });
  drainMicrotasks();
  fin();
} else {
  Promise.all(enCours).then(function () { fin(); }, fin);
}
