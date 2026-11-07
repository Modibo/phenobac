/* clsi-commun.js — les primitives de lecture du portail CLSI
 *
 * POURQUOI CE FICHIER EXISTE
 *
 * Il y a deux lecteurs du M100, parce qu'il y a deux formes de tables :
 *
 *   extraire-clsi.js        les tables de seuils (série 2). Une grille :
 *                           une LIGNE par antibiotique, des colonnes S/I/R.
 *   extraire-clsi-tests.js  les tables de tests (série 3). Une grille
 *                           TRANSPOSÉE : une LIGNE par critère (milieu,
 *                           inoculum, incubation, lecture), une COLONNE par
 *                           variante de test.
 *
 * Les deux doivent déplier les rowspan/colspan de la même façon. Tant que
 * chacun portait sa copie de grille() et de texte(), une correction apportée
 * à l'un n'atteignait pas l'autre — c'est le défaut même que ce dépôt
 * poursuit ailleurs, retourné : non plus une chose déclarée à un seul endroit
 * là où il en fallait plusieurs, mais la même chose à deux endroits là où un
 * seul correctif passera. Les primitives vivent donc ici, en un exemplaire.
 *
 * USAGE (console du navigateur, portail ouvert)
 *   Coller CE FICHIER D'ABORD, puis le lecteur voulu. Un lecteur collé seul
 *   s'arrête et le dit : il ne se rabat pas sur une copie locale, car une
 *   copie locale est exactement ce qu'on cherche à supprimer.
 */

(function () {
  "use strict";

  var C = {};

  C.EDITION = "CLSI M100 ED36:2026";
  C.M45     = "CLSI M45 ED3:2016";       // bactéries rares ou exigeantes

  C.RETOUR = "⏎";        // marque d'un <br> à l'intérieur d'une cellule
  C.HAUT   = "⇑";        // continuation verticale   (rowspan)
  C.GAUCHE = "⇐";        // continuation horizontale (colspan)
  C.DOUTE  = "⚠";

  // Confondre HAUT et GAUCHE transforme toute ligne de titre en copie de la
  // ligne de données précédente — défaut constaté, puis corrigé.

  C.estVide = function (s) {
    return s === "" || s === "–" || s === "-" || s === "—";
  };

  /* texte(cell[, opt])
   *
   * SANS opt : le comportement historique, AU CARACTÈRE PRÈS. Les appels de
   * note en exposant restent soudés au texte — « Penicillin (U)a », « BHIb ».
   * Cela ressemble à un défaut, et c'en serait un si personne n'en dépendait ;
   * mais outils/noms-clsi.py lit justement ces suffixes pour distinguer
   * « Penicillin (U) » du pénicilline ordinaire. Les retirer ici casserait la
   * correspondance des noms sans qu'aucun contrôle ne s'en aperçoive.
   *
   * AVEC opt.notes : la partie BIBLIOGRAPHIQUE des <sup> (lettres, chiffres,
   * virgules, tirets) est retirée du texte et poussée dans opt.notes.
   *
   * Un exposant n'est pas forcément un appel de note : « ATCC®d » en porte
   * DEUX CHOSES — la marque déposée, qui appartient au nom de la souche, et
   * la lettre d'appel, qui n'y appartient pas. Un premier jet traitait tout
   * exposant comme un bloc : il refusait « ® » et signalait soixante-dix
   * fausses anomalies, ce qui revient à ne plus en signaler aucune. On
   * sépare donc les deux : la marque reste dans le texte, l'appel part dans
   * les notes, et seul un reste INCLASSABLE va dans opt.suspects.
   */
  C.texte = function (cell, opt) {
    var c = cell.cloneNode(true);
    if (opt && opt.notes) {
      c.querySelectorAll("sup").forEach(function (s) {
        var v = (s.textContent || "").trim();
        if (v === "") return;
        var marques = (v.match(/[®™©]/g) || []).join("");
        var reste = v.replace(/[®™©]/g, "").trim();
        if (reste === "" || /^[a-zA-Z0-9,–—\-\s]+$/.test(reste)) {
          if (reste !== "") opt.notes.push(reste.replace(/\s+/g, ""));
          s.replaceWith(document.createTextNode(marques));
        } else if (opt.suspects) {
          opt.suspects.push(v);
        }
      });
    }
    c.querySelectorAll("br").forEach(function (b) {
      b.replaceWith(document.createTextNode(C.RETOUR));
    });
    return (c.textContent || "").replace(/ /g, " ")
      .split(C.RETOUR).map(function (s) { return s.trim().replace(/\s+/g, " "); })
      .join(C.RETOUR)
      .replace(new RegExp("^" + C.RETOUR + "+|" + C.RETOUR + "+$", "g"), "");
  };

  /* grille(table[, opt]) — déplie rowspan et colspan en un tableau plein.
   * opt est passé tel quel à texte() : un seul jeu de notes pour la table. */
  C.grille = function (t, opt) {
    var g = [], ri, ci, i, j, cell, rs, cs, v;
    for (ri = 0; ri < t.rows.length; ri++) {
      while (g.length <= ri) g.push([]);
      ci = 0;
      for (var k = 0; k < t.rows[ri].cells.length; k++) {
        cell = t.rows[ri].cells[k];
        while (g[ri][ci] !== undefined) ci++;
        rs = cell.rowSpan || 1; cs = cell.colSpan || 1; v = C.texte(cell, opt);
        for (i = 0; i < rs; i++) {
          while (g.length <= ri + i) g.push([]);
          for (j = 0; j < cs; j++)
            g[ri + i][ci + j] = (i === 0 && j === 0) ? v
                              : (i > 0 ? C.HAUT : C.GAUCHE);
        }
        ci += cs;
      }
    }
    return g;
  };

  /* lireDoc(cle[, edition]) — une section d'un document, par sa clé de table
   * (« 2A-1 », « 3L » pour le M100 ; « 1 », « 23A » pour le M45). L'édition
   * par défaut est le M100 ; passer C.M45 pour l'autre document.
   * Rend le Document, ou {erreur}. Le portail répond 200 avec la page de
   * connexion quand la session a expiré : on le détecte plutôt que de rendre
   * une table « vide », qui serait un mensonge tranquille. */
  C.lireDoc = async function (cle, edition) {
    var ed = edition || C.EDITION;
    var url = "GetDoc.aspx?doc=" + encodeURIComponent(ed) +
              "&sbssok=" + encodeURIComponent(ed + " TABLE " + cle) +
              "&format=HTML";
    var r = await fetch(url, {credentials: "same-origin"});
    if (!r.ok) return {erreur: "HTTP " + r.status};
    if (/Login\.aspx/i.test(r.url))
      return {erreur: "session expirée — refaire l'accès invité"};
    var t = await r.text();
    return {doc: new DOMParser().parseFromString(t, "text/html")};
  };

  C.exigerCommun = function (qui) {
    // Rien à faire ici : la fonction existe pour que le lecteur puisse écrire
    // « CLSI_COMMUN.exigerCommun(...) » et échouer bruyamment s'il manque.
    return qui;
  };

  window.CLSI_COMMUN = C;
  console.log("clsi-commun.js chargé — coller maintenant un lecteur.");
})();
