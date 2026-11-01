/* ============================================================
   essai-categorisation.js — la mesure de paillasse devient une catégorie

   CE QUE CE BANC PROTÈGE

   Quatre fonctions transforment un chiffre lu sur une boîte en S, I ou R :
   parseMic, catFromMic, parseDiam, catFromDiam. Tout le reste de PhénoBac
   en dépend — le phénotype, les règles expertes, le rendu ciblé, la
   posologie. AUCUN BANC NE LES APPELAIT. C'est outils/muter.py qui l'a
   montré : on pouvait y inverser un « >= » ou changer un « ou » en « et »
   sans qu'aucun contrôle ne tombe.

   Et il y avait bien une faute, dans le sens le plus dangereux.

   UNE BORNE N'EST PAS UNE VALEUR. « ≥ 0,25 » dit que la CMI vaut au moins
   0,25 : elle peut valoir 0,25, elle peut valoir 8. catFromMic rendait
   « S » — elle déclarait active une molécule qui pouvait être résistante,
   à partir d'une mesure qui ne le disait pas. Symétriquement « ≤ 2 »
   rendait « R » et privait le malade d'un antibiotique peut-être actif.
   La fonction jumelle des diamètres faisait déjà le bon choix.

   Avec Node :             node outils/essai-categorisation.js
   Sans Node, sur macOS :  …/jsc outils/essai-categorisation.js
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
  var mv = ch("voies.js");
  // LE RÉSOLVEUR LÈVE SUR UN NOM QU'IL NE CONNAÎT PAS. Il rendait la base de
  // connaissances par défaut : require("./voies") aurait rendu la base, et le
  // moteur, ne trouvant pas VOIES, n'aurait affiché AUCUNE voie — au vert.
  var resoudre = function (nom) {
    if (/posologie/.test(nom)) return mp;
    if (/voies/.test(nom)) return mv;
    if (/rendu-cible/.test(nom)) return mr;
    if (/base-connaissances/.test(nom)) return mb;
    throw new Error("le banc ne sait pas charger " + nom
      + " : ajoutez-le ici plutôt que de lui substituer la base");
  };
  (new Function("module", "exports", "require", readFile("moteur.js")))(
    mm, mm.exports,
    resoudre);
  E = mm.exports;
}

function dire(s) { (typeof console === "object" ? console.log : print)(s); }
function verif(ok, txt) { ok ? OK++ : KO++; dire((ok ? "  ok   " : "  ÉCHEC") + "  " + txt); }
function cat(v, bp) { return E.catFromMic(v, bp); }
function dia(v, dz) { return E.catFromDiam(v, dz); }

/* Un seuil courant : sensible jusqu'à 0,5 inclus, résistant au-delà.
   Il n'y a donc pas d'intervalle « I » : S et R se touchent. */
var SERRE = { S: 0.5, R: 0.5 };
/* Un seuil avec un intervalle intermédiaire : S ≤ 1, I jusqu'à 4, R > 4. */
var LARGE = { S: 1, R: 4 };

/* ---------- 1. Lire ce qui est écrit ---------- */
dire("\nLire la mesure telle que la paillasse l'écrit");
(function () {
  function lu(v) { var p = E.parseMic(v); return p ? p.op + "|" + p.v : null; }
  verif(lu("0.25") === "=|0.25", "un nombre simple");
  verif(lu("0,25") === "=|0.25", "la virgule décimale française");
  verif(lu(" 0.5 ") === "=|0.5", "les espaces autour");
  verif(lu("≤0.25") === "<=|0.25", "le signe ≤ des automates");
  verif(lu("<=0.25") === "<=|0.25", "sa forme tapée au clavier");
  verif(lu("≥2") === ">=|2", "le signe ≥");
  verif(lu(">8") === ">|8", "le strictement supérieur");
  verif(lu("<0.5") === "<|0.5", "le strictement inférieur");
  // Ce qui n'est pas une mesure ne doit pas devenir une mesure.
  ["", "   ", "abc", "-1", null, undefined].forEach(function (v) {
    verif(E.parseMic(v) === null, JSON.stringify(v) + " : refusé, et non interprété");
  });
})();

