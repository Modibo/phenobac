/* ============================================================
   essai-coherence.js — les contrôles de cohérence disent-ils vrai ?

   § 9 du cahier des charges. Une alerte de cohérence a deux façons d'échouer,
   et la seconde est la pire :

     elle ne se déclenche pas quand elle devrait — le laboratoire rend un
     résultat incohérent sans être averti ;

     elle se déclenche quand elle ne devrait pas — et l'utilisateur apprend à
     ignorer les alertes, ce qui les rend toutes inutiles.

   Chaque contrôle est donc éprouvé DANS LES DEUX SENS : un cas qui doit
   l'allumer, un cas voisin qui ne doit pas.

   Avec Node :             node outils/essai-coherence.js
   Sans Node, sur macOS :  …/jsc outils/essai-coherence.js
   ============================================================ */

var E, KO = 0, OK = 0;



/* ---------- chargement du moteur ----------
   Le raisonnement vit dans moteur.js, que le navigateur charge aussi : le
   banc éprouve donc exactement l'objet que le laboratoire exécute. Ce fichier
   n'a aucune dépendance — ni require, ni process — d'où ce chargement direct,
   là où il fallait auparavant simuler l'environnement de Node. */
if (typeof require === "function" && typeof module === "object" && module.exports) {
  E = require("../moteur");
} else {
  // La base d'abord : le moteur y reconstruit ses tables au chargement.
  var modB = { exports: {} };
  (new Function("module", "exports", readFile("base-connaissances.js")))(modB, modB.exports);
  // Le moteur réclame DEUX fichiers de données : la base de règles et les
  // posologies. Un require qui rendrait toujours le même les confondrait, et
  // le moteur chercherait des posologies dans la base.
  var modP = { exports: {} };
  (new Function("module", "exports", readFile("posologie.js")))(modP, modP.exports);
  var mod = { exports: {} };
  (new Function("module", "exports", "require", readFile("moteur.js")))(
    mod, mod.exports,
    function (nom) { return /posologie/.test(nom) ? modP.exports : modB.exports; });
  E = mod.exports;
}


function dire(s) { (typeof console === "object" ? console.log : print)(s); }

function verif(ok, txt) { ok ? OK++ : KO++; dire((ok ? "  ok   " : "  ÉCHEC") + "  " + txt); }

function alertes(org, res, ctx, ref) {
  return E.runInterpretation({ organism: org, mode: "sir", results: res,
                               ctx: ctx || {}, ref: ref }).interpretation.alerts || [];
}
function porte(org, res, motif, ctx) {
  return alertes(org, res, ctx).some(function (a) { return motif.test(a.txt); });
}
function niveauDe(org, res, motif, ctx) {
  var a = alertes(org, res, ctx).filter(function (x) { return motif.test(x.txt); })[0];
  return a ? a.lvl : null;
}

/* ---------- 1. L'association moins active que la molécule seule ---------- */
dire("\nUn inhibiteur ne peut pas rendre l'association moins active");
var IMPOSSIBLE = /ne peut donc pas être moins active/;
verif(porte("ecoli", { AMX: "S", AMC: "R", CTX: "S" }, IMPOSSIBLE),
      "E. coli, amoxicilline S et amoxicilline-clavulanate R : signalé");
verif(niveauDe("ecoli", { AMX: "S", AMC: "R" }, IMPOSSIBLE) === "warn",
      "… au niveau « à vérifier », pas en alerte majeure : c'est une faute de saisie probable");
verif(!porte("ecoli", { AMX: "R", AMC: "R", CTX: "S" }, IMPOSSIBLE),
      "les deux résistantes : rien à signaler");
verif(!porte("ecoli", { AMX: "S", AMC: "S", CTX: "S" }, IMPOSSIBLE),
      "les deux sensibles : rien à signaler");
verif(!porte("ecoli", { AMC: "R", CTX: "S" }, IMPOSSIBLE),
      "amoxicilline non testée : on ne conclut pas sur une mesure absente");

