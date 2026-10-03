/* ============================================================
   essai-banque.js — la banque d'entraînement dit-elle la même chose
   que le moteur ?

   Un cas d'entraînement dont la réponse ne correspond pas à ce que
   l'application répond enseigne le contraire de ce qu'elle fait : le
   stagiaire apprend un phénotype, puis saisit le même antibiogramme
   dans l'onglet Interprétation et lit autre chose. C'est pire
   qu'absence de formation.

   Deux lectures sont admises :
     - la réponse est le TITRE du phénotype rendu par le moteur ;
     - la réponse porte sur un AXE SECONDAIRE (MLSb, haut niveau de
       résistance aux aminosides, incohérence avec une résistance
       naturelle) — elle doit alors être appuyée par une alerte ou une
       règle du moteur.

   La comparaison tronque les mots à six caractères : « résistances »
   et « résistance », « constitutif » et « constitutive » désignent la
   même chose, et un contrôle qui s'y arrêterait ne signalerait que du
   bruit.

   Avec Node :            node outils/essai-banque.js
   Sans Node, sur macOS : jsc outils/essai-banque.js
   À lancer depuis la racine du dépôt.
   ============================================================ */

var E, QUIZ_BANK, LIBELLES, CTX_LIBELLE, OK = 0, KO = 0;

function dire(s) { (typeof console === "object" ? console.log : print)(s); }

/* ---------- chargement : moteur et banque ---------- */
function lire(chemin) {
  if (typeof readFile === "function") return readFile(chemin);
  return require("fs").readFileSync(chemin, "utf8");
}

(function charger() {
  // Le moteur vit dans moteur.js, chargé aussi par le navigateur : le banc
  // éprouve l'objet que le laboratoire exécute, sans simuler Node.
  if (typeof require === "function" && typeof module === "object" && module.exports) {
    E = require("../moteur");
  } else {
    // La base d'abord : le moteur y reconstruit ses tables au chargement.
    var modB = { exports: {} };
    (new Function("module", "exports", lire("base-connaissances.js")))(modB, modB.exports);
    var mod = { exports: {} };
    (new Function("module", "exports", "require",
                  lire("moteur.js")))(mod, mod.exports, function () { return modB.exports; });
    E = mod.exports;
  }

  // La banque vit dans la page : on en extrait le littéral plutôt que d'en
  // tenir une copie, qui divergerait au premier ajout de cas.
  var page = lire("phenobac.html");
  var i = page.indexOf("const QUIZ_BANK");
  var j = page.indexOf("[", i), prof = 0, fin = -1;
  for (var k = j; k < page.length; k++) {
    if (page[k] === "[") prof++;
    else if (page[k] === "]") { prof--; if (prof === 0) { fin = k; break; } }
  }
  QUIZ_BANK = (new Function("return " + page.slice(j, fin + 1)))();

  // Libellés des tests complémentaires : la carte les affiche en pastilles.
  // Sans eux, une clé de contexte s'afficherait sous son nom de code.
  var L = page.indexOf("const CTX_LIBELLE = {");
  CTX_LIBELLE = (new Function("return " + page.slice(page.indexOf("{", L),
                              page.indexOf("};", L) + 1)))();

  // Libellés d'espèce : la carte du quiz les affiche AU-DESSUS de la question.
  var o = page.indexOf("const ORG = {");
  var bloc = page.slice(o, page.indexOf("\nfunction panelComplet", o));
  var re = /\n  (\w+):\{\s*label:"([^"]+)"/g, m;
  LIBELLES = {};
  while ((m = re.exec(bloc))) LIBELLES[m[1]] = m[2];
})();

