/* ============================================================
   essai-contexte.js — une question posée sert-elle, et ce qui sert
   est-il demandé ?

   LE DÉFAUT QUI A FAIT NAÎTRE CE BANC, trouvé le 2026-11-01.

   Le CA-SFM exige de rechercher la β-lactamase de Pasteurella par un test
   chromogénique avant de rendre la pénicilline G ou une aminopénicilline
   sensible (p113, note 1). Le moteur lisait déjà « c.blac » pour Moraxella,
   Haemophilus et le gonocoque ; la page, elle, déclarait « ctx:[] » pour
   Pasteurella — AUCUNE question. Une règle branchée là serait restée
   inatteignable pour toujours : le contexte arrive vide, la condition est
   fausse, et il n'y a rien à voir. Aucun contrôle ne le disait.

   C'est la forme la plus discrète du défaut qui revient dans tout ce dépôt :
   UNE CHOSE JUSTE DÉCLARÉE À UN SEUL ENDROIT QUAND IL EN FALLAIT DEUX. Le
   moteur sait lire la réponse, la page ne sait pas poser la question, et les
   deux fichiers sont corrects pris séparément.

   LE CONTRÔLE EST UN DIFFÉRENTIEL, et non une lecture du code : pour chaque
   espèce et chaque question, on interprète le même antibiogramme avec la
   réponse et sans elle, et l'on regarde si le moteur a bougé. On tient alors
   deux ensembles :

       RÉPOND   les questions auxquelles le moteur réagit pour cette espèce ;
       OFFERT   les questions que la page pose pour cette espèce.

   Et l'on exige qu'ils soient ÉGAUX. Les deux écarts sont des défauts, de
   sens opposé :

       répond \ offert   le moteur attend une réponse que personne ne peut
                         donner — du code mort, qui a l'air vivant ;
       offert \ répond   la page pose une question qui ne change rien — on
                         fait travailler le technicien pour rien, et la
                         prochaine fois il ne répondra plus.

   Avec Node :             node outils/essai-contexte.js
   Sans Node, sur macOS :  …/jsc outils/essai-contexte.js

   À lancer depuis la racine du dépôt.
   ============================================================ */

var E, KO = 0, OK = 0;

function dire(s) { (typeof console === "object" ? console.log : print)(s); }
function verif(ok, txt) { ok ? OK++ : KO++; dire((ok ? "  ok   " : "  ÉCHEC") + "  " + txt); }

function lire(chemin) {
  if (typeof readFile === "function") return readFile(chemin);
  return require("fs").readFileSync(chemin, "utf8");
}

if (typeof require === "function" && typeof module === "object" && module.exports) {
  E = require("../moteur");
} else {
  var ch = function (f) {
    var m = { exports: {} };
    (new Function("module", "exports", lire(f)))(m, m.exports);
    return m.exports;
  };
  var mp = ch("posologie.js"), mb = ch("base-connaissances.js"),
      mr = ch("rendu-cible.js"), mv = ch("voies.js");
  var mm = { exports: {} };
  /* LE RÉSOLVEUR LÈVE SUR UN NOM QU'IL NE CONNAÎT PAS. Treize bancs de ce
     dépôt rendaient la base de connaissances pour tout fichier inconnu : le
     moteur recevait la base en guise de posologies et se taisait. */
  var resoudre = function (nom) {
    if (/posologie/.test(nom)) return mp;
    if (/voies/.test(nom)) return mv;
    if (/rendu-cible/.test(nom)) return mr;
    if (/base-connaissances/.test(nom)) return mb;
    throw new Error("le banc ne sait pas charger " + nom
      + " : ajoutez-le ici plutôt que de lui substituer la base");
  };
  (new Function("module", "exports", "require", lire("moteur.js")))(
    mm, mm.exports, resoudre);
  E = mm.exports;
}

/* Une sérialisation stable, QUI LÈVE SUR UN CYCLE au lieu de l'ignorer. Un
   comparateur qui avale discrètement une partie de l'objet rendrait
   « identique » deux interprétations différentes — et ce banc ne conclut que
   par des comparaisons. */
