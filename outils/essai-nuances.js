/* ============================================================
   essai-nuances.js — SDD et NS, les catégories que le CLSI nomme
   autrement qu'il ne les calcule

   CE QUE CE BANC PROTÈGE

   NI SDD NI NS ne sont des catégories de plus dans le moteur : ce sont des
   NOMS donnés à des bandes qui s'appellent autrement partout ailleurs.

     SDD  occupe la bande de « I ». Mesuré : sur les seize tables de seuils
          du M100, les colonnes SDD et I coexistent dans quatre tables, mais
          jamais pour un même agent.
     NS   occupe celle de « R », qui est la direction prudente — on ne
          présente jamais comme utilisable un antibiotique que le document
          ne dit pas tel. Le CLSI emploie cette catégorie quand il n'a fixé
          QU'UN seuil de sensibilité : plus de cent couples.

   Le choix évite de relire les cinquante endroits où le moteur et la page
   comparent une catégorie à « I » ou à « R ».

   Ce choix a un coût, et c'est lui que ce banc surveille : le nom se décide
   AILLEURS que la catégorie. Si les deux se désaccordent, une molécule
   sensible à forte posologie se rend « I » sans que rien ne le signale, ou
   pire, une molécule ordinaire se rend « SDD ».

   Trois choses sont donc vérifiées :

     1. le drapeau suit le COUPLE ET LA MÉTHODE — en table 2D du M100, SDD
        existe pour la CMI et pas pour le diamètre ;
     2. il ne se déclenche QUE sur la bande intermédiaire — jamais sur un
        « S » ni sur un « R » ;
     3. NS ne se confond pas avec R, ni dans la lettre ni dans la glose :
        « non sensible » veut dire « à confirmer », pas « inactif ».
     4. CHAQUE appel de lettreCat() et libelleCat() dans phenobac.html passe
        le code de l'antibiotique. C'est un contrôle de SOURCE, et il est ici
        parce que le défaut qu'il attrape est muet : un appel qui l'oublie
        rend « I » là où ses voisins rendent « SDD », et le compte rendu se
        contredit lui-même d'une ligne à l'autre. Onze appels existaient ;
        trois seulement avaient le code sous la main au premier jet.

   Avec Node :             node outils/essai-nuances.js
   Sans Node, sur macOS :  /System/Library/Frameworks/JavaScriptCore.framework/\
                             Versions/A/Helpers/jsc outils/essai-nuances.js

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
  verif(C.indexOf("ns") === C.length - 1 && C.indexOf("sdd") === C.length - 2,
        "« sdd » puis « ns » ferment la liste des colonnes — les insérer "
        + "ailleurs décalerait chaque valeur des lignes existantes, en silence");
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

  // NS : le CLSI ne fixe qu'un seuil de sensibilité. La ligne porte S = R,
  // et tout ce qui dépasse est « R » en interne, « NS » au rendu.
  E.BP_CLSI.entero.CRO = { S: 1, R: 1, ns: true };

  var r = lire("mic", { AMP: "16", GEN: "4" });
  verif(r.categories.AMP === "I",
        "la bande intermédiaire reste « I » dans categories — le moteur garde "
        + "son alphabet S / I / R");
  verif((r.nuances || {}).AMP === "SDD",
        "… et la nuance le nomme : c'est elle qui porte le nom, pas la catégorie");
  verif(!(r.nuances || {}).GEN,
        "un couple SANS drapeau n'y figure pas, à bande intermédiaire égale");

  var s = lire("mic", { AMP: "2" });
  verif(s.categories.AMP === "S" && !(s.nuances || {}).AMP,
        "sur la bande sensible, aucun SDD — le drapeau ne qualifie que "
        + "l'intermédiaire");

  var t = lire("mic", { AMP: "64" });
  verif(t.categories.AMP === "R" && !(t.nuances || {}).AMP,
        "sur la bande résistante non plus");

  // LE POINT QUI COMPTE : le drapeau est porté par la méthode.
  var d = lire("diam", { AMP: "16" });
  verif(d.categories.AMP === "I",
        "par disque, le même couple tombe bien dans la bande intermédiaire");
  verif(!(d.nuances || {}).AMP,
        "… et n'est PAS SDD : le seuil de diamètre ne porte pas le drapeau. "
        + "En table 2D du M100, SDD existe pour la CMI et pas pour le disque");

  // Pas de reliquat d'une lecture à l'autre.
  var u = lire("mic", { GEN: "4" });
  verif(!(u.nuances || {}).AMP,
        "la table des nuances est remplacée entre deux lectures — un "
        + "reliquat rendrait « SDD » une molécule de la lecture précédente");

  // ---- NS ----
  var ns1 = lire("mic", { CRO: "0.5" });
  verif(ns1.categories.CRO === "S" && !(ns1.nuances || {}).CRO,
        "sous le seuil de sensibilité, un couple NS est simplement « S »");
  var ns2 = lire("mic", { CRO: "8" });
  verif(ns2.categories.CRO === "R",
        "au-dessus, le moteur retient « R » — la direction prudente : on ne "
        + "présente jamais comme utilisable ce que le document ne dit pas tel");
  verif((ns2.nuances || {}).CRO === "NS",
        "… et la nuance dit « NS », parce que le CLSI ne dit pas « résistant »");
  var ns3 = lire("mic", { GEN: "16" });
  verif(ns3.categories.GEN === "R" && !(ns3.nuances || {}).GEN,
        "un vrai « R », lui, n'est pas nuancé : NS ne déteint pas sur ses voisins");
  delete E.BP_CLSI.entero.CRO;

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
    if (!/\bnuances\s*:/.test(m[0])) sans.push(m[0].replace(/\s+/g, " ").slice(0, 70));
  }
  verif(total >= 2, "les deux chemins d'interprétation sont vus (" + total + ")");
  verif(sans.length === 0,
        "chaque objet de résultat transporte les nuances avec ses catégories"
        + (sans.length ? " — sans : " + sans.join(" | ") : ""));

  var aff = src.match(/\bNUANCES\s*=/g) || [];
  verif(aff.length === 2,
        "NUANCES n'est affectée qu'une fois, après les deux branches "
        + "(plus sa déclaration) — trouvé " + aff.length);
})();

/* ---------- 3 ter. le germe non transcrit se dit AVANT la saisie --------
   Le moteur distingue « non transcrit » de « non chiffré », mais seulement
   quand une mesure lui est soumise. Devant un panel vierge, l'aide de
   chaque ligne disait « pas de seuil défini » — et c'est l'écran que le
   laboratoire regarde en premier. Les deux aides doivent donc consulter la
   couverture du groupe avant tout le reste. */
