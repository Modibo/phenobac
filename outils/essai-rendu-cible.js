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


/* ============================================================
   § 2.1.3 ET LES NOTES (A) (B) (C)

   Les couleurs du tableau ne sont que la moitié de la recommandation. Ce qui
   suit éprouve l'autre moitié, celle qui RETIRE des molécules que la case
   avait rendues. Le risque change de sens : ici, un défaut masque une
   molécule active de plus.
   ============================================================ */

function journal(r, sens, code) {
  return (r.restrictions || []).some(function (j) {
    return j.sens === sens && j.codes.indexOf(code) !== -1;
  });
}

/* ---------- 10. La donnée vient du document, et elle est complète ---------- */
dire("\nLes listes citées par les notes");
(function () {
  var L = E.RENDU_CIBLE_LISTES || {};
  ["groupe3", "c3g", "carbapenemes", "betalactaminesEtroites", "nouvelles"].forEach(function (k) {
    verif((L[k] || []).length > 0, "la liste « " + k + " » est lue dans les notes ("
          + (L[k] || []).length + " entrées)");
  });
  // Chaque nom de MOLÉCULE cité doit se traduire en codes, sinon la règle est
  // sautée. « groupe3 » nomme des espèces : il relève de RC_GROUPE3_ORG.
  var souci = null;
  ["c3g", "carbapenemes", "betalactaminesEtroites", "nouvelles"].forEach(function (k) {
    try { E.rcCodes(L[k]); } catch (e) { souci = souci || e.message; }
  });
  verif(!souci, "tout nom cité par une note se traduit en codes PhénoBac"
        + (souci ? " — " + souci : ""));
  // Et le jour où une révision du document citera une molécule de plus, la
  // traduction doit S'ARRÊTER, pas passer outre : une règle appliquée à une
  // liste amputée masque moins, ou masque la mauvaise molécule.
  var arrete = false;
  try { E.rcCodes(["une molécule que PhénoBac ne connaît pas"]); }
  catch (e) { arrete = /RC_NOM_CODES/.test(e.message); }
  verif(arrete, "un nom sans correspondance interrompt la traduction au lieu d'être ignoré");

  var ceph = E.rcCephalosporines();
  verif(ceph.indexOf("FEP") !== -1 && ceph.indexOf("FOX") !== -1 && ceph.indexOf("CAZ") !== -1,
        "la famille « céphalosporines » de la note (B) est tirée des tableaux ("
        + ceph.join(", ") + ")");

  // Les notes, verbatim : si le document change, la phrase change.
  var N = E.RENDU_CIBLE_NOTES || {};
  verif(/céfépime plutôt que/.test((N.pyelonephrite || {}).A || ""),
        "note (A) de la pyélonéphrite : « privilégier le rendu du céfépime plutôt que »");
  verif(/ne pas rendre le résultat du céfixime/.test((N.cystite || {}).A || ""),
        "note (A) de la cystite : « ne pas rendre le résultat du céfixime »");
  verif(/uniquement sur demande du clinicien\.$/.test((N.cystite || {}).B || ""),
        "note (B) de la cystite : carbapénèmes « uniquement sur demande du clinicien »");
  verif(/spectre plus étroit/.test((N.pyelonephrite || {}).B || ""),
        "note (B) de la pyélonéphrite : la condition de spectre");
  verif((E.RENDU_CIBLE_RESTRICTIONS || []).length === 7,
        (E.RENDU_CIBLE_RESTRICTIONS || []).length + " règles lues au § 2.1.3");
})();

/* ---------- 11. Le groupe 3 : aucune espèce ne peut entrer sans être classée ---------- */
dire("\nLes entérobactéries du groupe 3");
(function () {
  var L = (E.RENDU_CIBLE_LISTES || {}).groupe3 || [];
  var M = E.RC_GROUPE3_ORG || {};
  var manquantes = L.filter(function (e) { return !(e in M); });
  verif(manquantes.length === 0,
        "les " + L.length + " espèces nommées par la note (A) sont toutes classées"
        + (manquantes.length ? " — manque " + manquantes.join(", ") : ""));
  var fausses = Object.keys(M).filter(function (e) { return M[e] && !E.ORG[M[e]]; });
  verif(fausses.length === 0, "… et chaque renvoi désigne un organisme que PhénoBac connaît");

  // Le contrôle qui compte : qu'une espèce du groupe 3 ajoutée demain à
  // PhénoBac ne reste pas silencieusement hors du groupe 3. On relit les noms
  // du document, genre et espèce, et on les cherche dans la table ORG.
  var classes = Object.keys(M).map(function (e) { return M[e]; }).filter(Boolean);
  var oubliees = [];
  L.forEach(function (nom) {
    var mots = nom.split(/\s+/);
    var genre = mots[0];
    var espece = /spp/.test(mots[1] || "") ? null : mots[1];
    Object.keys(E.ORG).forEach(function (id) {
      var sp = (E.ORG[id].args && E.ORG[id].args.species) || "";
      var cible = espece ? new RegExp(genre + "\\s+" + espece, "i")
                         : new RegExp("\\b" + genre, "i");
      if (cible.test(sp) && classes.indexOf(id) === -1) oubliees.push(id + " (" + nom + ")");
    });
  });
  verif(oubliees.length === 0,
        "aucune espèce du groupe 3 présente dans PhénoBac n'est restée hors du classement"
        + (oubliees.length ? " — " + oubliees.join(", ") : ""));
})();