/* ---------- comparaison indulgente aux accords ---------- */
function racines(phrase) {
  // On ne tronque PAS à la première parenthèse : « ERV (résistance aux
  // glycopeptides) » n'y laisserait qu'un sigle de trois lettres, écarté par
  // le filtre de longueur, et le contrôle passerait à côté de tout.
  return phrase.toLowerCase()
    .replace(/[()—–,:;.…]/g, " ")
    .split(/[\s'’]+/)
    .filter(function (m) { return m.length > 4; })
    .map(function (m) { return m.slice(0, 6); });
}

function appuyePar(texte, reponse) {
  var t = texte.toLowerCase();
  var r = racines(reponse);
  if (!r.length) return false;
  return r.every(function (m) { return t.indexOf(m) !== -1; });
}

/* ---------- contrôles ---------- */
var exacts = 0, secondaires = 0;

QUIZ_BANK.forEach(function (c, i) {
  var n = i + 1;

  // Structure : sans cela le QCM est injouable.
  if (c.options.indexOf(c.answer) === -1) {
    KO++; dire("  ÉCHEC  cas " + n + " : la bonne réponse ne figure pas dans les propositions");
  } else if (c.options.length !== c.options.filter(function (o, k) { return c.options.indexOf(o) === k; }).length) {
    KO++; dire("  ÉCHEC  cas " + n + " : une proposition est en double");
  } else if (c.q2 && c.q2.options.indexOf(c.q2.answer) === -1) {
    KO++; dire("  ÉCHEC  cas " + n + " : la réponse de la question de suivi est absente de ses propositions");
  } else {
    OK++;
  }

  // La carte affiche le nom de l'espèce juste au-dessus de la question. Si la
  // réponse EST ce nom, l'exercice se résout en lisant l'énoncé : le stagiaire
  // coche juste sans avoir rien interprété. Le cas doit alors porter sa propre
  // question, par le champ « q ».
  var affiche = (LIBELLES[c.org] || "").trim();
  if (affiche && affiche === String(c.answer).trim()) {
    KO++; dire("  ÉCHEC  cas " + n + " (" + c.org + ") : la réponse « " + c.answer +
               " » est le nom affiché dans l'énoncé — ajoutez un champ « q »");
  } else {
    OK++;
  }

  // Fond : le moteur dit-il la même chose ?
  var out = E.runInterpretation({ organism: c.org, mode: "sir", results: c.res, ctx: c.ctx || {}, ref: "eucast" });
  if (!out || !out.interpretation) {
    KO++; dire("  ÉCHEC  cas " + n + " (" + c.org + ") : le moteur n'a rien rendu"); return;
  }
  var A = out.interpretation;
  if (A.name === c.answer) { OK++; exacts++; return; }

  // Le mécanisme compte autant que le titre : c'est la phrase que le panneau
  // affiche juste en dessous, et souvent là que le phénotype est nommé en
  // toutes lettres (« oxacillinases », « perte de la porine OprD »…).
  var appui = A.name + " " + (A.mech || "") + " "
    + (A.alerts || []).map(function (a) { return a.txt; }).join(" ") + " "
    + (A.rules || []).map(function (r) { return r.txt; }).join(" ");
  if (appuyePar(appui, c.answer)) { OK++; secondaires++; return; }

  KO++;
  dire("  ÉCHEC  cas " + n + " (" + c.org + ") : réponse et moteur divergent");
  dire("         banque : " + c.answer);
  dire("         moteur : " + A.name);
});

/* ------------------------------------------------------------
   Le cas est-il RÉSOLUBLE ?

   Un cas dont la réponse énonce le résultat d'un test complémentaire —
   « BLPAR (β-lactamase +) », « BLNAR », « carbapénémase confirmée » — n'est
   résoluble que si ce résultat figure sur la carte. Quatre cas demandaient
   de séparer une souche productrice de β-lactamase d'une souche à PLP
   modifiée sans montrer la nitrocéfine : on ne pouvait y répondre qu'au
   hasard, et rien ne le signalait.

   Le contrôle porte sur l'ÉNONCÉ de la réponse, pas sur le mécanisme : une
   « suspicion de carbapénémase » se lit sur l'antibiogramme et n'exige
   aucune confirmation — c'est justement ce que le mot « suspicion » dit.
   ------------------------------------------------------------ */
dire("\nLes tests complémentaires sont-ils montrés ?");
var EXIGE = [
  { motif: /β-lactamase\s*[+\-−]|\bBLPAR\b|\bBLNAR\b|\bPPNG\b|\bBRO\b/i,
    cle: "blac", quoi: "le test à la β-lactamase (nitrocéfine)" },
  { motif: /carbapénémase\s+confirmée/i,
    cle: "carba", quoi: "la confirmation de carbapénémase" },
  { motif: /\bBLSE\b/i, cle: "syn", quoi: "la synergie C3G + ac. clavulanique" },
  { motif: /MLS|inductible|constitutif/i, cle: "dtest", quoi: "le D-test" }
];

function verifierResoluble(c, n, reponse, ctx) {
  ctx = ctx || {};
  var manque = [];
  EXIGE.forEach(function (e) {
    if (!e.motif.test(String(reponse))) return;
    var v = ctx[e.cle];
    if (v === undefined || v === null || v === "" || v === "Non fait")
      manque.push(e.quoi);
  });
  if (manque.length) {
    KO++;
    dire("  ÉCHEC  cas " + n + " (" + c.org + ") : la réponse « " + reponse
         + " » suppose " + manque.join(" et ") + ", que la carte ne montre pas");
  } else { OK++; }

  // Et chaque clé de contexte doit avoir un libellé lisible, sinon la
  // pastille afficherait un nom de code.
  Object.keys(ctx).forEach(function (k) {
    if (k === "mening" || k === "urin" || CTX_LIBELLE[k]) { OK++; return; }
    KO++;
    dire("  ÉCHEC  cas " + n + " (" + c.org + ") : contexte « " + k
         + " » sans libellé — la pastille afficherait le nom de code");
  });
}

QUIZ_BANK.forEach(function (c, i) {
  var n = i + 1;
  if (c.kind === "ident") return;                       // pas d'antibiogramme
  if (c.kind === "combo") return verifierResoluble(c.interp, n, c.interp.answer, c.interp.ctx);
  verifierResoluble(c, n, c.answer, c.ctx);
  if (c.q2) verifierResoluble(c, n, c.q2.answer, c.ctx);
});

dire("\n" + QUIZ_BANK.length + " cas dans la banque — " + exacts + " sur le titre du phénotype, "
     + secondaires + " sur un axe secondaire appuyé par le moteur.");
dire(KO ? KO + " échec(s) sur " + (OK + KO) + " contrôles."
        : OK + " contrôles, la banque et le moteur concordent.");
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