/* ---------- 2. Les bornes du seuil, une par une ---------- */
dire("\nLes bornes : c'est là que se joue la catégorie");
(function () {
  verif(cat("0.5", SERRE) === "S", "0,5 avec S ≤ 0,5 : sensible — la borne est INCLUSE");
  verif(cat("1", SERRE) === "R", "1 : résistant");
  verif(cat("1", LARGE) === "S", "1 avec S ≤ 1 : sensible");
  verif(cat("2", LARGE) === "I", "2 : entre les deux bornes, intermédiaire");
  verif(cat("4", LARGE) === "I", "4 avec R > 4 : encore intermédiaire — la borne R est EXCLUE");
  verif(cat("4.001", LARGE) === "R", "juste au-dessus de 4 : résistant");
  verif(cat("0.0625", LARGE) === "S", "une dilution basse reste sensible");
})();

/* ---------- 3. UNE BORNE N'EST PAS UNE VALEUR ---------- */
dire("\nUne borne ne conclut que si elle suffit à elle seule");
(function () {
  // Borne supérieure.
  verif(cat("≤0.25", SERRE) === "S",
        "« ≤ 0,25 » sous S ≤ 0,5 : sensible — même la pire valeur possible l'est");
  verif(cat("≤2", SERRE) === null,
        "« ≤ 2 » sous S ≤ 0,5 : AUCUNE catégorie — la CMI peut valoir 0,25 (S) ou 1 (R)");
  verif(cat("<0.5", SERRE) === "S", "« < 0,5 » : sensible");
  verif(cat("<2", LARGE) === null, "« < 2 » sous S ≤ 1 : indécis, la CMI peut valoir 1,5");

  // Borne inférieure — le sens dangereux.
  verif(cat("≥2", SERRE) === "R",
        "« ≥ 2 » sous R > 0,5 : résistant — même la meilleure valeur possible l'est");
  verif(cat(">0.5", SERRE) === "R", "« > 0,5 » : résistant");
  verif(cat("≥0.25", SERRE) === null,
        "« ≥ 0,25 » : AUCUNE catégorie — c'est ici que le moteur rendait « S » sur une "
        + "souche qui pouvait être résistante");
  verif(cat("≥1", LARGE) === null, "« ≥ 1 » sous R > 4 : indécis");
  verif(cat("≥4", LARGE) === null, "« ≥ 4 » : indécis — 4 est encore intermédiaire");
  verif(cat(">4", LARGE) === "R", "« > 4 » : résistant, la borne R est franchie");
})();

/* ---------- 4. Quand le référentiel ne prévoit aucun « sensible » ---------- */
dire("\nSans catégorie « sensible », la souche est au mieux intermédiaire");
(function () {
  var SANS = { S: null, R: 2 };
  verif(cat("0.5", SANS) === "I", "une CMI basse : intermédiaire, jamais sensible");
  verif(cat("2", SANS) === "I", "à la borne : encore intermédiaire");
  verif(cat("4", SANS) === "R", "au-delà : résistant");
  verif(cat("≤1", SANS) === "I", "« ≤ 1 » : intermédiaire, la pire valeur l'est aussi");
  verif(cat("≥4", SANS) === "R", "« ≥ 4 » : résistant");
  verif(cat("≥1", SANS) === null, "« ≥ 1 » : indécis");
})();

/* ---------- 5. Les diamètres : le sens est inversé ---------- */
dire("\nLes diamètres — grand diamètre, souche sensible");
(function () {
  var DZ = { S: 25, R: 22 };
  function lu(v) { var p = E.parseDiam(v); return p ? p.op + "|" + p.v : null; }
  verif(lu("20mm") === "=|20", "l'unité « mm » est tolérée");
  verif(dia("30", DZ) === "S", "30 mm : sensible");
  verif(dia("25", DZ) === "S", "25 mm : sensible — la borne S est INCLUSE");
  verif(dia("24", DZ) === "I", "24 mm : intermédiaire");
  verif(dia("22", DZ) === "I", "22 mm : intermédiaire — la borne R est EXCLUE");
  verif(dia("21", DZ) === "R", "21 mm : résistant");
  verif(dia("0", DZ) === "R", "0 mm — pas de zone : résistant, et lu comme 6 mm");
  verif(dia("6", DZ) === "R", "6 mm — le disque lui-même : résistant");
  verif(E.parseDiam("5") === null, "5 mm : impossible, le disque en mesure déjà 6");
  verif(E.parseDiam("61") === null, "61 mm : impossible sur une boîte de 90 mm");
  verif(dia("≥25", DZ) === "S", "« ≥ 25 » : sensible");
  verif(dia("≥23", DZ) === null, "« ≥ 23 » : indécis — la zone peut valoir 23 (I) ou 30 (S)");
  verif(dia("≤21", DZ) === "R", "« ≤ 21 » : résistant");
  verif(dia("≤30", DZ) === null, "« ≤ 30 » : indécis");
})();

