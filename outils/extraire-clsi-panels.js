/* extraire-clsi-panels.js — lecture de la série 1 du CLSI M100 (les PANELS)
 *
 * CE QUE CETTE SÉRIE EST
 *
 * La série 1 ne donne aucun seuil. Elle dit, groupe d'espèces par groupe
 * d'espèces, QUELLES MOLÉCULES TESTER ET RENDRE, rangées en quatre rangs de
 * prescription :
 *
 *   Tier 1  à tester et à rendre en routine
 *   Tier 2  à tester en routine, à rendre de façon sélective
 *   Tier 3  réservés aux établissements à forte prévalence de résistance
 *   Tier 4  qui demandent un avis — cliniquement ou épidémiologiquement
 *
 * C'est l'équivalent du panel de PhénoBac : ce que l'application propose de
 * saisir pour un groupe, et dans quel ordre.
 *
 * Seize tables, 1A-1 à 1J, qui suivent exactement la série 2.
 *
 * UNE QUATRIÈME FORME
 *
 *   série 2    une ligne par antibiotique, colonnes S/SDD/I/R
 *   série 3    une ligne par critère, une colonne par variante de test
 *   M45        comme la série 2, précédée d'une colonne de classe
 *   série 1    quatre colonnes de rangs, et RIEN D'AUTRE — pas d'en-tête de
 *              ligne, pas de valeurs. Une cellule porte une ou plusieurs
 *              molécules ; sa position dans la grille ne veut rien dire,
 *              seule sa colonne compte.
 *
 * Une ligne pleine largeur — « Urine Only » — ouvre une section en fin de
 * table : tout ce qui suit ne vaut que pour les urines.
 *
 * DEUX SÉPARATEURS, ET IL A FALLU LES DISTINGUER
 *
 * Une cellule de panel sépare ses molécules de deux façons : par un <br>,
 * et par une frontière de <p> — « <p>Imipenem</p> <p>Meropenem</p> » en
 * table 1B-2. texte() n'en voyait qu'une, et rendait « Imipenem Meropenem »,
 * indiscernable d'un nom composé. Sept entrées sur deux cent trente-trois
 * étaient dans ce cas, et le contrôle de molécules soudées les signalait
 * comme un défaut du portail — alors que le défaut était ici. Le lecteur
 * demande donc maintenant opt.paragraphes, et coupe sur les deux marques.
 *
 * CE QUE LE PORTAIL PERD VRAIMENT, ET QU'IL FAUT SIGNALER
 *
 * Il reste UN cas, en table 1C, rang 4 :
 *
 *     <p>Ciprofloxacin or levofloxacin Moxifloxacin</p>
 *
 * Un seul <p>, aucun <br>, une simple espace. Le tableau imprimé y porte
 * deux entrées — « ciprofloxacine ou lévofloxacine », puis
 * « moxifloxacine » — et la conversion a perdu le saut de ligne. Aucune
 * règle ne le rétablit sans deviner : « or » sépare des ÉQUIVALENTS,
 * l'espace ne sépare rien du tout. Cette cellule part donc en anomalie.
 * Deviner aurait produit un panel plausible et faux, ce qui est la pire des
 * deux options.
 *
 * USAGE
 *   1. Portail ouvert, accès invité franchi.
 *   2. Coller outils/clsi-commun.js, PUIS ce fichier.
 *   3. await extrairePanels()
 *
 * COPYRIGHT
 *   La composition d'un panel est un fait — quelles molécules, dans quel
 *   rang — et entre dans PhénoBac avec citation de l'édition et du tableau.
 *   Les notes de bas de table du CLSI n'y entrent pas. Le JSON produit est
 *   une copie de travail et n'est pas versionné.
 */

