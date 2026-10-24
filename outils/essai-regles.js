/* ============================================================
   essai-regles.js — la gravité et les règles expertes

   POURQUOI CE BANC EXISTE

   Il n'a pas été écrit parce qu'on a pensé à ces règles : il a été écrit
   parce que outils/muter.py les a trouvées SANS DÉFENSE. En abîmant le
   moteur de soixante façons précises — un « et » devenu « ou », une égalité
   inversée, un seuil décuplé — l'outil a montré que vingt-six de ces
   altérations ne faisaient tomber aucun contrôle. Parmi elles :

     · A.sev, le niveau de gravité — que RIEN n'éprouvait. C'est lui qui
       colore le verdict et dit au biologiste s'il doit s'alarmer ;
     · le D-test : érythromycine R + clindamycine S doit faire chercher une
       résistance inductible AVANT de rendre la clindamycine. Rendre une
       clindamycine sensible sur une souche MLSb inductible, c'est conduire
       à un échec thérapeutique ;
     · les règles propres au CA-SFM : masquage du méropénème chez
       Pseudomonas, β-lactamase à chercher chez Moraxella, valeurs adaptées
       du CLSI chez Acinetobacter et Stenotrophomonas ;
     · la téicoplanine diminuée chez un staphylocoque à coagulase négative.

   Avec Node :             node outils/essai-regles.js
   Sans Node, sur macOS :  …/jsc outils/essai-regles.js
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

function lire(org, res, ctx, ref) {
  return E.runInterpretation({ organism: org, mode: "sir", results: res,
                               ctx: ctx || {}, ref: ref || "eucast" }).interpretation;
}
function texte(A) {
  return (A.alerts || []).map(function (x) { return x.txt; })
    .concat((A.rules || []).map(function (x) { return x.txt; })).join(" ∥ ");
}

/* ---------- 1. La gravité, que rien n'éprouvait ---------- */
dire("\nLe niveau de gravité — il colore le verdict et dit s'il faut s'alarmer");
(function () {
  var ORDRE = ["wild", "mod", "high", "crit"];
  function sev(A) { return A.sev; }

  verif(sev(lire("ecoli", { AMX: "S", AMC: "S", CTX: "S", CIP: "S" })) === "wild",
        "souche sauvage : « wild »");
  verif(sev(lire("ecoli", { AMX: "R", AMC: "S", CTX: "S", CIP: "S" })) === "mod",
        "pénicillinase de bas niveau : « mod »");
  // La hiérarchie est celle du moteur, et elle est délibérée : « crit » est
  // réservé à ce qui ferme une famille entière ou impose l'isolement d'urgence
  // — SARM, ERV, carbapénémase. Une BLSE est « high ». J'avais supposé
  // « crit » ; le banc doit décrire le moteur, pas mes attentes.
  verif(sev(lire("ecoli", { AMX: "R", AMC: "R", CTX: "R", CAZ: "R", FOX: "S", CIP: "S" },
                 { syn: "Positif" })) === "high",
        "BLSE : « high »");
  verif(sev(lire("ecoli", { AMX: "R", AMC: "R", CTX: "R", IPM: "R", MEM: "R" })) === "crit",
        "suspicion de carbapénémase : « crit », un cran au-dessus de la BLSE");
  verif(sev(lire("efaecium", { AMP: "R", VA: "R", TEC: "R" })) === "crit",
        "ERV : « crit »");
  verif(sev(lire("saureus", { FOX: "R", PEN: "R", VA: "S" })) === "crit",
        "SARM : « crit »");
  verif(sev(lire("saureus", { FOX: "S", PEN: "R", VA: "S" })) === "mod",
        "SASM producteur de pénicillinase : « mod »");
  verif(sev(lire("ecloacae", { AMX: "R", AMC: "R", CTX: "R", CAZ: "R", FEP: "S" })) === "high",
        "céphalosporinase déréprimée : « high »");

  // La gravité ne doit jamais REDESCENDRE au fil des règles ajoutées après coup.
  var crit = lire("saureus", { FOX: "R", PEN: "R", VA: "I", E: "R", DA: "S" });
  verif(crit.sev === "crit", "vancomycine diminuée chez un SARM : la gravité reste au plus haut");
  verif(ORDRE.indexOf(crit.sev) >= ORDRE.indexOf("crit"),
        "… et aucune règle postérieure ne l'a abaissée");
})();

