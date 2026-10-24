/* ============================================================
   essai-conditions.js — les conditions de réalisation, § 9

   PhénoBac ne devine pas sur quelle gélose un antibiogramme a poussé : il
   CONFRONTE ce que l'utilisateur déclare à ce que le référentiel exige pour
   l'espèce. Ce banc éprouve les deux façons d'échouer, et la seconde est la
   pire :

     la non-conformité passe inaperçue — le laboratoire rend des diamètres
     lus dans des conditions où les seuils ne valent pas ;

     l'alerte tombe alors que rien n'a été déclaré — et l'utilisateur ferme
     le panneau, ce qui rend tout le dispositif inutile.

   D'où la règle éprouvée en premier, et à chaque champ : UNE CONDITION NON
   RENSEIGNÉE NE PRODUIT RIEN.

   Les valeurs exigées viennent de :
     EUCAST disk diffusion method v13.0 (janvier 2025), tables 1 et 3, annexe A
     EUCAST anaérobies v3.0 (juin 2026)
     EUCAST Clinical Breakpoint Tables v16.1 (24 juin 2026)

   Avec Node :             node outils/essai-conditions.js
   Sans Node, sur macOS :  …/jsc outils/essai-conditions.js
   ============================================================ */

var E, KO = 0, OK = 0;

if (typeof require === "function" && typeof module === "object" && module.exports) {
  E = require("../moteur");
} else {
  var modB = { exports: {} };
  (new Function("module", "exports", readFile("base-connaissances.js")))(modB, modB.exports);
  // Le moteur réclame DEUX fichiers de données : la base de règles et les
  // posologies. Un require qui rendrait toujours le même les confondrait, et
  // le moteur chercherait des posologies dans la base.
  var modP = { exports: {} };
  (new Function("module", "exports", readFile("posologie.js")))(modP, modP.exports);
  var mod = { exports: {} };
  (new Function("module", "exports", "require", readFile("moteur.js")))(
    mod, mod.exports,
    function (nom) { return /posologie/.test(nom) ? modP.exports : modB.exports; });
  E = mod.exports;
}

function dire(s) { (typeof console === "object" ? console.log : print)(s); }
function verif(ok, txt) { ok ? OK++ : KO++; dire((ok ? "  ok   " : "  ÉCHEC") + "  " + txt); }

/* Un antibiogramme en diamètres, avec les conditions déclarées. Les valeurs
   elles-mêmes importent peu ici : c'est le panneau des conditions qu'on
   éprouve, pas la catégorisation. */
function run(org, ctx, mode, mesures) {
  var envoi = { organism: org, ctx: ctx || {}, mode: mode || "diam" };
  if (envoi.mode === "diam") envoi.diam = mesures || { GEN: "20" };
  else if (envoi.mode === "mic") envoi.mic = mesures || { GEN: "1" };
  else envoi.results = mesures || { GEN: "S" };
  return E.runInterpretation(envoi).interpretation;
}
function alertes(org, ctx, mode, mesures) { return run(org, ctx, mode, mesures).alerts || []; }
function porte(org, ctx, motif, mode, mesures) {
  return alertes(org, ctx, mode, mesures).some(function (a) { return motif.test(a.txt); });
}
function niveauDe(org, ctx, motif, mode, mesures) {
  var a = alertes(org, ctx, mode, mesures).filter(function (x) { return motif.test(x.txt); })[0];
  return a ? a.lvl : null;
}

/* ---------- 0. Le silence n'est pas une non-conformité ---------- */
dire("\nUne condition non renseignée ne déclenche rien");
(function () {
  var sans = alertes("ecoli", {});
  var bruit = sans.filter(function (a) {
    return /gélose|Atmosphère|Température|Incubation déclarée|Épaisseur|Inoculum|15-15-15|pureté|nappe/i.test(a.txt);
  });
  verif(bruit.length === 0, "aucune alerte de conditions sur un antibiogramme sans déclaration");
  var vides = alertes("ecoli", { milieu: "", atmo: "", tempC: "", dureeH: "", epaisseur: "", mcf: "", delais: "", pur: "", nappe: "", zones: "" });
  var bruit2 = vides.filter(function (a) {
    return /gélose|Atmosphère|Température|Incubation déclarée|Épaisseur|Inoculum|15-15-15/i.test(a.txt);
  });
  verif(bruit2.length === 0, "des champs présents mais vides ne valent pas davantage déclaration");
})();

