/* extraire-clsi.js — lecture des tables de seuils du CLSI M100
 *
 * POURQUOI UN SCRIPT DE CONSOLE, ET PAS UN OUTIL EN LIGNE DE COMMANDE
 *
 * Le CLSI donne un accès gratuit et en lecture seule au M100, par un portail
 * (em100.edaptivedocs.net) qui tient sa session dans un cookie ASP.NET marqué
 * HttpOnly. Ce cookie est, par construction, invisible au JavaScript : on ne
 * peut donc pas le passer à curl ni à requests, et aucun script hors
 * navigateur ne peut atteindre les pages. Le portail se lit dans un
 * navigateur, et nulle part ailleurs.
 *
 * Ce fichier est donc la partie reproductible de la lecture : la console du
 * navigateur est le seul transport, mais l'extraction, elle, est écrite,
 * versionnée et rejouable. Deux personnes qui le collent sur la même édition
 * obtiennent le même JSON.
 *
 * USAGE
 *   1. Ouvrir em100.edaptivedocs.net, franchir l'accès invité (e-mail, pays,
 *      type d'utilisateur), ouvrir « CLSI M100 ED36:2026 ».
 *   2. Coller ce fichier entier dans la console.
 *   3. await extraireCLSI()        → le JSON, et le compte des anomalies.
 *      await extraireCLSI(true)    → en plus, télécharge clsi-m100.json.
 *
 * CE QUE LE SCRIPT NE FAIT PAS
 *   Il ne devine jamais. Toute cellule qu'il ne sait pas répartir entre
 *   plusieurs agents est rendue préfixée de ⚠ et portée dans « anomalies »,
 *   pour être lue à la main. Une valeur inventée en silence serait pire que
 *   pas de valeur du tout : c'est un antibiotique rendu sensible à tort.
 *
 * COPYRIGHT
 *   Le M100 est un document protégé. Le JSON produit est une copie de travail,
 *   destinée à la confrontation ; il ne doit pas être versionné. Seuls les
 *   critères numériques, qui sont des faits, et la citation de l'édition et du
 *   tableau entrent dans la base de PhénoBac — jamais les commentaires du
 *   CLSI, qui sont son expression propre.
 */