/* ---------- 12. § 2.1.3, règle 1 : la pyélonéphrite n'est pas une cystite ---------- */
dire("\nLes molécules de la cystite seule ne figurent pas au tableau de la pyélonéphrite");
(function () {
  // « leur diffusion tissulaire rénale est insuffisante ». Le tableau le fait
  // déjà en ne les portant pas ; ce contrôle garantit qu'il continue.
  var tb = E.RENDU_CIBLE.pyelonephrite;
  var tous = [];
  tb.lignes.forEach(function (l) { l.codes.forEach(function (c) { tous.push(c); }); });
  ["MEC", "NIT", "FOS", "TMP"].forEach(function (k) {
    verif(tous.indexOf(k) === -1, k + " absent du tableau de la pyélonéphrite");
  });
  var r = rc("ecoli", SAUVAGE, ctx({ typeIU: "Pyélonéphrite" }));
  verif(["MEC", "NIT", "FOS", "TMP"].every(function (k) {
    return r.masquees.indexOf(k) !== -1;
  }), "… et une souche sensible ne les voit pas rendues en pyélonéphrite");
})();

/* ---------- 13. Note (B) : les carbapénèmes, dernier recours ---------- */
dire("\nNote (B) — le carbapénème attend que les β-lactamines étroites aient échoué");
(function () {
  // Pyélonéphrite, profil BLSE : la témocilline reste active.
  var avecEtroite = { AMX: "R", AMC: "S", SXT: "R", CTX: "R", CAZ: "R", CIP: "R",
                      GEN: "S", IPM: "S", TEM: "S" };
  var r = rc("ecoli", avecEtroite, ctx({ typeIU: "Pyélonéphrite" }));
  verif(r.masquees.indexOf("IPM") !== -1, "imipénème masqué : témocilline et association actives");
  verif(journal(r, "retiré", "IPM"), "… et le motif cite la note (B)");
  verif(r.rendues.indexOf("TEM") !== -1, "… tandis que la témocilline, elle, est rendue");

  // Plus aucune β-lactamine de spectre plus étroit : le carbapénème passe.
  var sansEtroite = { AMX: "R", AMC: "R", SXT: "R", CTX: "R", CAZ: "R", CIP: "R",
                      GEN: "S", IPM: "S" };
  var r2 = rc("ecoli", sansEtroite, ctx({ typeIU: "Pyélonéphrite" }));
  verif(r2.masquees.indexOf("IPM") === -1,
        "aucune β-lactamine étroite active : l'imipénème est rendu, comme la note le prévoit");

  // En cystite, la note ne connaît qu'une condition : la demande du clinicien.
  var cys = { AMX: "R", AMC: "R", SXT: "R", CTX: "R", CIP: "R", GEN: "R",
              FOS: "S", NIT: "R", TMP: "R", MEC: "R", CFM: "R", IPM: "S" };
  var r3 = rc("ecoli", cys, ctx({ typeIU: "Cystite" }));
  verif(r3.masquees.indexOf("IPM") !== -1,
        "cystite : l'imipénème reste hors de la feuille, bien qu'actif et tout le reste résistant");
  verif(r3.rendues.indexOf("FOS") !== -1, "… c'est la fosfomycine que le clinicien voit");
  var r4 = rc("ecoli", cys, ctx({ typeIU: "Cystite", demandeRecours: "Oui" }));
  verif(r4.rendues.indexOf("IPM") !== -1, "… et il est rendu dès que le clinicien le demande");
  verif(journal(r4, "ajouté", "IPM"), "… le journal porte l'ajout et sa raison");
})();