/* ---------- 1. La pureté ---------- */
dire("\nUne culture mixte arrête l'interprétation, quel que soit le mode");
var MIXTE = /NON PURE/;
["diam", "mic", "sir"].forEach(function (m) {
  verif(porte("ecoli", { pur: "mixte" }, MIXTE, m), "culture déclarée mixte, saisie en " + m + " : signalée");
  verif(niveauDe("ecoli", { pur: "mixte" }, MIXTE, m) === "stop", "… au niveau « interprétation impossible »");
});
verif(!!run("ecoli", { pur: "mixte" }).nonSecurise,
      "le refus est porté par l'interprétation, pas seulement par une alerte");
verif(!porte("ecoli", { pur: "pur" }, MIXTE), "culture déclarée pure : rien à signaler");

/* ---------- 2. La croissance ---------- */
dire("\nUn inoculum trop léger invalide la lecture (EUCAST § 7.1.1)");
var COLONIES = /Colonies individuelles visibles/;
verif(porte("ecoli", { nappe: "colonies" }, COLONIES), "colonies au lieu d'une nappe : signalé");
verif(niveauDe("ecoli", { nappe: "colonies" }, COLONIES) === "stop", "… le test doit être recommencé");
verif(!porte("ecoli", { nappe: "confluente" }, COLONIES), "nappe confluente : rien à signaler");
verif(!porte("ecoli", { nappe: "colonies" }, COLONIES, "sir"),
      "en saisie S/I/R, la question ne se pose pas : aucune boîte n'a été lue ici");

/* ---------- 3. Les zones doubles : la nuance d'EUCAST § 8.9.1 ---------- */
dire("\nZones doubles : la conduite dépend de la pureté");
var DOUBLE_PUR  = /TENIR COMPTE de ces colonies/;
var DOUBLE_SANS = /contrôler la pureté et de recommencer/;
verif(porte("ecoli", { zones: "doubles", pur: "pur" }, DOUBLE_PUR),
      "culture pure : mesurer la zone intérieure, et le dire");
verif(niveauDe("ecoli", { zones: "doubles", pur: "pur" }, DOUBLE_PUR) === "info",
      "… au niveau information : il n'y a rien à corriger, une mesure à faire autrement");
verif(porte("ecoli", { zones: "doubles" }, DOUBLE_SANS),
      "pureté non vérifiée : contrôler avant de rendre");
verif(niveauDe("ecoli", { zones: "doubles" }, DOUBLE_SANS) === "crit",
      "… en alerte majeure : c'est le premier signe d'une culture mixte");
verif(!porte("ecoli", { zones: "nettes", pur: "pur" }, /zone/i),
      "zones nettes sur culture pure : rien à signaler");

/* ---------- 4. Le milieu ---------- */
dire("\nLe milieu exigé dépend de l'espèce (EUCAST, table 1)");
var MILIEU = /Gélose déclarée/;
verif(porte("ecoli", { milieu: "MH" }, MILIEU) === false, "E. coli sur Mueller-Hinton : conforme");
verif(porte("ecoli", { milieu: "MH-F" }, MILIEU), "E. coli sur MH-F : signalé");
verif(niveauDe("ecoli", { milieu: "MH-F" }, MILIEU) === "crit", "… en alerte majeure");
verif(!porte("pneumocoque", { milieu: "MH-F" }, MILIEU), "pneumocoque sur MH-F : conforme");
verif(porte("pneumocoque", { milieu: "MH" }, MILIEU), "pneumocoque sur Mueller-Hinton nu : signalé");
verif(!porte("haemophilus", { milieu: "MH-F" }, MILIEU), "H. influenzae sur MH-F : conforme");
verif(!porte("bfragilis", { milieu: "FAA-HB" }, MILIEU), "B. fragilis sur FAA-HB : conforme");
verif(porte("bfragilis", { milieu: "MH-F" }, MILIEU), "B. fragilis sur MH-F : signalé");
verif(!porte("campylobacter", { milieu: "MH-F" }, MILIEU), "Campylobacter sur MH-F : conforme");