(function () {
  "use strict";

  var EDITION = "CLSI M100 ED36:2026";

  // Les seize tables de seuils. La 2B-3 est vide par décision du CLSI :
  // les seuils de B. cepacia ont été retirés, les deux méthodes de référence
  // ne concordant pas. Elle est listée pour que son absence soit constatée,
  // et non devinée.
  var TABLES = ["2A-1", "2A-2", "2B-1", "2B-2", "2B-3", "2B-4", "2B-5",
                "2C", "2D", "2E", "2F", "2G", "2H-1", "2H-2", "2I", "2J"];

  var RETOUR = "⏎";        // marque d'un <br> à l'intérieur d'une cellule
  var HAUT   = "⇑";        // continuation verticale   (rowspan)
  var GAUCHE = "⇐";        // continuation horizontale (colspan)
  var DOUTE  = "⚠";

  // Confondre HAUT et GAUCHE transforme toute ligne de titre en copie de la
  // ligne de données précédente — défaut constaté, puis corrigé.

  var VAL = /^(?:[≤≥<>]\s*)?\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?(?:\s*[-–]\s*(?:[≤≥]\s*)?\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)?\^?$/;

  function estVide(s) { return s === "" || s === "–" || s === "-" || s === "—"; }

  function texte(cell) {
    var c = cell.cloneNode(true);
    c.querySelectorAll("br").forEach(function (b) {
      b.replaceWith(document.createTextNode(RETOUR));
    });
    return (c.textContent || "").replace(/ /g, " ")
      .split(RETOUR).map(function (s) { return s.trim().replace(/\s+/g, " "); })
      .join(RETOUR).replace(new RegExp("^" + RETOUR + "+|" + RETOUR + "+$", "g"), "");
  }

  function grille(t) {
    var g = [], ri, ci, i, j, cell, rs, cs, v;
    for (ri = 0; ri < t.rows.length; ri++) {
      while (g.length <= ri) g.push([]);
      ci = 0;
      for (var k = 0; k < t.rows[ri].cells.length; k++) {
        cell = t.rows[ri].cells[k];
        while (g[ri][ci] !== undefined) ci++;
        rs = cell.rowSpan || 1; cs = cell.colSpan || 1; v = texte(cell);
        for (i = 0; i < rs; i++) {
          while (g.length <= ri + i) g.push([]);
          for (j = 0; j < cs; j++)
            g[ri + i][ci + j] = (i === 0 && j === 0) ? v : (i > 0 ? HAUT : GAUCHE);
        }
        ci += cs;
      }
    }
    return g;
  }

  // La table des seuils se reconnaît à son en-tête, jamais à sa longueur :
  // en 2B-3 le tableau « Testing Conditions » est le plus long de la page.
  function choisir(d) {
    var ts = Array.prototype.slice.call(d.querySelectorAll("table"));
    var bonnes = ts.filter(function (t) {
      return t.rows[0] && /Antimicrobial\s*Agent/i.test(t.rows[0].innerText || "");
    });
    if (!bonnes.length) return null;
    return bonnes.reduce(function (a, b) { return b.rows.length > a.rows.length ? b : a; });
  }

  // Répartit une cellule entre n agents. Rend ⚠ plutôt que de deviner.
  function repartir(cel, n, anomalies, ou, estAgent) {
    var p = cel.split(RETOUR).map(function (s) { return s.trim(); });
    if (n === 1) return [p.join(" ")];
    if (p.length === n) return p;
    if (p.length === 1) {
      var s = p[0], mots;
      if (estVide(s)) return new Array(n).fill(s);
      if (VAL.test(s)) return new Array(n).fill(s);      // une valeur pour tous
      if (estAgent) {
        var parOu = s.split(/\s+or\s+/i).map(function (x) { return x.trim(); })
                     .filter(function (x) { return x; });
        if (parOu.length === n) return parOu;            // « A or B or C »
        mots = s.split(/\s+/).filter(function (x) { return x; });
        if (mots.length === n && mots.every(function (x) {
              return /^[A-Za-zβ][A-Za-z\-]+\*?$/.test(x); })) return mots;
      }
      if (!/\d/.test(s)) return new Array(n).fill(s);    // portée ou libellé
      mots = s.split(/\s+/).filter(function (x) { return x; });
      if (mots.length === n && mots.every(function (x) {
            return VAL.test(x) || estVide(x); })) return mots;
    }
    anomalies.push(ou + " : « " + cel.split(RETOUR).join(" " + RETOUR + " ") +
                   " » pour " + n + " agents");
    return new Array(n).fill(DOUTE + cel.split(RETOUR).join(" " + RETOUR + " "));
  }

  async function lire(cle) {
    var url = "GetDoc.aspx?doc=" + encodeURIComponent(EDITION) +
              "&sbssok=" + encodeURIComponent(EDITION + " TABLE " + cle) + "&format=HTML";
    var r = await fetch(url, {credentials: "same-origin"});
    if (!r.ok) return {cle: cle, erreur: "HTTP " + r.status};
    var d = new DOMParser().parseFromString(await r.text(), "text/html");
    var t = choisir(d);
    if (!t) return {cle: cle, vide: true,
                    motif: "aucune table de seuils dans cette section"};
    var g = grille(t);
    var larg = Math.max.apply(null, g.map(function (r) { return r.length; }));
    var sous = (g[1] || []).filter(function (x) {
      return x && x !== HAUT && x !== GAUCHE; });
    var anomalies = [], lignes = [], precedent = null;
    for (var i = 2; i < g.length; i++) {
      var brut = [], j;
      for (j = 0; j < larg; j++) brut.push(g[i][j] === undefined ? "" : g[i][j]);
      var c = brut.map(function (x, jj) {
        return x === HAUT ? (precedent ? precedent[jj] : "") : (x === GAUCHE ? "" : x);
      });
      var utiles = c.filter(function (x) { return x !== ""; });
      if (utiles.length <= 1) { lignes.push(["§", utiles[0] || ""]); continue; }
      precedent = c.slice();
      // Le nombre d'agents se lit sur les colonnes de valeurs, jamais sur le
      // nom : « Cefuroxime ⏎ (parenteral) » est un seul agent au nom replié.
      var vals = c.slice(1, larg - 1);
      var n = Math.max.apply(null, [1].concat(vals.map(function (x) {
        return x.split(RETOUR).length; })));
      var ou = cle + " L" + i + " « " + c[0].split(RETOUR)[0].slice(0, 30) + " »";
      var cols = [];
      for (j = 0; j < larg - 1; j++)
        cols.push(repartir(c[j], n, anomalies, ou + " [c" + j + "]", j === 0));
      var com = c[larg - 1];
      for (var k = 0; k < n; k++) {
        lignes.push(cols.map(function (co) { return co[k]; })
          .concat([(com.match(/\(\d+\)/g) || []).join("")]));
      }
    }
    return {cle: cle, sous: sous, larg: larg, n: lignes.length,
            anomalies: anomalies, lignes: lignes};
  }

  window.extraireCLSI = async function (telecharger) {
    var res = {edition: EDITION, lu: new Date().toISOString(), tables: {}};
    var anomalies = [], vides = [];
    for (var i = 0; i < TABLES.length; i++) {
      var r = await lire(TABLES[i]);
      res.tables[TABLES[i]] = r;
      (r.anomalies || []).forEach(function (a) { anomalies.push(a); });
      if (r.vide) vides.push(TABLES[i]);
    }
    res.anomalies = anomalies;
    console.log("tables lues        : " + TABLES.length);
    console.log("tables sans seuils : " + (vides.join(", ") || "aucune"));
    console.log("lignes             : " + Object.keys(res.tables).reduce(
      function (s, k) { return s + (res.tables[k].n || 0); }, 0));
    console.log("anomalies à relire : " + anomalies.length);
    anomalies.forEach(function (a) { console.log("  " + a); });
    if (telecharger) {
      var b = new Blob([JSON.stringify(res, null, 1)], {type: "application/json"});
      var a = document.createElement("a");
      a.href = URL.createObjectURL(b); a.download = "clsi-m100.json";
      document.body.appendChild(a); a.click(); a.remove();
    }
    window.__CLSI = res;
    return res;
  };
})();
