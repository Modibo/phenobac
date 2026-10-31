/* ============================================================
   essai-voies.js — la note « selon la voie » change-t-elle une catégorie ?

   CE BANC PORTE UNE DÉCISION, ET C'EST POUR CELA QU'IL EXISTE

   Le CA-SFM donne parfois DEUX concentrations critiques pour une même
   molécule au même site, séparées par la voie d'administration :

       Amoxicilline iv       S ≤ 1     R > 2      (streptocoques, p85)
       Amoxicilline per os   S ≤ 0,5   R > 1

   Le biologiste a tranché le 2026-10-31, en connaissance de l'alternative :
   PhénoBac MONTRE les deux seuils et ne catégorise pas avec. Demander la voie
   au prescripteur pour en déduire une catégorie aurait fait de l'application
   l'auteur d'un choix thérapeutique, sur une donnée qu'un compte rendu
   d'antibiogramme ne porte pas toujours.

   Une décision pareille se trahit par son implémentation, pas par son énoncé.
   Il suffirait qu'un jour quelqu'un branche VOIES sur getBP « puisque la
   valeur est là » pour que la catégorie se mette à dépendre d'une voie que
   personne n'a déclarée — sans qu'aucun autre contrôle ne s'en aperçoive, la
   valeur étant juste et la table officielle.

   LE CONTRÔLE CENTRAL EST DONC UN DIFFÉRENTIEL : on interprète toutes les
   espèces sous tous les profils AVEC la table, puis SANS elle, et l'on exige
   que les deux interprétations soient identiques champ pour champ, à la seule
   exception du champ « voies » lui-même. Vider la table est possible parce
   que le moteur la lit à chaque appel ; c'est un interrupteur, et c'est lui
   qui donne au banc son pouvoir de refus.

   Un différentiel ne vaut cependant rien s'il compare deux fois le même
   silence : si la note ne paraissait jamais, « rien n'a changé » serait vrai
   et vide. Le banc exige donc AUSSI que chacun des couples de la table soit
   atteint par au moins une espèce, et que la comparaison ait bien tourné au
   moins une fois avec la note présente.

   Avec Node :             node outils/essai-voies.js
   Sans Node, sur macOS :  …/jsc outils/essai-voies.js
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
  var mp = ch("posologie.js"), mb = ch("base-connaissances.js"),
      mr = ch("rendu-cible.js"), mv = ch("voies.js");
  var mm = { exports: {} };
  var resoudre = function (nom) {
    if (/posologie/.test(nom)) return mp;
    if (/voies/.test(nom)) return mv;
    if (/rendu-cible/.test(nom)) return mr;
    if (/base-connaissances/.test(nom)) return mb;
    throw new Error("le banc ne sait pas charger " + nom
      + " : ajoutez-le ici plutôt que de lui substituer la base");
  };
  (new Function("module", "exports", "require", readFile("moteur.js")))(
    mm, mm.exports, resoudre);
  E = mm.exports;
}

function dire(s) { (typeof console === "object" ? console.log : print)(s); }
function verif(ok, txt) { ok ? OK++ : KO++; dire((ok ? "  ok   " : "  ÉCHEC") + "  " + txt); }

/* Une sérialisation stable, QUI LÈVE SUR UN CYCLE au lieu de l'ignorer. Un
   comparateur qui avale discrètement une partie de l'objet rendrait « égal »
   deux interprétations différentes — exactement le verdict que ce banc ne
   doit jamais rendre à tort. */
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

function gelerSauf(a, sauf) {
  var c = {};
  for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k) && k !== sauf) c[k] = a[k];
  return geler(c, [], "");
}

/* ---------- 0. LE COMPARATEUR SAIT-IL VOIR UNE DIFFÉRENCE ?
   Posé en premier, et volontairement trivial : tout ce qui suit s'appuie sur
   lui, et un comparateur qui rend toujours « égal » ferait passer ce banc au
   vert en ayant tout approuvé. */