function geler(x, vus, chemin) {
  vus = vus || [];
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  var t = typeof x;
  if (t === "string") return JSON.stringify(x);
  if (t === "number" || t === "boolean") return String(x);
  if (t === "function") return "fn";
  if (vus.indexOf(x) >= 0) throw new Error("cycle dans l'interprétation, en " + chemin);
  vus = vus.concat([x]);
  if (Object.prototype.toString.call(x) === "[object Array]") {
    var a = [];
    for (var i = 0; i < x.length; i++) a.push(geler(x[i], vus, chemin + "[" + i + "]"));
    return "[" + a.join(",") + "]";
  }
  var cles = Object.keys(x).sort(), o = [];
  for (var j = 0; j < cles.length; j++)
    o.push(JSON.stringify(cles[j]) + ":" + geler(x[cles[j]], vus, chemin + "." + cles[j]));
  return "{" + o.join(",") + "}";
}

/* ---------- 0. LE COMPARATEUR SAIT-IL REFUSER ?
   Posé en premier : tout le banc repose sur lui, et un comparateur qui rend
   toujours « identique » le ferait passer au vert en ayant tout approuvé. */
dire("\nLe comparateur sait-il refuser ?");
verif(geler({ a: 1, b: [1, 2] }) === geler({ b: [1, 2], a: 1 }),
      "l'ordre des clés ne compte pas");
verif(geler({ a: 1 }) !== geler({ a: 2 }), "une valeur qui change se voit");
verif(geler({ a: undefined }) !== geler({}),
      "une clé absente ne se confond pas avec une clé à « undefined » : "
      + "c'est la différence entre « question non posée » et « question sans réponse »");
(function () {
  var a = { x: 1 }; a.moi = a, leve = false;
  try { geler(a); } catch (e) { leve = /cycle/.test(String(e)); }
  verif(leve, "un cycle lève au lieu d'être avalé");
})();

/* ---------- 1. CE QUE LA PAGE POSE ----------

   Lu dans phenobac.html, et NON recopié ici : une liste écrite à la main
   dans le banc dirait ce que le banc croit, pas ce que le laboratoire voit à
   l'écran. C'est précisément l'erreur que ce fichier existe pour trouver. */
dire("\nCe que la page pose, espèce par espèce");
var page = lire("phenobac.html");

function trancher(nom) {
  var a = page.indexOf("const " + nom + " = {");
  if (a < 0) throw new Error(nom + " introuvable dans phenobac.html");
  var f = page.indexOf("\n};", a);
  if (f < 0) throw new Error("fin de " + nom + " introuvable dans phenobac.html");
  return page.slice(a, f);
}

var OFFERT = {};          // espèce -> { clé: [options déclarées] }
(function () {
  var bloc = trancher("PRESENTATION");
  var re = /\n  ([a-zA-Z0-9_]+):\{/g, m;
  var bornes = [];
  while ((m = re.exec(bloc))) bornes.push([m[1], m.index + m[0].length]);
  for (var i = 0; i < bornes.length; i++) {
    var nom = bornes[i][0];
    var corps = bloc.slice(bornes[i][1], i + 1 < bornes.length ? bornes[i + 1][1] : bloc.length);
    var q = /\{\s*id:"([a-zA-Z0-9_]+)"/g, n, dec = {};
    while ((n = q.exec(corps))) {
      // Les options suivent l'identifiant, dans le même objet littéral.
      var apres = corps.slice(n.index, n.index + 400);
      var o = /opts:\[([^\]]*)\]/.exec(apres);
      var vals = o ? o[1].match(/"([^"]*)"/g) || [] : [];
      dec[n[1]] = vals.map(function (v) { return v.slice(1, -1); });
    }
    if (Object.keys(dec).length) OFFERT[nom] = dec;
  }
})();
var especesOffrant = Object.keys(OFFERT);
verif(especesOffrant.length >= 10,
      especesOffrant.length + " espèces déclarent au moins une question propre");

/* Le vocabulaire des questions PROPRES à une espèce, tel que la page le
   compose — et non tel que le banc l'imagine. */
var VOCABULAIRE = {};
especesOffrant.forEach(function (id) {
  Object.keys(OFFERT[id]).forEach(function (k) {
    VOCABULAIRE[k] = (VOCABULAIRE[k] || []).concat(
      OFFERT[id][k].filter(function (v) { return VOCABULAIRE[k] ? VOCABULAIRE[k].indexOf(v) < 0 : true; }));
  });
});
var cles = Object.keys(VOCABULAIRE).sort();
dire("  (" + cles.map(function (k) { return k + " : " + VOCABULAIRE[k].join("/"); }).join(" · ") + ")");