/* ---------- 6. Les deux chemins disent la même chose ---------- */
dire("\nCMI et diamètre refusent de deviner de la même façon");
(function () {
  verif(cat("≥0.25", SERRE) === null && dia("≥23", { S: 25, R: 22 }) === null,
        "une borne qui ne tranche pas ne rend AUCUNE catégorie, des deux côtés");
  verif(cat("abc", SERRE) === null && dia("abc", { S: 25, R: 22 }) === null,
        "une saisie illisible ne rend aucune catégorie, des deux côtés");
  verif(cat("1", null) === null && dia("25", null) === null,
        "sans seuil, aucune catégorie — et surtout aucune invention");
})();

/* ---------- 7. Et de bout en bout, par le moteur ---------- */
dire("\nLe même refus, vu depuis l'interprétation complète");
(function () {
  var out = E.runInterpretation({ organism: "ecoli", mode: "mic",
                                  mic: { CTX: "≥0.25", CAZ: "0.25" }, ctx: {} });
  verif(out.categories.CAZ === "S", "une CMI exacte est catégorisée");
  verif(!out.categories.CTX,
        "une borne qui ne tranche pas ne produit pas de catégorie, même au bout de la chaîne");
})();

/* ---------- 8. LE SITE CHOISIT LA TABLE ----------

   Savoir LIRE une mesure ne sert à rien si l'on se trompe de table. Le même
   0,5 mg/L de pénicilline vaut « I » sur une hémoculture et « R » sur un
   LCR — les seuils méningés sont plus stricts parce que l'antibiotique y
   diffuse mal. Se tromper de site, c'est rendre sensible une souche qui
   tuera le malade.

   muter.py a montré que ce choix n'était éprouvé par rien : on pouvait
   inverser « c.mening === "Oui" » sans qu'aucun contrôle ne tombe. */
dire("\nLe site choisit la table de seuils");
function categ(org, mic, ctx, ref) {
  return E.runInterpretation({ organism: org, mode: "mic", mic: mic,
                               ctx: ctx || {}, ref: ref || "eucast" }).categories;
}
(function () {
  // Pénicilline sur pneumocoque : la même CMI, deux catégories.
  verif(categ("pneumocoque", { PEN: "0.5" }, {}).PEN === "I",
        "pénicilline 0,5 mg/L, site ordinaire : intermédiaire");
  verif(categ("pneumocoque", { PEN: "0.5" }, { mening: "Oui" }).PEN === "R",
        "la MÊME CMI en contexte méningé : RÉSISTANT — le seuil y est plus strict");
  verif(categ("pneumocoque", { CTX: "1" }, {}).CTX === "I",
        "céfotaxime 1 mg/L, site ordinaire : intermédiaire");
  verif(categ("pneumocoque", { CTX: "1" }, { mening: "Oui" }).CTX === "R",
        "… et résistant sur un LCR");
  verif(categ("pneumocoque", { PEN: "0.5" }, { mening: "Oui" }, "casfm").PEN === "R",
        "le CA-SFM dit la même chose, par sa propre table méningée");

  /* LA TABLE MÉNINGÉE DU CA-SFM DOIT ÊTRE LA SIENNE. Ma première épreuve ne
     le montrait pas : sur le pneumocoque, les deux comités tombent d'accord,
     et retirer la ligne du CA-SFM laissait la table de l'EUCAST donner la
     même réponse. Le méningocoque les sépare — le CA-SFM chiffre
     l'amoxicilline en contexte méningé, l'EUCAST non. */
  verif(categ("nmeningitidis", { AMX: "0.5" }, { mening: "Oui" }, "casfm").AMX === "R",
        "méningocoque, amoxicilline 0,5 : résistant par la table méningée du CA-SFM");
  verif(categ("nmeningitidis", { AMX: "0.5" }, { mening: "Oui" }, "eucast").AMX === "I",
        "… intermédiaire sous l'EUCAST, qui n'a pas de table méningée pour ce couple");
  verif(categ("nmeningitidis", { AMX: "0.5" }, {}, "casfm").AMX === "I",
        "… et intermédiaire aussi hors contexte méningé : c'est bien le site qui tranche");

  // Le méningé l'emporte sur l'urinaire : un LCR n'est pas une urine.
  verif(categ("pneumocoque", { PEN: "0.5" }, { mening: "Oui", urin: "Oui" }).PEN === "R",
        "les deux contextes cochés : c'est le méningé qui tranche");
})();

