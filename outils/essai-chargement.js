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

HORS INTÉGRATION CONTINUE : ce banc n'a de sens QUE sous jsc, où il simule Node
pour éprouver la branche que le poste de développement n'emprunte jamais. Sous
Node, la chaîne exécute déjà cette branche pour de vrai, à chaque banc : le
lancer là-bas ne vérifierait rien de plus.
   ============================================================ */

if (typeof readFile !== "function") {
  (typeof console === "object" ? console.log : print)(
    "Ce banc ne vaut que sous jsc : sous Node, la chaîne éprouve déjà la vraie branche.");
} else {
  /* LA LISTE DOIT ÊTRE COMPLÈTE, ET ELLE NE L'ÉTAIT PAS. Huit bancs sur
     dix-huit y figuraient ; les dix autres n'avaient JAMAIS vu leur branche
     node s'exécuter ailleurs qu'en intégration continue. Le 7 novembre 2026,
     essai-langue.js — absent d'ici — a cassé la chaîne pour cette raison
     exacte : un contrôle ajouté lisait une variable locale au chargement
     jsc, inexistante sous node. Au vert sur le poste, rouge après le push.

     Un banc oublié dans cette liste rouvre l'angle mort que ce fichier
     existe pour fermer. Elle est donc confrontée, juste après, à ce que
     l'intégration continue EXÉCUTE : en ajouter un là-bas sans l'inscrire
     ici fait échouer ce banc. */
  var BANCS = ["anaerobies", "banque", "categorisation", "coherence",
               "commentaire", "conditions", "contexte", "debit", "diametres",
               "especes-aerobies", "glass", "langue", "posologie",
               "referentiel", "regles", "nuances", "rendu-cible",
               "service-worker", "voies"];
  var vraiLire = readFile, KO = 0, OK = 0, modules = {};

  /* LA LISTE CI-DESSUS CONTRE CELLE DE LA CHAÎNE.
     Le fichier de la chaîne fait foi : c'est lui qui dit quels bancs seront
     exécutés par node. Tout banc qu'il lance et que BANCS ignore est un
     angle mort rouvert ; tout banc inscrit ici que la chaîne ne lance pas
     est une liste qui ment sur sa portée. */
  (function () {
    var yml;
    try { yml = vraiLire(".github/workflows/deploy.yml"); }
    catch (e) {
      print("  ÉCHEC  le fichier de la chaîne est illisible : " + e.message);
      KO++; return;
    }
    var chaine = [], m, re = /node\s+outils\/essai-([a-z0-9-]+)\.js/g;
    while ((m = re.exec(yml)) !== null) if (chaine.indexOf(m[1]) < 0) chaine.push(m[1]);
    if (!chaine.length) {
      print("  ÉCHEC  aucun banc trouvé dans le fichier de la chaîne : "
            + "le motif de lecture ne correspond plus");
      KO++; return;
    }
    var oublies = chaine.filter(function (b) { return BANCS.indexOf(b) < 0; });
    var fantomes = BANCS.filter(function (b) { return chaine.indexOf(b) < 0; });
    if (oublies.length) {
      print("  ÉCHEC  la chaîne exécute " + oublies.length + " banc(s) que ce fichier "
            + "n'éprouve pas sous Node : " + oublies.join(", "));
      KO++;
    } else if (fantomes.length) {
      print("  ÉCHEC  inscrits ici mais absents de la chaîne : " + fantomes.join(", "));
      KO++;
    } else {
      print("  ok     les " + chaine.length + " bancs de la chaîne sont tous éprouvés ici");
      OK++;
    }
  })();


  function fauxRequire(nom) {
    if (nom === "fs") return { readFileSync: function (f) { return vraiLire(f); } };
    /* LES MODULES INTÉGRÉS DE NODE. Sans « path », essai-service-worker
       échouait ICI alors qu'il passe en intégration continue : le simulateur
       accusait un banc sain. Une fausse alerte vaut une alerte manquée —
       elle apprend à ne plus lire le rapport. */
    if (nom === "path") return {
      join: function () {
        var bouts = [];
        for (var i = 0; i < arguments.length; i++) {
          String(arguments[i]).split("/").forEach(function (x) {
            if (x === "" || x === ".") return;
            if (x === "..") { bouts.pop(); return; }
            bouts.push(x);
          });
        }
        return bouts.join("/");
      }
    };
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
                    "__dirname",
                    vraiLire("outils/essai-" + b + ".js")))(
        fauxRequire,
        { exports: {} },
        { log: function (s) { sortie.push(String(s)); } },
        { exit: function (c) { code = c; }, argv: [] },
        undefined,          // readFile INTROUVABLE : c'est tout l'intérêt
        "outils"            // __dirname, comme node le donne au banc
      );
    } catch (e) { code = 1; sortie.push("EXCEPTION " + e.message); }
    var fin = (sortie.join("\n").trim().split("\n").pop() || "(muet)").trim();
    if (code) { KO++; print("  ÉCHEC  essai-" + b + " : " + fin.slice(0, 90)); }
    else { OK++; print("  ok     essai-" + b + " — " + fin.slice(0, 70)); }
  });

  print("\n" + (KO ? KO + " banc(s) cassent sous Node alors qu'ils passent sous jsc."
                   : BANCS.length + " bancs se chargent aussi par require, et la liste\n"
                     + "couvre tout ce que la chaîne exécute : elle les exécutera."));
  if (KO) throw new Error(KO + " échec(s)");
}
