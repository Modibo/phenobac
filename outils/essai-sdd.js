/* ============================================================
   essai-sdd.js — SDD, la quatrième catégorie du CLSI

   CE QUE CE BANC PROTÈGE

   SDD n'est pas une catégorie de plus dans le moteur : c'est un NOM donné
   à la bande qui s'appelle « I » partout ailleurs. Le choix tient à une
   mesure — sur les seize tables de seuils du M100, les colonnes SDD et I
   coexistent dans quatre tables, mais jamais pour un même agent — et il
   évite de relire les cinquante endroits où le moteur et la page comparent
   une catégorie à « I ».

   Ce choix a un coût, et c'est lui que ce banc surveille : le nom se décide
   AILLEURS que la catégorie. Si les deux se désaccordent, une molécule
   sensible à forte posologie se rend « I » sans que rien ne le signale, ou
   pire, une molécule ordinaire se rend « SDD ».

   Trois choses sont donc vérifiées :

     1. le drapeau suit le COUPLE ET LA MÉTHODE — en table 2D du M100, SDD
        existe pour la CMI et pas pour le diamètre ;
     2. il ne se déclenche QUE sur la bande intermédiaire — jamais sur un
        « S » ni sur un « R » ;
     3. CHAQUE appel de lettreCat() et libelleCat() dans phenobac.html passe
        le code de l'antibiotique. C'est un contrôle de SOURCE, et il est ici
        parce que le défaut qu'il attrape est muet : un appel qui l'oublie
        rend « I » là où ses voisins rendent « SDD », et le compte rendu se
        contredit lui-même d'une ligne à l'autre. Onze appels existaient ;
        trois seulement avaient le code sous la main au premier jet.

   Avec Node :             node outils/essai-sdd.js
   Sans Node, sur macOS :  /System/Library/Frameworks/JavaScriptCore.framework/\
                             Versions/A/Helpers/jsc outils/essai-sdd.js

   À lancer depuis la racine du dépôt.
   ============================================================ */

var E, B, KO = 0, OK = 0, lireFichier;

if (typeof require === "function" && typeof module === "object" && module.exports) {
  E = require("../moteur");
  B = require("../base-connaissances");
  var fs = require("fs"), path = require("path");
  lireFichier = function (f) {
    return fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  };
} else {
  lireFichier = function (f) { return readFile(f); };
  var modB = { exports: {} };
  (new Function("module", "exports", lireFichier("base-connaissances.js")))(modB, modB.exports);
  var modP = { exports: {} };
  (new Function("module", "exports", lireFichier("posologie.js")))(modP, modP.exports);
  var modV = { exports: {} };
  (new Function("module", "exports", lireFichier("voies.js")))(modV, modV.exports);
  var mod = { exports: {} };
  var resoudre = function (nom) {
    if (/posologie/.test(nom)) return modP.exports;
    if (/voies/.test(nom)) return modV.exports;
    if (/rendu-cible/.test(nom)) return modB.exports;
    if (/base-connaissances/.test(nom)) return modB.exports;
    throw new Error("le banc ne sait pas charger " + nom);
  };
  (new Function("module", "exports", "require", lireFichier("moteur.js")))(
    mod, mod.exports, resoudre);
  E = mod.exports;
  B = modB.exports;
}

function dire(s) { (typeof console === "object" ? console.log : print)(s); }
function verif(cond, titre) {
  cond ? OK++ : KO++;
  dire((cond ? "  ok    " : "  ÉCHEC ") + titre);
}

/* ---------- 1. la colonne existe, et elle est en queue ---------- */
(function () {
  var C = B.COLONNES;
  verif(C.indexOf("sdd") === C.length - 1,
        "« sdd » est la DERNIÈRE colonne — l'insérer ailleurs décalerait "
        + "chaque valeur des lignes existantes, en silence");
})();

