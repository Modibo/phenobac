/* ============================================================
   essai-anaerobies.js — les anaérobies, et les notes du classeur

   POURQUOI CE BANC EXISTE

   Le 25 octobre 2026, la feuille des anaérobies à Gram positif a été
   ajoutée : dix espèces, 194 règles. Au passage, trois choses se sont vues
   qui dormaient depuis longtemps :

     · l'EUCAST donne SEPT DIAMÈTRES à Bacteroides fragilis, et PhénoBac n'en
       portait aucun — un laboratoire qui travaille au disque ne pouvait rien
       rendre sur l'anaérobie le plus fréquent des suppurations abdominales ;

     · la COLONNE I du classeur — les notes — n'avait jamais été lue. Elle
       porte l'inférence « amoxicilline lue sur le disque d'ampicilline »,
       sans quoi la molécule reste sans catégorie ; elle porte la règle
       « pénicilline G sensible ⇒ toutes les β-lactamines à seuil » ; et elle
       porte l'avertissement qui évite de rendre une fausse résistance au
       métronidazole quand l'anaérobiose a mal pris ;

     · dix espèces, dix tables de seuils, et elles DIFFÈRENT. C. innocuum n'a
       ni pénicilline G, ni carbapénème, ni vancomycine ; C. ramosum n'a ni
       vancomycine ni clindamycine ; C. tertium n'a ni pénicilline G, ni
       clindamycine, ni pipéracilline-tazobactam. Un seuil appliqué à la
       mauvaise espèce est « un chiffre juste au mauvais endroit », et c'est
       le défaut le plus difficile à repérer.

   Ce banc tient ces trois choses. Il ne vérifie pas que le code est joli :
   il vérifie qu'un résultat faux redevient impossible.

   Avec Node :             node outils/essai-anaerobies.js
   Sans Node, sur macOS :  …/jsc outils/essai-anaerobies.js
   ============================================================ */

var E, KO = 0, OK = 0;

if (typeof require === "function" && typeof module === "object" && module.exports) {
  E = require("../moteur");
} else {
  var ch = function (f) {
    var m = { exports: {} };
    (new Function("module", "exports", readFile(f)))(m, m.exports);
    return m.exports;
  };
  var mp = ch("posologie.js"), mb = ch("base-connaissances.js"), mr = ch("rendu-cible.js");
  var mm = { exports: {} };
  (new Function("module", "exports", "require", readFile("moteur.js")))(
    mm, mm.exports,
    function (n) { return /posologie/.test(n) ? mp : (/rendu-cible/.test(n) ? mr : mb); });
  E = mm.exports;
}

function dire(s) { (typeof console === "object" ? console.log : print)(s); }
function verif(ok, txt) { ok ? OK++ : KO++; dire((ok ? "  ok   " : "  ÉCHEC") + "  " + txt); }

function interp(org, res, ctx) {
  return E.runInterpretation({ organism: org, mode: "sir", results: res, ctx: ctx || {} });
}
/* Un antibiogramme lu au disque : c'est le mode « diam », et les mesures
   arrivent par « diam », non par « results ». Les passer au mauvais endroit
   rendait la mesure telle quelle — un banc qui aurait alors vérifié
   « AMX === "30" » aurait été vert sans rien catégoriser. */
function disque(org, mm, ctx) {
  return E.runInterpretation({ organism: org, mode: "diam", diam: mm, ctx: ctx || {} });
}
function A(org, res, ctx) { return interp(org, res, ctx).interpretation; }
function textes(a) {
  return (a.rules || []).map(function (x) { return x.txt; })
    .concat((a.alerts || []).map(function (x) { return x.txt; }))
    .concat([a.comment || "", a.mech || "", a.name || ""]).join(" || ");
}

var GPOS = ["cinnocuum", "cramosum", "csepticum", "ctertium", "cacnes", "cavidum",
            "finegoldia", "parvimonas", "peptostrepto", "peptoniphilus"];
var TOUS = GPOS.concat(["bfragilis", "cperfringens", "cdifficile",
                        "prevotella", "fnecrophorum", "fnucleatum"]);

/* ---------- 1. Les dix espèces existent et portent leur propre table ---------- */
dire("\nLes dix anaérobies à Gram positif de la feuille v16.1");
GPOS.forEach(function (id) {
  var o = E.ORG[id];
  verif(!!o, id + " : connue du moteur");
  verif(!!o && o.bpGroup === id,
        "… et ses seuils lui sont PROPRES (bpGroup « " + (o && o.bpGroup) + " ») — "
        + "les partager appliquerait le chiffre d'une espèce à une autre");
});

/* ---------- 2. Ce que le document NE donne PAS ne se catégorise pas ----------
   C'est la moitié la plus importante : rendre « sensible » une molécule que
   l'EUCAST laisse sans seuil pour cette espèce-là, c'est inventer. */