/* ---------- 5. L'atmosphère ---------- */
dire("\nL'atmosphère exigée dépend de l'espèce (EUCAST, table 3)");
var ATMO = /Atmosphère déclarée/;
verif(!porte("ecoli", { atmo: "air" }, ATMO), "E. coli à l'air ambiant : conforme");
verif(porte("ecoli", { atmo: "co2" }, ATMO), "E. coli sous CO2 : signalé");
verif(!porte("pneumocoque", { atmo: "co2" }, ATMO), "pneumocoque sous 4-6 % de CO2 : conforme");
verif(porte("pneumocoque", { atmo: "air" }, ATMO), "pneumocoque à l'air ambiant : signalé");
verif(!porte("campylobacter", { atmo: "micro" }, ATMO), "Campylobacter en microaérobie : conforme");
verif(porte("campylobacter", { atmo: "co2" }, ATMO), "Campylobacter sous CO2 : signalé");
verif(!porte("bfragilis", { atmo: "anaero" }, ATMO), "B. fragilis en anaérobiose : conforme");
verif(porte("bfragilis", { atmo: "air" }, ATMO), "B. fragilis à l'air ambiant : signalé");

/* ---------- 6. La température ---------- */
dire("\nLa température : 35 ± 1 °C, sauf Campylobacter à 41 ± 1 °C");
var TEMP = /Température déclarée/;
verif(!porte("ecoli", { tempC: "35" }, TEMP), "E. coli à 35 °C : conforme");
verif(!porte("ecoli", { tempC: "34" }, TEMP), "… 34 °C, borne basse : conforme");
verif(!porte("ecoli", { tempC: "36" }, TEMP), "… 36 °C, borne haute : conforme");
verif(porte("ecoli", { tempC: "37" }, TEMP), "… 37 °C : signalé");
verif(porte("ecoli", { tempC: "30" }, TEMP), "… 30 °C : signalé");
verif(!porte("campylobacter", { tempC: "41" }, TEMP), "Campylobacter à 41 °C : conforme");
verif(porte("campylobacter", { tempC: "35" }, TEMP), "Campylobacter à 35 °C : signalé");
verif(!porte("bfragilis", { tempC: "37" }, TEMP), "B. fragilis à 37 °C : conforme (35-37 °C)");

/* ---------- 7. La durée, et ses deux sens d'erreur ---------- */
dire("\nLa durée : les deux sens d'erreur ne portent pas le même danger");
var TROP_LONG  = /au-delà des/;
var TROP_COURT = /en deçà des/;
verif(!porte("ecoli", { dureeH: "18" }, /Incubation déclarée/), "18 h : conforme");
verif(!porte("ecoli", { dureeH: "16" }, /Incubation déclarée/), "16 h, borne basse : conforme");
verif(!porte("ecoli", { dureeH: "20" }, /Incubation déclarée/), "20 h, borne haute : conforme");
verif(porte("ecoli", { dureeH: "24" }, TROP_LONG), "24 h : signalé comme trop long");
verif(/faussement|pas|rendre résistant/i.test(
        alertes("ecoli", { dureeH: "24" }).filter(function (a) { return TROP_LONG.test(a.txt); })[0].txt),
      "… en disant le danger : des colonies poussent DANS les zones, et l'on rend résistant à tort");
verif(porte("ecoli", { dureeH: "12" }, TROP_COURT), "12 h : signalé comme trop court");
verif(!porte("campylobacter", { dureeH: "24" }, /Incubation déclarée/), "Campylobacter à 24 h : conforme");
verif(porte("campylobacter", { dureeH: "18" }, TROP_COURT), "Campylobacter à 18 h : signalé");
verif(porte("bfragilis", { dureeH: "48" }, TROP_LONG),
      "anaérobies à 48 h : signalé — au-delà de 20 h, le document l'interdit");