/* ---------- 2. le drapeau, la bande, et la méthode ---------- */
(function () {
  // Un couple fabriqué de toutes pièces, sous CLSI, dont on maîtrise tout.
  // ampicilline sur entérobactéries : S ≤ 8, R > 16 — la bande intermédiaire
  // va donc de 16 inclus à 16, c'est-à-dire la seule valeur 16.
  E.BP_CLSI.entero = { AMP: { S: 8, R: 16, sdd: true },
                       GEN: { S: 2, R: 4 } };           // sans drapeau, témoin
  E.DZ_CLSI.entero = { AMP: { S: 17, R: 14 } };         // disque : PAS de sdd
  E.DISQUE_CLSI.entero = { AMP: "10 µg" };

  function lire(mode, mesures) {
    var e = { organism: "ecoli", mode: mode, ctx: {}, ref: "clsi" };
    e[mode === "mic" ? "mic" : "diam"] = mesures;
    return E.runInterpretation(e);
  }

  var r = lire("mic", { AMP: "16", GEN: "4" });
  verif(r.categories.AMP === "I",
        "la bande intermédiaire reste « I » dans categories — le moteur garde "
        + "son alphabet S / I / R");
  verif((r.sdd || []).indexOf("AMP") >= 0,
        "… et le couple est nommé dans sdd : c'est lui qui porte le nom");
  verif((r.sdd || []).indexOf("GEN") < 0,
        "un couple SANS drapeau n'y figure pas, à bande intermédiaire égale");

  var s = lire("mic", { AMP: "2" });
  verif(s.categories.AMP === "S" && (s.sdd || []).indexOf("AMP") < 0,
        "sur la bande sensible, aucun SDD — le drapeau ne qualifie que "
        + "l'intermédiaire");

  var t = lire("mic", { AMP: "64" });
  verif(t.categories.AMP === "R" && (t.sdd || []).indexOf("AMP") < 0,
        "sur la bande résistante non plus");

  // LE POINT QUI COMPTE : le drapeau est porté par la méthode.
  var d = lire("diam", { AMP: "16" });
  verif(d.categories.AMP === "I",
        "par disque, le même couple tombe bien dans la bande intermédiaire");
  verif((d.sdd || []).indexOf("AMP") < 0,
        "… et n'est PAS SDD : le seuil de diamètre ne porte pas le drapeau. "
        + "En table 2D du M100, SDD existe pour la CMI et pas pour le disque");

  // Pas de reliquat d'une lecture à l'autre.
  var u = lire("mic", { GEN: "4" });
  verif((u.sdd || []).indexOf("AMP") < 0,
        "sdd est vidé entre deux lectures — un reliquat rendrait « SDD » "
        + "une molécule de la lecture précédente");

  delete E.BP_CLSI.entero; delete E.DZ_CLSI.entero; delete E.DISQUE_CLSI.entero;
  E.cadrer("eucast", null);
})();

/* ---------- 3. aucun appel de rendu n'oublie le code ---------- */
(function () {
  var src = lireFichier("phenobac.html");
  // Les appels, hors les deux définitions.
  var re = /(lettreCat|libelleCat)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
  var m, oublis = [], total = 0;
  while ((m = re.exec(src)) !== null) {
    var args = m[2];
    // La définition elle-même : « function lettreCat(cat, abx) ».
    if (/^cat\s*,\s*abx$/.test(args.trim())) continue;
    total++;
    // Un appel correct porte DEUX arguments au premier niveau.
    var prof = 0, virgules = 0;
    for (var i = 0; i < args.length; i++) {
      var c = args[i];
      if (c === "(" || c === "[" || c === "{") prof++;
      else if (c === ")" || c === "]" || c === "}") prof--;
      else if (c === "," && prof === 0) virgules++;
    }
    if (virgules < 1) oublis.push(m[0].slice(0, 60));
  }
  verif(total >= 10,
        "le contrôle voit bien les appels de rendu de catégorie (" + total + ")");
  verif(oublis.length === 0,
        "chaque appel passe le code de l'antibiotique"
        + (oublis.length ? " — oublis : " + oublis.join(" | ") : ""));
})();

/* ---------- 3 bis. sdd voyage AVEC les catégories, par les DEUX chemins ----
   La page obtient son interprétation de deux façons : le moteur chargé dans
   le navigateur, ou le serveur quand moteur.js manque. Le premier jet ne
   transportait sdd que par le chemin LOCAL. La panne qui en résulte est la
   pire espèce : invisible sur le poste du développeur, qui a toujours le
   moteur local, et silencieuse chez l'utilisateur, qui voit « I » au lieu de
   « SDD » sans rien pour le lui dire.

   Deux propriétés sont donc exigées : tout objet de résultat qui porte des
   catégories porte aussi sdd, et SDD_ACTIF ne s'affecte QU'À UN ENDROIT,
   après les deux branches. */
(function () {
  var src = lireFichier("phenobac.html");

  var re = /\{[^{}]*\binterpretation\s*:[^{}]*\bcategories\s*:[^{}]*\}/g;
  var m, total = 0, sans = [];
  while ((m = re.exec(src)) !== null) {
    total++;
    if (!/\bsdd\s*:/.test(m[0])) sans.push(m[0].replace(/\s+/g, " ").slice(0, 70));
  }
  verif(total >= 2, "les deux chemins d'interprétation sont vus (" + total + ")");
  verif(sans.length === 0,
        "chaque objet de résultat transporte sdd avec ses catégories"
        + (sans.length ? " — sans : " + sans.join(" | ") : ""));

  var aff = src.match(/SDD_ACTIF\s*=/g) || [];
  verif(aff.length === 2,
        "SDD_ACTIF n'est affecté qu'une fois, après les deux branches "
        + "(plus sa déclaration) — trouvé " + aff.length);
})();

/* ---------- 4. le catalogue de langue porte les deux langues ---------- */
(function () {
  var src = lireFichier("langue.js");
  verif(/"cat\.I\.clsi"/.test(src), "« cat.I.clsi » existe dans le catalogue");
  var m = src.match(/"cat\.I\.clsi":\s*\{([^}]*)\}/);
  verif(!!m && /fr:/.test(m[1]) && /en:/.test(m[1]),
        "… et il porte le français ET l'anglais");
  verif(/Susceptible-dose dependent/.test(src),
        "le terme anglais est celui du CLSI, pas une traduction maison");
})();

dire("\n" + (KO ? KO + " échec(s) sur " + (OK + KO) + " vérifications."
                : OK + " vérifications, SDD se nomme où il faut et nulle part ailleurs."));
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
