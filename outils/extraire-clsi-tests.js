/* extraire-clsi-tests.js — lecture de la série 3 du CLSI M100 (les TESTS)
 *
 * CE QUE CETTE SÉRIE EST, ET POURQUOI ELLE DEMANDE UN AUTRE LECTEUR
 *
 * La série 2 donne des SEUILS : une ligne par antibiotique, des colonnes
 * S/SDD/I/R. extraire-clsi.js la lit.
 *
 * La série 3 donne des TESTS : dépistages et lectures indirectes. Sa grille
 * est TRANSPOSÉE — une ligne par critère (méthode, milieu, concentration,
 * inoculum, incubation, lecture, contrôle de qualité), une colonne par
 * variante de test. choisir(), dans l'autre lecteur, cherche un en-tête
 * « Antimicrobial Agent » : il ne trouve rien ici, et lire() rendrait ces
 * tables « vides ». Une table déclarée vide alors qu'elle est pleine est
 * pire qu'une table non lue : elle clôt la question.
 *
 * CE QU'ELLE RECOUVRE DANS PHÉNOBAC
 *   3A  BLSE — K. pneumoniae, K. oxytoca, E. coli, P. mirabilis
 *   3E  résistance à la colistine — entérobactéries, P. aeruginosa
 *   3G  β-lactamase — Staphylococcus spp.
 *   3H  gélose salée à l'oxacilline — S. aureus
 *   3I  gélose vancomycine — S. aureus, Enterococcus spp.
 *   3J  clindamycine inductible (test D) — staphylocoques, streptocoques
 *   3K  haut niveau de mupirocine — S. aureus
 *   3L  haut niveau d'aminosides — Enterococcus spp. ; c'est là, et NULLE
 *       PART dans les tables de seuils, que vit le code HLG de PhénoBac
 *
 * Ensemble, elles recouvrent les conventions `dep` (dépistage) et `temoin`
 * de la base.
 *
 * COMBIEN UNE TABLE A-T-ELLE DE COLONNES ? LA QUESTION N'EST PAS TRIVIALE.
 *
 * Compter les colonnes physiques donne un faux compte, dans les deux sens :
 *
 *   — en 3A, une colonne de test en occupe DEUX, parce que sa cellule de
 *     lecture est un couple « Cefpodoxime zone | ≤ 17 mm ». Six colonnes
 *     physiques, quatre tests.
 *   — en 3J, « Disk Diffusion (D-zone test) » couvre deux colonnes, que la
 *     ligne « Organism group » sépare ensuite en staphylocoques et
 *     streptocoques. Deux méthodes, mais bien quatre tests.
 *
 * Les colonnes logiques sont donc la PARTITION LA PLUS FINE induite par les
 * lignes d'en-tête — la ligne 0, « Test method », « Organism group » —, et
 * non le compte des cellules de l'une d'elles. Cette partition se lit dans
 * le document : chaque début de cellule, à n'importe laquelle de ces lignes,
 * est une frontière. Rien n'est supposé.
 *
 * USAGE
 *   1. Portail ouvert, accès invité franchi.
 *   2. Coller outils/clsi-commun.js, PUIS ce fichier.
 *   3. await extraireTestsCLSI()
 *
 * CE QUE LE SCRIPT NE FAIT PAS
 *   Il ne devine pas. Une colonne qu'il ne sait pas nommer, un critère sans
 *   libellé, un exposant qui n'est ni un appel de note ni une marque : tout
 *   part dans « anomalies » et rien n'est inventé pour combler.
 *
 * COPYRIGHT — ET LA LIGNE DE PARTAGE, QUI N'EST PAS AU MÊME ENDROIT ICI
 *   Pour la série 2, le partage était simple : les seuils sont des faits, les
 *   commentaires sont l'expression du CLSI. Ici les deux se mêlent dans la
 *   même table. Entrent dans PhénoBac les CRITÈRES OPÉRATOIRES — espèces
 *   visées, milieu, concentration, inoculum, conditions et durée
 *   d'incubation, règle de lecture, souches de contrôle — qui sont des faits
 *   et qu'aucune autre formulation ne rendrait. Restent dehors les lignes de
 *   conduite rédigées (« Additional testing and reporting », « Reporting »,
 *   « Strengths », « Limitations », « When to perform this test ») : elles se
 *   lisent pour comprendre, elles ne se recopient pas. Chaque critère porte
 *   donc un drapeau `portable`, et c'est lui qui décide, pas le lecteur.
 *   Le JSON produit est une copie de travail et n'est pas versionné.
 */