/* ---------- 2. La téicoplanine diminuée chez un SCN ---------- */
dire("\nTéicoplanine diminuée chez un staphylocoque à coagulase négative");
(function () {
  var A = lire("shaemolyticus", { FOX: "S", PEN: "S", VA: "S", TEC: "R" });
  verif(A.sev === "high", "la gravité monte de « wild » à « high »");
  verif(/téicoplanine/i.test(texte(A)), "… et une alerte nomme la téicoplanine");
  verif(/vancomycine reste souvent active/i.test(texte(A)),
        "… en rappelant que la vancomycine, elle, reste souvent active");
  // Chez S. aureus, la règle ne s'applique pas : elle vise les SCN.
  var B = lire("saureus", { FOX: "S", PEN: "S", VA: "S", TEC: "R" });
  verif(B.sev !== "high" || !/téicoplanine/i.test(texte(B)),
        "S. aureus : la règle des SCN ne s'y applique pas");
})();

/* ---------- 3. Le D-test — la règle qui évite un échec thérapeutique ---------- */
dire("\nMLSb inductible : la clindamycine ne se rend pas sans le D-test");
(function () {
  // Staphylocoque : érythromycine R, clindamycine S → chercher l'inductible.
  var sans = lire("saureus", { FOX: "S", PEN: "S", E: "R", DA: "S", VA: "S" });
  verif(/D-test/i.test(texte(sans)),
        "érythromycine R et clindamycine S : le D-test est réclamé avant de rendre la clindamycine");

  var pos = lire("saureus", { FOX: "S", PEN: "S", E: "R", DA: "S", VA: "S" }, { dtest: "Positif" });
  verif(/MLSb inductible/i.test(texte(pos)), "D-test positif : résistance MLSb inductible annoncée");
  verif(/rendue R|rendue résistante/i.test(texte(pos)),
        "… et la clindamycine est rendue RÉSISTANTE malgré son « S » in vitro");

  var neg = lire("saureus", { FOX: "S", PEN: "S", E: "R", DA: "S", VA: "S" }, { dtest: "Négatif" });
  verif(!/rendue R/i.test(texte(neg)) || /négatif/i.test(texte(neg)),
        "D-test négatif : la clindamycine n'est pas requalifiée");

  // Les deux R : il n'y a plus rien à induire, le D-test n'a plus d'objet.
  var cons = lire("saureus", { FOX: "S", PEN: "S", E: "R", DA: "R", VA: "S" });
  verif(!/D-test/i.test(texte(cons)),
        "érythromycine R ET clindamycine R : le D-test n'est plus demandé, il n'y a rien à induire");

  // Le pneumocoque porte la même règle — et NOMME en plus la MLSb constitutive.
  var pn = lire("pneumocoque", { OXA: "S", E: "R", DA: "S", VA: "S" });
  verif(/D-test/i.test(texte(pn)), "pneumocoque : la même règle vaut");
  var pnc = lire("pneumocoque", { OXA: "S", E: "R", DA: "R", VA: "S" });
  verif(/constitutive/i.test(texte(pnc)),
        "pneumocoque, les deux R : « résistance constitutive MLSb » est nommée");
})();

