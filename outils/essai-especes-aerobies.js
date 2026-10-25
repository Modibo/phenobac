/* ============================================================
   essai-especes-aerobies.js — les sept espèces du 25 octobre 2026

   POURQUOI CE BANC EXISTE

   Pasteurella, Aeromonas, Achromobacter, Kingella, Aerococcus,
   Corynebacterium diphtheriae et C. ulcerans ont apporté 126 règles, et avec
   elles quatre façons précises de se tromper :

     · LA NOTE 13. Chez les corynébactéries toxinogènes, le classeur écrit
       « S ≤ 0,001 mg/L » et « S ≥ 50 mm » pour la pénicilline G, la
       céfotaxime et la ciprofloxacine. Ce ne sont pas des seuils : c'est un
       seuil HORS ÉCHELLE qui veut dire « ne jamais rendre S ». Pris pour des
       chiffres, ils rendraient « sensible » presque tout ;

     · LA FEUILLE PARTAGÉE. C. diphtheriae et C. ulcerans vivent sur la même
       feuille, et le document ne chiffre la clindamycine que pour la
       première. Un seul groupe de seuils appliquerait la valeur de l'une à
       l'autre ;

     · LE SITE URINAIRE. Trois seuils d'Aerococcus ne valent que pour la
       cystite simple. Les appliquer à une hémoculture rendrait « sensible »
       ce qui ne l'est pas ;

     · LE DÉPISTAGE EUCAST. Le dépistage était, dans PhénoBac, une notion du
       CA-SFM : une seule table, consultée sous ce seul référentiel. Les
       écrans de l'EUCAST tombaient donc dans le vide, et l'application
       affirmait que le document ne tranche pas — alors qu'il explique
       comment conclure.

   Avec Node :             node outils/essai-especes-aerobies.js
   Sans Node, sur macOS :  …/jsc outils/essai-especes-aerobies.js
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

function sir(org, res, ctx) {
  return E.runInterpretation({ organism: org, mode: "sir", results: res, ctx: ctx || {} });
}
function cmi(org, m, ctx, ref) {
  return E.runInterpretation({ organism: org, mode: "mic", mic: m, ctx: ctx || {},
                               ref: ref || "eucast" });
}
function diam(org, m, ctx, ref) {
  return E.runInterpretation({ organism: org, mode: "diam", diam: m, ctx: ctx || {},
                               ref: ref || "eucast" });
}
function textes(a) {
  return (a.rules || []).map(function (x) { return x.txt; })
    .concat((a.alerts || []).map(function (x) { return x.txt; }))
    .concat([a.comment || "", a.mech || "", a.name || ""]).join(" || ");
}

var SEPT = ["pasteurella", "aeromonas", "achromobacter", "kingella", "aerococcus",
            "cdiphtheriae", "culcerans"];

/* ---------- 1. Elles existent, et chacune a ses seuils ---------- */
dire("\nLes sept espèces, et leurs tables propres");
SEPT.forEach(function (id) {
  var o = E.ORG[id];
  verif(!!o, id + " : connue du moteur");
  verif(!!o && o.bpGroup === id, "… ses seuils lui sont propres (« " + (o && o.bpGroup) + " »)");
  verif(!!E.BP[id] || !!E.BP_URIN[id], "… et la table n'est pas vide");
});