dire("\nCe que le document ne chiffre pas ne reçoit pas de catégorie");
[["cinnocuum", "VA", "la vancomycine de C. innocuum"],
 ["cinnocuum", "PEN", "la pénicilline G de C. innocuum"],
 ["cinnocuum", "MEM", "le méropénème de C. innocuum"],
 ["cramosum", "VA", "la vancomycine de C. ramosum"],
 ["cramosum", "DA", "la clindamycine de C. ramosum"],
 ["ctertium", "PEN", "la pénicilline G de C. tertium"],
 ["ctertium", "DA", "la clindamycine de C. tertium"],
 ["ctertium", "TZP", "la pipéracilline-tazobactam de C. tertium"]
].forEach(function (t) {
  verif(E.BP[t[0]] === undefined || E.BP[t[0]][t[1]] === undefined,
        t[2] + " : aucun seuil, donc aucune catégorie");
});
/* …et l'inverse, sans quoi le contrôle ci-dessus passerait sur une table vide. */
verif(E.BP.cinnocuum && E.BP.cinnocuum.MTZ && E.BP.cinnocuum.MTZ.S === 4,
      "… alors que le métronidazole de C. innocuum, lui, est bien chiffré (S ≤ 4)");
verif(E.BP.csepticum && E.BP.csepticum.VA && E.BP.csepticum.VA.S === 4,
      "… et la vancomycine de C. septicum aussi (S ≤ 4) : l'absence est propre à l'espèce");

/* ---------- 3. Les seuils ne se mélangent pas entre espèces ---------- */
dire("\nDeux espèces voisines, deux seuils différents");
verif(E.BP.cacnes.PEN.S === 0.125 && E.BP.cavidum.PEN.S === 0.5,
      "pénicilline G : 0,125 chez C. acnes, 0,5 chez C. avidum");
verif(E.BP.parvimonas.PEN.S === 0.03 && E.BP.peptoniphilus.PEN.S === 0.5,
      "pénicilline G : 0,03 chez Parvimonas, 0,5 chez Peptoniphilus");
verif(E.DZ.finegoldia.PEN.S === 20 && E.DZ.peptoniphilus.PEN.S === 18,
      "disque de pénicilline G : 20 mm chez Finegoldia, 18 chez Peptoniphilus");

/* ---------- 4. LES DIAMÈTRES DE BACTEROIDES, QUI MANQUAIENT TOUS ---------- */
dire("\nBacteroides fragilis au disque — il n'y avait rien");
[["AMC", 14], ["TZP", 24], ["ETP", 23], ["IPM", 29], ["MEM", 28], ["DA", 10], ["MTZ", 25]
].forEach(function (t) {
  verif(E.DZ.bfragilis && E.DZ.bfragilis[t[0]] && E.DZ.bfragilis[t[0]].S === t[1],
        "diamètre " + t[0] + " : S ≥ " + t[1] + " mm");
});
verif(E.BP.bfragilis.ETP && E.BP.bfragilis.ETP.S === 2,
      "ertapénème : la CMI manquait aussi (S ≤ 2)");
verif(E.ECOFF["bfragilis:ETP"] !== undefined,
      "… et elle vient ENTRE PARENTHÈSES : la réserve ECOFF est portée");
(function () {
  var d = disque("bfragilis", { MTZ: "30", MEM: "20", DA: "8" });
  verif(d.categories.MTZ === "S", "métronidazole 30 mm : S (seuil 25)");
  verif(d.categories.MEM === "R", "méropénème 20 mm : R (seuil 28)");
  verif(d.categories.DA === "R", "clindamycine 8 mm : R (seuil 10)");
  verif(Object.keys(d.categories).length === 3,
        "… les trois sont catégorisés : avant, aucun ne l'était");
})();

/* ---------- 5. Le témoin : l'amoxicilline se lit sur le disque d'ampicilline ----
   Sans lui, la CMI est portée et le disque reste sans catégorie — c'est-à-dire
   que la molécule disparaît du compte rendu du laboratoire qui n'a que des
   disques, et il y en a beaucoup. */
dire("\nL'amoxicilline se lit sur le disque d'ampicilline (note du classeur)");
["prevotella", "fnecrophorum", "fnucleatum"].concat(GPOS).forEach(function (g) {
  verif(E.DZ_TEMOIN[g] && E.DZ_TEMOIN[g].AMX === "AMP",
        g + " : amoxicilline -> disque d'ampicilline");
});
(function () {
  // Prevotella : disque d'ampicilline à S ≥ 25 mm. 30 mm doit rendre S, 20 mm R.
  var s = disque("prevotella", { AMX: "30" });
  var r = disque("prevotella", { AMX: "20" });
  verif(s.categories.AMX === "S",
        "30 mm d'amoxicilline sur Prevotella : rendu S, par le seuil de l'ampicilline");
  verif(r.categories.AMX === "R", "20 mm : rendu R");
  verif(s.categories.AMX !== r.categories.AMX,
        "… les deux diffèrent : le témoin catégorise vraiment, il ne décore pas");
  var c = disque("cacnes", { AMX: "30" });
  verif(c.categories.AMX === "S",
        "et chez C. acnes aussi : 30 mm d'amoxicilline rendus S (seuil ampicilline 23)");
})();