// La nuance qui fait tout : chez les espèces à céphalosporinase inductible,
// le clavulanate INDUIT l'enzyme. Le même profil y est attendu.
dire("\n… sauf là où le clavulanate induit la céphalosporinase");
var INDUIT = /INDUIT la céphalosporinase/;
["ecloacae", "kaerogenes", "serratia", "cfreundii"].forEach(function (g) {
  verif(porte(g, { AMX: "S", AMC: "R", CTX: "S" }, INDUIT),
        g + " : le profil est expliqué, non reproché");
  verif(!porte(g, { AMX: "S", AMC: "R", CTX: "S" }, IMPOSSIBLE),
        "… et n'est pas signalé comme impossible");
});
verif(niveauDe("ecloacae", { AMX: "S", AMC: "R" }, INDUIT) === "info",
      "au niveau « information » : rien à corriger, quelque chose à comprendre");

/* ---------- 2. Deux mesures du même mécanisme ---------- */
dire("\nCéfoxitine et oxacilline dépistent la même résistance");
var DESACCORD = /en désaccord/;
verif(porte("saureus", { FOX: "R", OXA: "S", PEN: "R" }, DESACCORD),
      "céfoxitine R et oxacilline S : signalé");
verif(porte("saureus", { FOX: "S", OXA: "R", PEN: "R" }, DESACCORD),
      "et dans l'autre sens aussi");
verif(!porte("saureus", { FOX: "R", OXA: "R", PEN: "R" }, DESACCORD),
      "les deux d'accord sur la résistance : rien à signaler");
verif(!porte("saureus", { FOX: "S", PEN: "R" }, DESACCORD),
      "oxacilline non testée : rien à comparer, donc rien à dire");

/* ---------- 3. Identification plutôt que faute de frappe ---------- */
dire("\nUne résistance naturelle contredite, ou plusieurs");
var IDENT = /identification erronée/;
verif(!porte("paeru", { AMX: "S", CIP: "S" }, IDENT),
      "une seule contredite : erreur de saisie probable, pas d'alerte d'identification");
verif(porte("paeru", { AMX: "S", CTX: "S", CIP: "S" }, IDENT),
      "deux contredites : l'identification est mise en cause");
verif(niveauDe("paeru", { AMX: "S", CTX: "S" }, IDENT) === "stop",
      "… et l'interprétation est déclarée impossible en l'état");

(function () {
  var A = E.runInterpretation({ organism: "paeru", mode: "sir",
                                results: { AMX: "S", CTX: "S", CIP: "S" }, ctx: {} }).interpretation;
  verif(!!A.nonSecurise, "le refus de conclure est porté par l'interprétation, pas seulement par une alerte");
  verif(!!A.name, "… et le phénotype reste calculé, pour que le biologiste voie ce qui était en jeu");
})();

/* ---------- 4. Une alerte ne change jamais une donnée brute ---------- */
dire("\nUne alerte ne modifie aucune donnée");
(function () {
  var saisi = { AMX: "S", AMC: "R", CTX: "S", FOX: "S" };
  var r = E.runInterpretation({ organism: "ecoli", mode: "sir", results: saisi, ctx: {} });
  var intact = Object.keys(saisi).every(function (k) { return r.categories[k] === saisi[k]; });
  verif(intact, "les catégories rendues sont celles qui ont été saisies");
  verif(r.interpretation.alerts.length > 0, "… alors qu'une alerte a bien été levée");
})();

/* ------------------------------------------------------------
   LE PRÉLÈVEMENT DÉCLARÉ ET LE SITE DES SEUILS

   Le champ « Prélèvement » paraissait sur le compte rendu et partait à la
   surveillance, mais il ne commandait rien : le site des seuils venait de
   questions séparées. On pouvait déclarer « LCR », ne pas répondre à la
   question méningée, et obtenir des seuils de site ordinaire sur un isolat
   de liquide céphalo-rachidien — avec « Prélèvement : LCR » imprimé juste à
   côté. Les deux champs se contredisaient sans que rien ne le dise.

   PhénoBac ne tranche pas à la place du biologiste : lui seul sait si le
   prélèvement relève du cadre méningé ou de la cystite simple. Il confronte.
   ------------------------------------------------------------ */