/* ---------- 2. LA NOTE 13 — ne jamais rendre « sensible » ---------- */
dire("\nNote 13 : « S ≤ 0,001 » veut dire JAMAIS S, pas « sensible à tout »");
["cdiphtheriae", "culcerans"].forEach(function (g) {
  ["PEN", "CTX", "CIP"].forEach(function (k) {
    verif(E.BP[g][k] && E.BP[g][k].S === null,
          g + " / " + k + " : S = null — aucune catégorie « sensible »");
  });
});
(function () {
  // Une CMI minuscule ne doit PAS donner S. C'est tout l'objet de la note.
  var tres = cmi("cdiphtheriae", { PEN: "0.004" });
  var moyen = cmi("cdiphtheriae", { PEN: "0.5" });
  var haut = cmi("cdiphtheriae", { PEN: "2" });
  verif(tres.categories.PEN === "I", "CMI 0,004 mg/L de pénicilline G : rendue I, pas S");
  verif(moyen.categories.PEN === "I", "CMI 0,5 : I");
  verif(haut.categories.PEN === "R", "CMI 2 : R (seuil R > 1)");
  verif(tres.categories.PEN !== "S" && moyen.categories.PEN !== "S",
        "… aucune CMI ne produit « S » : le contrôle porterait à faux si l'une le faisait");
  // LE CAS QUI PIÈGE : si l'on recopiait « 0,001 » comme un chiffre au lieu de
  // null, une CMI égale à 0,001 passerait « S ≤ 0,001 » et serait rendue
  // SENSIBLE — exactement ce que la note 13 interdit. Les CMI plus hautes, elles,
  // donneraient « I » dans les deux cas, et l'erreur resterait invisible.
  verif(cmi("cdiphtheriae", { PEN: "0.001" }).categories.PEN !== "S",
        "CMI égale à 0,001 mg/L : toujours pas « S » — c'est là que la faute se cacherait");
  verif(cmi("culcerans", { CTX: "0.001" }).categories.CTX !== "S",
        "… et de même pour la céfotaxime de C. ulcerans");
  var large = diam("cdiphtheriae", { PEN: "55" });
  verif(large.categories.PEN === "I", "55 mm au disque : I — même un très grand diamètre");
  verif(diam("cdiphtheriae", { PEN: "8" }).categories.PEN === "R", "8 mm : R");
  // Et une espèce qui, elle, a bien une catégorie S : sans quoi on ne saurait
  // pas si le moteur sait encore en rendre une.
  verif(cmi("cdiphtheriae", { E: "0.03" }).categories.E === "S",
        "… alors que l'érythromycine, normalement chiffrée, rend bien « S »");
})();

/* ---------- 3. La feuille partagée, et la molécule d'une seule espèce ---------- */
dire("\nC. diphtheriae et C. ulcerans : même feuille, clindamycine d'une seule");
verif(E.BP.cdiphtheriae.DA && E.BP.cdiphtheriae.DA.S === 0.5,
      "C. diphtheriae : clindamycine chiffrée (S ≤ 0,5)");
verif(!E.BP.culcerans.DA,
      "C. ulcerans : AUCUN seuil de clindamycine — « le sauvage y est moins sensible »");
verif(cmi("culcerans", { DA: "0.25" }).categories.DA === undefined,
      "… et une CMI de clindamycine sur C. ulcerans ne reçoit pas de catégorie");
verif(cmi("cdiphtheriae", { DA: "0.25" }).categories.DA === "S",
      "… alors qu'elle en reçoit une sur C. diphtheriae : la séparation fonctionne");
verif(/ZOONOSE/.test(textes(sir("culcerans", { E: "S" }).interpretation)),
      "C. ulcerans : on dit que c'est une zoonose — l'enquête ne vise pas le même entourage");
verif(!/ZOONOSE/.test(textes(sir("cdiphtheriae", { E: "S" }).interpretation)),
      "… et on ne le dit pas de C. diphtheriae");

/* ---------- 4. L'antitoxine avant l'antibiogramme ---------- */
dire("\nDiphtérie : la priorité n'est pas l'antibiogramme");
["cdiphtheriae", "culcerans"].forEach(function (g) {
  var a = sir(g, { E: "S", PEN: "I" }).interpretation;
  verif(a.sev === "crit", g + " : gravité « crit » — ce n'est pas une remarque de bas de page");
  verif(/antitoxine/i.test(textes(a)), "… l'antitoxine est nommée");
  verif(/déclaration obligatoire/i.test(textes(a)), "… la déclaration obligatoire est rappelée");
  verif(/gène tox|Elek/.test(textes(a)), "… le caractère toxinogène est à chercher");
  verif((a.alerts || []).some(function (x) { return x.lvl === "crit"; }),
        "… et l'alerte est de niveau critique");
});

