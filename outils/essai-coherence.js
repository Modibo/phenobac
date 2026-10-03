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
  var mod = { exports: {} };
  (new Function("module", "exports", "require",
                readFile("moteur.js")))(mod, mod.exports, function () { return modB.exports; });
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

dire("\n" + (KO ? KO + " échec(s) sur " + (OK + KO) + " contrôles."
                : OK + " contrôles, les alertes de cohérence se déclenchent quand il faut, et seulement alors."));
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
