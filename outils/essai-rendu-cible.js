/* ============================================================
   essai-rendu-cible.js — l'antibiogramme ciblé, recommandation HAS 2023

   MASQUER UN RÉSULTAT EST UN ACTE GRAVE. Ce banc ne vérifie donc pas d'abord
   que le masquage marche : il vérifie qu'il ne marche PAS là où il ne doit
   pas. Les cinq garde-fous d'abord, la mécanique ensuite.

     1. désactivé par défaut — sans décision du laboratoire, tout est rendu ;
     2. périmètre — entérobactéries, ECBU, patiente de 12 ans ou plus ;
     3. une molécule RÉSISTANTE est toujours rendue ;
     4. rien n'est effacé — les catégories restent intactes ;
     5. une molécule qui porte une alerte n'est jamais masquée.

   Le défaut qu'on redoute ici n'est pas qu'une molécule de trop s'affiche :
   c'est qu'une molécule active disparaisse de la feuille du clinicien.

   Avec Node :             node outils/essai-rendu-cible.js
   Sans Node, sur macOS :  …/jsc outils/essai-rendu-cible.js
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

var ECBU = { urin: "Oui", patiente: "Oui" };
function ctx(sup) {
  var c = { urin: ECBU.urin, patiente: ECBU.patiente };
  for (var k in (sup || {})) c[k] = sup[k];
  return c;
}
function run(org, res, c, actif) {
  return E.runInterpretation({ organism: org || "ecoli", mode: "sir", results: res,
                               ctx: c || ctx(), renduCible: actif !== false }).interpretation;
}
function rc(org, res, c, actif) { return run(org, res, c, actif).renduCible; }

var SAUVAGE = { AMX: "S", AMC: "S", SXT: "S", CTX: "S", CIP: "S", GEN: "S",
                IPM: "S", FOS: "S", NIT: "S", TMP: "S", MEC: "S" };

/* ---------- 1. Désactivé par défaut ---------- */
dire("\nSans décision du laboratoire, rien n'est masqué");
verif(rc("ecoli", SAUVAGE, ctx({ typeIU: "Cystite" }), false) === null,
      "drapeau absent : le rendu ciblé ne s'applique pas du tout");
(function () {
  var A = E.runInterpretation({ organism: "ecoli", mode: "sir", results: SAUVAGE,
                                ctx: ctx({ typeIU: "Cystite" }) }).interpretation;
  verif(!A.renduCible, "… et l'interprétation n'en porte aucune trace");
})();

/* ---------- 2. Le périmètre, et il est étroit ---------- */
dire("\nLe périmètre de la recommandation");
(function () {
  var hors = rc("saureus", { PEN: "S", FOX: "S", VA: "S" }, ctx({ typeIU: "Cystite" }));
  verif(hors && !hors.applique, "staphylocoque : hors entérobactéries, pas de rendu ciblé");
  verif(hors && /entérobactéries/.test(hors.motif), "… et le motif le dit");

  var sansEcbu = rc("ecoli", SAUVAGE, { patiente: "Oui", typeIU: "Cystite" });
  verif(sansEcbu && !sansEcbu.applique, "prélèvement non urinaire : pas de rendu ciblé");

  var sansPatiente = rc("ecoli", SAUVAGE, { urin: "Oui", typeIU: "Cystite" });
  verif(sansPatiente && !sansPatiente.applique,
        "âge et sexe non confirmés : pas de rendu ciblé — la recommandation n'est pas validée ailleurs");
  verif(sansPatiente && /12 ans/.test(sansPatiente.motif), "… et le motif cite la limite");
})();

/* ---------- 3. Le tableau suit le renseignement clinique ---------- */
dire("\nLe renseignement clinique choisit le tableau");
verif(rc("ecoli", SAUVAGE, ctx({ typeIU: "Cystite" })).tableau === "cystite",
      "cystite renseignée : tableau de la cystite");
verif(rc("ecoli", SAUVAGE, ctx({ typeIU: "Pyélonéphrite" })).tableau === "pyelonephrite",
      "pyélonéphrite renseignée : son tableau");
verif(rc("ecoli", SAUVAGE, ctx({})).tableau === "sansRenseignement",
      "rien de renseigné : le tableau sans renseignement clinique");

/* ---------- 4. Ce que la cystite d'une souche sensible donne ---------- */
dire("\nCystite à souche sensible : la raison d'être du dispositif");
(function () {
  var r = rc("ecoli", SAUVAGE, ctx({ typeIU: "Cystite" }));
  verif(r.colonne === "premiereIntentionS", "colonne : au moins une molécule de 1re intention active");
  ["IPM", "CIP", "CTX"].forEach(function (k) {
    verif(r.masquees.indexOf(k) !== -1, k + " masqué — molécule critique inutile ici");
  });
  ["AMX", "FOS", "NIT", "TMP"].forEach(function (k) {
    verif(r.rendues.indexOf(k) !== -1, k + " rendu — première intention");
  });
})();