dire("\nLe comparateur sait-il refuser ?");
verif(geler({ a: 1, b: [1, 2] }) === geler({ b: [1, 2], a: 1 }),
      "l'ordre des clés ne compte pas — sinon le banc crierait au moindre remaniement");
verif(geler({ a: 1 }) !== geler({ a: 2 }), "une valeur qui change se voit");
verif(geler({ a: [1, 2] }) !== geler({ a: [2, 1] }), "un ordre de tableau qui change se voit");
verif(geler({ a: null }) !== geler({ a: 0 }),
      "« null » ne se confond pas avec zéro : c'est toute la différence entre "
      + "« aucune catégorie sensible » et « un seuil de zéro »");
(function () {
  var a = { x: 1 }; a.moi = a;
  var leve = false;
  try { geler(a); } catch (e) { leve = /cycle/.test(String(e)); }
  verif(leve, "un cycle lève au lieu d'être avalé");
})();

/* ---------- 1. LA TABLE ---------- */
dire("\nLa table des voies");
var VOIES = E.VOIES || {};
var couples = Object.keys(VOIES);
verif(!!E.VOIES_SOURCE, "voies.js s'est chargé et se nomme : " + (E.VOIES_SOURCE || "AUCUNE SOURCE"));
verif(couples.length >= 5, couples.length + " couples (groupe, molécule, site) à voies multiples");

/* Les groupes que la table nomme doivent exister dans le moteur. Un groupe
   mal orthographié ne lèverait rien : la note ne paraîtrait simplement
   jamais, et le fichier resterait là, juste et inutile. */
var groupesMoteur = {};
Object.keys(E.ORG).forEach(function (id) {
  if (E.ORG[id].bpGroup) groupesMoteur[E.ORG[id].bpGroup] = true;
});
var mauvais = [], malformes = [];
couples.forEach(function (c) {
  var p = c.split(":");
  if (p.length !== 3) { malformes.push(c); return; }
  if (!groupesMoteur[p[0]]) mauvais.push(c);
  if (!E.ABXNAME[p[1]]) mauvais.push(c + " (molécule inconnue)");
  var v = VOIES[c], noms = Object.keys(v);
  if (noms.length < 2) malformes.push(c + " (une seule voie : elle n'apprend rien)");
  noms.forEach(function (n) {
    var e = v[n];
    if (!(typeof e.S === "number" || e.S === null)) malformes.push(c + ":" + n + " (S)");
    if (!(typeof e.R === "number" || e.R === null)) malformes.push(c + ":" + n + " (R)");
    if (!(typeof e.page === "number" && e.page > 0 && e.page <= 200))
      malformes.push(c + ":" + n + " (page " + e.page + ")");
  });
});
verif(mauvais.length === 0,
      mauvais.length === 0 ? "chaque couple nomme un groupe et une molécule que le moteur connaît"
        : "la table nomme ce que le moteur ignore : " + mauvais.join(", "));
verif(malformes.length === 0,
      malformes.length === 0 ? "chaque voie porte S, R et sa page du communiqué"
        : "formes fautives : " + malformes.join(", "));

/* ---------- 2. CHAQUE COUPLE EST-IL ATTEINT PAR UNE ESPÈCE ? ----------
   Le contrôle qui empêche le différentiel d'être vide. Une table dont aucune
   espèce n'atteint les couples est une donnée morte : le différentiel
   comparerait deux fois la même absence et passerait au vert. */
dire("\nChaque couple de la table est-il atteint par une espèce ?");
/* LE RÉFÉRENTIEL VOYAGE AVEC LA DEMANDE, il n'est pas un réglage préalable :
   runInterpretation() appelle cadrer(input.ref, organism) à son entrée, et
   efface donc tout cadrer() posé avant lui. Ma première version du banc
   cadrait à part et interprétait sans « ref » : les cinq couples étaient
   déclarés inatteignables, et le différentiel comparait 960 fois deux
   silences. Il l'a dit — c'est précisément à cela que sert le contrôle de
   portée. */
