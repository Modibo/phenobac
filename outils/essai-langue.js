/* ============================================================
   essai-langue.js — le moteur rend-il vraiment dans les deux langues ?

   POURQUOI CE BANC EXISTE

   Le contrôle outils/verifier-langues.py lit le TEXTE des fichiers : il voit
   qu'une phrase a ses deux langues. Il ne voit pas si le moteur les emploie.
   Entre les deux il y a tout ce qui peut mal tourner : une langue qui ne se
   pose pas, un nom d'antibiotique resté français au milieu d'une phrase
   anglaise, un moteur qui garde la langue du dernier appel et rend en anglais
   à un laboratoire francophone.

   Ce dernier point est le plus sournois. La langue est un état du module ;
   deux interprétations successives dans deux langues doivent rendre chacune
   la sienne, sans que la première déteigne sur la seconde.

   LE FRANÇAIS RESTE LE DÉFAUT, ET C'EST VOULU : une application mal
   configurée doit rendre la langue de ceux pour qui elle a été écrite.

   Avec Node :             node outils/essai-langue.js
   Sans Node, sur macOS :  …/jsc outils/essai-langue.js
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
  var mp = ch("posologie.js"), mb = ch("base-connaissances.js"), mr = ch("rendu-cible.js");
  var mm = { exports: {} };
  (new Function("module", "exports", "require", readFile("moteur.js")))(
    mm, mm.exports,
    function (n) { return /posologie/.test(n) ? mp : (/rendu-cible/.test(n) ? mr : mb); });
  E = mm.exports;
}

function dire(s) { (typeof console === "object" ? console.log : print)(s); }
function verifPremier(ok, txt) { ok ? OK++ : KO++; dire((ok ? "  ok   " : "  ÉCHEC") + "  " + txt); }

/* ---------- 0. LANGUE.JS SE CHARGE-T-IL SEULEMENT ?

   LE 25 OCTOBRE 2026, IL NE SE CHARGEAIT PLUS, ET TOUT ÉTAIT AU VERT.
   Un script avait écrit dans le catalogue des chaînes contenant de VRAIS
   retours à la ligne : JavaScript ne l'admet pas dans un littéral entre
   guillemets, et le fichier échouait à l'analyse. La page affichait son
   HTML français, le bouton de langue ne faisait rien, et personne ne
   signalait quoi que ce soit — parce que verifier-langues.py LIT le
   fichier avec une expression régulière au lieu de le CHARGER. Un lecteur
   indulgent trouvait ses 126 entrées dans un fichier qu'aucun navigateur
   n'aurait exécuté.

   Ici on le charge pour de bon, et on lui demande de rendre quelque chose.
   C'est le premier contrôle du banc : si le catalogue est cassé, rien de ce
   qui suit n'a de sens. */
dire("\nLe catalogue se charge-t-il, et répond-il ?");
(function () {
  var LA = null, souci = null;
  try {
    if (typeof require === "function" && typeof module === "object" && module.exports) {
      LA = require("../langue");
    } else {
      var m = { exports: {} };
      (new Function("module", "exports", readFile("langue.js")))(m, m.exports);
      LA = m.exports;
    }
  } catch (e) { souci = String(e); }
  verifPremier(!!LA, LA ? "langue.js s'analyse et s'exécute"
                        : "langue.js NE SE CHARGE PAS : " + souci
                          + " — la page resterait en français, le bouton de langue sans effet, "
                          + "et aucun contrôle qui LIT le fichier ne le verrait");
  if (!LA) return;
  var n = Object.keys(LA.CATALOGUE || {}).length;
  verifPremier(n >= 120, n + " entrées au catalogue : un catalogue vidé passerait au vert");
  LA.fixer("fr");
  var fr = LA.L("ap.nest.titre");
  LA.fixer("en");
  var en = LA.L("ap.nest.titre");
  verifPremier(fr && en && fr !== en && fr.indexOf("⟦") !== 0,
               "une clé prise au hasard rend deux textes différents : « " + fr + " » / « " + en + " »");
  LA.fixer("fr");
})();
function verif(ok, txt) { ok ? OK++ : KO++; dire((ok ? "  ok   " : "  ÉCHEC") + "  " + txt); }

