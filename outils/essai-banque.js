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

var E, QUIZ_BANK, QUIZ_BANK_EN, LIBELLES, CTX_LIBELLE, CTX_LIBELLE_EN, OK = 0, KO = 0;

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
    // Le moteur réclame DEUX fichiers de données : la base de règles et les
    // posologies. Un require qui rendrait toujours le même les confondrait.
    var modP = { exports: {} };
    (new Function("module", "exports", lire("posologie.js")))(modP, modP.exports);
    var mod = { exports: {} };
    (new Function("module", "exports", "require", lire("moteur.js")))(
      mod, mod.exports,
      function (nom) { return /posologie/.test(nom) ? modP.exports : modB.exports; });
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

  // La banque en anglais, extraite de la même façon. Ce banc est le seul à
  // EXÉCUTER les deux tables : verifier-langues.py les confronte comme du
  // texte, et ne verrait pas une table qui ne s'analyse plus.
  var ie = page.indexOf("const QUIZ_BANK_EN = {");
  if (ie < 0) throw new Error("QUIZ_BANK_EN introuvable dans phenobac.html");
  var je = page.indexOf("{", ie), profe = 0, fine = -1;
  for (var ke = je; ke < page.length; ke++) {
    if (page[ke] === "{") profe++;
    else if (page[ke] === "}") { profe--; if (profe === 0) { fine = ke; break; } }
  }
  QUIZ_BANK_EN = (new Function("return " + page.slice(je, fine + 1)))();

  /* Libellés des tests complémentaires : la carte les affiche en pastilles.
     Sans eux, une clé de contexte s'afficherait sous son nom de code.

     LA TABLE S'APPELLE DÉSORMAIS CTX_LIBELLE_FR, et « CTX_LIBELLE » est un
     Proxy qui choisit la langue. Ce banc cherchait « const CTX_LIBELLE = { »
     et ne le trouvait plus : indexOf rendait -1, le découpage repartait du
     PREMIER « { » du fichier — une règle CSS — et le banc tombait sur
     « Unexpected token '--' ». Un extracteur qui part de -1 ne se trompe pas
     à moitié : il lit n'importe quoi. */
  var bornes = function (nom) {
    var a = page.indexOf("const " + nom + " = {");
    if (a < 0) throw new Error(nom + " introuvable dans phenobac.html");
    return (new Function("return " + page.slice(page.indexOf("{", a),
                         page.indexOf("};", a) + 1)))();
  };
  CTX_LIBELLE = bornes("CTX_LIBELLE_FR");
  CTX_LIBELLE_EN = bornes("CTX_LIBELLE_EN");

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

/* ------------------------------------------------------------
   Les arguments décrivent-ils l'antibiogramme qu'on a sous les yeux ?

   Un « argument en faveur » qui citerait une catégorie que la souche ne
   porte pas serait pire qu'une absence d'explication : il donnerait au
   raisonnement une apparence de rigueur en le fondant sur rien. Ce contrôle
   confronte donc chaque élément de la grille au résultat réellement saisi.

   Les éléments DISCORDANTS, eux, ne sont pas une faute : une BLSE
   accompagnée d'une imperméabilité atteint la céfoxitine, et le dire est
   juste. Ils sont comptés et affichés, pas sanctionnés.
   ------------------------------------------------------------ */
dire("\nLes arguments correspondent-ils à l'antibiogramme ?");
(function () {
  var avecGrille = 0, sansGrille = [], discordants = 0, niveaux = {}, declarees = {};
  var NIVEAUX = ["confirmé", "probable", "possible"];

  QUIZ_BANK.forEach(function (c, i) {
    if (c.kind === "ident") return;
    var cas = (c.kind === "combo") ? c.interp : c;
    if (!cas.res) return;
    var A = E.runInterpretation({ organism: cas.org, mode: "sir",
                                  results: cas.res, ctx: cas.ctx || {} }).interpretation;
    /* UNE CONCLUSION SANS ARGUMENTS EST DÉSORMAIS UNE FAUTE, sauf à dire
       pourquoi. Trente-deux phénotypes nommaient un mécanisme sans rien
       justifier ; le § 7 demande, POUR CHAQUE hypothèse, les arguments en
       faveur, les éléments discordants et un niveau de confiance. Il reste
       un cas légitime — Clostridioides difficile, qu'on ne met pas sur un
       antibiogramme — et il le déclare dans A.sansGrille. Déclarer coûte une
       phrase ; oublier ne coûte rien, et c'est bien le problème. */
    if (!A.pour && !A.contre) {
      sansGrille.push(cas.org);
      if (A.sansGrille) {
        OK++;
        declarees[cas.org] = A.sansGrille;
      } else {
        KO++;
        dire("  ÉCHEC  cas " + (i + 1) + " (" + cas.org + ") : « " + A.name +
             " » est conclu sans aucun argument, et sans dire pourquoi. " +
             "Ajoutez une grille parce(), ou déclarez A.sansGrille avec la raison.");
      }
      return;
    }
    avecGrille++;

    (A.pour || []).concat(A.contre || []).forEach(function (x) {
      if (cas.res[x.abx] !== x.cat) {
        KO++;
        dire("  ÉCHEC  cas " + (i + 1) + " (" + cas.org + ") : la grille cite " +
             x.abx + " " + x.cat + ", l'antibiogramme porte " + (cas.res[x.abx] || "rien"));
      } else { OK++; }
    });

    if (NIVEAUX.indexOf(A.confiance) === -1) {
      KO++; dire("  ÉCHEC  cas " + (i + 1) + " : niveau de confiance inattendu « " + A.confiance + " »");
    } else { OK++; niveaux[A.confiance] = (niveaux[A.confiance] || 0) + 1; }

    if (A.confirmation && A.confiance !== "confirmé") {
      KO++; dire("  ÉCHEC  cas " + (i + 1) + " : un test de confirmation est cité, mais la confiance reste « " + A.confiance + " »");
    } else { OK++; }

    discordants += (A.contre || []).length;
  });

  dire("  " + avecGrille + " cas sur " + (avecGrille + sansGrille.length) +
       " portent une grille d'arguments.");
  dire("  niveaux : " + NIVEAUX.map(function (n) { return (niveaux[n] || 0) + " " + n; }).join(", ") + ".");
  if (discordants) dire("  " + discordants + " élément(s) discordant(s) signalé(s) — ce n'est pas une faute.");
  Object.keys(declarees).forEach(function (org) {
    dire("  sans grille, et le dit : " + org + " — " + declarees[org] + ".");
  });
})();

