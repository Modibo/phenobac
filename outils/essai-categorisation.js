/* ============================================================
   essai-categorisation.js — la mesure de paillasse devient une catégorie

   CE QUE CE BANC PROTÈGE

   Quatre fonctions transforment un chiffre lu sur une boîte en S, I ou R :
   parseMic, catFromMic, parseDiam, catFromDiam. Tout le reste de PhénoBac
   en dépend — le phénotype, les règles expertes, le rendu ciblé, la
   posologie. AUCUN BANC NE LES APPELAIT. C'est outils/muter.py qui l'a
   montré : on pouvait y inverser un « >= » ou changer un « ou » en « et »
   sans qu'aucun contrôle ne tombe.

   Et il y avait bien une faute, dans le sens le plus dangereux.

   UNE BORNE N'EST PAS UNE VALEUR. « ≥ 0,25 » dit que la CMI vaut au moins
   0,25 : elle peut valoir 0,25, elle peut valoir 8. catFromMic rendait
   « S » — elle déclarait active une molécule qui pouvait être résistante,
   à partir d'une mesure qui ne le disait pas. Symétriquement « ≤ 2 »
   rendait « R » et privait le malade d'un antibiotique peut-être actif.
   La fonction jumelle des diamètres faisait déjà le bon choix.

   Avec Node :             node outils/essai-categorisation.js
   Sans Node, sur macOS :  …/jsc outils/essai-categorisation.js
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
function cat(v, bp) { return E.catFromMic(v, bp); }
function dia(v, dz) { return E.catFromDiam(v, dz); }

/* Un seuil courant : sensible jusqu'à 0,5 inclus, résistant au-delà.
   Il n'y a donc pas d'intervalle « I » : S et R se touchent. */
var SERRE = { S: 0.5, R: 0.5 };
/* Un seuil avec un intervalle intermédiaire : S ≤ 1, I jusqu'à 4, R > 4. */
var LARGE = { S: 1, R: 4 };

/* ---------- 1. Lire ce qui est écrit ---------- */
dire("\nLire la mesure telle que la paillasse l'écrit");
(function () {
  function lu(v) { var p = E.parseMic(v); return p ? p.op + "|" + p.v : null; }
  verif(lu("0.25") === "=|0.25", "un nombre simple");
  verif(lu("0,25") === "=|0.25", "la virgule décimale française");
  verif(lu(" 0.5 ") === "=|0.5", "les espaces autour");
  verif(lu("≤0.25") === "<=|0.25", "le signe ≤ des automates");
  verif(lu("<=0.25") === "<=|0.25", "sa forme tapée au clavier");
  verif(lu("≥2") === ">=|2", "le signe ≥");
  verif(lu(">8") === ">|8", "le strictement supérieur");
  verif(lu("<0.5") === "<|0.5", "le strictement inférieur");
  // Ce qui n'est pas une mesure ne doit pas devenir une mesure.
  ["", "   ", "abc", "-1", null, undefined].forEach(function (v) {
    verif(E.parseMic(v) === null, JSON.stringify(v) + " : refusé, et non interprété");
  });
})();

/* ---------- 2. Les bornes du seuil, une par une ---------- */
dire("\nLes bornes : c'est là que se joue la catégorie");
(function () {
  verif(cat("0.5", SERRE) === "S", "0,5 avec S ≤ 0,5 : sensible — la borne est INCLUSE");
  verif(cat("1", SERRE) === "R", "1 : résistant");
  verif(cat("1", LARGE) === "S", "1 avec S ≤ 1 : sensible");
  verif(cat("2", LARGE) === "I", "2 : entre les deux bornes, intermédiaire");
  verif(cat("4", LARGE) === "I", "4 avec R > 4 : encore intermédiaire — la borne R est EXCLUE");
  verif(cat("4.001", LARGE) === "R", "juste au-dessus de 4 : résistant");
  verif(cat("0.0625", LARGE) === "S", "une dilution basse reste sensible");
})();