function textes(o) {
  const a = o.interpretation;
  return (a.rules || []).map(x => x.txt)
    .concat((a.alerts || []).map(x => x.txt))
    .concat([a.comment || "", a.mech || "", a.name || ""]).join(" || ");
}
function zit(lang) {
  return E.runInterpretation({ organism: "ecoli", lang: lang, mode: "mic",
                               mic: { CIP: "0.5" }, ctx: {} });
}

/* ---------- 1. Le français est le défaut ---------- */
dire("\nLe français est la langue par défaut");
E.fixerLangue("fr");
verif(E.langueCourante() === "fr", "le moteur démarre en français");
verif(E.fixerLangue("sw") === "fr",
      "une langue inconnue retombe sur le français, et non sur une page vide");
verif(E.fixerLangue("en") === "en" && E.fixerLangue("fr") === "fr",
      "les deux langues se posent et se reposent");

/* ---------- 2. Les noms d'antibiotiques suivent ---------- */
dire("\nLes noms d'antibiotiques suivent la langue");
[["FOS", "Fosfomycine", "Fosfomycin"],
 ["SXT", "Cotrimoxazole", "Trimethoprim-sulfamethoxazole"],
 ["PEN", "Pénicilline G", "Benzylpenicillin"],
 ["CAF", "Chloramphénicol", "Chloramphenicol"]].forEach(function (t) {
  E.fixerLangue("fr"); verif(E.nomAbx(t[0]) === t[1], t[0] + " en français : " + t[1]);
  E.fixerLangue("en"); verif(E.nomAbx(t[0]) === t[2], t[0] + " en anglais : " + t[2]);
});
E.fixerLangue("fr");
verif(Object.keys(E.ABXNAME).length === Object.keys(E.ABXNAME_EN).length,
      "les deux tables de noms couvrent le même nombre de molécules ("
      + Object.keys(E.ABXNAME).length + ")");
verif(Object.keys(E.ABXNAME).every(function (k) { return !!E.ABXNAME_EN[k]; }),
      "… et aucune molécule n'a de nom français sans nom anglais");