(function () {
  var src = lireFichier("phenobac.html");
  verif(/function indiceNonTranscrit\s*\(/.test(src),
        "l'aide de saisie sait dire qu'un germe n'est pas transcrit");
  ["bpHint", "dzHint"].forEach(function (f) {
    var m = src.match(new RegExp("function " + f + "\\s*\\([^)]*\\)\\s*\\{([\\s\\S]{0,160})"));
    verif(!!m && /indiceNonTranscrit/.test(m[1]),
          f + "() la consulte, et dès sa première ligne");
  });
})();

/* ---------- 4. le catalogue de langue porte les deux langues ---------- */
(function () {
  var src = lireFichier("langue.js");
  verif(/"cat\.I\.clsi"/.test(src), "« cat.I.clsi » existe dans le catalogue");
  verif(/"cat\.R\.clsi\.ns"/.test(src), "« cat.R.clsi.ns » aussi");
  verif(/Nonsusceptible/.test(src),
        "et le terme anglais de NS est celui du CLSI");
  var m = src.match(/"cat\.I\.clsi":\s*\{([^}]*)\}/);
  verif(!!m && /fr:/.test(m[1]) && /en:/.test(m[1]),
        "… et il porte le français ET l'anglais");
  verif(/Susceptible-dose dependent/.test(src),
        "le terme anglais est celui du CLSI, pas une traduction maison");
})();

dire("\n" + (KO ? KO + " échec(s) sur " + (OK + KO) + " vérifications."
                : OK + " vérifications, les nuances se nomment où il faut et "
                  + "nulle part ailleurs."));
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