/* ---------- 9. Les molécules qui n'existent QUE pour la cystite ---------- */
dire("\nCertaines molécules n'ont de seuil que pour la cystite simple");
(function () {
  // L'EUCAST ne chiffre le pivmécillinam, la nitrofurantoïne, le
  // triméthoprime et le céfixime QUE pour cette indication. Hors d'elle, il
  // n'y a pas de seuil — et dire « sensible » serait appliquer le seuil d'une
  // autre indication à un prélèvement qui n'en relève pas.
  // LA FOSFOMYCINE LES A REJOINTES le 25 octobre 2026. Elle servait jusque-là
  // de contre-exemple — « toutes ne sont pas urinaires » — parce qu'elle
  // portait un seuil hors cystite. Elle n'aurait pas dû : le document ne la
  // chiffre que pour E. coli et pour l'infection urinaire, et renvoie tout le
  // reste à une note. Le contre-exemple est désormais la ciprofloxacine, qui
  // a bien un seuil dans les deux contextes.
  ["MEC", "NIT", "TMP", "CFM", "FOS"].forEach(function (k) {
    var m = {}; m[k] = k === "NIT" ? "32" : (k === "FOS" ? "8" : "1");
    verif(categ("ecoli", m, {})[k] === undefined,
          k + " hors cystite : AUCUNE catégorie — le référentiel n'en chiffre pas");
    verif(categ("ecoli", m, { urin: "Oui" })[k] === "S",
          k + " en cystite simple : catégorisé");
  });
  verif(categ("ecoli", { CIP: "0.125" }, {}).CIP === "S",
        "la ciprofloxacine, elle, a un seuil hors cystite : toutes ne sont pas urinaires");
  // Et la fosfomycine ajoute une restriction d'ESPÈCE que les quatre autres
  // n'ont pas : cochée ou non, elle ne vaut pas pour Klebsiella.
  verif(categ("kpneu", { FOS: "8" }, { urin: "Oui" }).FOS === undefined,
        "fosfomycine sur Klebsiella, même en cystite : aucune catégorie — E. coli seulement");
  verif(categ("ecoli", { FOS: "8" }, { urin: "Oui" }).FOS === "S",
        "… alors que sur E. coli en cystite, elle est catégorisée");
})();

/* ---------- 10. La restriction d'espèce ---------- */
dire("\nUn seuil validé pour une espèce ne vaut pas pour sa voisine");
(function () {
  // L'EUCAST ne valide la nitrofurantoïne que chez E. coli. Chez Klebsiella,
  // le même chiffre n'a pas de seuil — « un chiffre juste au mauvais
  // endroit », dit le moteur, et c'est exactement cela.
  verif(categ("ecoli", { NIT: "32" }, { urin: "Oui" }).NIT === "S",
        "nitrofurantoïne chez E. coli, en cystite : catégorisée");
  verif(categ("kpneu", { NIT: "32" }, { urin: "Oui" }).NIT === undefined,
        "la MÊME mesure chez Klebsiella : aucune catégorie — le seuil n'y est pas validé");
  // Les autres molécules urinaires, elles, ne sont pas restreintes.
  verif(categ("kpneu", { MEC: "1" }, { urin: "Oui" }).MEC === "S",
        "le pivmécillinam, lui, vaut pour les deux : la restriction n'est pas globale");
})();

/* ---------- 10 bis. LA RESTRICTION PORTE SUR UNE MÉTHODE ----------

   LE CHANGEMENT DU 2026-11-01, ET POURQUOI IL DEMANDE CE BANC.

   La restriction d'espèce s'indexait sur « groupe:molécule ». Une
   restriction écrite sur la ligne de CMI gouvernait donc aussi le disque, et
   réciproquement. Cela marchait tant que le document restreignait des LIGNES
   ENTIÈRES — et il le fait presque toujours : « Imipenem, E. faecalis »
   nomme l'espèce pour la CMI comme pour le diamètre.

   La vancomycine de l'entérocoque est l'exception, et elle est exactement à
   l'envers de ce que l'ancienne clé savait dire. Classeur v16.1, feuille
   « Enterococcus » :

       l.81  Vancomycin, E. faecalis and E. faecium   CMI 4/4   disque 12/12
       l.82  Vancomycin, E. casseliflavus and           «  -  »      «  -  »
             E. gallinarum
       l.83  Vancomycin, other enterococci            CMI 4/4   disque 15/15

   La CMI est la MÊME partout ; seul le diamètre sépare. Restreindre le
   couple entier aurait retiré aux autres entérocoques une concentration
   critique que l'EUCAST leur accorde.

   LE PRIX DU GAIN EST UNE INVERSION DU SENS DE PANNE. Avant, oublier la
   restriction sur une ligne était rattrapé par la ligne sœur ; maintenant,
   l'oubli OUVRE le seuil, en silence. Trois garde-fous répondent à cela —
   celui-ci éprouve les deux premiers, verifier-fratries.py tient le
   troisième (chaque ligne d'un couple restreint doit être tranchée). */