/* ---------- 6. « Pénicilline G sensible ⇒ toutes les β-lactamines » ----------
   La note est portée par CERTAINES espèces seulement. L'appliquer aux autres
   serait l'inventer ; ne l'appliquer à aucune serait perdre ce que le
   document donne. */
dire("\nLa note « PEN-S couvre les β-lactamines », là où le document la porte");
var AVEC = ["cramosum", "csepticum", "cacnes", "cavidum", "finegoldia", "parvimonas",
            "peptostrepto", "peptoniphilus", "prevotella", "fnecrophorum", "cperfringens"];
var SANS = ["cinnocuum", "ctertium", "bfragilis"];
var motif = /autorise à rendre sensibles TOUTES les β-lactamines/;
AVEC.forEach(function (g) {
  verif(motif.test(textes(A(g, { PEN: "S" }, {}))),
        g + " : la règle paraît quand la pénicilline G est sensible");
});
SANS.forEach(function (g) {
  verif(!motif.test(textes(A(g, { PEN: "S" }, {}))),
        g + " : le document ne porte pas la note — la règle ne paraît PAS");
});
verif(!motif.test(textes(A("cacnes", { PEN: "R" }, {}))),
      "pénicilline G résistante : la règle ne paraît pas non plus — elle ne vaut que pour S");
verif(!motif.test(textes(A("cacnes", {}, {}))),
      "pénicilline G non testée : rien n'est affirmé");

/* ---------- 7. Le métronidazole résistant : d'abord la jarre ---------- */
dire("\nMétronidazole non sensible : vérifier l'ANAÉROBIOSE avant de rendre");
var jarre = /vérifier l'ANAÉROBIOSE/;
["bfragilis", "prevotella", "cperfringens", "cinnocuum", "finegoldia"].forEach(function (g) {
  verif(jarre.test(textes(A(g, { MTZ: "R" }, {}))), g + " : l'avertissement paraît");
  verif(!jarre.test(textes(A(g, { MTZ: "S" }, {}))),
        g + " : métronidazole sensible — pas d'avertissement, pas de bruit");
});

/* ---------- 8. Ce que chaque groupe apporte de propre ---------- */
dire("\nLes trois récits cliniques, et ce qu'ils disent");
verif(/néoplasie colique/.test(textes(A("csepticum", { PEN: "S" }, {}))),
      "C. septicum : son isolement fait chercher une néoplasie colique");
verif(!/néoplasie colique/.test(textes(A("cramosum", { PEN: "S" }, {}))),
      "… et cette alerte ne suit pas les autres clostridies");
verif(A("csepticum", { PEN: "S" }, {}).sev === "high",
      "… la gravité monte : ce n'est pas une remarque de bas de page");
verif(/AÉROTOLÉRANTE/.test(textes(A("ctertium", { AMP: "S" }, {}))),
      "C. tertium : on prévient qu'elle pousse en aérobiose et se confond avec un Bacillus");
verif(/Vancomycine naturellement inactive/.test(textes(A("cinnocuum", { AMP: "S" }, {}))),
      "C. innocuum : vancomycine naturellement inactive, et c'est dit");
verif(/14 jours/.test(textes(A("cacnes", { PEN: "S" }, {}))),
      "Cutibacterium : la culture doit être tenue 14 jours, sans quoi la prothèse est rendue stérile");
verif(/plusieurs prélèvements profonds/.test(textes(A("cacnes", { PEN: "S" }, {}))),
      "… et un seul prélèvement positif ne vaut pas infection");
verif(/l'EUCAST la dit RARE/.test(textes(A("cacnes", { PEN: "R" }, {}))),
      "Cutibacterium, β-lactamine résistante : le document demande de confirmer");
verif(!/l'EUCAST la dit RARE/.test(textes(A("cacnes", { PEN: "S" }, {}))),
      "… et ne le demande pas quand elle est sensible");
["finegoldia", "parvimonas", "peptostrepto", "peptoniphilus"].forEach(function (g) {
  verif(/INDUCTIBLE à la clindamycine/.test(textes(A(g, { PEN: "S" }, {}))),
        g + " : résistance inductible à la clindamycine à chercher");
});

/* ---------- 9. Aucun anaérobie ne reste sans commentaire ---------- */
dire("\nAucune espèce ne rend un compte rendu vide");
TOUS.forEach(function (g) {
  var a = A(g, { MTZ: "S", PEN: "S" }, {});
  verif(!!a.comment && a.comment.length > 40,
        g + " : commentaire rendu (" + (a.comment || "").length + " caractères)");
  verif(!!a.name, g + " : le profil est nommé");
});

dire("\n" + (KO ? KO + " échec(s) sur " + (OK + KO) + " contrôles."
                : OK + " contrôles : les seuils ne se mélangent plus entre espèces, "
                     + "les diamètres de Bacteroides sont là,\net les notes du classeur "
                     + "ne peuvent plus disparaître sans que rien ne tombe."));
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
