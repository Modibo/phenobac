/* ============================================================
   essai-commentaire.js — le commentaire en cinq moments, § 15

   Le § 15 veut un commentaire « court, professionnel et directement
   copiable » qui DISTINGUE cinq choses : l'observation, l'interprétation,
   l'hypothèse mécanistique, les limites, et l'éventuel test complémentaire.

   Un tel commentaire échoue de trois façons, et la troisième est la pire :

     un moment manque alors qu'il y avait matière — le lecteur ne sait pas
     ce qui a été observé, ou ce qui limite la conclusion ;

     un moment est rempli de force — « Limites : néant » apprend à sauter
     les rubriques, et c'est celle des limites qu'on sauterait ;

     l'hypothèse est présentée comme acquise. Le § 3 l'interdit : tant
     qu'aucun test ne l'a tranchée, elle « évoque », elle est « compatible
     avec ». Jamais « confirmé ». C'est la seule des trois qui peut coûter
     un traitement.

   Avec Node :             node outils/essai-commentaire.js
   Sans Node, sur macOS :  …/jsc outils/essai-commentaire.js
   ============================================================ */

var E, KO = 0, OK = 0;

if (typeof require === "function" && typeof module === "object" && module.exports) {
  E = require("../moteur");
} else {
  var modB = { exports: {} };
  (new Function("module", "exports", readFile("base-connaissances.js")))(modB, modB.exports);
  var mod = { exports: {} };
  (new Function("module", "exports", "require",
                readFile("moteur.js")))(mod, mod.exports, function () { return modB.exports; });
  E = mod.exports;
}

function dire(s) { (typeof console === "object" ? console.log : print)(s); }
function verif(ok, txt) { ok ? OK++ : KO++; dire((ok ? "  ok   " : "  ÉCHEC") + "  " + txt); }

function interp(org, res, ctx, ref) {
  return E.runInterpretation({ organism: org, mode: "sir", results: res,
                               ctx: ctx || {}, ref: ref }).interpretation;
}
function moment(A, nom) {
  return (A.moments || []).filter(function (m) { return m.moment === nom; })[0] || null;
}

/* ---------- 1. Les cinq moments existent et sont nommés ---------- */
dire("\nLes cinq moments du § 15");
verif(E.COMMENT_MOMENTS.length === 5, "cinq moments sont déclarés");
["Observation", "Interprétation", "Hypothèse mécanistique", "Limites", "Test complémentaire"]
  .forEach(function (n) {
    verif(E.COMMENT_MOMENTS.indexOf(n) !== -1, "« " + n + " » en fait partie");
  });

/* ---------- 2. Un cas complet les porte tous ---------- */
dire("\nUn SARM non confirmé : les cinq moments ont matière");
(function () {
  var A = interp("saureus", { FOX: "R", PEN: "R", E: "S", DA: "S", VA: "S" });
  E.COMMENT_MOMENTS.forEach(function (n) {
    verif(!!moment(A, n), n.toLowerCase() + " : présent");
  });
  verif(/Céfoxitine R/.test(moment(A, "Observation").texte),
        "l'observation reprend la molécule ET sa catégorie");
  verif(/PLP2a|mecA/.test(moment(A, "Test complémentaire").texte),
        "le test complémentaire nomme le test");
})();

/* ---------- 3. Un moment sans matière est OMIS ---------- */
dire("\nUn moment sans matière est omis, jamais rempli de force");
(function () {
  var A = interp("ecoli", { AMX: "S", CTX: "S", GEN: "S", CIP: "S" });
  verif(!moment(A, "Hypothèse mécanistique"),
        "souche sauvage : aucune hypothèse mécanistique — il n'y a pas de mécanisme à supposer");
  verif(!moment(A, "Test complémentaire"),
        "… ni de test à faire : rien n'est à trancher");
  verif(!!moment(A, "Interprétation"), "… mais l'interprétation est là");
  (A.moments || []).forEach(function (m) {
    verif(!!m.texte && m.texte.trim().length > 3, "aucun moment vide (" + m.moment + ")");
  });
})();

