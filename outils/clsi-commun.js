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
  C.PARA   = "¶";        // marque d'une frontière de <p> dans une cellule
  C.HAUT   = "⇑";        // continuation verticale   (rowspan)
  C.GAUCHE = "⇐";        // continuation horizontale (colspan)
  C.DOUTE  = "⚠";

  // Confondre HAUT et GAUCHE transforme toute ligne de titre en copie de la
  // ligne de données précédente — défaut constaté, puis corrigé.
  //
  // RETOUR et PARA se distinguent pour la même raison, et le CLSI est
  // constant là-dessus : le <br> sépare les AGENTS d'une même cellule
  // (« Cefotaxime or⏎ceftriaxone », et ses valeurs « ≥ 26⏎≥ 23 »), tandis
  // que le <p> sépare les items d'une AUTRE dimension — les deux temps de
  // lecture en 3F-2, les molécules d'un panel en série 1. Les écraser sur
  // la même espace, comme texte() le faisait, rendait « Imipenem Meropenem »
  // indiscernable d'un nom composé.

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
   * AVEC opt.paragraphes : les frontières de <p> deviennent des PARA.
   * Sans l'option, elles disparaissent — ce qui est le comportement
   * historique et reste juste partout où un <p> ne sépare qu'un nom de son
   * qualificatif (« Pefloxacin (Inv.) » + « (surrogate test…) »).
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
    if (opt && opt.paragraphes) {
      var ps = c.querySelectorAll("p");
      for (var i = 1; i < ps.length; i++)
        ps[i].parentNode.insertBefore(document.createTextNode(C.PARA), ps[i]);
    }
    c.querySelectorAll("br").forEach(function (b) {
      b.replaceWith(document.createTextNode(C.RETOUR));
    });
    var t = (c.textContent || "").replace(/ /g, " ");
    // Normaliser autour des deux marqueurs, puis rogner ceux des bords.
    t = t.split(C.RETOUR).map(function (x) {
      return x.split(C.PARA).map(function (y) {
        return y.trim().replace(/\s+/g, " "); }).join(C.PARA);
    }).join(C.RETOUR);
    return t.replace(new RegExp("^[" + C.RETOUR + C.PARA + "]+|[" +
                                C.RETOUR + C.PARA + "]+$", "g"), "");
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

  /* sommaire(edition) — les clés de table que le document déclare lui-même,
   * tirées de sa table des matières.
   *
   * POURQUOI CECI EXISTE
   *
   * Les listes de tables de ce dépôt ont d'abord été écrites de mémoire. Elles
   * annonçaient huit tables en série 3 là où il y en a quinze, et douze en
   * série 1 là où il y en a seize. Les manquantes n'étaient ni lues, ni
   * déclarées non lues : elles n'étaient nulle part, et rien ne pouvait le
   * dire. Une liste fausse est pire qu'une liste absente, parce qu'elle clôt
   * la question.
   *
   * Le sommaire était à UNE REQUÊTE de distance. Il l'est toujours, et
   * confronter() oblige maintenant chaque lecteur à s'y mesurer. */
  C.sommaire = async function (edition) {
    var ed = edition || C.EDITION;
    var r = await fetch("GetDoc.aspx?doc=" + encodeURIComponent(ed) + "&format=HTML",
                        {credentials: "same-origin"});
    if (!r.ok) return {erreur: "HTTP " + r.status};
    if (/Login\.aspx/i.test(r.url)) return {erreur: "session expirée"};
    var d = new DOMParser().parseFromString(await r.text(), "text/html");
    var cles = [], titres = {};
    Array.prototype.forEach.call(d.querySelectorAll('a[href*="TABLE"]'), function (a) {
      var t = (a.textContent || "").replace(/\s+/g, " ").trim();
      var m = t.match(/^Table\s+([0-9]+[A-Z]?(?:-[0-9]+)?)\./i);
      if (!m) return;
      if (cles.indexOf(m[1]) < 0) { cles.push(m[1]); titres[m[1]] = t; }
    });
    return {cles: cles, titres: titres};
  };

  /* confronter(portee, nommees, sommaire) — ce que le lecteur prétend
   * couvrir contre ce que le document contient. Échoue DANS LES DEUX SENS :
   * une table du document absente de la liste est une omission silencieuse ;
   * une table listée qui n'existe pas est une liste périmée. */
  C.confronter = async function (portee, nommees, edition) {
    var som = await C.sommaire(edition);
    if (som.erreur) return ["sommaire illisible : " + som.erreur];
    var dans = som.cles.filter(function (k) { return portee.test(k); });
    var manque = dans.filter(function (k) { return nommees.indexOf(k) < 0; });
    var fantome = nommees.filter(function (k) { return som.cles.indexOf(k) < 0; });
    var a = [];
    if (manque.length)
      a.push("tables du document que ce lecteur ne nomme NULLE PART : " + manque.join(", "));
    if (fantome.length)
      a.push("tables nommées qui n'existent pas dans le document : " + fantome.join(", "));
    return a;
  };

  C.exigerCommun = function (qui) {
    // Rien à faire ici : la fonction existe pour que le lecteur puisse écrire
    // « CLSI_COMMUN.exigerCommun(...) » et échouer bruyamment s'il manque.
    return qui;
  };

  window.CLSI_COMMUN = C;
  console.log("clsi-commun.js chargé — coller maintenant un lecteur.");
})();