function premierOrg(groupe) {
  var ids = Object.keys(E.ORG);
  for (var i = 0; i < ids.length; i++) if (E.ORG[ids[i]].bpGroup === groupe) return ids[i];
  return null;
}
var atteints = 0, orphelins = [];
couples.forEach(function (c) {
  var p = c.split(":"), id = premierOrg(p[0]);
  if (!id) { orphelins.push(c + " (aucune espèce de ce groupe)"); return; }
  var r = {}; r[p[1]] = "S";
  var a = E.runInterpretation({ organism: id, ref: "casfm", mode: "sir",
    results: r, ctx: {} }).interpretation;
  if (a.voies && a.voies[p[1]]) atteints++;
  else orphelins.push(c + " (" + id + " ne la reçoit pas)");
});
verif(orphelins.length === 0,
      orphelins.length === 0
        ? "les " + atteints + " couples sont tous atteints par au moins une espèce"
        : "couples que personne n'atteint : " + orphelins.join(", "));

/* ---------- 3. LA NOTE DIT-ELLE CE QU'ELLE EST ? ---------- */
dire("\nCe que la note dit d'elle-même");
E.fixerLangue("fr");
var strep = E.runInterpretation({ organism: "spyogenes", ref: "casfm", mode: "sir",
  results: { AMX: "S" }, ctx: {} }).interpretation;
var nAMX = strep.voies && strep.voies.AMX;
verif(!!nAMX, "Streptococcus pyogenes, amoxicilline : la note paraît");
if (nAMX) {
  verif(/ne connaît pas la voie prescrite/.test(nAMX.dit),
        "elle dit que la catégorie a été rendue SANS la voie — sans quoi un "
        + "lecteur croirait que l'une des deux valeurs l'a décidée");
  verif(nAMX.voies.length === 2 && nAMX.voies[0].libelle && nAMX.voies[1].libelle,
        "les deux voies sont nommées : " + nAMX.voies.map(function (v) {
          return v.libelle + " " + v.dit; }).join(" / "));
  verif(nAMX.voies.every(function (v) { return !/≤ *(null|undefined|0 )/.test(v.dit); }),
        "aucun seuil ne s'écrit « ≤ null » ni « ≤ 0 » — c'est le mensonge déjà "
        + "rencontré sur bpHint, où S = null s'affichait « S ≤ 0 »");
  verif((nAMX.pages || []).length > 0 && nAMX.pages.every(function (p) { return p > 0; }),
        "la note porte sa page du communiqué : " + (nAMX.pages || []).join(", "));
}

/* « S: null » veut dire que le comité n'accorde AUCUNE catégorie sensible par
   cette voie. Haemophilus, amoxicilline per os, page 105. Le dire en chiffres
   serait inventer une valeur ; il faut des mots. */
var haem = E.runInterpretation({ organism: "haemophilus", ref: "casfm", mode: "sir",
  results: { AMX: "S" }, ctx: {} }).interpretation;
var nH = haem.voies && haem.voies.AMX;
verif(!!nH, "Haemophilus influenzae, amoxicilline : la note paraît");
if (nH) {
  var orale = nH.voies.filter(function (v) { return v.voie === "orale"; })[0];
  verif(!!orale && /aucune catégorie/.test(orale.dit),
        "voie orale, S = null : « " + (orale ? orale.dit : "—") + " » — en mots, "
        + "pas en chiffres");
}

/* ---------- 4. LES QUATRE REFUS ----------
   Chacun évite d'annoncer un seuil qui n'a pas servi. */
dire("\nLes quatre refus");
function voiesDe(appel) {
  var a = E.runInterpretation(appel).interpretation;
  return Object.keys(a.voies || {}).length;
}
verif(voiesDe({ organism: "spyogenes", ref: "eucast", mode: "sir",
                results: { AMX: "S" }, ctx: {} }) === 0,
      "sous EUCAST, rien : la table est celle du CA-SFM, avec sa page. "
      + "L'afficher attribuerait à un référentiel la règle de l'autre");
