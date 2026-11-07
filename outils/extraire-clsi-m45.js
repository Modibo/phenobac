/* extraire-clsi-m45.js — lecture du CLSI M45 Ed3:2016
 *
 * CE QUE CE DOCUMENT EST
 *
 * Le M45, « Methods for Antimicrobial Dilution and Disk Susceptibility
 * Testing of Infrequently Isolated or Fastidious Bacteria », est un document
 * SÉPARÉ du M100, et c'est lui qui porte les seuils des bactéries rares ou
 * exigeantes. Douze des quarante-six groupes de PhénoBac n'ont de seuils CLSI
 * que là : Aerococcus, Aeromonas, Campylobacter, Corynebacterium (dont
 * diphtheriae et ulcerans), Kingella (groupe HACEK), Listeria, Moraxella,
 * Pasteurella, Vibrio.
 *
 * Il est dans le même portail gratuit que le M100, sous l'édition
 * « CLSI M45 ED3:2016 », et ses tables sont numérotées simplement : 1 à 21
 * pour les espèces, 22 pour les conditions, 23A-24B pour les gammes de
 * contrôle de qualité.
 *
 * POURQUOI UN TROISIÈME LECTEUR
 *
 * C'est une grille de seuils, comme la série 2 du M100 — mais pas la même
 * grille, et la différence est exactement du genre qui fait lire une colonne
 * pour une autre :
 *
 *   M100  Antimicrobial Agent | Disk Content | [S I R] | [S I R] | Comments
 *   M45   Antimicrobial CLASS | Antimicrobial Agent | Disk Content
 *                             | [S I R] | [S I R] | Comments
 *
 * Une colonne de plus, EN TÊTE. extraire-clsi.js calcule la première colonne
 * de valeurs par `larg - 1 - sous.length` et prend la colonne 0 pour le nom
 * de l'agent : sur le M45, il lirait les classes comme des antibiotiques et
 * décalerait tout d'un cran. Il ne doit donc pas être employé ici, et c'est
 * pourquoi ce fichier existe plutôt qu'un drapeau dans l'autre.
 *
 * LA PREMIÈRE COLONNE NE DIT PAS TOUJOURS LA MÊME CHOSE
 *
 * Elle s'appelle « Antimicrobial Class » dans dix-neuf tables, « Test/Report
 * Group » en table 10 (H. pylori) et « Organism Group » en table 21 (agents
 * du bioterrorisme). Et en table 21 elle porte DEUX choses à la fois : les
 * lignes de titre pleine largeur donnent la classe d'antibiotiques
 * (« PENICILLINS »), tandis que la même colonne, sur les lignes de données,
 * donne l'espèce (« B. anthracis », reportée vers le bas par rowspan).
 *
 * Chaque ligne porte donc DEUX champs distincts : `section`, venue de la
 * ligne de titre, et `groupe`, venue de la colonne elle-même. Les confondre
 * rendrait « PENICILLINS » comme nom d'espèce.
 *
 * LA CLASSE NE VIT PAS SUR LA LIGNE DE L'AGENT
 *
 * « PENICILLINS AND β-LACTAM/β-LACTAMASE INHIBITOR COMBINATIONS » occupe une
 * ligne à elle seule, fusionnée sur toute la largeur ; les agents qui suivent
 * ont leur colonne de classe VIDE. La classe se reporte donc de haut en bas,
 * jusqu'à la ligne de titre suivante. Lire la colonne 0 de la ligne de
 * l'agent rendrait une classe vide pour tout le monde.
 *
 * USAGE
 *   1. Portail ouvert, accès invité franchi.
 *   2. Coller outils/clsi-commun.js, PUIS ce fichier.
 *   3. await extraireM45()
 *
 * CE QUE LE SCRIPT NE FAIT PAS
 *   Il ne devine pas. Toute cellule qu'il ne sait pas répartir est rendue
 *   préfixée de ⚠ et portée dans « anomalies ».
 *
 * CE QU'IL NE LIT PAS
 *   Les tables 22 à 24B — conditions d'essai et gammes de contrôle de
 *   qualité. Elles ne portent pas de seuils cliniques ; la 22 double d'ailleurs
 *   l'encadré « Testing Conditions » que chaque table d'espèce porte déjà.
 *
 * COPYRIGHT
 *   Comme pour le M100 : les critères numériques sont des faits et entrent
 *   dans la base avec citation de l'édition et du tableau ; les commentaires
 *   du CLSI sont son expression propre et n'y entrent pas. Le JSON produit
 *   est une copie de travail et n'est pas versionné.
 */