/* ---------- 3. UNE BORNE N'EST PAS UNE VALEUR ---------- */
dire("\nUne borne ne conclut que si elle suffit à elle seule");
(function () {
  // Borne supérieure.
  verif(cat("≤0.25", SERRE) === "S",
        "« ≤ 0,25 » sous S ≤ 0,5 : sensible — même la pire valeur possible l'est");
  verif(cat("≤2", SERRE) === null,
        "« ≤ 2 » sous S ≤ 0,5 : AUCUNE catégorie — la CMI peut valoir 0,25 (S) ou 1 (R)");
  verif(cat("<0.5", SERRE) === "S", "« < 0,5 » : sensible");
  verif(cat("<2", LARGE) === null, "« < 2 » sous S ≤ 1 : indécis, la CMI peut valoir 1,5");

  // Borne inférieure — le sens dangereux.
  verif(cat("≥2", SERRE) === "R",
        "« ≥ 2 » sous R > 0,5 : résistant — même la meilleure valeur possible l'est");
  verif(cat(">0.5", SERRE) === "R", "« > 0,5 » : résistant");
  verif(cat("≥0.25", SERRE) === null,
        "« ≥ 0,25 » : AUCUNE catégorie — c'est ici que le moteur rendait « S » sur une "
        + "souche qui pouvait être résistante");
  verif(cat("≥1", LARGE) === null, "« ≥ 1 » sous R > 4 : indécis");
  verif(cat("≥4", LARGE) === null, "« ≥ 4 » : indécis — 4 est encore intermédiaire");
  verif(cat(">4", LARGE) === "R", "« > 4 » : résistant, la borne R est franchie");
})();

/* ---------- 4. Quand le référentiel ne prévoit aucun « sensible » ---------- */
dire("\nSans catégorie « sensible », la souche est au mieux intermédiaire");
(function () {
  var SANS = { S: null, R: 2 };
  verif(cat("0.5", SANS) === "I", "une CMI basse : intermédiaire, jamais sensible");
  verif(cat("2", SANS) === "I", "à la borne : encore intermédiaire");
  verif(cat("4", SANS) === "R", "au-delà : résistant");
  verif(cat("≤1", SANS) === "I", "« ≤ 1 » : intermédiaire, la pire valeur l'est aussi");
  verif(cat("≥4", SANS) === "R", "« ≥ 4 » : résistant");
  verif(cat("≥1", SANS) === null, "« ≥ 1 » : indécis");
})();

/* ---------- 5. Les diamètres : le sens est inversé ---------- */
dire("\nLes diamètres — grand diamètre, souche sensible");
(function () {
  var DZ = { S: 25, R: 22 };
  function lu(v) { var p = E.parseDiam(v); return p ? p.op + "|" + p.v : null; }
  verif(lu("20mm") === "=|20", "l'unité « mm » est tolérée");
  verif(dia("30", DZ) === "S", "30 mm : sensible");
  verif(dia("25", DZ) === "S", "25 mm : sensible — la borne S est INCLUSE");
  verif(dia("24", DZ) === "I", "24 mm : intermédiaire");
  verif(dia("22", DZ) === "I", "22 mm : intermédiaire — la borne R est EXCLUE");
  verif(dia("21", DZ) === "R", "21 mm : résistant");
  verif(dia("0", DZ) === "R", "0 mm — pas de zone : résistant, et lu comme 6 mm");
  verif(dia("6", DZ) === "R", "6 mm — le disque lui-même : résistant");
  verif(E.parseDiam("5") === null, "5 mm : impossible, le disque en mesure déjà 6");
  verif(E.parseDiam("61") === null, "61 mm : impossible sur une boîte de 90 mm");
  verif(dia("≥25", DZ) === "S", "« ≥ 25 » : sensible");
  verif(dia("≥23", DZ) === null, "« ≥ 23 » : indécis — la zone peut valoir 23 (I) ou 30 (S)");
  verif(dia("≤21", DZ) === "R", "« ≤ 21 » : résistant");
  verif(dia("≤30", DZ) === null, "« ≤ 30 » : indécis");
})();