verif(voiesDe({ organism: "spyogenes", ref: "casfm", mode: "sir", results: { AMX: "S" },
                ctx: { urin: "Oui" } }) === 0,
      "en contexte urinaire, rien : la clé porte le site, et l'on ne retombe "
      + "jamais sur « standard » par défaut");
verif(voiesDe({ organism: "spyogenes", ref: "casfm", mode: "sir", results: { AMX: "S" },
                ctx: { mening: "Oui" } }) === 0,
      "en contexte méningé, rien, pour la même raison");
verif(voiesDe({ organism: "spyogenes", ref: "casfm", mode: "mic", mic: { AMX: "0.25" },
                ctx: {}, bpOverride: { "strepacg:AMX": { S: 4, R: 8 } } }) === 0,
      "seuils saisis par le laboratoire : rien. Le seuil appliqué est le sien ; "
      + "lui opposer ceux du CA-SFM parlerait d'un seuil qui n'a pas servi");
verif(voiesDe({ organism: "spyogenes", ref: "casfm", mode: "sir",
                results: { E: "S" }, ctx: {} }) === 0,
      "une molécule que la table ne connaît pas ne reçoit rien");

/* ---------- 5. LE CONTRÔLE QUI PORTE LA DÉCISION ----------
   AVEC la table, puis SANS : les deux interprétations doivent être
   identiques champ pour champ, hors le champ « voies ». */
dire("\nLa note change-t-elle une catégorie ? (toutes les espèces, tous les profils)");
var PROFILS = [
  { nom: "S/I/R",       appel: { mode: "sir",
      results: { AMX: "S", AMC: "S", PEN: "S", CTX: "S", E: "S", DA: "S", VA: "S",
                 GEN: "S", SXT: "S", CIP: "S", MEM: "S", TE: "S", LVX: "S" }, ctx: {} } },
  { nom: "S/I/R résistant", appel: { mode: "sir",
      results: { AMX: "R", AMC: "R", PEN: "R", CTX: "R", E: "R" }, ctx: {} } },
  { nom: "CMI",         appel: { mode: "mic",
      mic: { AMX: "0.5", AMC: "2", PEN: "0.125", CTX: "1", E: "0.25" }, ctx: {} } },
  { nom: "CMI haute",   appel: { mode: "mic",
      mic: { AMX: "4", AMC: "8", PEN: "2" }, ctx: {} } },
  { nom: "diamètres",   appel: { mode: "disc",
      diam: { AMX: "18", AMC: "20", PEN: "22", CTX: "24", E: "19" }, ctx: {} } },
  { nom: "urine",       appel: { mode: "sir",
      results: { AMX: "S", AMC: "S", NIT: "S", FOS: "S", SXT: "S" },
      ctx: { urin: "Oui" } } },
  { nom: "LCR",         appel: { mode: "sir",
      results: { AMX: "S", CTX: "S", PEN: "S", MEM: "S" }, ctx: { mening: "Oui" } } },
  { nom: "rendu ciblé HAS", appel: { mode: "sir", renduCible: true,
      results: { AMX: "S", SXT: "S", CIP: "S", NIT: "S", FOS: "S", AMC: "S", CTX: "S" },
      ctx: { urin: "Oui", patiente: "Oui", typeIU: "Cystite" } } }
];