/* ---------- 5. Une molécule résistante est TOUJOURS rendue ---------- */
dire("\nUne résistance ne se masque jamais");
(function () {
  var res = {};
  for (var k in SAUVAGE) res[k] = SAUVAGE[k];
  res.CIP = "R"; res.IPM = "R";          // deux molécules hors première ligne
  var r = rc("ecoli", res, ctx({ typeIU: "Cystite" }));
  verif(r.masquees.indexOf("CIP") === -1, "ciprofloxacine R : rendue, bien que hors colonne");
  verif(r.masquees.indexOf("IPM") === -1, "imipénème R : rendu, bien que hors colonne");
  verif(r.rendues.indexOf("CIP") !== -1 && r.rendues.indexOf("IPM") !== -1,
        "… toutes deux dans les molécules rendues");
})();

/* ---------- 6. Rien n'est effacé ---------- */
dire("\nLe masquage ne touche pas aux données");
(function () {
  var out = E.runInterpretation({ organism: "ecoli", mode: "sir", results: SAUVAGE,
                                  ctx: ctx({ typeIU: "Cystite" }), renduCible: true });
  var intact = Object.keys(SAUVAGE).every(function (k) { return out.categories[k] === SAUVAGE[k]; });
  verif(intact, "toutes les catégories restent dans le résultat, masquées comprises");
  verif(out.interpretation.renduCible.masquees.length > 0, "… alors que des molécules sont masquées");
})();

/* ---------- 7. Une alerte protège sa molécule ---------- */
dire("\nUne molécule qui porte une alerte n'est jamais masquée");
(function () {
  // L'association rendue moins active que la molécule seule lève une alerte
  // nommant l'amoxicilline-acide clavulanique.
  var res = { AMX: "S", AMC: "R", CTX: "S", CIP: "S", IPM: "S", FOS: "S", NIT: "S", SXT: "S" };
  var A = run("ecoli", res, ctx({ typeIU: "Cystite" }));
  var nomme = (A.alerts || []).some(function (a) { return /clavulanique/i.test(a.txt); });
  verif(nomme, "l'alerte sur l'amoxicilline-acide clavulanique est bien levée");
  // AMC est ici R : elle serait rendue de toute façon. Le vrai cas à éprouver
  // est celui d'une molécule ACTIVE, HORS COLONNE, et NOMMÉE par une alerte —
  // c'est le seul où le garde-fou change quelque chose. Ma première version
  // n'en construisait aucun, et la mutation qui retirait ce garde-fou passait
  // inaperçue : le banc affirmait une protection qu'il ne vérifiait pas.
  //
  // Proteus mirabilis est naturellement résistant à la colistine. Une
  // colistine rendue « S » lève donc une alerte d'incohérence qui la nomme ;
  // or la colistine ne figure dans aucun tableau de la HAS, et serait masquée
  // sans cette protection.
  var pr = { AMX: "S", AMC: "S", SXT: "S", CTX: "S", CIP: "S", FOS: "S", COL: "S" };
  var A2 = run("proteus", pr, ctx({ typeIU: "Cystite" }));
  var nommeCol = (A2.alerts || []).some(function (a) { return /[Cc]olistine/.test(a.txt); });
  verif(nommeCol, "colistine S sur Proteus : l'alerte d'incohérence la nomme");
  var r2 = A2.renduCible;
  verif(r2 && r2.applique, "… le rendu ciblé s'applique bien à ce cas");
  verif(r2 && r2.masquees.indexOf("COL") === -1,
        "… et la colistine n'est PAS masquée, bien qu'active et hors de tout tableau");
  verif(r2 && r2.rendues.indexOf("COL") !== -1, "… elle figure parmi les molécules rendues");
  verif(r2 && r2.masquees.length > 0,
        "… tandis que d'autres molécules actives et sans alerte le sont bien");
})();

/* ---------- 8. Le profil BLSE ---------- */
dire("\nUne BLSE en cystite : les carbapénèmes restent hors de la feuille");
(function () {
  var res = { AMX: "R", AMC: "R", SXT: "R", CTX: "R", CAZ: "R", CIP: "R",
              GEN: "S", IPM: "S", FOS: "S", NIT: "S" };
  var r = rc("ecoli", res, ctx({ typeIU: "Cystite" }));
  verif(r.masquees.indexOf("IPM") !== -1,
        "imipénème masqué : fosfomycine et nitrofurantoïne restent actives");
  verif(r.rendues.indexOf("FOS") !== -1 && r.rendues.indexOf("NIT") !== -1,
        "… et ce sont elles que le clinicien voit");
  ["AMX", "AMC", "CTX", "CIP"].forEach(function (k) {
    verif(r.rendues.indexOf(k) !== -1, k + " rendu : il est résistant");
  });
})();

/* ---------- 9. La première intention vient de la donnée ---------- */
dire("\nLa liste de première intention n'est pas écrite à la main");
(function () {
  var prem = E.rcPremiereIntention();
  verif(prem.length >= 5, prem.length + " molécules de première intention, tirées du tableau");
  ["AMX", "MEC", "FOS", "NIT", "TMP"].forEach(function (k) {
    verif(prem.indexOf(k) !== -1, k + " en fait partie");
  });
  verif(prem.indexOf("IPM") === -1, "… et aucun carbapénème");
})();

dire("\n" + (KO ? KO + " échec(s) sur " + (OK + KO) + " contrôles."
                : OK + " contrôles : le rendu ciblé ne masque que dans son périmètre,"
                    + " jamais une résistance, jamais une alerte."));
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