(function () {
  "use strict";

  if (!window.CLSI_COMMUN)
    throw new Error("extraire-clsi-m45.js : coller d'abord outils/clsi-commun.js");
  var K = window.CLSI_COMMUN;

  // Les 21 tables d'espèces. Les numéros sont ceux du document.
  var TABLES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11",
                "12", "13", "14", "15", "16", "17", "18", "19", "20", "21"];

  var TABLES_NON_LUES = ["22", "23A", "23B", "23C", "23D", "23E", "23F",
                         "24A", "24B"];

  var VAL = /^(?:[≤≥<>]\s*)?\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?(?:\s*[-–]\s*(?:[≤≥]\s*)?\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)?\^?$/;

  // La table de seuils se reconnaît à son en-tête. Chaque section du M45 en
  // porte DEUX : l'encadré « Testing Conditions » vient en premier et serait
  // pris par un querySelector("table") naïf.
  function choisir(d) {
    var ts = Array.prototype.slice.call(d.querySelectorAll("table"));
    var bonnes = ts.filter(function (t) {
      return t.rows[0] && /Antimicrobial\s*Agent/i.test(t.rows[0].innerText || "");
    });
    if (!bonnes.length) return null;
    return bonnes.reduce(function (a, b) { return b.rows.length > a.rows.length ? b : a; });
  }

  // Le titre de la table, tel que le sommaire le donne : « Table 14. Listeria
  // monocytogenes ». C'est lui qui dira quel groupe de PhénoBac est visé.
  function titre(d, cle) {
    var a = d.querySelector('a[href*="TABLE ' + cle + '"]');
    if (a) return (a.textContent || "").replace(/\s+/g, " ").trim();
    var m = (d.body.innerText || "").match(
      new RegExp("Table\\s+" + cle + "\\.\\s+([^\\n]{3,120})"));
    return m ? ("Table " + cle + ". " + m[1].trim()) : null;
  }

  async function lire(cle) {
    var rep = await K.lireDoc(cle, K.M45);
    if (rep.erreur) return {cle: cle, erreur: rep.erreur};

    var t = choisir(rep.doc);
    if (!t) return {cle: cle, erreur: "aucune table de seuils dans cette section"};

    var opt = {notes: [], suspects: []};
    var g = K.grille(t, opt);
    var anomalies = [];
    var larg = Math.max.apply(null, g.map(function (r) { return r.length; }));

    function cel(i, j) {
      var v = g[i] && g[i][j];
      return v === undefined ? "" : v;
    }
    // Un en-tête peut porter un <br> : « Antimicrobial⏎Class ». Le replier
    // AVANT de le comparer. Sans cela /Antimicrobial\s*Class/ ne reconnaît
    // rien — ⏎ n'est pas un blanc — et la colonne passe pour absente. Ce seul
    // oubli faisait échouer trois tables sur vingt et une, dont celle du
    // groupe HACEK où vit le Kingella de PhénoBac.
    function aplatir(x) {
      return String(x).split(K.RETOUR).join(" ").replace(/\s+/g, " ").trim();
    }
    // La valeur réelle d'une cellule d'en-tête, en remontant les fusions.
    function tete(i, j) {
      var v = cel(i, j), jj = j, ii = i;
      while (v === K.GAUCHE && jj > 0) { jj--; v = cel(i, jj); }
      while (v === K.HAUT && ii > 0) { ii--; v = cel(ii, jj); }
      return (v === K.HAUT || v === K.GAUCHE) ? "" : aplatir(v);
    }

    // ----- repérer les colonnes, par leur en-tête et non par leur rang ----
    // « Disk Content » en table 3, « Disk Diffusion » en table 20 : le libellé
    // change d'une table à l'autre. S'accrocher au rang serait plus court et
    // faux.
    var iGroupe = -1, nomGroupe = null, iAgent = -1, iDisque = -1, iCom = -1;
    var bloc = [], courant = null;
    for (var j = 0; j < larg; j++) {
      var h = tete(0, j);
      if (/Antimicrobial\s*Agent/i.test(h)) { iAgent = j; courant = null; }
      else if (/(Antimicrobial\s*Class|Test\/Report\s*Group|Organism\s*Group)/i.test(h)) {
        iGroupe = j; nomGroupe = h; courant = null;
      }
      else if (/^Disk/i.test(h)) { iDisque = j; courant = null; }
      else if (/Zone\s*Diameter/i.test(h)) courant = "zone";
      else if (/MIC/i.test(h)) courant = "cmi";
      else if (/Comments?/i.test(h)) { iCom = j; courant = null; }
      bloc[j] = courant;
    }
    if (iAgent < 0) return {cle: cle, erreur: "colonne « Antimicrobial Agent » introuvable"};
    if (iGroupe < 0)
      anomalies.push(cle + " : aucune colonne de groupe en tête — forme inattendue");

    // La ligne des sous-en-têtes S/I/R n'est PAS toujours la ligne 1 : en
    // table 10 une ligne de fusion s'intercale et la repousse en 2. La
    // chercher, plutôt que la supposer.
    var iSous = -1;
    for (var ii = 1; ii < Math.min(5, g.length) && iSous < 0; ii++)
      for (j = 0; j < larg; j++)
        if (bloc[j] && (cel(ii, j) || "").trim().toUpperCase() === "S") { iSous = ii; break; }
    if (iSous < 0) return {cle: cle, erreur: "ligne des catégories S/I/R introuvable"};

    var cat = {zone: {}, cmi: {}};
    for (j = 0; j < larg; j++) {
      var s = (cel(iSous, j) || "").trim().toUpperCase();
      if (bloc[j] && /^(S|SDD|I|R)$/.test(s)) cat[bloc[j]][s] = j;
    }
    if (!Object.keys(cat.zone).length && !Object.keys(cat.cmi).length)
      return {cle: cle, erreur: "aucune colonne S/I/R"};

    // ----- les lignes ---------------------------------------------------
    var lignes = [], section = null, groupe = null;
    for (var i = iSous + 1; i < g.length; i++) {
      var ag = cel(i, iAgent);
      var cl = iGroupe >= 0 ? cel(i, iGroupe) : "";

      // Ligne de TITRE : la cellule de tête est pleine et fusionnée vers la
      // droite. Elle ne porte pas de seuil, elle ouvre une section.
      if (cl && cl !== K.HAUT && cl !== K.GAUCHE &&
          (ag === K.GAUCHE || ag === "")) {
        section = cl;
        groupe = null;
        continue;
      }
      if (ag === "" || ag === K.GAUCHE || ag === K.HAUT) continue;
      // Sur une ligne de données, la colonne de tête donne le GROUPE — une
      // espèce en table 21, un rang de rendu en table 10 — et se reporte
      // vers le bas par rowspan.
      if (cl && cl !== K.HAUT && cl !== K.GAUCHE) groupe = cl;

      // Un nom d'agent peut tenir plusieurs molécules séparées par un <br>.
      var noms = ag.split(K.RETOUR).map(function (x) {
        return x.replace(/\s+or$/i, "").trim(); }).filter(function (x) { return x; });
      var n = noms.length || 1;

      function part(j, role) {
        if (j === undefined || j < 0) return new Array(n).fill(null);
        var v = cel(i, j);
        if (v === K.HAUT || v === K.GAUCHE) v = "";
        var p = v.split(K.RETOUR).map(function (x) { return x.trim(); });
        if (n === 1) return [p.join(" ")];
        if (p.length === n) return p;
        if (p.length === 1) {
          if (K.estVide(p[0]) || VAL.test(p[0])) return new Array(n).fill(p[0]);
          if (role === "disque") {
            var ch = p[0].match(/\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?\s*(?:units?|U|µg|μg|mg)/gi);
            if (ch && ch.length === n) return ch.map(function (x) { return x.trim(); });
          }
          if (!/\d/.test(p[0])) return new Array(n).fill(p[0]);
        }
        anomalies.push(cle + " L" + i + " « " + noms[0].slice(0, 28) + " » : « " +
                       v.split(K.RETOUR).join(" ⏎ ") + " » pour " + n + " agents");
        return new Array(n).fill(K.DOUTE + v.split(K.RETOUR).join(" ⏎ "));
      }

      var dq = part(iDisque, "disque");
      var zS = part(cat.zone.S), zI = part(cat.zone.I), zR = part(cat.zone.R);
      var mS = part(cat.cmi.S),  mI = part(cat.cmi.I),  mR = part(cat.cmi.R);
      var com = iCom >= 0 ? cel(i, iCom) : "";
      if (com === K.HAUT || com === K.GAUCHE) com = "";

      for (var k = 0; k < n; k++) {
        lignes.push({
          section: section, groupe: groupe, agent: noms[k], disque: dq[k],
          zone: {S: zS[k], I: zI[k], R: zR[k]},
          cmi:  {S: mS[k], I: mI[k], R: mR[k]},
          renvois: (com.match(/\(\d+\)/g) || []).join("")
        });
      }
      if (!section && !groupe)
        anomalies.push(cle + " L" + i + " « " + noms[0].slice(0, 28) +
                       " » : ni section ni groupe au-dessus");
    }

    opt.suspects.forEach(function (s) {
      anomalies.push(cle + " : exposant non bibliographique « " + s + " »");
    });

    /* LA MÊME FORME QUE LA SÉRIE 2, pour que le convertisseur n'ait pas à
       apprendre un second format. outils/transcrire-clsi.py lit `colonnes`
       et `lignes` ; un second lecteur de JSON à écrire serait un second
       endroit où la conversion peut diverger. On traduit donc ici, à la
       source, plutôt que là-bas, en double.

       Les noms de colonnes sont ceux de la série 2 — « agent », « charge »,
       « cmi:S », « disque:R » — et les valeurs sont rendues telles que le
       document les écrit, « ≤ 1 », « ≥ 4 ». La conversion vers la
       convention de PhénoBac reste le travail du convertisseur, en un seul
       endroit. */
    var colonnes = ["agent", "charge",
                    "disque:S", "disque:I", "disque:R",
                    "cmi:S", "cmi:I", "cmi:R"];
    var plates = lignes.map(function (l) {
      return [l.agent, l.disque,
              l.zone.S, l.zone.I, l.zone.R,
              l.cmi.S, l.cmi.I, l.cmi.R, l.renvois];
    });

    return {cle: cle, titre: titre(rep.doc, cle), colonneGroupe: nomGroupe,
            blocs: {zone: Object.keys(cat.zone), cmi: Object.keys(cat.cmi)},
            colonnes: colonnes, n: lignes.length,
            lignes: plates, detail: lignes,
            notes: Array.from(new Set(opt.notes)).sort(),
            anomalies: anomalies};
  }

  window.extraireM45 = async function () {
    var res = {edition: K.M45, lu: new Date().toISOString(), tables: {}};
    var anomalies = [], vides = [];
    for (var i = 0; i < TABLES.length; i++) {
      var r = await lire(TABLES[i]);
      res.tables[TABLES[i]] = r;
      (r.anomalies || []).forEach(function (a) { anomalies.push(a); });
      if (r.erreur) vides.push(TABLES[i] + " (" + r.erreur + ")");
    }
    res.anomalies = anomalies;
    res.nonLues = TABLES_NON_LUES;
    console.log("tables d'espèces lues : " + TABLES.length);
    console.log("tables sans seuils    : " + (vides.join(", ") || "aucune"));
    console.log("lignes                : " + TABLES.reduce(function (s, k) {
      return s + (res.tables[k].n || 0); }, 0));
    console.log("anomalies à relire    : " + anomalies.length);
    anomalies.forEach(function (a) { console.log("  " + a); });
    window.__CLSI_M45 = res;
    return res;
  };
})();