(function () {
  var ids = Object.keys(E.ORG), refs = ["casfm", "eucast"];
  var paires = 0, avecNote = 0, divergent = [], catsDivergentes = [];

  function tour(id, p, ref) {
    var appel = { organism: id, ref: ref };
    for (var k in p.appel) appel[k] = p.appel[k];
    var o = E.runInterpretation(appel);
    return { gel: gelerSauf(o.interpretation, "voies"),
             cats: geler([o.categories, o.rendues]),
             note: Object.keys(o.interpretation.voies || {}).length };
  }

  /* L'interrupteur : le moteur lit VOIES À CHAQUE APPEL, ce qui permet de la
     vider et de la remettre sans recharger quoi que ce soit. Sans cela il
     n'y aurait pas de différentiel possible, et la décision du biologiste
     resterait un énoncé que rien ne vérifie. */
  var copie = {};
  Object.keys(E.VOIES).forEach(function (c) { copie[c] = E.VOIES[c]; });
  function vider() { Object.keys(E.VOIES).forEach(function (c) { delete E.VOIES[c]; }); }
  function remettre() { Object.keys(copie).forEach(function (c) { E.VOIES[c] = copie[c]; }); }

  ids.forEach(function (id) {
    PROFILS.forEach(function (p) {
      refs.forEach(function (ref) {
        remettre();
        var avec = tour(id, p, ref);
        vider();
        var sans = tour(id, p, ref);
        remettre();
        paires++;
        if (avec.note) avecNote++;
        if (avec.gel !== sans.gel) divergent.push(id + " / " + p.nom + " / " + ref);
        if (avec.cats !== sans.cats) catsDivergentes.push(id + " / " + p.nom + " / " + ref);
      });
    });
  });

  verif(Object.keys(E.VOIES).length === couples.length,
        "la table a été remise en place après le différentiel (" + couples.length + " couples)");
  verif(avecNote > 0,
        avecNote + " interprétations sur " + paires + " portaient la note : la "
        + "comparaison a bien tourné avec elle, et non deux fois sur le même silence");
  verif(catsDivergentes.length === 0,
        catsDivergentes.length === 0
          ? "AUCUNE catégorie ne change, ni brute ni rendue, sur " + paires + " paires"
          : "DES CATÉGORIES CHANGENT selon que la note paraît : "
            + catsDivergentes.slice(0, 6).join(" ; "));
  verif(divergent.length === 0,
        divergent.length === 0
          ? "et rien d'autre ne change non plus — commentaire, alertes, règles, "
            + "posologies, rendu ciblé, les " + paires + " paires sont identiques"
          : "l'interprétation diffère ailleurs que dans « voies » : "
            + divergent.slice(0, 6).join(" ; "));
})();

/* ---------- 6. LA NOTE EST-ELLE BILINGUE ? ----------
   Le reste de l'application l'est depuis le 2026-10-25 ; une note neuve
   restée française serait un retour en arrière, et aucun contrôle qui lit les
   FICHIERS ne la verrait, puisqu'elle est composée à l'exécution. */
dire("\nLa note dans les deux langues");
function noteEn(lang) {
  E.fixerLangue(lang);
  var a = E.runInterpretation({ organism: "spyogenes", ref: "casfm", lang: lang,
    mode: "sir", results: { AMX: "S" }, ctx: {} }).interpretation;
  return (a.voies && a.voies.AMX) || null;
}
var nFr = noteEn("fr"), nEn = noteEn("en");
verif(!!nFr && !!nEn, "la note paraît dans les deux langues");
if (nFr && nEn) {
  verif(nFr.dit !== nEn.dit, "la phrase d'avertissement change de langue");
  verif(!/[àâçéèêëîïôùûœ]|\bvoie\b|\baucune\b/.test(nEn.dit + " "
          + nEn.voies.map(function (v) { return v.libelle + " " + v.dit; }).join(" ")),
        "rien de français ne subsiste côté anglais : « " + nEn.voies[0].libelle
        + " » / « " + nEn.voies[0].dit + " »");
  verif(nFr.voies[0].libelle !== nEn.voies[0].libelle,
        "le nom de la voie se traduit : « " + nFr.voies[0].libelle + " » → « "
        + nEn.voies[0].libelle + " »");
}
E.fixerLangue("fr");

dire("");
if (KO) {
  dire(KO + " ÉCHEC(S) sur " + (OK + KO) + " contrôles.");
  if (typeof process === "object") process.exit(1);
} else {
  dire(OK + " contrôles : la note montre les deux seuils et ne décide d'aucune catégorie.");
}