/* ---------- 3. Le commentaire change vraiment ---------- */
dire("\nLe commentaire rendu change avec la langue");
(function () {
  const fr = textes(zit("fr")), en = textes(zit("en"));
  verif(/zone d'incertitude technique/.test(fr), "français : « zone d'incertitude technique »");
  verif(/area of technical uncertainty/.test(en), "anglais : « area of technical uncertainty »");
  verif(/ZIT/.test(fr) && /ATU/.test(en),
        "… et le sigle suit : ZIT en français, ATU en anglais — c'est celui de l'EUCAST");
  verif(!/zone d'incertitude/.test(en),
        "… le texte anglais ne garde pas la formule française");
  verif(/Ciprofloxacine/.test(fr) && /Ciprofloxacin\b/.test(en),
        "le nom de la molécule suit aussi : un nom français dans une phrase anglaise "
        + "trahit une traduction de surface");
})();

/* ---------- 4. UNE LANGUE NE DÉTEINT PAS SUR L'APPEL SUIVANT ---------- */
dire("\nDeux interprétations successives rendent chacune leur langue");
(function () {
  const en = textes(zit("en"));
  const fr = textes(zit("fr"));
  const en2 = textes(zit("en"));
  verif(/area of technical uncertainty/.test(en), "anglais d'abord : anglais");
  verif(/zone d'incertitude technique/.test(fr),
        "français ensuite : français — l'anglais n'a pas déteint");
  verif(en2 === en, "anglais de nouveau : exactement le même texte qu'au premier appel");
})();

/* ---------- 5. Sans langue demandée, la dernière posée tient ---------- */
dire("\nSans « lang » dans l'appel, la langue posée reste");
(function () {
  E.fixerLangue("en");
  const o = E.runInterpretation({ organism: "ecoli", mode: "mic", mic: { CIP: "0.5" }, ctx: {} });
  verif(/area of technical uncertainty/.test(textes(o)),
        "la langue posée par fixerLangue() s'applique aux appels suivants");
  E.fixerLangue("fr");
})();

/* ---------- 6. L'absence d'incohérence se dit dans les deux langues ---------- */
dire("\nLes phrases les plus fréquentes, celles qu'on lit à chaque fois");
(function () {
  const fr = textes(E.runInterpretation({ organism: "ecoli", lang: "fr", mode: "sir",
                                          results: { AMX: "S" }, ctx: {} }));
  const en = textes(E.runInterpretation({ organism: "ecoli", lang: "en", mode: "sir",
                                          results: { AMX: "S" }, ctx: {} }));
  verif(/Aucune incohérence détectée/.test(fr), "français : « Aucune incohérence détectée »");
  verif(/No inconsistency found/.test(en), "anglais : « No inconsistency found »");
})();

/* ---------- 7. Un diamètre non catégorisé dit pourquoi, dans les deux ---------- */
dire("\nUn diamètre sans catégorie explique sa raison dans les deux langues");
(function () {
  function raison(lang) {
    return textes(E.runInterpretation({ organism: "kpneu", lang: lang, mode: "diam",
                                        diam: { FOS: "26" }, ctx: { urin: "Oui" } }));
  }
  verif(/ne chiffre ce couple que pour/.test(raison("fr")),
        "français : le seuil n'existe que pour E. coli");
  verif(/sets this breakpoint only for/.test(raison("en")), "anglais : idem");
  verif(/Fosfomycin\b/.test(raison("en")) && !/Fosfomycine/.test(raison("en")),
        "… avec le nom anglais de la molécule, pas le français");
})();

/* ---------- 8. LE RECENSEMENT, ESPÈCE PAR ESPÈCE ----------

   COMPTER LE FRANÇAIS DANS LE FICHIER NE MARCHE PAS, ET ON A ESSAYÉ TROIS
   FOIS. Un balayage d'états sur moteur.js se désynchronise sur les
   apostrophes, puis sur les littéraux d'expression régulière ; le nombre a
   valu 501, 415 puis 413 sans suivre le travail — dix-huit phrases traduites
   n'en faisaient baisser que deux. Un nombre qui ne suit pas le travail ne
   mesure pas le travail, et un plafond posé dessus ne retient rien.

   On mesure donc le COMPORTEMENT, qui est exact et qui est aussi ce que
   l'utilisateur voit : on fait tourner le moteur en anglais sur CHAQUE
   espèce, et on compte celles dont le rendu contient encore du français.
   Soixante sur soixante au départ. Le nombre ne peut descendre qu'en
   traduisant, et il ne peut pas se tromper : c'est le texte rendu. */
/* UN SEUL PROFIL NE PROUVE RIEN, ET CINQ CHAMPS SUR DIX-NEUF NON PLUS.

   Première version : UN profil — tout résistant, EUCAST, S/I/R — sur les
   soixante espèces, et CINQ champs lus (name, mech, comment, rules, alerts).
   Elle est tombée de 60 à 0. À zéro, elle aurait déclaré la traduction
   finie. Elle ne l'était pas : un rapport en CA-SFM, une CMI, un prélèvement
   méningé ou urinaire passent par des machineries entières que ce profil ne
   visite pas, et l'interprétation porte DIX-NEUF champs — les cinq moments,
   le commentaire copiable, les posologies, le rendu ciblé, tous affichés et
   tous lus par un biologiste.

   Corrigé deux fois : SIX profils, et un parcours de TOUT l'objet rendu.

   ET LE COMPTE SE FAIT PAR CHAMP, pas par couple. Compter les couples
   (espèce, profil) donnait 360 sur 360 dès que « moments » restait français
   — et un plafond de 360 n'aurait plus rien retenu : on aurait pu laisser
   repasser « name » en français sans que le nombre bouge. Le plafond est
   donc posé CHAMP PAR CHAMP ; un champ absent de la table doit rendre zéro,
   ce qui fait échouer l'apparition d'un champ neuf resté français. */
var PLAFOND_CHAMPS = {
  // Les trois machineries de composition, traduites le 25 octobre 2026 :
  // les cinq moments du § 15, le commentaire copiable qu'ils composent, et
  // l'habillage des posologies. Elles valaient 1653, 358 et 42.
  // TOUT EST À ZÉRO, ET C'EST LÀ QUE CE CONTRÔLE DEVIENT LE PLUS UTILE :
  // n'importe quelle phrase française qui reparaîtrait, dans n'importe quel
  // champ, le ferait échouer.
  moments: 0,
  commentaireCopiable: 0,
  posologies: 0,
  renduCible: 0
};

/* CE QUI RESTE EN FRANÇAIS POUR UNE RAISON, ET LA RAISON AVEC.

   Les commentaires et les notes du rendu ciblé sont du texte de la HAS,
   recopié mot pour mot d'une recommandation qui n'existe qu'en français.
   Les traduire produirait un texte qui RESSEMBLE à la recommandation sans
   en être une — et qu'un laboratoire recopierait dans un compte rendu en
   croyant citer la HAS. Ils restent donc en français, et le rendu porte en
   anglais la phrase qui explique pourquoi (champ « citation »).

   L'exemption est NOMMÉE chemin par chemin, et le contrôle vérifie que
   chaque chemin exempté est ENCORE ATTEINT. Sans cela, une exemption
   survivrait à la disparition de ce qu'elle couvre, et deviendrait une
   porte ouverte sur le reste du rendu. */
var CITATIONS = {
  "confiance": "clé d'aiguillage (« confirmé » / « probable » / « possible »), comparée "
    + "telle quelle par le moteur et par la page ; c'est confianceLibelle() qui est "
    + "affiché, et verifier-langues.py vérifie que la page n'affiche plus la clé",
  "renduCible.commentaires": "§ 2.1.4 — les commentaires que la HAS impose au compte rendu",
  "renduCible.notes": "notes (A), (B) et (C) des tableaux décisionnels de la HAS"
};

dire("\nRecensement : que reste-t-il de français quand on demande l'anglais ?");
(function () {
  /* « PhénoBac » porte un accent et n'est pas du français : le nom du
     produit reste le même dans les deux langues. Sans ce retrait, douze
     phrases DÉJÀ TRADUITES étaient comptées comme françaises, et le nombre
     aurait cessé de suivre le travail — c'est exactement la panne de mesure
     qui avait fait abandonner le comptage par le texte. */
  var FR = /[àâéèêëîïôùûç]|\b(le|la|les|des|une|un|aux|est|pas|qui|que|pour|sur|dans|avec|sans)\b/;
  function francais(t) { return FR.test(String(t).replace(/PhénoBac/g, "PhenoBac")); }

  var PROFILS = [
    { nom: "tout R, EUCAST",
      appel: { mode: "sir", results: { PEN: "R", AMX: "R", CTX: "R", FOX: "R", E: "R",
                                       MTZ: "S", SXT: "S", CIP: "S" }, ctx: {} } },
    { nom: "tout S, EUCAST",
      appel: { mode: "sir", results: { PEN: "S", AMX: "S", CTX: "S", FOX: "S", E: "S",
                                       MTZ: "S", SXT: "S", CIP: "S" }, ctx: {} } },
    { nom: "CMI",
      appel: { mode: "mic", mic: { CIP: "0.5", PEN: "2", CTX: "1", AMX: "8" }, ctx: {} } },
    { nom: "référentiel CA-SFM",
      appel: { mode: "sir", results: { PEN: "R", AMX: "R", CTX: "R", FOX: "R", E: "R",
                                       CIP: "S" }, ctx: { referentiel: "casfm" } } },
    { nom: "prélèvement méningé",
      appel: { mode: "mic", mic: { CTX: "1", PEN: "1", MEM: "1" },
               ctx: { site: "lcr", meninge: true } } },
    { nom: "prélèvement urinaire",
      appel: { mode: "sir", results: { AMX: "S", SXT: "S", CIP: "S", NIT: "S", FOS: "S" },
               ctx: { site: "urine" } } },
    /* LE RENDU CIBLÉ EST DÉSACTIVÉ PAR DÉFAUT — et les six profils
       précédents ne l'atteignaient donc jamais. C'est une machinerie
       entière (renduCible, rcRestreindre, les commentaires de la HAS) qui
       serait restée hors du recensement, et un laboratoire anglophone qui
       l'active est précisément celui qui lirait ces phrases. */
    { nom: "rendu ciblé HAS",
      appel: { mode: "sir", renduCible: true,
               results: { AMX: "S", SXT: "S", CIP: "S", NIT: "S", FOS: "S", AMC: "S", CTX: "S" },
               ctx: { urin: "Oui", patiente: "Oui", typeIU: "Cystite" } } },
    /* LES TESTS COMPLÉMENTAIRES SONT DANS ctx, ET AUCUN PROFIL NE LES POSAIT.
       β-lactamase, synergie, D-test, carbapénémase : ce sont eux qui font
       basculer le moteur sur ses branches les plus riches — BLPACR, MLSb
       inductible, BLSE confirmée. Sans eux, ces branches ne sont jamais
       rendues, et leur français ne se voit pas. */
    { nom: "tests complémentaires",
      appel: { mode: "sir",
               results: { PEN: "R", AMX: "R", AMC: "S", CTX: "R", FOX: "S", E: "R",
                          DA: "S", OX: "R", MEM: "R", GEN: "S" },
               ctx: { blac: "Positif", syn: "Positif", dtest: "Positif",
                      carba: "Positif", carbaType: "OXA-48", cefox: "Positif" } } },
    /* LE MODE DIAMÈTRE N'ÉTAIT PAS COUVERT NON PLUS. Il a ses propres
       phrases — l'absence de disque, la restriction d'espèce, la mesure
       hors échelle — qu'aucun des sept autres profils n'atteint. */
    { nom: "diamètres",
      appel: { mode: "disc", diam: { AMX: "12", CIP: "22", CTX: "18", FOS: "20", NIT: "14" },
               ctx: {} } }
  ];

  var compte = {}, chaines = 0, vus = 0, citees = {}, verifCitation = false;
  function exempte(chemin) {
    for (var c in CITATIONS) if (chemin === c || chemin.indexOf(c + ".") === 0) return c;
    return null;
  }
  function marche(x, chemin, deja) {
    if (x === null || x === undefined) return;
    var champ = chemin.split(".")[0];
    if (typeof x === "string") {
      chaines++;
      if (!francais(x)) return;
      var c = exempte(chemin);
      if (c) { citees[c] = (citees[c] || 0) + 1; return; }
      compte[champ] = (compte[champ] || 0) + 1;
      return;
    }
    if (typeof x !== "object") return;
    deja = deja || [];
    if (deja.indexOf(x) >= 0) return;
    deja.push(x);
    if (Object.prototype.toString.call(x) === "[object Array]") {
      for (var i = 0; i < x.length; i++) marche(x[i], chemin, deja);
    } else {
      for (var k in x) if (Object.prototype.hasOwnProperty.call(x, k)) marche(x[k], chemin + "." + k, deja);
    }
  }

  Object.keys(E.ORG).forEach(function (id) {
    PROFILS.forEach(function (p) {
      var appel = { organism: id, lang: "en" };
      for (var k in p.appel) appel[k] = p.appel[k];
      var a = E.runInterpretation(appel).interpretation;
      vus++;
      Object.keys(a).forEach(function (champ) { marche(a[champ], champ); });
      if (p.nom === "rendu ciblé HAS" && a.renduCible && a.renduCible.applique) {
        verifCitation = verifCitation || !!a.renduCible.citation;
      }
    });
  });

  var n = Object.keys(E.ORG).length;
  verif(vus === n * PROFILS.length && chaines > 5000,
        "le recensement a parcouru les " + n + " espèces sous " + PROFILS.length
        + " profils (" + vus + " couples, " + chaines + " chaînes lues) : un recensement "
        + "vide passerait au vert sans rien avoir regardé");

  var total = 0, debordent = [];
  Object.keys(compte).forEach(function (champ) {
    total += compte[champ];
    var plafond = PLAFOND_CHAMPS[champ] || 0;
    if (compte[champ] > plafond) {
      debordent.push(champ + " : " + compte[champ] + " > " + plafond
                     + (plafond === 0 ? " (champ qu'on croyait traduit)" : " — A RECULÉ"));
    }
  });
  verif(debordent.length === 0,
        debordent.length === 0
          ? total + " chaînes françaises restantes, toutes sous leur plafond ("
            + Object.keys(compte).sort().map(function (c) {
                return c + " " + compte[c] + "/" + (PLAFOND_CHAMPS[c] || 0); }).join(", ") + ")"
          : "la traduction a reculé — " + debordent.join(" ; "));

  var creuses = Object.keys(CITATIONS).filter(function (c) { return !citees[c]; });
  verif(creuses.length === 0,
        creuses.length === 0
          ? "les " + Object.keys(CITATIONS).length + " exemptions nommées sont bien "
            + "atteintes par le recensement (" + Object.keys(CITATIONS).sort().map(function (c) {
                return c + " " + citees[c]; }).join(", ") + ") — l'exemption couvre quelque "
            + "chose de réel, elle n'est pas une porte ouverte"
          : "exemption devenue creuse : " + creuses.join(", ") + " ne rend plus rien de "
            + "français. Retirez-la de CITATIONS, sans quoi elle laisserait passer ce qui "
            + "reprendrait ce chemin.");
  verif(verifCitation,
        verifCitation
          ? "… et le rendu ciblé dit en anglais POURQUOI ces blocs restent en français"
          : "le rendu ciblé laisse du français sans dire pourquoi : un lecteur anglophone "
            + "y verrait une traduction manquante");

  var oublies = Object.keys(PLAFOND_CHAMPS).filter(function (c) {
    return (compte[c] || 0) === 0 && PLAFOND_CHAMPS[c] > 0; });
  verif(oublies.length === 0,
        oublies.length === 0
          ? "… et chaque champ de la table est encore atteint par le recensement"
          : "plafond devenu inutile — ces champs ne rendent plus de français et leur "
            + "plafond doit tomber à zéro : " + oublies.join(", "));

  E.fixerLangue("fr");
  var frOk = Object.keys(E.ORG).every(function (id) {
    return PROFILS.every(function (p) {
      var appel = { organism: id, lang: "fr" };
      for (var k in p.appel) appel[k] = p.appel[k];
      return !!E.runInterpretation(appel).interpretation.comment;
    });
  });
  verif(frOk, "en français, les " + vus + " couples rendent toujours un commentaire — "
        + "traduire ne doit rien casser de ce qui marchait");
})();

/* ---------- 9. CHAQUE PHRASE DE RÉSISTANCE NATURELLE SAIT-ELLE SE TRADUIRE ?

   Les 101 valeurs de ORG[...].intrinsic sont des citations du document
   EUCAST ; le moteur ne les traduit pas une par une mais les COMPOSE
   (naturelleEn). Une composition ne couvre que ce qu'elle connaît : la
   phrase d'une règle ajoutée demain ne serait pas traduite, et le rapport
   anglais la rendrait en français SANS que rien ne le dise — le recensement
   par espèce ne la verrait que si cette espèce rend l'incohérence, c'est-à-
   dire seulement si l'on a saisi « S » sur une molécule naturellement
   résistante.

   Ce contrôle regarde les phrases elles-mêmes, toutes, sans dépendre d'une
   saisie. naturelleEn() rend null quand elle ne sait pas : c'est ce null qui
   permet d'échouer ici plutôt que de rendre du français en silence. */
dire("\nLes phrases de résistance naturelle se traduisent-elles toutes ?");
(function () {
  var FR = /[àâéèêëîïôùûç]|\b(le|la|les|des|une|un|aux|est|pas|qui|que|pour|sur|dans|avec|sans|aminosides|naturelle)\b/;
  var phrases = {}, muettes = [], restees = [];
  Object.keys(E.ORG).forEach(function (id) {
    var nat = E.ORG[id].intrinsic || {};
    Object.keys(nat).forEach(function (k) { phrases[nat[k]] = true; });
  });
  var toutes = Object.keys(phrases);
  toutes.forEach(function (fr) {
    var en = E.naturelleEn(fr);
    if (!en) { muettes.push(fr); return; }
    if (FR.test(en)) restees.push(fr + "  ->  " + en);
  });
  verif(toutes.length >= 60,
        "le contrôle a bien ramassé les " + toutes.length + " phrases distinctes de "
        + "ORG : un ramassage vide passerait au vert sans rien avoir regardé");
  verif(muettes.length === 0,
        muettes.length === 0
          ? "les " + toutes.length + " phrases savent toutes se traduire"
          : muettes.length + " phrase(s) que naturelleEn() ne sait pas traduire — "
            + "elles seraient rendues EN FRANÇAIS dans un rapport anglais : "
            + muettes.join(" | "));
  verif(restees.length === 0,
        restees.length === 0
          ? "… et aucune traduction ne laisse du français derrière elle"
          : restees.length + " traduction(s) gardent du français : " + restees.join(" | "));
})();

E.fixerLangue("fr");
dire("\n" + (KO ? KO + " échec(s) sur " + (OK + KO) + " contrôles."
                : OK + " contrôles : le moteur rend dans les deux langues, les noms de "
                     + "molécules suivent,\net une langue ne déteint pas sur l'interprétation "
                     + "suivante."));
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