/* ---------- 5. Aerococcus : trois seuils de CYSTITE SIMPLE ---------- */
dire("\nAerococcus : ce qui ne vaut que pour la cystite simple");
["CIP", "LVX", "NIT"].forEach(function (k) {
  verif(E.BP.aerococcus[k] === undefined,
        k + " : aucun seuil hors cystite simple");
  verif(E.BP_URIN.aerococcus && E.BP_URIN.aerococcus[k] !== undefined,
        "… et un seuil propre à la cystite simple");
});
(function () {
  var u = cmi("aerococcus", { CIP: "1" }, { urin: "Oui" });
  var h = cmi("aerococcus", { CIP: "1" }, {});
  verif(u.categories.CIP === "S", "ciprofloxacine 1 mg/L, cystite simple : S");
  verif(h.categories.CIP === undefined,
        "la même CMI hors cystite : AUCUNE catégorie — le seuil ne s'applique pas");
  verif(cmi("aerococcus", { PEN: "0.06" }, {}).categories.PEN === "S",
        "… alors que la pénicilline G est chiffrée dans les deux contextes");
  verif(/endocardite/.test(textes(sir("aerococcus", { PEN: "S" }).interpretation)),
        "un Aerococcus fait chercher une endocardite");
  verif(/catalase/i.test(textes(sir("aerococcus", { PEN: "S" }).interpretation)),
        "… et on rappelle la catalase négative, qui l'écarte des staphylocoques");
})();

/* ---------- 6. Les témoins déclarés par le document ---------- */
dire("\nLes molécules qu'on lit sur le disque d'une autre");
[["pasteurella", "AMP", "PEN"], ["pasteurella", "AMX", "PEN"],
 ["kingella", "AMP", "PEN"], ["kingella", "AMX", "PEN"],
 ["kingella", "AZM", "E"], ["kingella", "DOX", "TET"],
 ["aerococcus", "AMX", "AMP"], ["aerococcus", "LVX", "CIP"],
 ["cdiphtheriae", "DOX", "TET"], ["culcerans", "DOX", "TET"]
].forEach(function (t) {
  verif(E.DZ_TEMOIN[t[0]] && E.DZ_TEMOIN[t[0]][t[1]] === t[2],
        t[0] + " : " + t[1] + " se lit sur le disque de " + t[2]);
});
(function () {
  // Pasteurella : disque de pénicilline G à S ≥ 17 mm.
  var s = diam("pasteurella", { AMX: "20" });
  var r = diam("pasteurella", { AMX: "12" });
  verif(s.categories.AMX === "S", "20 mm d'amoxicilline sur Pasteurella : S (seuil PEN 17)");
  verif(r.categories.AMX === "R", "12 mm : R");
  verif(s.categories.AMX !== r.categories.AMX, "… le témoin catégorise vraiment");
  // Kingella : disque d'érythromycine à S ≥ 20 mm.
  verif(diam("kingella", { AZM: "25" }).categories.AZM === "S",
        "25 mm d'azithromycine sur Kingella : S, par le seuil d'érythromycine");
})();

/* ---------- 7. LE DÉPISTAGE EUCAST, qui tombait dans le vide ---------- */
dire("\nLe dépistage de l'EUCAST — et le message qui n'est pas celui du CA-SFM");
verif(E.DEPISTAGE.pasteurella && E.DEPISTAGE.pasteurella.TET === 24,
      "Pasteurella : tétracycline, écran à 24 mm, dans la table EUCAST");
verif(!(E.DEPISTAGE_CASFM.pasteurella || {}).TET,
      "… et NON dans celle du CA-SFM, où elle ne serait jamais consultée");