/* ---------- LES DEUX LANGUES, EXÉCUTÉES ----------

   verifier-langues.py confronte les deux banques comme du TEXTE : il compte
   les identifiants et les propositions. Ce qu'il ne peut pas voir, c'est une
   table qui ne s'analyse plus — c'est exactement ce qui est arrivé à
   langue.js, resté au vert partout alors qu'aucun navigateur ne l'aurait
   exécuté. Ici les deux banques sont ÉVALUÉES, puis confrontées sur ce qui
   compte pour l'apprenant.

   LE CONTRÔLE QUI COMPTE LE PLUS : la bonne réponse doit figurer parmi les
   propositions. Une traduction qui reformule la réponse sans reformuler
   l'option correspondante rend le cas insoluble — et l'apprenant se croit
   en faute. */
// Ce banc compte lui-même ses OK et ses KO, sans fonction d'assertion.
function verif(ok, txt) { ok ? OK++ : KO++; dire((ok ? "  ok   " : "  ÉCHEC") + "  " + txt); }

dire("\nLa banque dit-elle la même chose dans les deux langues ?");
(function () {
  var ids = QUIZ_BANK.map(function (c) { return c.id; }).filter(Boolean);
  verif(ids.length === QUIZ_BANK.length,
        "les " + QUIZ_BANK.length + " cas portent un identifiant : sans lui, la "
        + "traduction s'indexerait sur la position et glisserait au premier cas inséré");

  var sansTrad = ids.filter(function (k) { return !QUIZ_BANK_EN[k]; });
  verif(sansTrad.length === 0,
        sansTrad.length === 0
          ? "les " + ids.length + " cas ont leur traduction anglaise"
          : sansTrad.length + " cas sans traduction : " + sansTrad.join(", "));

  var orphelines = Object.keys(QUIZ_BANK_EN).filter(function (k) { return ids.indexOf(k) < 0; });
  verif(orphelines.length === 0,
        orphelines.length === 0
          ? "… et aucune traduction ne survit à son cas"
          : "traduction(s) orpheline(s) : " + orphelines.join(", "));

  var horsListe = [], compte = [], vides = [];
  QUIZ_BANK.forEach(function (c) {
    var t = QUIZ_BANK_EN[c.id];
    if (!t) return;
    if (t.options && c.options && t.options.length !== c.options.length) {
      compte.push(c.id + " (" + c.options.length + " contre " + t.options.length + ")");
    }
    if (t.answer && t.options && t.options.indexOf(t.answer) < 0) {
      horsListe.push(c.id + " : « " + t.answer + " »");
    }
    if (c.q2 && t.q2 && t.q2.answer && t.q2.options && t.q2.options.indexOf(t.q2.answer) < 0) {
      horsListe.push(c.id + " (q2) : « " + t.q2.answer + " »");
    }
    ["answer", "teach"].forEach(function (champ) {
      if (t[champ] !== undefined && !String(t[champ]).trim()) vides.push(c.id + "." + champ);
    });
  });
  verif(compte.length === 0,
        compte.length === 0
          ? "chaque cas a le même nombre de propositions dans les deux langues"
          : "nombre de propositions différent : " + compte.join(", "));
  verif(horsListe.length === 0,
        horsListe.length === 0
          ? "… et la bonne réponse anglaise figure toujours PARMI les propositions "
            + "anglaises — sans quoi le cas serait insoluble et l'apprenant se croirait "
            + "en faute"
          : "la bonne réponse ne figure pas dans les propositions : " + horsListe.join(" ; "));
  verif(vides.length === 0,
        vides.length === 0 ? "aucun champ traduit n'est vide" : "champ(s) vide(s) : " + vides.join(", "));

  // Les libellés de contexte : les mêmes clés de part et d'autre, sinon une
  // pastille s'afficherait sous son nom de code en anglais.
  var ctxManquants = Object.keys(CTX_LIBELLE).filter(function (k) { return !CTX_LIBELLE_EN[k]; });
  verif(ctxManquants.length === 0,
        ctxManquants.length === 0
          ? "les " + Object.keys(CTX_LIBELLE).length + " libellés de contexte ont leur anglais"
          : "libellé(s) de contexte sans anglais : " + ctxManquants.join(", ")
            + " — la pastille s'afficherait sous son nom de code");
})();

dire("\n" + QUIZ_BANK.length + " cas dans la banque — " + exacts + " sur le titre du phénotype, "
     + secondaires + " sur un axe secondaire appuyé par le moteur.");
dire(KO ? KO + " échec(s) sur " + (OK + KO) + " contrôles."
        : OK + " contrôles, la banque et le moteur concordent.");
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