/* ---------- 4. Les règles propres au CA-SFM ---------- */
dire("\nLes règles que le CA-SFM ajoute, et que l'EUCAST ne porte pas");
(function () {
  function casfm(org, res, ctx) { return texte(lire(org, res, ctx || {}, "casfm")); }
  function eucast(org, res, ctx) { return texte(lire(org, res, ctx || {}, "eucast")); }

  // Masquage du méropénème chez Pseudomonas : prescrire un carbapénème quand
  // une β-lactamine plus étroite reste active est un mésusage.
  var p = { TZP: "S", CAZ: "S", FEP: "S", MEM: "S", IPM: "S", CIP: "S", GEN: "S", COL: "S" };
  verif(/masquage du méropénème|ne pas rendre le méropénème/i.test(casfm("paeru", p)),
        "Pseudomonas, méropénème actif et β-lactamines plus étroites actives : règle de masquage");
  verif(!/masquage du méropénème/i.test(eucast("paeru", p)),
        "… et l'EUCAST ne la porte pas : la règle est bien française");

  var pR = { TZP: "R", CAZ: "R", FEP: "R", MEM: "S", IPM: "S", CIP: "R", GEN: "R" };
  verif(!/masquage du méropénème/i.test(casfm("paeru", pR)),
        "… plus aucune β-lactamine étroite active : le méropénème n'est plus masqué");

  // UNE RÈGLE D'ESPÈCE NE DOIT PAS DÉBORDER. Je n'éprouvais que son
  // déclenchement ; muter.py a montré qu'en remplaçant le « et » par un
  // « ou », elle s'appliquait à TOUTE espèce ayant un méropénème actif —
  // et aucun contrôle ne tombait. Un conseil juste chez Pseudomonas est
  // un contresens chez une entérobactérie à carbapénémase.
  verif(!/masquage du méropénème/i.test(
          casfm("ecoli", { AMX: "S", AMC: "S", CTX: "S", MEM: "S", IPM: "S", CIP: "S" })),
        "E. coli, méropénème actif : la règle de Pseudomonas ne déborde pas sur lui");
  verif(!/masquage du méropénème/i.test(
          casfm("ecloacae", { AMX: "R", AMC: "R", CTX: "R", MEM: "S", FEP: "S" })),
        "… ni sur Enterobacter");

  // Moraxella : chercher la β-lactamase avant de rendre une aminopénicilline S.
  verif(/β-lactamase par test chromogénique/i.test(casfm("moraxella", { AMX: "S", PEN: "S" })),
        "Moraxella, amoxicilline rendue S : le CA-SFM veut le test chromogénique d'abord");
  verif(!/chromogénique/i.test(casfm("moraxella", { AMX: "R", PEN: "R" })),
        "… et pas quand l'amoxicilline est résistante : il n'y a plus de doute à lever");

  // Acinetobacter et Stenotrophomonas : valeurs adaptées du CLSI.
  verif(/CLSI M100/i.test(casfm("acineto", { IPM: "S", CAZ: "S", CIP: "S", GEN: "S" })),
        "Acinetobacter : les valeurs adaptées du CLSI M100 sont signalées");
  verif(/CLSI M100/i.test(casfm("steno", { SXT: "S", LVX: "S", MIN: "S" })),
        "Stenotrophomonas : idem, avec la lévofloxacine retenue à 1 mg/L");
  verif(!/CLSI M100/i.test(eucast("acineto", { IPM: "S", CAZ: "S", CIP: "S", GEN: "S" })),
        "… et rien de tout cela sous le référentiel EUCAST");

  // S. saprophyticus : un dépistage négatif à l'ampicilline ne suffit pas.
  verif(/saprophyticus|méticillino-sensible/i.test(
          casfm("ssaprophyticus", { AMX: "S", FOX: "S", VA: "S" })),
        "S. saprophyticus, amoxicilline S : le CA-SFM veut vérifier la méticilline aussi");

  // Rifampicine : jamais seule.
  verif(/en association/i.test(casfm("saureus", { FOX: "S", PEN: "S", RD: "S", VA: "S" })),
        "rifampicine S : le CA-SFM exige la mention « à utiliser en association »");
  verif(!/en association/i.test(eucast("saureus", { FOX: "S", PEN: "S", RD: "S", VA: "S" })),
        "… mention que l'EUCAST ne réclame pas");
})();

/* ---------- 5. Les gravités portées par une règle tardive ---------- */
dire("\nUne règle qui survient après le verdict doit pouvoir élever la gravité");
(function () {
  // Campylobacter : le macrolide EST le traitement. Le perdre change la
  // gravité, et c'est tout ce que le clinicien doit retenir du rendu.
  var ok = lire("campylobacter", { AZM: "S", E: "S", CIP: "R" });
  verif(ok.sev === "wild", "macrolide actif : gravité ordinaire, même avec une fluoroquinolone R");
  var ko1 = lire("campylobacter", { AZM: "R", E: "S", CIP: "R" });
  verif(ko1.sev === "high", "azithromycine R : la gravité monte");
  var ko2 = lire("campylobacter", { AZM: "S", E: "R", CIP: "R" });
  verif(ko2.sev === "high", "érythromycine R : elle monte aussi — l'une OU l'autre suffit");
  verif(/perte du traitement de référence/i.test(texte(ko1)),
        "… et l'alerte dit que le traitement de référence est perdu");

  // Stenotrophomonas : le cotrimoxazole perdu fait passer au plus grave.
  verif(lire("steno", { SXT: "S", LVX: "S", MIN: "S" }).sev === "high",
        "Stenotrophomonas avec cotrimoxazole actif : « high », la multirésistance est naturelle");
  verif(lire("steno", { SXT: "R", LVX: "S", MIN: "S" }).sev === "crit",
        "cotrimoxazole R : « crit » — le traitement de référence est tombé");
})();

dire("\n" + (KO ? KO + " échec(s) sur " + (OK + KO) + " contrôles."
                : OK + " contrôles : la gravité, le D-test et les règles du CA-SFM"
                    + " ne peuvent plus changer sans que rien ne tombe."));
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