/* ---------- 6. Les deux chemins disent la même chose ---------- */
dire("\nCMI et diamètre refusent de deviner de la même façon");
(function () {
  verif(cat("≥0.25", SERRE) === null && dia("≥23", { S: 25, R: 22 }) === null,
        "une borne qui ne tranche pas ne rend AUCUNE catégorie, des deux côtés");
  verif(cat("abc", SERRE) === null && dia("abc", { S: 25, R: 22 }) === null,
        "une saisie illisible ne rend aucune catégorie, des deux côtés");
  verif(cat("1", null) === null && dia("25", null) === null,
        "sans seuil, aucune catégorie — et surtout aucune invention");
})();

/* ---------- 7. Et de bout en bout, par le moteur ---------- */
dire("\nLe même refus, vu depuis l'interprétation complète");
(function () {
  var out = E.runInterpretation({ organism: "ecoli", mode: "mic",
                                  mic: { CTX: "≥0.25", CAZ: "0.25" }, ctx: {} });
  verif(out.categories.CAZ === "S", "une CMI exacte est catégorisée");
  verif(!out.categories.CTX,
        "une borne qui ne tranche pas ne produit pas de catégorie, même au bout de la chaîne");
})();

/* ---------- 8. LE SITE CHOISIT LA TABLE ----------

   Savoir LIRE une mesure ne sert à rien si l'on se trompe de table. Le même
   0,5 mg/L de pénicilline vaut « I » sur une hémoculture et « R » sur un
   LCR — les seuils méningés sont plus stricts parce que l'antibiotique y
   diffuse mal. Se tromper de site, c'est rendre sensible une souche qui
   tuera le malade.

   muter.py a montré que ce choix n'était éprouvé par rien : on pouvait
   inverser « c.mening === "Oui" » sans qu'aucun contrôle ne tombe. */
dire("\nLe site choisit la table de seuils");
function categ(org, mic, ctx, ref) {
  return E.runInterpretation({ organism: org, mode: "mic", mic: mic,
                               ctx: ctx || {}, ref: ref || "eucast" }).categories;
}
(function () {
  // Pénicilline sur pneumocoque : la même CMI, deux catégories.
  verif(categ("pneumocoque", { PEN: "0.5" }, {}).PEN === "I",
        "pénicilline 0,5 mg/L, site ordinaire : intermédiaire");
  verif(categ("pneumocoque", { PEN: "0.5" }, { mening: "Oui" }).PEN === "R",
        "la MÊME CMI en contexte méningé : RÉSISTANT — le seuil y est plus strict");
  verif(categ("pneumocoque", { CTX: "1" }, {}).CTX === "I",
        "céfotaxime 1 mg/L, site ordinaire : intermédiaire");
  verif(categ("pneumocoque", { CTX: "1" }, { mening: "Oui" }).CTX === "R",
        "… et résistant sur un LCR");
  verif(categ("pneumocoque", { PEN: "0.5" }, { mening: "Oui" }, "casfm").PEN === "R",
        "le CA-SFM dit la même chose, par sa propre table méningée");

  /* LA TABLE MÉNINGÉE DU CA-SFM DOIT ÊTRE LA SIENNE. Ma première épreuve ne
     le montrait pas : sur le pneumocoque, les deux comités tombent d'accord,
     et retirer la ligne du CA-SFM laissait la table de l'EUCAST donner la
     même réponse. Le méningocoque les sépare — le CA-SFM chiffre
     l'amoxicilline en contexte méningé, l'EUCAST non. */
  verif(categ("nmeningitidis", { AMX: "0.5" }, { mening: "Oui" }, "casfm").AMX === "R",
        "méningocoque, amoxicilline 0,5 : résistant par la table méningée du CA-SFM");
  verif(categ("nmeningitidis", { AMX: "0.5" }, { mening: "Oui" }, "eucast").AMX === "I",
        "… intermédiaire sous l'EUCAST, qui n'a pas de table méningée pour ce couple");
  verif(categ("nmeningitidis", { AMX: "0.5" }, {}, "casfm").AMX === "I",
        "… et intermédiaire aussi hors contexte méningé : c'est bien le site qui tranche");

  // Le méningé l'emporte sur l'urinaire : un LCR n'est pas une urine.
  verif(categ("pneumocoque", { PEN: "0.5" }, { mening: "Oui", urin: "Oui" }).PEN === "R",
        "les deux contextes cochés : c'est le méningé qui tranche");
})();