(function () {
  "use strict";

  if (!window.CLSI_COMMUN)
    throw new Error("extraire-clsi-tests.js : coller d'abord outils/clsi-commun.js");
  var K = window.CLSI_COMMUN;

  // Les ONZE fiches de critères de la série 3. Les quatre autres tables de
  // la série — 3F-2, 3F-3, 3F-4 — sont des GRILLES DE SEUILS et reviennent
  // à extraire-clsi.js ; voir SERIE_3_AILLEURS plus bas.
  //
  // Un premier jet n'en déclarait que huit, et ne disait rien des sept
  // autres : ni lues, ni déclarées non lues. C'est le défaut même que la
  // liste TABLES_NON_LUES existe pour empêcher, commis sur la liste
  // elle-même. Une portée annoncée plus large que la portée réelle vaut
  // mieux que rien dit, mais pas de beaucoup : elle clôt la question.
  var TABLES = ["3A", "3B", "3C", "3D", "3E", "3F-1",
                "3G", "3H", "3I", "3J", "3K", "3L"];

  var SERIE_3_AILLEURS = ["3F-2", "3F-3", "3F-4"];

  /* CE QUE CE LECTEUR NE LIT PAS, ET QUI EXISTE.
   * La série 1 donne, par groupe d'espèces, les molécules à tester et à
   * rendre — l'équivalent du panel de PhénoBac. C'est une TROISIÈME forme :
   * ni grille de seuils, ni fiche de critères, mais des listes groupées par
   * rang de prescription. Elle est déclarée ici pour que son absence soit
   * écrite plutôt que supposée. */
  var TABLES_NON_LUES = ["1A-1", "1A-2", "1B-1", "1B-2", "1B-3", "1B-4", "1B-5",
                         "1C", "1D", "1E", "1F", "1G", "1H-1", "1H-2",
                         "1I", "1J"];

  var EST_METHODE  = /^test method$/i;
  var EST_ORGANISME = /^organism group/i;

  // Les critères rencontrés dans l'édition lue, et pour chacun : est-il un
  // FAIT OPÉRATOIRE (portable dans PhénoBac) ou une ligne de conduite
  // rédigée (lue, jamais recopiée) ? Voir l'en-tête, « COPYRIGHT ».
  // Un libellé absent de cette liste n'est pas une erreur — le CLSI en
  // ajoute — mais il est signalé : c'est le signe qu'une table a changé de
  // forme, et un critère non classé ne doit surtout pas être porté par
  // défaut. L'inconnu est donc NON portable.
  var CRITERES = [
    [/^test$/i,                              false],
    [/^test method$/i,                        true],
    [/^organism group/i,                      true],
    [/^medium$/i,                             true],
    [/^antimicrobial concentration$/i,        true],
    [/^inoculum$/i,                           true],
    [/^test reagents and materials$/i,        true],
    [/^test procedure/i,                      true],
    [/^incubation conditions$/i,              true],
    [/^incubation length$/i,                  true],
    [/^supplemental early reading/i,          true],
    [/^results?$/i,                           true],
    [/^test interpretation$/i,                true],
    [/^qc recommendations/i,                  true],
    [/^additional testing and reporting$/i,  false],
    [/^reporting$/i,                         false],
    [/^strengths$/i,                         false],
    [/^limitations$/i,                       false],
    [/^when to perform this test$/i,         false],
    [/^notes$/i,                             false]
  ];

  // « Test procedure: mCIM » et « When to perform this test: » : le CLSI
  // ponctue ses libellés de façon inégale d'une table à l'autre. Les motifs
  // ancrés par $ y échouent, et un critère connu passe alors pour inconnu —
  // neuf fois, à l'ajout des tables 3B, 3C, 3D et 3F-1. Le deux-points
  // final est donc retiré avant la comparaison, et deux motifs sont devenus
  // des préfixes plutôt que des égalités.

  function classer(lib) {
    for (var i = 0; i < CRITERES.length; i++)
      if (CRITERES[i][0].test(lib)) return {connu: true, portable: CRITERES[i][1]};
    return {connu: false, portable: false};
  }

  // Un libellé peut porter un <br> : « QC⏎recommendations – routine ». Le
  // replier avant de comparer, sinon le critère passe pour inconnu.
  function aplatir(s) {
    return s.split(K.RETOUR).join(" ").replace(/\s+/g, " ").trim()
            .replace(/\s*:$/, "");
  }

  async function lire(cle) {
    var rep = await K.lireDoc(cle);
    if (rep.erreur) return {cle: cle, erreur: rep.erreur};

    var t = rep.doc.querySelector("table");
    if (!t) return {cle: cle, erreur: "aucune table dans cette section"};

    var opt = {notes: [], suspects: []};
    var g = K.grille(t, opt);
    var anomalies = [];
    var larg = Math.max.apply(null, g.map(function (r) { return r.length; }));
    var haut = g.length;

    function cel(i, j) {
      var v = g[i] && g[i][j];
      return v === undefined ? "" : v;
    }
    // Le libellé d'une ligne, en résolvant le rowspan de la colonne 0.
    function libelle(i) {
      var v = cel(i, 0);
      while (v === K.HAUT && i > 0) { i--; v = cel(i, 0); }
      return v === K.HAUT || v === K.GAUCHE ? "" : aplatir(v);
    }

    // ----- repérer les lignes d'en-tête -------------------------------
    var iMethode = -1, iOrganisme = -1, i, j;
    for (i = 1; i < haut; i++) {
      var l = libelle(i);
      if (iMethode < 0 && EST_METHODE.test(l)) iMethode = i;
      if (iOrganisme < 0 && EST_ORGANISME.test(l)) iOrganisme = i;
    }
    if (iMethode < 0)
      anomalies.push(cle + " : aucune ligne « Test method » — colonnes nommées par la seule ligne 0");

    // ----- la partition la plus fine ----------------------------------
    var frontieres = {};
    [0, iMethode, iOrganisme].forEach(function (ii) {
      if (ii < 0) return;
      for (var jj = 1; jj < larg; jj++)
        if (cel(ii, jj) !== K.GAUCHE) frontieres[jj] = true;
    });
    var deb = Object.keys(frontieres).map(Number).sort(function (a, b) { return a - b; });
    if (!deb.length) return {cle: cle, erreur: "aucune colonne de test"};
    var spans = deb.map(function (d, k) {
      return [d, k + 1 < deb.length ? deb[k + 1] : larg];
    });

    // La valeur d'une ligne d'en-tête pour une colonne : remonter à gauche
    // jusqu'à la cellule réelle, puis en haut si elle vient d'un rowspan.
    function enTete(ii, a) {
      if (ii < 0) return null;
      var jj = a, v = cel(ii, jj);
      while (v === K.GAUCHE && jj > 1) { jj--; v = cel(ii, jj); }
      var kk = ii;
      while (v === K.HAUT && kk > 0) { kk--; v = cel(kk, jj); }
      return (v === K.HAUT || v === K.GAUCHE) ? null : aplatir(v);
    }

    var colonnes = spans.map(function (sp) {
      var gr = enTete(0, sp[0]), me = enTete(iMethode, sp[0]),
          og = enTete(iOrganisme, sp[0]);
      var morceaux = [gr, me, og].filter(function (x) { return x; });
      // Dédoublonner : en 3I le groupe et la méthode peuvent se répéter.
      var vus = {}, nom = morceaux.filter(function (x) {
        if (vus[x]) return false; vus[x] = true; return true;
      }).join(" / ");
      return {colonnes: sp, groupe: gr, methode: me, organisme: og, nom: nom};
    });
    colonnes.forEach(function (c, k) {
      if (!c.nom) anomalies.push(cle + " : colonne " + (k + 1) + " sans nom");
    });

    // ----- les critères, lignes groupées par rowspan de la colonne 0 ---
    var criteres = [], courant = null;
    for (i = 1; i < haut; i++) {
      if (i === iMethode || i === iOrganisme) continue;   // déjà dans les noms
      var brut = cel(i, 0);
      var lib = libelle(i);
      if (!lib) {
        var pleine = false;
        for (j = 1; j < larg; j++) {
          var x = cel(i, j);
          if (x !== K.GAUCHE && x !== K.HAUT && !K.estVide(x)) pleine = true;
        }
        if (pleine) anomalies.push(cle + " L" + i + " : valeurs sans libellé de critère");
        continue;
      }
      // Une ligne dont la colonne 0 est ⇑ CONTINUE le critère précédent :
      // en 3A, « Results » porte un rowspan de onze lignes. En faire onze
      // critères « Results » séparés casserait la liste qu'ils forment.
      if (brut === K.HAUT && courant && courant.critere === lib) {
        // on poursuit
      } else {
        var cl = classer(lib);
        if (!cl.connu) anomalies.push(cle + " L" + i + " : critère inconnu « " + lib + " »");
        courant = {critere: lib, portable: cl.portable, lignes: []};
        criteres.push(courant);
      }

      var ligne = colonnes.map(function (c) {
        var bouts = [], fusionGauche = false;
        for (var jj = c.colonnes[0]; jj < c.colonnes[1]; jj++) {
          var v = cel(i, jj);
          if (v === K.GAUCHE) {
            if (jj === c.colonnes[0]) fusionGauche = true;   // suite de la colonne de gauche
          } else if (v === K.HAUT) {
            // rien de neuf sur cette ligne : la cellule déborde d'en haut
          } else bouts.push(v);
        }
        if (!bouts.length) return fusionGauche ? "⟵" : "";
        return bouts.length === 1 ? bouts[0] : bouts;
      });
      // Une ligne entièrement vide n'apporte rien : ne pas l'empiler.
      if (ligne.some(function (v) { return v !== "" && v !== "⟵"; }))
        courant.lignes.push(ligne);
    }

    opt.suspects.forEach(function (s) {
      anomalies.push(cle + " : exposant non bibliographique « " + s + " »");
    });

    return {cle: cle, colonnes: colonnes, criteres: criteres,
            notes: Array.from(new Set(opt.notes)).sort(),
            anomalies: anomalies};
  }

  window.extraireTestsCLSI = async function () {
    var res = {edition: K.EDITION, lu: new Date().toISOString(), tables: {}};
    var anomalies = [];
    for (var i = 0; i < TABLES.length; i++) {
      var r = await lire(TABLES[i]);
      res.tables[TABLES[i]] = r;
      (r.anomalies || []).forEach(function (a) { anomalies.push(a); });
      if (r.erreur) anomalies.push(TABLES[i] + " : " + r.erreur);
    }
    res.anomalies = anomalies;
    res.nonLues = TABLES_NON_LUES;
    console.log("tables de tests lues : " + TABLES.length);
    console.log("tables NON lues      : " + TABLES_NON_LUES.length + " (série 1 : panels)");
    console.log("série 3 ailleurs     : " + SERIE_3_AILLEURS.join(", ") +
      " — grilles de seuils, lues par extraire-clsi.js");
    console.log("colonnes de test     : " + TABLES.reduce(function (s, k) {
      return s + ((res.tables[k].colonnes || []).length); }, 0));
    console.log("anomalies à relire   : " + anomalies.length);
    anomalies.forEach(function (a) { console.log("  " + a); });
    window.__CLSI_TESTS = res;
    return res;
  };
})();
