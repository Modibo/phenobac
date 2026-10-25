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

E.fixerLangue("fr");
dire("\n" + (KO ? KO + " échec(s) sur " + (OK + KO) + " contrôles."
                : OK + " contrôles : le moteur rend dans les deux langues, les noms de "
                     + "molécules suivent,\net une langue ne déteint pas sur l'interprétation "
                     + "suivante."));
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