(function () {
  "use strict";

  if (!window.CLSI_COMMUN)
    throw new Error("extraire-clsi-panels.js : coller d'abord outils/clsi-commun.js");
  var K = window.CLSI_COMMUN;

  var TABLES = ["1A-1", "1A-2", "1B-1", "1B-2", "1B-3", "1B-4", "1B-5",
                "1C", "1D", "1E", "1F", "1G", "1H-1", "1H-2", "1I", "1J"];

  // Ce lecteur ne répond que de la série 1 ; les séries 2 et 3 ont les leurs.
  var PORTEE = /^1/;

  // Une entrée tient-elle plusieurs molécules que rien ne sépare ?
  // On ne compte que les mots d'au moins quatre lettres, hors parenthèses :
  // « Polymyxin B » est une molécule, « levofloxacin Moxifloxacin » en est
  // deux, et « Cefoxitin (surrogate for oxacillin) » une seule.
  function soude(x) {
    var nu = x.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    var mots = nu.split(" ").filter(function (m) { return m.length >= 4; });
    return mots.length > 1;
  }

  async function lire(cle, sommaire) {
    var rep = await K.lireDoc(cle);
    if (rep.erreur) return {cle: cle, erreur: rep.erreur};

    var t = rep.doc.querySelector("table");
    if (!t) {
      // Une section sans table n'est pas forcément une panne. La 1B-3 ne
      // contient qu'une phrase : « Refer to Table 2B-3 for information
      // regarding testing of B. cepacia complex ». C'est une DÉCISION du
      // CLSI — les seuils de B. cepacia ont été retirés, ses deux méthodes
      // de référence ne concordant pas — et la rendre comme une erreur de
      // lecture ferait chercher une panne là où il n'y en a pas.
      var ps = Array.prototype.map.call(rep.doc.querySelectorAll("p"), function (x) {
        return (x.textContent || "").replace(/\s+/g, " ").trim(); });
      var rv = null;
      ps.forEach(function (x) {
        var m = x.match(/Refer to Table\s+([0-9A-Z-]+)/i);
        if (m && !rv) rv = m[1];
      });
      if (rv) return {cle: cle, renvoi: rv, n: 0, entrees: [], anomalies: []};
      return {cle: cle, erreur: "aucune table et aucun renvoi dans cette section"};
    }

    var opt = {notes: [], suspects: [], paragraphes: true};
    var g = K.grille(t, opt);
    var anomalies = [];
    var larg = Math.max.apply(null, g.map(function (r) { return r.length; }));

    function cel(i, j) {
      var v = g[i] && g[i][j];
      return v === undefined ? "" : v;
    }

    // Les rangs, lus sur la ligne 0. « Tier 1: Antimicrobial agents that… » :
    // on garde le numéro, la phrase appartient au CLSI.
    var rangs = [];
    for (var j = 0; j < larg; j++) {
      var h = cel(0, j).split(K.RETOUR).join(" ");
      var m = h.match(/Tier\s*(\d+)/i);
      rangs.push(m ? Number(m[1]) : null);
    }
    if (!rangs.some(function (r) { return r; }))
      return {cle: cle, erreur: "aucune colonne « Tier » — forme inattendue"};

    var entrees = [], section = null;
    for (var i = 1; i < g.length; i++) {
      // Ligne pleine largeur : une section, pas des molécules.
      var pleine = cel(i, 0) !== "" && cel(i, 0) !== K.HAUT;
      for (var j2 = 1; j2 < larg && pleine; j2++)
        if (cel(i, j2) !== K.GAUCHE) pleine = false;
      if (pleine) { section = cel(i, 0); continue; }

      for (j = 0; j < larg; j++) {
        if (!rangs[j]) continue;
        var v = cel(i, j);
        // ⇑ ne dit rien de neuf : la cellule déborde d'en haut.
        if (v === "" || v === K.HAUT || v === K.GAUCHE) continue;
        // Les deux marques valent séparateur d'entrée, à égalité.
        v.split(K.RETOUR).join(K.PARA).split(K.PARA).forEach(function (p) {
          p = p.trim();
          if (!p) return;
          // « Cefotaxime or ceftriaxone » : des ÉQUIVALENTS, une entrée. Le
          // découpage sur « or » vient donc AVANT le contrôle, sinon toute
          // liste d'équivalents passe pour une cellule abîmée — c'est ce
          // qu'un premier jet faisait, et il signalait douze fausses
          // soudures sur vingt. Un contrôle qui crie sur le cas normal ne
          // se lit plus quand il crie sur le cas vrai.
          var eq = p.split(/\s+or\s+/i).map(function (x) { return x.trim(); })
                    .filter(function (x) { return x; });
          var douteux = eq.some(soude);
          if (douteux)
            anomalies.push(cle + " rang " + rangs[j] + " : « " + p +
                           " » — plusieurs molécules sans séparateur, " +
                           "le portail a perdu un saut de ligne");
          entrees.push({
            rang: rangs[j],
            section: section,
            equivalents: eq,
            brut: douteux ? K.DOUTE + p : p
          });
        });
      }
    }

    opt.suspects.forEach(function (s) {
      anomalies.push(cle + " : exposant non bibliographique « " + s + " »");
    });

    return {cle: cle, titre: sommaire && sommaire.titres ? sommaire.titres[cle] : null,
            rangs: rangs.filter(function (r) { return r; }),
            n: entrees.length, entrees: entrees,
            notes: Array.from(new Set(opt.notes)).sort(),
            anomalies: anomalies};
  }

  window.extrairePanels = async function () {
    var res = {edition: K.EDITION, lu: new Date().toISOString(), tables: {}};
    var anomalies = [], renvois = [];

    // La liste déclarée se mesure au sommaire du document AVANT toute
    // lecture. Une liste écrite de mémoire a déjà coûté sept tables.
    var ecarts = await K.confronter(PORTEE, TABLES);
    ecarts.forEach(function (e) { anomalies.push("PORTÉE — " + e); });

    var som = await K.sommaire();
    for (var i = 0; i < TABLES.length; i++) {
      var r = await lire(TABLES[i], som);
      res.tables[TABLES[i]] = r;
      (r.anomalies || []).forEach(function (a) { anomalies.push(a); });
      if (r.erreur) anomalies.push(TABLES[i] + " : " + r.erreur);
      if (r.renvoi) renvois.push(TABLES[i] + " → " + r.renvoi);
    }
    res.anomalies = anomalies;
    res.renvois = renvois;
    console.log("tables de panels lues : " + TABLES.length);
    console.log("renvois sans panel    : " + (renvois.join(", ") || "aucun"));
    console.log("entrées               : " + TABLES.reduce(function (s, k) {
      return s + (res.tables[k].n || 0); }, 0));
    console.log("anomalies à relire    : " + anomalies.length);
    anomalies.forEach(function (a) { console.log("  " + a); });
    window.__CLSI_PANELS = res;
    return res;
  };
})();