/* Les questions que renderCtx() ajoute à TOUTE espèce, en plus des siennes :
   elles ne peuvent donc jamais manquer, et n'ont pas à figurer dans le ctx
   d'un germe. La liste se lit dans la page, à côté du ctx propre. */
var GLOBALES = {};
(function () {
  var a = page.indexOf("function renderCtx()");
  var corps = page.slice(a, a + 1200);
  ["questionMeninge", "questionUrinaire", "questionCarbapenemase", "questionsRenduCible"]
    .forEach(function (f) {
      if (corps.indexOf(f + "(") < 0) return;
      var d = page.indexOf("function " + f + "()");
      if (d < 0) return;
      var q = /id:\s*"([a-zA-Z0-9_]+)"/g, m, t = page.slice(d, d + 2500);
      while ((m = q.exec(t))) GLOBALES[m[1]] = f;
    });
})();
verif(Object.keys(GLOBALES).length >= 3,
      "renderCtx() ajoute " + Object.keys(GLOBALES).sort().join(", ")
      + " à toute espèce : " + Object.keys(GLOBALES).sort().map(function (k) {
        return k + " par " + GLOBALES[k] + "()"; }).join(", "));

/* ---------- 2. LE PANEL DE CHAQUE ESPÈCE ----------
   Le différentiel doit saisir quelque chose : une interprétation sans aucun
   antibiotique ne réagirait à rien, et le banc comparerait partout deux
   silences — vrai, et vide. On remplit donc le panel que la page affiche. */
var PANEL = {};
(function () {
  var bloc = trancher("PRESENTATION");
  var re = /\n  ([a-zA-Z0-9_]+):\{/g, m, bornes = [];
  while ((m = re.exec(bloc))) bornes.push([m[1], m.index + m[0].length]);
  for (var i = 0; i < bornes.length; i++) {
    var corps = bloc.slice(bornes[i][1], i + 1 < bornes.length ? bornes[i + 1][1] : bloc.length);
    var p = /abx:\[([^\]]*)\]/g, n, codes = [];
    while ((n = p.exec(corps)))
      (n[1].match(/"([^"]*)"/g) || []).forEach(function (c) { codes.push(c.slice(1, -1)); });
    if (codes.length) PANEL[bornes[i][0]] = codes;
  }
})();
verif(Object.keys(PANEL).length >= 40,
      Object.keys(PANEL).length + " espèces déclarent un panel d'antibiotiques");

/* ---------- 3. LE DIFFÉRENTIEL ----------

   UN SEUL PROFIL NE SUFFIT PAS, et la première version du banc l'a appris en
   accusant vingt-deux questions justes.

   Elle interprétait un antibiogramme TOUT SENSIBLE. Or une question de
   contexte ne sert, par construction, qu'en présence d'une résistance : le
   D-test ne se lit que si l'érythromycine est atteinte et la clindamycine
   conservée, la synergie au clavulanate que si une C3G est atteinte. Sur un
   profil tout sensible, le moteur ne regarde ni l'une ni l'autre — et il a
   raison. Le banc concluait « question posée pour rien » sur vingt-deux
   couples espèce/question parfaitement en place : un contrôle qui accuse à
   tort est pire qu'un contrôle absent, parce qu'on finit par le désarmer.

   On balaie donc une FAMILLE de profils, choisie pour qu'une résistance
   isolée se présente au moins une fois sur chaque molécule du panel — c'est
   la forme sous laquelle les mécanismes se lisent.  */
dire("\nÀ quelles questions le moteur répond-il, espèce par espèce ?");

function profils(id) {
  var codes = PANEL[id] || [], p = [];
  function tous(v) { var r = {}; codes.forEach(function (k) { r[k] = v; }); return r; }
  p.push(tous("S")); p.push(tous("R")); p.push(tous("I"));
  codes.forEach(function (k) {
    var a = tous("S"); a[k] = "R"; p.push(a);     // une résistance isolée
    var b = tous("R"); b[k] = "S"; p.push(b);     // une sensibilité isolée
  });
  return p;
}