/* ---------- 8. L'épaisseur et l'inoculum ---------- */
dire("\nL'épaisseur de gélose et la densité de l'inoculum");
verif(porte("ecoli", { epaisseur: "hors" }, /Épaisseur de gélose/), "épaisseur hors 4,0 ± 0,5 mm : signalée");
verif(niveauDe("ecoli", { epaisseur: "hors" }, /Épaisseur de gélose/) === "warn", "… au niveau « à vérifier »");
verif(!porte("ecoli", { epaisseur: "conforme" }, /Épaisseur de gélose/), "épaisseur conforme : rien à signaler");
verif(!porte("ecoli", { mcf: "0.5" }, /Inoculum/), "E. coli à McFarland 0,5 : conforme");
verif(porte("ecoli", { mcf: "1.0" }, /Inoculum déclaré/), "E. coli à McFarland 1,0 : signalé");
verif(!porte("bfragilis", { mcf: "1.0" }, /Inoculum/), "anaérobies à McFarland 1,0 : conforme");
verif(porte("bfragilis", { mcf: "0.5" }, /Inoculum déclaré/), "anaérobies à McFarland 0,5 : signalé");
verif(porte("ecoli", { mcf: "sans" }, /non ajusté à un étalon/), "inoculum non étalonné : signalé");

/* ---------- 9. Les délais ---------- */
dire("\nLa règle des 15-15-15");
verif(porte("ecoli", { delais: "non" }, /15-15-15/), "règle non respectée : signalée");
verif(!porte("ecoli", { delais: "oui" }, /15-15-15/), "règle respectée : rien à signaler");

/* ---------- 10. Les espèces hors méthode des disques ---------- */
dire("\nLes espèces pour lesquelles la diffusion en gélose n'est pas définie");
var HORS = /pas de critère|aucun critère|ne peut pas servir|ne fait pas partie/i;
["ngonorrhoeae", "nmeningitidis"].forEach(function (g) {
  verif(porte(g, { milieu: "MH-F" }, /aucun critère de diffusion en gélose n'est défini/),
        g + " : l'EUCAST ne définit aucun critère au disque, c'est dit");
  verif(niveauDe(g, {}, /aucun critère de diffusion en gélose n'est défini/) === "stop",
        "… et l'interprétation au disque est déclarée impossible");
});
verif(porte("cdifficile", {}, /ne fait pas partie/),
      "C. difficile : la méthode des anaérobies ne lui est pas validée");
verif(!porte("ngonorrhoeae", {}, /aucun critère de diffusion/, "mic"),
      "… mais en CMI, rien de tout cela ne se dit : la méthode est justement celle qu'il faut");

/* ---------- 11. Les espèces que les documents ne couvrent pas ---------- */
dire("\nCe qui n'est pas documenté reste muet (§ 26)");
verif(E.CONDITIONS.burk === undefined,
      "Burkholderia cepacia : absente de la table, car absente des documents de l'EUCAST");
verif(!porte("burk", { milieu: "MH-F", atmo: "co2", tempC: "30", dureeH: "48" }, /Gélose déclarée|Atmosphère déclarée|Température déclarée|Incubation déclarée/),
      "… aucune condition ne lui est reprochée : on ne compare pas à une exigence qu'on n'a pas lue");

/* ---------- 12. Les réserves propres à l'espèce ---------- */
dire("\nCe que le référentiel demande EN PLUS pour certaines espèces");
verif(porte("efaecalis", { milieu: "MH" }, /24 h/),
      "entérocoque : la réserve des glycopeptides à 24 h est rappelée");
verif(!porte("efaecalis", {}, /24 h.*glycopeptides|glycopeptides.*24 h/),
      "… seulement à qui a renseigné le panneau, sinon elle s'ajouterait à chaque antibiogramme");
verif(porte("coryne", { milieu: "MH-F" }, /40-44 h/),
      "Corynebacterium : la réincubation à 40-44 h est rappelée");

/* ---------- 13. Une alerte ne change aucune donnée ---------- */
dire("\nUne condition non conforme ne modifie aucune mesure");
(function () {
  var r = E.runInterpretation({ organism: "ecoli", mode: "diam",
            diam: { AMX: "6", CTX: "15", GEN: "20" },
            ctx: { milieu: "MH-F", atmo: "co2", dureeH: "30", pur: "mixte" } });
  verif(r.categories.GEN === "S", "la catégorie calculée reste celle du diamètre mesuré");
  verif(r.interpretation.alerts.length > 0, "… alors que les alertes ont bien été levées");
  verif(!!r.interpretation.name, "… et le phénotype reste calculé, pour que le biologiste voie ce qui était en jeu");
})();

dire("\n" + (KO ? KO + " échec(s) sur " + (OK + KO) + " contrôles."
                : OK + " contrôles, les conditions de réalisation sont confrontées au référentiel"
                    + " et seulement quand elles sont déclarées."));
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