/* ---------- 14. Note (A) : le céfépime plutôt que la C3G, pour le groupe 3 ---------- */
dire("\nNote (A) — groupe 3 : le céfépime prend la place des C3G");
(function () {
  var prof = { AMX: "R", AMC: "R", SXT: "R", CFM: "S", CTX: "S", CRO: "S",
               CAZ: "S", FEP: "S", CIP: "S", GEN: "S", IPM: "S" };
  var g3 = rc("ecloacae", prof, ctx({ typeIU: "Pyélonéphrite" }));
  verif(g3.colonne === "amcEtSxtR", "colonne : association et cotrimoxazole résistants");
  ["CFM", "CTX", "CRO"].forEach(function (k) {
    verif(g3.masquees.indexOf(k) !== -1, k + " retiré — Enterobacter cloacae est du groupe 3");
  });
  verif(g3.rendues.indexOf("FEP") !== -1, "céfépime rendu à leur place");
  verif(journal(g3, "ajouté", "FEP"), "… et le journal dit que c'est une substitution");

  var ec = rc("ecoli", prof, ctx({ typeIU: "Pyélonéphrite" }));
  verif(ec.rendues.indexOf("CTX") !== -1,
        "E. coli n'est pas du groupe 3 : sa céfotaxime reste rendue");
  verif(ec.masquees.indexOf("FEP") !== -1, "… et son céfépime n'est pas rendu");

  // Sans céfépime actif, il n'y a rien à préférer : ne pas retirer les C3G.
  var sansFep = {};
  for (var k in prof) sansFep[k] = prof[k];
  sansFep.FEP = "R";
  var g3b = rc("ecloacae", sansFep, ctx({ typeIU: "Pyélonéphrite" }));
  verif(g3b.rendues.indexOf("CTX") !== -1,
        "céfépime résistant : les C3G sont conservées — « privilégier plutôt que » suppose un remplaçant");

  // La note ne vaut qu'« en l'absence de BLSE ou de résistance aux C3G ».
  //
  // Le cas qui ÉPROUVE cette borne doit porter une C3G encore ACTIVE dans la
  // colonne « C3G résistante ou BLSE » — sinon les C3G y sont rendues de toute
  // façon parce qu'elles sont résistantes, et retirer la borne ne change rien :
  // ma première version n'affirmait donc rien. Une céphalosporinase déréprimée
  // d'Enterobacter touche la ceftazidime en laissant céfotaxime et ceftriaxone :
  // la colonne bascule, et les C3G restent actives.
  var cazR = { AMX: "R", AMC: "R", SXT: "S", CFM: "S", CTX: "S", CRO: "S",
               CAZ: "R", FEP: "S", CIP: "S", GEN: "S", IPM: "S" };
  var g3c = rc("ecloacae", cazR, ctx({ typeIU: "Pyélonéphrite" }));
  verif(g3c.colonne === "c3gRouBlse", "ceftazidime résistante : la dernière colonne");
  verif(g3c.rendues.indexOf("CTX") !== -1 && g3c.rendues.indexOf("CRO") !== -1,
        "… et les C3G actives y restent rendues : hors de la portée de la note (A)");
  verif(!journal(g3c, "retiré", "CTX"), "… le journal ne porte aucun retrait de C3G");
})();

/* ---------- 15. Note (A) de la cystite : un autre texte, une autre règle ---------- */
dire("\nNote (A) de la cystite — le céfixime du groupe 3");
(function () {
  var R1 = { AMX: "R", MEC: "R", FOS: "R", NIT: "R", TMP: "R", SXT: "R",
             AMC: "S", CFM: "S", CTX: "S", CIP: "S" };
  var r = rc("ecloacae", R1, ctx({ typeIU: "Cystite" }));
  verif(r.masquees.indexOf("CFM") !== -1,
        "céfixime retiré : groupe 3 et résistance aux molécules de première intention");
  verif(r.rendues.indexOf("AMC") !== -1, "… l'association, elle, reste rendue");
  verif(rc("ecoli", R1, ctx({ typeIU: "Cystite" })).rendues.indexOf("CFM") !== -1,
        "E. coli dans le même profil : son céfixime est rendu");
  // La condition « colonne !== premiereIntentionS » est une ceinture par-dessus
  // des bretelles, et le banc le dit plutôt que de faire semblant de l'éprouver :
  // le tableau ne prévoit JAMAIS le céfixime quand une molécule de première
  // intention reste active. La retirer du code ne changerait aucun rendu — ce
  // qu'il faut surveiller, c'est l'invariant qui la rend inoffensive.
  var prem = E.RENDU_CIBLE.cystite.lignes.filter(function (l) {
    return l.codes.indexOf("CFM") !== -1;
  })[0];
  verif(prem && prem.rendre.indexOf("premiereIntentionS") === -1,
        "le céfixime n'est pas prévu quand une molécule de première intention est active");

  var R2 = {}; for (var k in R1) R2[k] = R1[k]; R2.FOS = "S";
  verif(rc("ecloacae", R2, ctx({ typeIU: "Cystite" })).colonne === "premiereIntentionS",
        "fosfomycine active : plus de résistance de première intention…");
  verif(rc("ecloacae", R2, ctx({ typeIU: "Cystite" })).masquees.indexOf("CFM") !== -1,
        "… et le céfixime n'est pas rendu non plus, mais parce que le tableau ne le prévoit pas");
})();