(function () {
  var haut = diam("pasteurella", { TET: "30" });
  var bas = diam("pasteurella", { TET: "20" });
  verif(haut.categories.TET === "S", "30 mm : au-dessus de l'écran, rendu sensible");
  verif(bas.categories.TET === undefined,
        "20 mm : en dessous, AUCUNE catégorie — un écran ne conclut que dans un sens");
  var t = textes(bas.interpretation);
  verif(/L'écran est POSITIF/.test(t), "… et on explique quoi faire");
  verif(/l'EUCAST demande/.test(t), "… en nommant le référentiel qui le demande");
  verif(!/Le CA-SFM n'autorise pas/.test(t),
        "… SANS citer le CA-SFM : attribuer à un référentiel la règle de l'autre est "
        + "pire qu'un silence");
  var c = diam("spyogenes", { PEN: "20" }, {}, "casfm");
  verif(/Le CA-SFM n'autorise pas/.test(textes(c.interpretation)),
        "… et sous CA-SFM, c'est bien le texte du CA-SFM qui paraît");
})();

/* ---------- 8. Aeromonas a une vraie zone « I » ---------- */
dire("\nAeromonas : la seule de ces sept où l'EUCAST laisse une zone « I »");
verif(E.BP.aeromonas.CAZ.S === 1 && E.BP.aeromonas.CAZ.R === 4,
      "ceftazidime : S ≤ 1 et R > 4 — les deux bords diffèrent");
verif(cmi("aeromonas", { CAZ: "2" }).categories.CAZ === "I",
      "CMI 2 mg/L : rendue I, et non arrondie à S ou à R");
verif(/INDUCTIBLE/.test(textes(sir("aeromonas", { CIP: "S" }).interpretation)),
      "… et l'on prévient des β-lactamases inductibles, qui peuvent se dérépresser");

/* ---------- 9. Ce que le document ne chiffre pas ---------- */
dire("\nAchromobacter : trois molécules, et c'est l'information");
verif(Object.keys(E.BP.achromobacter).length === 3,
      "l'EUCAST n'en chiffre que trois (" + Object.keys(E.BP.achromobacter).sort().join(", ") + ")");
["GEN", "AMK", "CRO", "ATM", "CIP"].forEach(function (k) {
  verif(E.BP.achromobacter[k] === undefined, k + " : aucun seuil, donc aucune catégorie");
});
verif(/que trois molécules|trois seules molécules/.test(
        textes(sir("achromobacter", { SXT: "S" }).interpretation)),
      "… et le commentaire le dit, au lieu de laisser croire à un panel incomplet");

/* ---------- 10. Pasteurella : le piège de la morsure ---------- */
dire("\nPasteurella : le piège que l'on tend à la morsure");
(function () {
  var t = textes(sir("pasteurella", { AMC: "S", PEN: "S" }).interpretation);
  verif(/oxacilline/i.test(t) && /INACTIVES/.test(t),
        "oxacilline, C1G et clindamycine inactives : c'est dit en clair");
  verif(/rage/i.test(t) && /tétanos/i.test(t),
        "… et l'on rappelle la rage et le tétanos, qui ne se lisent pas sur un antibiogramme");
})();

/* ---------- 11. Kingella : la culture qu'on rend « stérile » ---------- */
dire("\nKingella : elle pousse mal, et c'est le vrai risque");
(function () {
  var t = textes(sir("kingella", { AMX: "S" }).interpretation);
  verif(/FLACON D'HÉMOCULTURE/.test(t),
        "ensemencer le liquide articulaire en flacon d'hémoculture");
  verif(/PCR/.test(t), "… et penser à la PCR");
  verif(/stérile/.test(t),
        "… parce qu'une culture classique négative fait rendre « stérile » une arthrite qui ne l'est pas");
})();

/* ---------- 12. Aucune de ces sept ne rend un compte rendu vide ---------- */
dire("\nChacune rend un commentaire, et un profil nommé");
SEPT.forEach(function (g) {
  var a = sir(g, { SXT: "S", PEN: "S", E: "S", CIP: "S", MEM: "S", AMP: "S" }).interpretation;
  verif(!!a.comment && a.comment.length > 60,
        g + " : commentaire rendu (" + (a.comment || "").length + " caractères)");
  verif(!!a.name, g + " : profil nommé");
});

dire("\n" + (KO ? KO + " échec(s) sur " + (OK + KO) + " contrôles."
                : OK + " contrôles : la note 13 tient, la feuille partagée ne mélange pas "
                     + "les espèces,\nles seuils de cystite ne débordent pas, et le dépistage "
                     + "de l'EUCAST ne tombe plus dans le vide."));
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