function interpreter(id, ref, r, ctx) {
  return E.runInterpretation({ organism: id, ref: ref, mode: "sir",
                               results: r, ctx: ctx }).interpretation;
}

var REFS = ["eucast", "casfm"];
var repond = {}, essais = 0, bouge = 0;
Object.keys(E.ORG).forEach(function (id) {
  if (!PANEL[id]) return;                 // espèce sans panel : rien à saisir
  repond[id] = {};
  var jeux = profils(id);
  cles.forEach(function (k) {
    for (var ir = 0; ir < REFS.length; ir++) {
      for (var ij = 0; ij < jeux.length; ij++) {
        var temoin = geler(interpreter(id, REFS[ir], jeux[ij], {}));
        for (var iv = 0; iv < VOCABULAIRE[k].length; iv++) {
          var c = {}; c[k] = VOCABULAIRE[k][iv];
          essais++;
          if (geler(interpreter(id, REFS[ir], jeux[ij], c)) !== temoin) {
            repond[id][k] = true; bouge++;
            return;                        // cette question sert : au suivant
          }
        }
      }
    }
  });
});
verif(essais > 5000, essais + " interprétations comparées à leur témoin");
verif(bouge > 0, bouge + " questions trouvées actives — le différentiel n'a pas "
      + "comparé partout deux silences");

/* ---------- 4. LES DEUX ÉCARTS ----------
   Nulle table d'exceptions ici, et c'est voulu : une question propre à une
   espèce qui ne servirait à rien, ou une réponse attendue qu'on ne peut pas
   donner, n'a pas de cas légitime. Le jour où il y en aura un, il s'écrira
   avec son motif — et pas avant. */
dire("\nCe que le moteur attend et ce que la page pose : le compte doit tomber juste");
var muettes = [], sourdes = [];
Object.keys(repond).forEach(function (id) {
  var off = OFFERT[id] || {};
  Object.keys(repond[id]).forEach(function (k) {
    if (!off[k] && !GLOBALES[k]) muettes.push(id + "." + k);
  });
  Object.keys(off).forEach(function (k) {
    if (GLOBALES[k]) return;              // posée de toute façon
    if (!repond[id][k]) sourdes.push(id + "." + k);
  });
});
verif(muettes.length === 0,
      muettes.length === 0
        ? "aucune espèce n'attend une réponse que la page ne demande pas"
        : "LE MOTEUR LIT UNE RÉPONSE QUE PERSONNE NE PEUT DONNER — code mort : "
          + muettes.join(", "));
verif(sourdes.length === 0,
      sourdes.length === 0
        ? "aucune question propre ne reste sans effet sur l'interprétation"
        : "QUESTION POSÉE POUR RIEN, le technicien travaille en vain : "
          + sourdes.join(", "));

/* ---------- 5. LE BANC SAIT-IL ENCORE REFUSER ? ----------
   Un contrôle de concordance passe au vert aussi bien quand tout concorde
   que quand il ne regarde plus rien. On lui retire donc une question connue
   et l'on exige qu'il crie. */
dire("\nLe banc sait-il encore refuser ?");
(function () {
  var temoin = Object.keys(OFFERT).filter(function (id) {
    return OFFERT[id].blac && repond[id] && repond[id].blac; })[0];
  verif(!!temoin, "au moins une espèce répond à « blac » et se le voit demander"
    + (temoin ? " (" + temoin + ")" : ""));
  if (!temoin) return;
  var faux = [];
  var off = {};                            // la page amputée de cette question
  Object.keys(OFFERT[temoin]).forEach(function (k) {
    if (k !== "blac") off[k] = OFFERT[temoin][k]; });
  Object.keys(repond[temoin]).forEach(function (k) {
    if (!off[k] && !GLOBALES[k]) faux.push(temoin + "." + k); });
  verif(faux.length > 0,
        "si l'on retire « blac » du ctx de " + temoin + ", le contrôle le "
        + "signale (" + faux.join(", ") + ") — il regarde donc bien");
})();

dire("\n" + OK + " vérifications passées, " + KO + " échec(s).");
if (KO) { if (typeof process === "object") process.exit(1); throw new Error(KO + " échec(s)"); }
