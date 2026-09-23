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

var E, QUIZ_BANK, OK = 0, KO = 0;

function dire(s) { (typeof console === "object" ? console.log : print)(s); }

/* ---------- chargement : moteur et banque ---------- */
function lire(chemin) {
  if (typeof readFile === "function") return readFile(chemin);
  return require("fs").readFileSync(chemin, "utf8");
}

(function charger() {
  var faux = function (n) {
    if (n === "crypto") return {
      createHmac: function () { return { update: function () { return this; }, digest: function () { return ""; } }; },
      timingSafeEqual: function () { return false; }
    };
    if (n.indexOf("revocation") !== -1) return { isRevoked: function () { return false; } };
    if (n.indexOf("http") !== -1) return { cors: function () { return {}; } };
    return {};
  };
  var mod = { exports: {} };
  (new Function("module", "exports", "process", "require",
    lire("netlify/functions/premium-interpret.js")))(mod, mod.exports, { env: {} }, faux);
  E = mod.exports._engine;

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

dire("\n" + QUIZ_BANK.length + " cas dans la banque — " + exacts + " sur le titre du phénotype, "
     + secondaires + " sur un axe secondaire appuyé par le moteur.");
dire(KO ? KO + " échec(s) sur " + (OK + KO) + " contrôles."
        : OK + " contrôles, la banque et le moteur concordent.");
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