dire("\nLe prélèvement déclaré et le site des seuils disent-ils la même chose ?");
var DESACCORD = /Prélèvement déclaré|Contexte «/;
(function () {
  var pn = { PEN: "S", CTX: "S", E: "S", VA: "S" };
  verif(porte("pneumocoque", pn, DESACCORD, { prelevement: "LCR" }),
        "LCR déclaré sans contexte méningé : le désaccord est signalé");
  verif(/pénicilline|céfotaxime/i.test(
          (alertes("pneumocoque", pn, { prelevement: "LCR" })
            .filter(function (a) { return DESACCORD.test(a.txt); })[0] || {}).txt || ""),
        "… en NOMMANT les molécules dont le seuil change, pas en termes vagues");
  verif(!porte("pneumocoque", pn, DESACCORD, { prelevement: "LCR", mening: "Oui" }),
        "LCR déclaré ET contexte méningé renseigné : rien à dire");

  // Le désaccord vaut dans les DEUX SENS : le compte rendu porterait l'un et
  // les seuils l'autre.
  verif(porte("pneumocoque", pn, DESACCORD, { prelevement: "Hémoculture", mening: "Oui" }),
        "contexte méningé renseigné sur une hémoculture : signalé aussi");

  var urines = { AMX: "S", MEC: "S", NIT: "S", TMP: "S" };
  verif(porte("ecoli", urines, DESACCORD, { prelevement: "ECBU (urines)" }),
        "ECBU déclaré sans cystite renseignée : signalé");
  verif(!porte("ecoli", urines, DESACCORD, { prelevement: "ECBU (urines)", urin: "Oui" }),
        "… et plus rien une fois la cystite renseignée");

  /* UN AVERTISSEMENT SANS CONSÉQUENCE FINIT PAR ÊTRE IGNORÉ, y compris le
     jour où il en a une. Il ne paraît donc que si une molécule dont le site
     change le seuil a réellement été saisie. */
  verif(!porte("pneumocoque", { E: "S", VA: "S" }, DESACCORD, { prelevement: "LCR" }),
        "LCR, mais aucune molécule à seuil méningé saisie : on se tait");
  verif(!porte("ecoli", { AMX: "S", CTX: "S", GEN: "S" }, DESACCORD,
               { prelevement: "ECBU (urines)" }),
        "ECBU, mais aucune molécule à seuil urinaire saisie : on se tait");

  // Les prélèvements qui n'appellent aucun site particulier ne disent rien.
  ["Pus / plaie", "Prélèvement respiratoire", "Cathéter", "Autre"].forEach(function (p) {
    verif(!porte("pneumocoque", pn, DESACCORD, { prelevement: p }),
          "« " + p + " » : aucun site propre dans les référentiels, aucun avertissement");
  });
  verif(!porte("pneumocoque", pn, DESACCORD, {}),
        "prélèvement non renseigné : rien à confronter");
})();

/* ------------------------------------------------------------
   Les deux entérobactéries de groupe 3 que la HAS nommait et qu'on ne
   pouvait pas choisir.
   ------------------------------------------------------------ */
dire("\nMorganella et Providencia — leurs résistances naturelles parlent");
(function () {
  var NATURELLE = /[Rr]ésistance naturelle attendue/;
  [["mmorganii", "Morganella morganii"], ["providencia", "Providencia spp."]].forEach(function (x) {
    verif(porte(x[0], { COL: "S", AMX: "R", CTX: "S" }, NATURELLE),
          x[1] + " : colistine rendue S → incohérence signalée");
    verif(porte(x[0], { NIT: "S", AMX: "R", CTX: "S" }, NATURELLE),
          x[1] + " : nitrofurantoïne rendue S → incohérence signalée");
    verif(!porte(x[0], { AMX: "R", AMC: "R", CTX: "S", CIP: "S" }, NATURELLE),
          x[1] + " : profil attendu → aucune incohérence");
  });

  // Le défaut que ce contrôle vient de révéler chez les Proteae : la
  // nitrofurantoïne est arrivée au panel urinaire sans être déclarée
  // résistante naturelle, sur le prélèvement où la question se pose le plus.
  verif(porte("proteus", { NIT: "S", AMX: "S", CTX: "S" }, NATURELLE),
        "Proteus mirabilis : nitrofurantoïne rendue S → incohérence signalée");
  verif(porte("pvulgaris", { NIT: "S", CTX: "S" }, NATURELLE),
        "Proteus vulgaris : idem");
})();

dire("\n" + (KO ? KO + " échec(s) sur " + (OK + KO) + " contrôles."
                : OK + " contrôles, les alertes de cohérence se déclenchent quand il faut, et seulement alors."));
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
