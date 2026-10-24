/* ============================================================
   essai-chargement.js — les bancs tiennent-ils sous Node ?

   L'ANGLE MORT QUE CE BANC EXISTE POUR COUVRIR

   Node n'est pas installé sur le poste de développement : les bancs y sont
   exécutés par jsc. L'intégration continue, elle, les exécute par node. Les
   deux environnements ne chargent pas les modules de la même façon :

     jsc   readFile("moteur.js") puis new Function(...)
     node  require("../moteur"), et fs.readFileSync pour les fichiers

   Chaque banc porte donc un aiguillage, et SEULE LA BRANCHE jsc est
   éprouvée au quotidien. La branche node ne l'est qu'en intégration
   continue — c'est-à-dire après avoir poussé, et seulement si l'on va lire
   le journal. Un banc peut donc passer ici et casser la chaîne là-bas.

   Ce banc exécute les autres en SIMULANT node : un require maison, un fs
   maison, et surtout readFile RENDU INTROUVABLE. Sans cette dernière
   précaution le contrôle ne vaut rien — les bancs préfèrent readFile quand
   il existe, et l'on éprouverait une fois de plus la branche jsc en croyant
   éprouver l'autre. C'est l'erreur que j'ai commise en écrivant ce fichier.

   Sans Node, sur macOS :  …/jsc outils/essai-chargement.js
   (sous Node, il ne sert à rien : la CI éprouve déjà la vraie branche.)
   ============================================================ */

if (typeof readFile !== "function") {
  (typeof console === "object" ? console.log : print)(
    "Ce banc ne vaut que sous jsc : sous Node, la chaîne éprouve déjà la vraie branche.");
} else {
  var BANCS = ["referentiel", "debit", "banque", "coherence", "diametres",
               "glass", "conditions", "commentaire"];
  var vraiLire = readFile, KO = 0, OK = 0, modules = {};

  function fauxRequire(nom) {
    if (nom === "fs") return { readFileSync: function (f) { return vraiLire(f); } };
    var f = nom.replace(/^\.\.\//, "").replace(/^\.\//, "");
    if (!/\.js$/.test(f)) f += ".js";
    if (modules[f]) return modules[f].exports;
    var m = { exports: {} }; modules[f] = m;
    (new Function("module", "exports", "require", vraiLire(f)))(m, m.exports, fauxRequire);
    return m.exports;
  }

  BANCS.forEach(function (b) {
    var sortie = [], code = 0;
    try {
      (new Function("require", "module", "console", "process", "readFile",
                    vraiLire("outils/essai-" + b + ".js")))(
        fauxRequire,
        { exports: {} },
        { log: function (s) { sortie.push(String(s)); } },
        { exit: function (c) { code = c; }, argv: [] },
        undefined           // readFile INTROUVABLE : c'est tout l'intérêt
      );
    } catch (e) { code = 1; sortie.push("EXCEPTION " + e.message); }
    var fin = (sortie.join("\n").trim().split("\n").pop() || "(muet)").trim();
    if (code) { KO++; print("  ÉCHEC  essai-" + b + " : " + fin.slice(0, 90)); }
    else { OK++; print("  ok     essai-" + b + " — " + fin.slice(0, 70)); }
  });

  print("\n" + (KO ? KO + " banc(s) cassent sous Node alors qu'ils passent sous jsc."
                   : OK + " bancs se chargent aussi par require : la chaîne les exécutera."));
  if (KO) throw new Error(KO + " échec(s)");
}