/* ---------- 16. § 2.1.3 : les fluoroquinolones, et la moitié qu'on n'applique pas ---------- */
dire("\n§ 2.1.3 — les fluoroquinolones");
(function () {
  var prof = { AMX: "R", AMC: "S", SXT: "R", CFM: "R", CTX: "R", CAZ: "R",
               CIP: "S", GEN: "S", IPM: "R" };
  var r = rc("ecoli", prof, ctx({ typeIU: "Pyélonéphrite" }));
  verif(r.masquees.indexOf("CIP") !== -1,
        "amoxicilline R, association S : la ciprofloxacine n'est pas rendue");
  verif(journal(r, "retiré", "CIP"), "… et le motif cite le § 2.1.3");
  verif(r.rendues.indexOf("AMC") !== -1, "… c'est l'association que le clinicien voit");

  // La règle est écrite « quelle que soit la situation clinique (cystite ou
  // pyélonéphrite) » : sans renseignement clinique, elle n'est pas appliquée.
  var r2 = rc("ecoli", prof, ctx({}));
  verif(r2.tableau === "sansRenseignement", "sans renseignement clinique : l'autre tableau");
  verif(!journal(r2, "retiré", "CIP"),
        "… la règle n'y est pas appliquée : le document la borne à la cystite et à la pyélonéphrite");

  // La moitié non appliquée doit être DITE, et seulement quand elle compte.
  var actif = { AMX: "R", AMC: "R", SXT: "R", CFM: "S", CTX: "S", CIP: "S", GEN: "S" };
  var r3 = rc("ecoli", actif, ctx({ typeIU: "Pyélonéphrite" }));
  verif(r3.rendues.indexOf("CIP") !== -1, "fluoroquinolone rendue dans ce profil…");
  verif((r3.horsPortee || []).some(function (h) { return /per os/.test(h); }),
        "… et PhénoBac déclare ne pas appliquer la moitié « autres antibiotiques per os actifs »");
  verif((rc("ecoli", SAUVAGE, ctx({ typeIU: "Cystite" })).horsPortee || []).length === 0,
        "là où aucune fluoroquinolone n'est rendue, PhénoBac ne dit rien : pas de bruit inutile");
})();

/* ---------- 17. Note (C) : les molécules nouvelles ---------- */
dire("\nNote (C) — nouvelles associations et nouvelles céphalosporines");
(function () {
  var prof = { AMX: "R", AMC: "R", SXT: "R", CFM: "S", CTX: "S", CIP: "S", FDC: "S" };
  var r = rc("ecoli", prof, ctx({ typeIU: "Pyélonéphrite" }));
  verif(r.masquees.indexOf("FDC") !== -1, "céfidérocol non rendu : il attend la demande du clinicien");
  var r2 = rc("ecoli", prof, ctx({ typeIU: "Pyélonéphrite", demandeRecours: "Oui" }));
  verif(r2.rendues.indexOf("FDC") !== -1, "… et il l'est dès qu'elle vient");
  verif(journal(r2, "ajouté", "FDC"), "… le journal porte la note (C)");

  // Le retrait de la note (C) est aujourd'hui SANS EFFET, et il faut le dire :
  // aucune ligne de tableau ne porte le code d'une molécule nouvelle — la ligne
  // « Autres molécules » n'en nomme aucune. Elles sont donc déjà hors de la
  // feuille, et c'est l'ajout sur demande qui fait tout le travail. Le retrait
  // reste en place pour le jour où une révision leur donnerait une ligne ;
  // l'invariant qui le rend inoffensif est ce qu'on surveille.
  var nouvelles = E.rcCodes((E.RENDU_CIBLE_LISTES || {}).nouvelles || []);
  var prevues = [];
  Object.keys(E.RENDU_CIBLE).forEach(function (cle) {
    E.RENDU_CIBLE[cle].lignes.forEach(function (l) {
      l.codes.forEach(function (c) { if (prevues.indexOf(c) === -1) prevues.push(c); });
    });
  });
  verif(nouvelles.every(function (c) { return prevues.indexOf(c) === -1; }),
        "aucune molécule nouvelle n'a de ligne dans les tableaux : elles sont hors feuille d'office");
})();

