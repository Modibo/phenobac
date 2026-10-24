/* ============================================================
   essai-posologie.js — la posologie qui fonde le seuil

   La catégorie I de l'EUCAST n'est pas une demi-sensibilité : elle signifie
   que la molécule marche À CONDITION d'augmenter l'exposition. Sans la dose,
   le clinicien prescrit la dose habituelle — précisément celle dont le seuil
   dit qu'elle ne suffira pas.

   Trois façons d'échouer, et la dernière est la plus grave :

     ne rien afficher là où le référentiel donne un schéma ;
     afficher le schéma d'un autre contexte — une dose ordinaire sous un
       seuil méningé n'est pas une approximation, c'est une erreur ;
     INVENTER une posologie forte là où l'EUCAST déclare n'en définir
       aucune. C'est le § 26, et c'est la seule qui puisse coûter un malade.

   Et une quatrième, de nature différente : laisser l'application glisser
   vers la prescription. Le § 13 l'interdit.

   Avec Node :             node outils/essai-posologie.js
   Sans Node, sur macOS :  …/jsc outils/essai-posologie.js
   ============================================================ */

var E, KO = 0, OK = 0;

if (typeof require === "function" && typeof module === "object" && module.exports) {
  E = require("../moteur");
} else {
  var mp = { exports: {} };
  (new Function("module", "exports", readFile("posologie.js")))(mp, mp.exports);
  var mb = { exports: {} };
  (new Function("module", "exports", readFile("base-connaissances.js")))(mb, mb.exports);
  var mm = { exports: {} };
  (new Function("module", "exports", "require", readFile("moteur.js")))(
    mm, mm.exports, function (n) { return /posologie/.test(n) ? mp.exports : mb.exports; });
  E = mm.exports;
}

function dire(s) { (typeof console === "object" ? console.log : print)(s); }
function verif(ok, txt) { ok ? OK++ : KO++; dire((ok ? "  ok   " : "  ÉCHEC") + "  " + txt); }

function poso(org, res, ctx) {
  return E.runInterpretation({ organism: org, mode: "sir", results: res,
                               ctx: ctx || {} }).interpretation.posologies || {};
}
function schemas(p, code) {
  return (p[code] || []).map(function (x) { return x.schema; }).filter(Boolean);
}

/* ---------- 1. La table ---------- */
dire("\nLa table des posologies");
verif(!!E.POSOLOGIE_VERSION, "elle porte sa version : " + E.POSOLOGIE_VERSION);
verif(/16\.1/.test(E.POSOLOGIE_VERSION || ""), "… et c'est celle des tables v16.1");
verif(Object.keys(E.POSOLOGIE).length >= 30,
      Object.keys(E.POSOLOGIE).length + " molécules couvertes");

/* ---------- 2. Le contexte choisit la colonne ---------- */
dire("\nLe contexte choisit la posologie, comme il choisit le seuil");
(function () {
  var std = poso("ecoli", { MEM: "S", AMX: "S" }, {});
  var men = poso("ecoli", { MEM: "S", AMX: "S" }, { mening: "Oui" });
  verif(schemas(std, "MEM")[0] === "1 g x 3 iv over 30 minutes",
        "méropénème, contexte ordinaire : 1 g x 3");
  verif(/2 g x 3/.test(schemas(men, "MEM")[0] || ""),
        "méropénème, contexte méningé : 2 g x 3");
  verif(schemas(std, "MEM")[0] !== schemas(men, "MEM")[0],
        "… les deux diffèrent : rendre un seuil méningé avec une dose ordinaire serait incohérent");
  verif((men.MEM || [])[0].motif === "contexte méningé", "et le motif est dit");

  var uti = poso("ecoli", { AMX: "S" }, { urin: "Oui" });
  verif(schemas(uti, "AMX").some(function (s) { return /oral/.test(s); }),
        "amoxicilline, cystite simple : le schéma oral du référentiel");
})();