/* ---------- 4. § 3 : la prudence tant que rien n'est confirmé ---------- */
dire("\n§ 3 — une hypothèse non confirmée ne se dit jamais « confirmée »");
(function () {
  var A = interp("ecoli", { AMX: "R", CTX: "R", CAZ: "R", IPM: "R", MEM: "R" });
  var h = moment(A, "Hypothèse mécanistique");
  verif(!!h, "l'hypothèse est formulée");
  verif(/compatible avec|évoque|suggère/i.test(h.texte),
        "… au conditionnel : « compatible avec »");
  verif(!/confirmé/i.test(h.texte), "… et jamais « confirmé »");
  verif(/aucun test n'a confirmé/i.test((moment(A, "Limites") || {}).texte || ""),
        "les limites disent qu'aucun test n'a tranché");
})();

dire("\n… et l'affirme quand un test l'a tranchée");
(function () {
  var A = interp("ecoli", { AMX: "R", AMC: "R", CTX: "R", CAZ: "R", FOX: "S", IPM: "S" },
                 { syn: "Positif" }, "casfm");
  var h = moment(A, "Hypothèse mécanistique");
  verif(/Mécanisme confirmé par/.test(h.texte), "« Mécanisme confirmé par … » : le test est nommé");
  // C'est ICI que la casse est forcée — sur une hypothèse confirmée, et nulle
  // part ailleurs. Le balayage général ne l'atteint donc pas : il n'emploie
  // aucun contexte de confirmation. Or le texte commence par « β-lactamase »,
  // et toUpperCase() en ferait « Β-lactamase », bêta grec capitale : le mot
  // le plus fréquent de l'application, rendu méconnaissable.
  verif(h.texte.indexOf("β-lactamase") === 0,
        "… et le β de « β-lactamase » reste un bêta minuscule");
  verif(h.texte.indexOf("Β") === -1, "… aucun bêta capitale dans la phrase");
  verif(!moment(A, "Test complémentaire"),
        "… et plus aucun test complémentaire n'est demandé : il a été fait");
})();

/* ---------- 5. Le texte copiable ---------- */
dire("\nLe texte copiable");
(function () {
  var A = interp("saureus", { FOX: "R", PEN: "R", VA: "S" });
  var c = A.commentaireCopiable;
  verif(/Validation biologique requise\.$/.test(c),
        "il se termine par la validation biologique, comme l'exemple du § 15");
  verif(c.indexOf("Observation :") === -1 && c.indexOf("Limites :") === -1,
        "les étiquettes restent à l'écran et ne partent pas dans le presse-papier");
  (A.moments || []).forEach(function (m) {
    verif(c.indexOf(m.texte.trim()) !== -1, "le moment « " + m.moment + " » y figure en entier");
  });
})();

/* ---------- 6. Toutes les espèces, toutes les phrases ---------- */
dire("\nAucune phrase bancale, sur aucune espèce");
(function () {
  var profils = [
    { AMX:"R", CTX:"R", CAZ:"R", IPM:"R", GEN:"R", E:"R", DA:"R", VA:"R", FOX:"R", PEN:"R", CIP:"R", SXT:"R" },
    { AMX:"S", CTX:"S", GEN:"S", E:"S", DA:"S", VA:"S", FOX:"S", PEN:"S" }
  ];
  var vus = 0, bancales = 0, sansValidation = 0;
  Object.keys(E.ORG).forEach(function (id) {
    profils.forEach(function (res) {
      var A = E.runInterpretation({ organism: id, mode: "sir", results: res, ctx: {} }).interpretation;
      if (!A || !A.moments) return;
      vus++;
      A.moments.forEach(function (m) {
        // Espace avant virgule, virgule orpheline, double espace, deux-points
        // enchâssés, et le bêta grec passé en capitale par une mise en forme
        // trop zélée : « Β-lactamase » rend méconnaissable le mot le plus
        // fréquent de l'application.
        if (/\s,|,\s*\.|  |::|Β/.test(m.texte)) {
          bancales++;
          dire("        " + id + " [" + m.moment + "] " + m.texte.slice(0, 90));
        }
      });
      if (!/Validation biologique requise\.$/.test(A.commentaireCopiable || "")) sansValidation++;
    });
  });
  verif(vus > 50, vus + " interprétations passées en revue");
  verif(bancales === 0, "aucune phrase mal formée");
  verif(sansValidation === 0, "toutes se terminent par la validation biologique");
})();

dire("\n" + (KO ? KO + " échec(s) sur " + (OK + KO) + " contrôles."
                : OK + " contrôles, le commentaire distingue ses cinq moments"
                    + " et ne dit jamais confirmé ce qui ne l'est pas."));
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