/* ---------- 18. Le plancher : jamais une feuille sans molécule active ---------- */
dire("\nGARDE-FOU 6 — une feuille sans aucun antibiotique utilisable n'aide personne");
(function () {
  // Cystite où seul l'imipénème est actif : la note (B) le retirerait, et la
  // feuille ne porterait plus rien. Ce plancher est de PhénoBac, pas de la HAS :
  // le document suppose un appel au laboratoire que la feuille imprimée n'a pas.
  var seul = { AMX: "R", AMC: "R", SXT: "R", CTX: "R", CAZ: "R", CIP: "R", GEN: "R",
               FOS: "R", NIT: "R", TMP: "R", MEC: "R", CFM: "R", IPM: "S" };
  var r = rc("ecoli", seul, ctx({ typeIU: "Cystite" }));
  verif(r.rendues.indexOf("IPM") !== -1, "le seul antibiotique actif est rendu malgré la note (B)");
  verif(!!r.plancher && /levé/.test(r.plancher), "… et la feuille dit que le masquage a été levé");
  verif(/Imipénème/.test(r.plancher || ""), "… en nommant la molécule relevée");

  // Quand plusieurs molécules sont actives, on lève d'abord celles qui ne sont
  // PAS de dernier recours : l'ordre du document est respecté jusqu'au bout.
  var plusieurs = { AMX: "R", AMC: "R", SXT: "R", MEC: "R", FOS: "R", NIT: "R",
                    TMP: "R", CFM: "S", CTX: "S", CIP: "S", IPM: "S" };
  var r2 = rc("ecloacae", plusieurs, ctx({ typeIU: "Cystite" }));
  verif(r2.masquees.indexOf("IPM") !== -1,
        "d'autres molécules actives existent : le carbapénème reste masqué");
  verif(r2.rendues.indexOf("CTX") !== -1, "… ce sont elles que le plancher relève");

  // Et le plancher ne se déclenche pas quand tout va bien.
  verif(!rc("ecoli", SAUVAGE, ctx({ typeIU: "Cystite" })).plancher,
        "souche sensible : aucun plancher, le rendu ciblé fait son office");
})();

/* ---------- 19. Le journal n'affirme que ce qui s'est produit ---------- */
dire("\nLe journal des restrictions ne ment pas");
(function () {
  // Une molécule retirée par une note PUIS rendue parce qu'elle est résistante
  // n'a pas été masquée. Le journal ne doit pas prétendre le contraire.
  var prof = { AMX: "R", AMC: "S", SXT: "R", CTX: "R", CAZ: "R", CIP: "R",
               GEN: "S", IPM: "R", TEM: "S" };
  var r = rc("ecoli", prof, ctx({ typeIU: "Pyélonéphrite" }));
  verif(r.rendues.indexOf("IPM") !== -1, "imipénème résistant : rendu, malgré la note (B)");
  verif(!journal(r, "retiré", "IPM"), "… et le journal ne prétend pas l'avoir masqué");
  verif((r.restrictions || []).length === 0,
        "aucune entrée ne subsiste ici : toutes les molécules visées sont rendues");

  // Et là où des entrées subsistent, chacune doit décrire l'état réel.
  var vivant = { AMX: "R", AMC: "S", SXT: "R", CTX: "R", CAZ: "R", CIP: "R",
                 GEN: "S", IPM: "S", TEM: "S", FDC: "S" };
  var rv = rc("ecloacae", vivant, ctx({ typeIU: "Pyélonéphrite" }));
  verif((rv.restrictions || []).length > 0,
        (rv.restrictions || []).length + " entrée(s) de journal à vérifier");
  (rv.restrictions || []).forEach(function (j) {
    var faux = j.codes.filter(function (k) {
      return j.sens === "retiré" ? rv.masquees.indexOf(k) === -1 : rv.rendues.indexOf(k) === -1;
    });
    verif(faux.length === 0, "entrée « " + j.sens + " " + j.codes.join(",")
          + " » : chaque molécule citée est bien dans l'état annoncé");
  });
})();

dire("\n" + (KO ? KO + " échec(s) sur " + (OK + KO) + " contrôles."
                : OK + " contrôles : le rendu ciblé ne masque que dans son périmètre,"
                    + " jamais une résistance, jamais une alerte."));
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