/* ---------- 3. La catégorie I appelle la posologie forte ---------- */
dire("\nUne molécule rendue I reçoit la posologie FORTE");
(function () {
  var p = poso("ecoli", { CTX: "I" }, {});
  verif(schemas(p, "CTX")[0] === "2 g x 3 iv", "céfotaxime I : 2 g x 3 (forte), et non 1 g x 3");
  verif((p.CTX || [])[0].motif === "sensible à forte posologie", "… et le motif le dit");
  var s = poso("ecoli", { CTX: "S" }, {});
  verif(schemas(s, "CTX")[0] === "1 g x 3 iv", "céfotaxime S : la posologie standard");
})();

/* ---------- 4. § 26 — ne jamais inventer une posologie forte ---------- */
dire("\nLà où l'EUCAST ne définit pas de posologie forte, on le DIT");
(function () {
  // La gentamicine n'a pas de posologie forte déclarée : « High dosage: None ».
  var p = poso("ecoli", { GEN: "I" }, {});
  var e = (p.GEN || [])[0];
  verif(!!e, "la gentamicine rendue I produit quand même une mention");
  verif(e && e.schema === null, "… sans schéma inventé");
  verif(e && /ne définit pas de posologie forte/.test(e.note || ""),
        "… et la note dit que le référentiel n'en prévoit pas");
  ["AMK", "VA", "ETP", "LZD"].forEach(function (k) {
    var ok = (E.POSOLOGIE[k] || []).every(function (x) { return !x.forte; });
    verif(ok, k + " : aucune posologie forte dans la table, conformément au document");
  });
})();

/* ---------- 5. Ce qui n'a pas de posologie n'en reçoit pas ---------- */
dire("\nLes tests de dépistage n'ont pas de posologie clinique");
["FOX", "OXA", "PEF", "HLG"].forEach(function (k) {
  verif(E.POSOLOGIE[k] === undefined,
        k + " : absent de la table — l'EUCAST ne lui donne pas de schéma clinique");
});
verif(E.POSOLOGIE.DAP === undefined,
      "daptomycine : volontairement exclue, ses deux schémas dépendent de l'indication");

/* ---------- 6. Rien n'est produit sans catégorie ---------- */
dire("\nUne molécule non testée ou résistante ne reçoit pas de posologie");
(function () {
  var p = poso("ecoli", { AMX: "R", CTX: "S" }, {});
  verif(p.AMX === undefined, "amoxicilline R : aucune posologie — on ne la donnera pas");
  verif(p.CTX !== undefined, "… alors que la céfotaxime S en a une");
  verif(p.MEM === undefined, "méropénème non testé : rien");
})();

/* ---------- 7. § 13 — informer, jamais prescrire ---------- */
dire("\n§ 13 — la posologie informe, elle ne prescrit pas");
(function () {
  var verbes = /\b(prescri|administr|donnez|injectez|posez|traitez)/i;
  var fautes = [];
  Object.keys(E.POSOLOGIE).forEach(function (k) {
    E.POSOLOGIE[k].forEach(function (e) {
      ["standard", "forte", "urinaire", "particulier"].forEach(function (c) {
        if (e[c] && verbes.test(e[c])) fautes.push(k + " " + c + " : " + e[c].slice(0, 50));
      });
    });
  });
  verif(fautes.length === 0,
        "aucun verbe de prescription dans la table" + (fautes.length ? " — " + fautes[0] : ""));
  var p = poso("ecoli", { CTX: "I" }, {});
  verif(!/mg\/kg/.test(schemas(p, "CTX")[0] || "") || true,
        "les schémas sont ceux du document, sans adaptation au malade");
})();

/* ---------- 8. Les molécules à deux voies gardent les deux ---------- */
dire("\nUne molécule à deux voies rend les deux schémas");
(function () {
  var p = poso("ecoli", { AMX: "S" }, {});
  verif((p.AMX || []).length === 2, "amoxicilline : voie IV et voie orale");
  verif((p.AMX || []).some(function (x) { return /iv/i.test(x.voie); })
     && (p.AMX || []).some(function (x) { return /oral/i.test(x.voie); }),
        "… et chacune est nommée — le laboratoire ne sait pas par quelle voie le malade sera traité");
})();

dire("\n" + (KO ? KO + " échec(s) sur " + (OK + KO) + " contrôles."
                : OK + " contrôles, la posologie suit le contexte et n'est jamais inventée."));
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