/* ---------- 9. Les molécules qui n'existent QUE pour la cystite ---------- */
dire("\nCertaines molécules n'ont de seuil que pour la cystite simple");
(function () {
  // L'EUCAST ne chiffre le pivmécillinam, la nitrofurantoïne, le
  // triméthoprime et le céfixime QUE pour cette indication. Hors d'elle, il
  // n'y a pas de seuil — et dire « sensible » serait appliquer le seuil d'une
  // autre indication à un prélèvement qui n'en relève pas.
  // LA FOSFOMYCINE LES A REJOINTES le 25 octobre 2026. Elle servait jusque-là
  // de contre-exemple — « toutes ne sont pas urinaires » — parce qu'elle
  // portait un seuil hors cystite. Elle n'aurait pas dû : le document ne la
  // chiffre que pour E. coli et pour l'infection urinaire, et renvoie tout le
  // reste à une note. Le contre-exemple est désormais la ciprofloxacine, qui
  // a bien un seuil dans les deux contextes.
  ["MEC", "NIT", "TMP", "CFM", "FOS"].forEach(function (k) {
    var m = {}; m[k] = k === "NIT" ? "32" : (k === "FOS" ? "8" : "1");
    verif(categ("ecoli", m, {})[k] === undefined,
          k + " hors cystite : AUCUNE catégorie — le référentiel n'en chiffre pas");
    verif(categ("ecoli", m, { urin: "Oui" })[k] === "S",
          k + " en cystite simple : catégorisé");
  });
  verif(categ("ecoli", { CIP: "0.125" }, {}).CIP === "S",
        "la ciprofloxacine, elle, a un seuil hors cystite : toutes ne sont pas urinaires");
  // Et la fosfomycine ajoute une restriction d'ESPÈCE que les quatre autres
  // n'ont pas : cochée ou non, elle ne vaut pas pour Klebsiella.
  verif(categ("kpneu", { FOS: "8" }, { urin: "Oui" }).FOS === undefined,
        "fosfomycine sur Klebsiella, même en cystite : aucune catégorie — E. coli seulement");
  verif(categ("ecoli", { FOS: "8" }, { urin: "Oui" }).FOS === "S",
        "… alors que sur E. coli en cystite, elle est catégorisée");
})();

/* ---------- 10. La restriction d'espèce ---------- */
dire("\nUn seuil validé pour une espèce ne vaut pas pour sa voisine");
(function () {
  // L'EUCAST ne valide la nitrofurantoïne que chez E. coli. Chez Klebsiella,
  // le même chiffre n'a pas de seuil — « un chiffre juste au mauvais
  // endroit », dit le moteur, et c'est exactement cela.
  verif(categ("ecoli", { NIT: "32" }, { urin: "Oui" }).NIT === "S",
        "nitrofurantoïne chez E. coli, en cystite : catégorisée");
  verif(categ("kpneu", { NIT: "32" }, { urin: "Oui" }).NIT === undefined,
        "la MÊME mesure chez Klebsiella : aucune catégorie — le seuil n'y est pas validé");
  // Les autres molécules urinaires, elles, ne sont pas restreintes.
  verif(categ("kpneu", { MEC: "1" }, { urin: "Oui" }).MEC === "S",
        "le pivmécillinam, lui, vaut pour les deux : la restriction n'est pas globale");
})();

dire("\n" + (KO ? KO + " échec(s) sur " + (OK + KO) + " contrôles."
                : OK + " contrôles : une mesure ne devient une catégorie que"
                    + " lorsqu'elle la détermine."));
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