dire("\nLa restriction d'espèce porte sur une méthode, et l'oubli doit lever");
(function () {
  /* 1. LA PORTE LÈVE SI ON L'APPELLE SANS MÉTHODE.
     C'est le garde-fou le plus important du lot : un appel qui oublie la
     méthode ne trouverait aucune limite, conclurait « autorisé », et
     rendrait un seuil à une espèce que le document exclut. */
  var leve = false;
  try { E.especeAutorisee("enteroc", "VA", "eucast"); }
  catch (e) { leve = /méthode/.test(String(e)); }
  verif(leve, "especeAutorisee() sans méthode LÈVE au lieu d'ouvrir le seuil");
  var leve2 = false;
  try { E.especeAutorisee("enteroc", "VA", "eucast", "diametre"); }
  catch (e) { leve2 = /méthode/.test(String(e)); }
  verif(leve2, "… et une méthode inventée lève aussi : « diametre » n'est pas « disque »");
  verif(E.especeAutorisee("pseudo", "CAZ", "eucast", "cmi") === true,
        "… tandis qu'un couple sans restriction reste autorisé");

  /* 2. LA TABLE DIT CE QUE LE DOCUMENT DIT. */
  verif(!!E.ESPECE_EUCAST["enteroc:VA:disque"],
        "le diamètre de la vancomycine porte sa restriction d'espèce");
  verif(E.ESPECE_EUCAST["enteroc:VA:cmi"] === undefined,
        "… et la CMI n'en porte PAS : l'EUCAST la donne à tous les entérocoques");
  verif(!!E.ESPECE_EUCAST["pseudo:MEM:disque"] && E.ESPECE_EUCAST["pseudo:MEM:cmi"] === undefined,
        "même partage pour le méropénème de Pseudomonas : le diamètre est nommé, la CMI non");

  /* 3. AUCUNE LISTE NE NOMME UNE ESPÈCE QUI N'EXISTE PAS.
     Un identifiant mal orthographié ne correspondrait à aucune espèce : le
     seuil se fermerait pour TOUT LE MONDE. C'est le sens de panne sûr, mais
     c'est une panne, et elle est muette.

     CE CONTRÔLE A D'ABORD EXIGÉ QUE L'ESPÈCE SOIT DU GROUPE DE LA CLÉ, ET
     IL A ACCUSÉ QUARANTE-TROIS LIGNES JUSTES. Les listes sont à l'échelle
     de l'ORDRE, par construction : l'EUCAST publie une seule table pour les
     entérobactéries, PhénoBac en tient quatre groupes de seuils (entero,
     morganella, salmonella, serratia), et verifier-fratries.py exige que la
     restriction du pivmécillinam soit la MÊME dans les quatre. Chacune
     nomme donc des espèces des quatre groupes. Le filtre par groupe aurait
     fait rayer, pour « nettoyer », la symétrie que l'autre contrôle
     impose — deux contrôles qui se contredisent valent moins qu'un seul. */
  var fantomes = [], vides = [];
  [["eucast", E.ESPECE_EUCAST], ["casfm", E.ESPECE_CASFM]].forEach(function (p) {
    Object.keys(p[1]).forEach(function (cle) {
      var liste = p[1][cle];
      if (!liste || !liste.length) { vides.push(p[0] + " " + cle); return; }
      liste.forEach(function (id) {
        if (!E.ORG[id]) fantomes.push(p[0] + " " + cle + " nomme « " + id + " »");
      });
    });
  });
  verif(fantomes.length === 0,
        fantomes.length === 0
          ? "les " + (Object.keys(E.ESPECE_EUCAST).length + Object.keys(E.ESPECE_CASFM).length)
            + " restrictions ne nomment que des espèces que le moteur connaît"
          : "restriction qui nomme une espèce inconnue : " + fantomes.join(" ; "));
  verif(vides.length === 0,
        vides.length === 0 ? "aucune liste de restriction n'est vide"
          : "liste vide — le seuil se fermerait pour tout le monde : " + vides.join(", "));

  /* 4. LE BALAYAGE : une espèce hors liste n'obtient RIEN.
     Générique, et c'est voulu : il visite chaque restriction de la base, et
     non les trois que le banc aurait choisies. Une restriction ajoutée
     demain sera éprouvée sans qu'on y pense. */
  var ouverts = [], fermes = 0;
  Object.keys(E.ESPECE_EUCAST).forEach(function (cle) {
    var p = cle.split(":"), groupe = p[0], abx = p[1], meth = p[2];
    var liste = E.ESPECE_EUCAST[cle];
    Object.keys(E.ORG).forEach(function (id) {
      if (E.ORG[id].bpGroup !== groupe) return;
      if (liste.indexOf(id) !== -1) return;              // espèce autorisée
      /* DEUX MESURES, L'UNE FRANCHEMENT SENSIBLE ET L'AUTRE FRANCHEMENT
         RÉSISTANTE. Une seule ne suffit pas : plusieurs de ces seuils
         s'écrivent « S: null » — « ne jamais rendre sensible » —, et une
         mesure très sensible n'en tire alors aucune catégorie même quand la
         porte est grande ouverte. L'épreuve par mutation l'a montré :
         l'imipénème au disque échappait au balayage. */
      var sondes = meth === "cmi" ? ["0.002", "1024"] : ["45", "6"];
      var vu = null;
      sondes.forEach(function (v) {
        if (vu) return;
        var appel = { organism: id, ref: "eucast", ctx: { urin: "Oui" } };
        if (meth === "cmi") { appel.mode = "mic"; appel.mic = {}; appel.mic[abx] = v; }
        else { appel.mode = "diam"; appel.diam = {}; appel.diam[abx] = v; }
        var c = E.runInterpretation(appel).categories;
        if (c[abx] !== undefined) vu = c[abx] + " (mesure " + v + ")";
      });
      if (vu) ouverts.push(id + " obtient " + abx + " (" + meth + ") = " + vu);
      else fermes++;
    });
  });
  verif(ouverts.length === 0,
        ouverts.length === 0
          ? fermes + " couples (espèce hors liste, molécule restreinte) restent sans catégorie"
          : "UN SEUIL RESTREINT A ÉTÉ RENDU À UNE ESPÈCE EXCLUE : " + ouverts.join(" ; "));
  verif(fermes > 0, "… et le balayage a bien visité quelque chose (" + fermes + " cas)");

  /* 4 bis. L'EXCEPTION NOMINATIVE EST-ELLE RÉELLEMENT RENDUE ?

     Depuis le 2026-11-01, une ligne de la base peut donner un seuil À UNE
     ESPÈCE à côté d'une ligne générale qui le donne aux autres :
     l'oxacilline des staphylocoques, 2 mg/L pour S. aureus, S. lugdunensis
     et S. saprophyticus, 0,25 pour les autres — EUCAST note 4 des
     pénicillines, CA-SFM p72.

     Le moteur doit consulter cette table AVANT celle du groupe, dans
     CHACUNE des neuf branches de getBP et getDZ. En oublier une ne lève
     pas : la valeur du groupe sortirait, et elle est plausible — c'est
     même celle qui était rendue hier. Le banc exige donc que chaque clé de
     SEUIL_ESPECE soit atteinte par l'espèce qu'elle nomme, et avec SA
     valeur, et non celle du groupe. */
  var jamais = [], atteintes = 0;
  Object.keys(E.SEUIL_ESPECE).forEach(function (cle) {
    var p = cle.split(":");            // ref:meth:site:groupe:abx:espece
    var ref = p[0], meth = p[1], site = p[2], abx = p[4], id = p[5];
    var attendu = E.SEUIL_ESPECE[cle];
    var ctx = site === "urinaire" ? { urin: "Oui" }
            : site === "meninge"  ? { mening: "Oui" } : {};
    E.cadrer(ref, id);
    var lu = meth === "cmi" ? E.getBP({}, E.ORG[id].bpGroup, abx, ctx)
                            : E.getDZ({}, E.ORG[id].bpGroup, abx, ctx);
    if (!lu || lu.S !== attendu.S || lu.R !== attendu.R)
      jamais.push(cle + " : attendu " + JSON.stringify(attendu)
        + ", rendu " + JSON.stringify(lu));
    else atteintes++;
  });
  verif(jamais.length === 0,
        jamais.length === 0
          ? "les " + atteintes + " exceptions nominatives sont toutes rendues à "
            + "l'espèce qu'elles nomment"
          : "EXCEPTION NOMINATIVE NON RENDUE — la valeur du groupe sort à sa "
            + "place, et elle est plausible : " + jamais.join(" ; "));

  /* 4 ter. L'oxacilline, nommément : c'est elle qui a fait naître la table,
     et le défaut qu'elle corrige est le plus lourd rencontré jusqu'ici. Un
     S. aureus MÉTICILLINO-SENSIBLE dont la CMI d'oxacilline vaut 1 mg/L
     sortait « R » sous EUCAST ; le moteur en déduisait la
     méticillino-résistance et rayait TOUTES les β-lactamines. */
  ["eucast", "casfm"].forEach(function (ref) {
    verif(categ("saureus", { OXA: "1" }, {}, ref).OXA === "S",
          ref + " : S. aureus, oxacilline 1 mg/L → S (le seuil est 2, pas 0,25)");
    verif(categ("saureus", { OXA: "4" }, {}, ref).OXA === "R",
          ref + " : … et 4 mg/L → R, le seuil sépare toujours");
    verif(categ("ssaprophyticus", { OXA: "1" }, {}, ref).OXA === "S"
          && categ("slugdunensis", { OXA: "1" }, {}, ref).OXA === "S",
          ref + " : S. saprophyticus et S. lugdunensis suivent S. aureus — "
          + "les trois espèces que la note 4 nomme ensemble");
    verif(categ("sepidermidis", { OXA: "1" }, {}, ref).OXA === "R"
          && categ("shaemolyticus", { OXA: "1" }, {}, ref).OXA === "R",
          ref + " : … tandis que S. epidermidis et S. haemolyticus restent à 0,25");
  });
  /* Et le phénotype qui en découle : c'est là que se mesure le dégât. */
  (function () {
    var a = E.runInterpretation({ organism: "saureus", ref: "eucast", mode: "mic",
      mic: { OXA: "1" }, ctx: {} });
    verif(!/SARM|méticillino-rés/i.test((a.interpretation.name || "")
            + (a.interpretation.comment || "")),
          "un S. aureus à 1 mg/L d'oxacilline n'est plus rendu SARM : "
          + "« " + (a.interpretation.name || "sans nom") + " »");
  })();

  /* 5. Les espèces couvertes, elles, gardent leur seuil. Un contrôle qui
     ferme tout passerait les quatre précédents. */
  verif(categ("efaecalis", { VA: "2" }).VA === "S" && categ("efaecium", { VA: "2" }).VA === "S",
        "la vancomycine reste catégorisée en CMI chez les deux entérocoques couverts");
  var d = function (org, mm) { return E.runInterpretation({ organism: org, mode: "diam",
    diam: mm, ctx: {}, ref: "eucast" }).categories; };
  verif(d("efaecalis", { VA: "13" }).VA === "S" && d("efaecium", { VA: "11" }).VA === "R",
        "… et au disque, le 12 mm sépare toujours S de R chez E. faecalis et E. faecium");
  verif(d("paeru", { MEM: "22" }).MEM === "S" && d("paeru", { MEM: "13" }).MEM === "R",
        "… et le 20/14 du méropénème vaut toujours pour P. aeruginosa");
})();

/* ---------- 11. LA CATÉGORIE REPRISE D'UN AUTRE AGENT ----------

   LE DÉFAUT CORRIGÉ LE 2026-11-01, trouvé par comparer-eucast.py --notes.

   Feuille « Streptococcus A,B,C,G » du classeur v16.1 : l'amoxicilline et la
   céfotaxime portent « Note / Note » — aucun chiffre. PhénoBac appliquait
   pourtant 0,5 / 2 aux deux, c'est-à-dire, mot pour mot, la ligne
   « Cefotaxime (indications other than endocarditis and meningitis) » de la
   feuille S. PNEUMONIAE. Une valeur juste pour une espèce, appliquée à sa
   voisine — et marquée « convention de laboratoire », ce qui était honnête
   sur l'absence de seuil et muet sur la provenance du chiffre.

   Ce que le document dit à la place :

     « The susceptibility of streptococcus groups A, B, C and G to
       penicillins / cephalosporins / carbapenems is inferred from the
       benzylpenicillin susceptibility. »

   La catégorie ne se calcule pas : elle se REPREND. */
dire("\nLa catégorie que le document fait reprendre à un autre agent");
(function () {
  function m(org, mic, ref) {
    return E.runInterpretation({ organism: org, ref: ref || "eucast", mode: "mic",
                                 mic: mic, ctx: {} });
  }
  /* 1. Les quatre lignes empruntées ont disparu de la base. */
  verif(!(E.BP.strepacg && E.BP.strepacg.AMX) && !(E.BP.strepacg && E.BP.strepacg.CTX),
        "streptocoques A/C/G : plus de seuil propre pour l'amoxicilline ni la céfotaxime");
  verif(!(E.BP.strepb && E.BP.strepb.AMX) && !(E.BP.strepb && E.BP.strepb.CTX),
        "streptocoques B : idem");
  /* Et la pénicilline G, elle, garde le sien — sinon il n'y aurait plus rien
     à reprendre, et le banc comparerait deux silences. */
  verif(E.BP.strepacg.PEN && E.BP.strepacg.PEN.S === 0.03,
        "… tandis que la pénicilline G garde le sien (0,03 pour A/C/G)");
  verif(E.BP.strepb.PEN && E.BP.strepb.PEN.S === 0.125,
        "… et 0,125 pour le groupe B, qui n'est pas le même chiffre");

  /* 2. La reprise se fait, dans les deux sens et sous les deux référentiels. */
  ["eucast", "casfm"].forEach(function (ref) {
    var s = m("spyogenes", { PEN: "0.016", AMX: "1", CTX: "1" }, ref).categories;
    verif(s.AMX === "S" && s.CTX === "S",
          ref + " : pénicilline G sensible → amoxicilline et céfotaxime sensibles");
    var r = m("sagalactiae", { PEN: "0.5", AMX: "0.25" }, ref).categories;
    verif(r.PEN === "R" && r.AMX === "R",
          ref + " : pénicilline G résistante → amoxicilline résistante, "
          + "même avec une CMI basse — c'est le sens de « inferred from »");
  });

  /* 3. ELLE SE DIT. Une catégorie qui ne vient pas d'une mesure est une
     conclusion : le compte rendu doit permettre de la refaire. */
  var a = m("spyogenes", { PEN: "0.016", AMX: "1" }).interpretation;
  verif((a.deduites || []).length === 1 && a.deduites[0].source === "PEN",
        "… et la reprise est enregistrée, avec l'agent dont elle vient");
  verif((a.rules || []).some(function (x) { return /reprise de/.test(x.txt); }),
        "… et dite au compte rendu");

  /* 4. ON NE DÉDUIT PAS POUR UNE MOLÉCULE QUE PERSONNE N'A POSÉE. */
  var seul = m("spyogenes", { PEN: "0.016" }).categories;
  verif(seul.AMX === undefined && seul.CTX === undefined,
        "une molécule non testée ne reçoit pas de catégorie déduite : le compte "
        + "rendu ne parle pas d'antibiotiques qu'on n'a pas posés");

  /* 5. SANS SOURCE, PAS DE REPRISE. */
  verif(m("spyogenes", { AMX: "1" }).categories.AMX === undefined,
        "amoxicilline seule, sans pénicilline G : aucune catégorie — il n'y a "
        + "rien à reprendre, et l'application ne l'invente pas");

  /* 6. LE DÉSACCORD SAISI SE DIT, SANS ÊTRE RÉÉCRIT. On ne réécrit pas la
     paillasse en silence ; on signale que le document ne sépare pas les deux. */
  var d = E.runInterpretation({ organism: "spyogenes", ref: "eucast", mode: "sir",
                                results: { PEN: "S", AMX: "R" }, ctx: {} });
  verif(d.categories.AMX === "R",
        "une catégorie saisie n'est pas réécrite par la reprise");
  verif((d.interpretation.alerts || []).some(function (x) { return /déduit sa catégorie/.test(x.txt); }),
        "… mais le désaccord avec la pénicilline G est signalé");
  var ok = E.runInterpretation({ organism: "spyogenes", ref: "eucast", mode: "sir",
                                 results: { PEN: "S", AMX: "S" }, ctx: {} });
  verif(!(ok.interpretation.alerts || []).some(function (x) { return /déduit sa catégorie/.test(x.txt); }),
        "… et rien n'est dit quand les deux concordent");
})();

dire("\n" + (KO ? KO + " échec(s) sur " + (OK + KO) + " contrôles."
                : OK + " contrôles : une mesure ne devient une catégorie que"
                    + " lorsqu'elle la détermine."));
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
