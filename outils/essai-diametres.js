/* ============================================================
   essai-diametres.js — la saisie en millimètres.

   Ce banc existe pour UN danger précis : le sens des seuils est
   inversé par rapport aux CMI. En CMI, petit veut dire sensible ; au
   disque, c'est grand. Une inversion ne casse rien, ne lève aucune
   exception, et rend résistante toute souche sensible. Elle ne se
   verrait qu'au lit du malade.

   Chaque contrôle ci-dessous est donc écrit en DEUX points : un
   diamètre franchement au-dessus du seuil, un franchement en dessous.
   Si le sens venait à s'inverser, les deux basculeraient ensemble et
   la moitié des lignes échouerait d'un coup.

   Avec Node :             node outils/essai-diametres.js
   Sans Node, sur macOS :  /System/Library/Frameworks/JavaScriptCore.framework/\
                             Versions/A/Helpers/jsc outils/essai-diametres.js

   À lancer depuis la racine du dépôt.
   ============================================================ */

var E, KO = 0, OK = 0;


/* ---------- chargement du moteur ----------
   Le raisonnement vit dans moteur.js, que le navigateur charge aussi : le
   banc éprouve donc exactement l'objet que le laboratoire exécute. Ce fichier
   n'a aucune dépendance — ni require, ni process — d'où ce chargement direct,
   là où il fallait auparavant simuler l'environnement de Node. */
if (typeof require === "function" && typeof module === "object" && module.exports) {
  E = require("../moteur");
} else {
  // La base d'abord : le moteur y reconstruit ses tables au chargement.
  var modB = { exports: {} };
  (new Function("module", "exports", readFile("base-connaissances.js")))(modB, modB.exports);
  // Le moteur réclame DEUX fichiers de données : la base de règles et les
  // posologies. Un require qui rendrait toujours le même les confondrait, et
  // le moteur chercherait des posologies dans la base.
  var modP = { exports: {} };
  (new Function("module", "exports", readFile("posologie.js")))(modP, modP.exports);
  var mod = { exports: {} };
  var modV = { exports: {} };
  (new Function("module", "exports", readFile("voies.js")))(modV, modV.exports);
  // LE RÉSOLVEUR LÈVE SUR UN NOM QU'IL NE CONNAÎT PAS. Il rendait la base de
  // connaissances par défaut : require("./voies") aurait rendu la base, et le
  // moteur, ne trouvant pas VOIES, n'aurait affiché AUCUNE voie — au vert.
  var resoudre = function (nom) {
    if (/posologie/.test(nom)) return modP.exports;
    if (/voies/.test(nom)) return modV.exports;
    if (/rendu-cible/.test(nom)) return modB.exports;
    if (/base-connaissances/.test(nom)) return modB.exports;
    throw new Error("le banc ne sait pas charger " + nom
      + " : ajoutez-le ici plutôt que de lui substituer la base");
  };
  (new Function("module", "exports", "require", readFile("moteur.js")))(
    mod, mod.exports,
    resoudre);
  E = mod.exports;
}

function dire(s) { (typeof console === "object" ? console.log : print)(s); }


function dire(s) { (typeof console === "object" ? console.log : print)(s); }

function verif(ok, txt) {
  ok ? OK++ : KO++;
  dire((ok ? "  ok   " : "  ÉCHEC") + "  " + txt);
}

var dia = function (org, d, ctx, ref) {
  return { organism: org, mode: "diam", diam: d, ctx: ctx || {}, ref: ref };
};

// La catégorie rendue pour un diamètre donné.
function cat(titre, org, abx, mm, attendu, ctx, ref) {
  var d = {}; d[abx] = mm;
  var got = E.runInterpretation(dia(org, d, ctx, ref)).categories[abx];
  if (got === undefined) got = null;
  verif(got === attendu, titre + " — " + abx + " " + mm + " mm = " +
        (got === null ? "non catégorisé" : got) +
        (got === attendu ? "" : " (attendu " + attendu + ")"));
}

/* ---------- 1. le sens, sur les deux bords ---------- */
dire("\nLe sens des seuils (grand = sensible)");
// E. coli / ampicilline, disque 10 µg : S ≥ 14, R < 14.
cat("E. coli, ampicilline", "ecoli", "AMP", "20", "S");
cat("E. coli, ampicilline", "ecoli", "AMP", "10", "R");
cat("E. coli, ampicilline — au seuil exact", "ecoli", "AMP", "14", "S");
cat("E. coli, ampicilline — juste en dessous", "ecoli", "AMP", "13", "R");
// E. coli / céfotaxime : S ≥ 20, R < 17 — un vrai intervalle intermédiaire.
cat("E. coli, céfotaxime", "ecoli", "CTX", "25", "S");
cat("E. coli, céfotaxime", "ecoli", "CTX", "18", "I");
cat("E. coli, céfotaxime", "ecoli", "CTX", "15", "R");
// S. aureus / gentamicine : S ≥ 18, R < 18.
cat("S. aureus, gentamicine", "saureus", "GEN", "22", "S");
cat("S. aureus, gentamicine", "saureus", "GEN", "12", "R");

/* ---------- 2. « pas de catégorie sensible » ---------- */
dire("\nCouples sans catégorie « sensible » à posologie standard");
// P. aeruginosa / ceftazidime : l'EUCAST écrit S ≥ 50 mm, qu'aucune boîte ne
// produit. Même une très grande zone ne peut donc pas être rendue S.
cat("P. aeruginosa, ceftazidime — grande zone", "paeru", "CAZ", "30", "I");
cat("P. aeruginosa, ceftazidime — petite zone", "paeru", "CAZ", "12", "R");
// S. aureus / ciprofloxacine : même convention (R < 17).
cat("S. aureus, ciprofloxacine — grande zone", "saureus", "CIP", "35", "I");
cat("S. aureus, ciprofloxacine — petite zone", "saureus", "CIP", "10", "R");

/* ---------- 3. le LCR ---------- */
dire("\nContexte méningé");
// E. coli / céfotaxime : 20/20 dans le LCR contre 20/17 ailleurs. Une zone de
// 18 mm est intermédiaire en ville, résistante dans une méningite.
cat("E. coli, céfotaxime, hors LCR", "ecoli", "CTX", "18", "I");
cat("E. coli, céfotaxime, LCR", "ecoli", "CTX", "18", "R", { mening: "Oui" });
// Pneumocoque : l'EUCAST renvoie à la CMI pour la méningite. Appliquer le
// seuil ordinaire serait trop permissif — le moteur doit refuser.
cat("Pneumocoque, céfotaxime, LCR", "pneumocoque", "CTX", "26", null, { mening: "Oui" });
(function () {
  var r = E.runInterpretation(dia("pneumocoque", { CTX: "26" }, { mening: "Oui" }));
  var dit = (r.interpretation.alerts || []).some(function (a) {
    return /renvoie à la CMI|trop permissif/.test(a.txt); });
  verif(dit, "Pneumocoque, LCR : le refus est expliqué au biologiste");
})();

/* ---------- 4. couples que le disque ne sait pas juger ---------- */
dire("\nCouples hors méthode des disques");
// La colistine ne diffuse pas dans la gélose : l'EUCAST l'interdit au disque.
cat("P. aeruginosa, colistine", "paeru", "COL", "15", null);
// La vancomycine sur staphylocoque : même interdiction.
cat("S. aureus, vancomycine", "saureus", "VA", "18", null);
// … mais elle est valide chez l'entérocoque (S ≥ 12).
cat("E. faecalis, vancomycine", "efaecalis", "VA", "18", "S");
cat("E. faecalis, vancomycine", "efaecalis", "VA", "8", "R");
(function () {
  var r = E.runInterpretation(dia("saureus", { VA: "18", GEN: "22" }));
  var dit = (r.interpretation.alerts || []).some(function (a) {
    return /Vancomycine/i.test(a.txt) && /non catégorisé/.test(a.txt); });
  verif(dit, "Un diamètre non traduit est signalé, pas escamoté");
  verif(r.categories.GEN === "S", "… et les autres antibiotiques sont rendus normalement");
})();

/* ---------- 5. le CA-SFM ---------- */
dire("\nRéférentiel CA-SFM");
// Streptocoque A : l'EUCAST tranche des deux côtés à 23 mm. Le CA-SFM n'y
// voit qu'un DÉPISTAGE — « si le diamètre est < 23 mm, utiliser une méthode
// [de CMI] » — parce que la résistance aux β-lactamines y est exceptionnelle
// et qu'un petit diamètre est d'abord un problème technique.
cat("S. pyogenes, pénicilline, EUCAST", "spyogenes", "PEN", "25", "S", {}, "eucast");
cat("S. pyogenes, pénicilline, EUCAST", "spyogenes", "PEN", "18", "R", {}, "eucast");
cat("S. pyogenes, pénicilline, CA-SFM", "spyogenes", "PEN", "25", "S", {}, "casfm");
cat("S. pyogenes, pénicilline, CA-SFM", "spyogenes", "PEN", "18", null, {}, "casfm");
(function () {
  var r = E.runInterpretation(dia("spyogenes", { PEN: "18" }, {}, "casfm"));
  var dit = (r.interpretation.alerts || []).some(function (a) {
    return /seuil de dépistage/.test(a.txt) && /CMI/.test(a.txt); });
  verif(dit, "… et le refus de conclure est expliqué, CMI à l'appui");
  var pasR = r.categories.PEN !== "R";
  verif(pasR, "… la pénicilline n'est surtout pas rendue résistante");
})();

// Un couple sur lequel les deux référentiels s'accordent reste catégorisable.
cat("E. coli, ampicilline, CA-SFM", "ecoli", "AMP", "20", "S", {}, "casfm");

// Amoxicilline : l'EUCAST fait lire le disque d'ampicilline (10 µg, 14 mm),
// le CA-SFM lui donne le sien (20 µg, 19 mm). Une zone de 16 mm sépare
// franchement les deux référentiels.
cat("E. coli, amoxicilline, EUCAST", "ecoli", "AMX", "16", "S", {}, "eucast");
cat("E. coli, amoxicilline, CA-SFM", "ecoli", "AMX", "16", "R", {}, "casfm");

// Couples que le CA-SFM chiffre là où l'EUCAST se tait.
cat("A. baumannii, ceftazidime, EUCAST", "acineto", "CAZ", "20", null, {}, "eucast");
cat("A. baumannii, ceftazidime, CA-SFM", "acineto", "CAZ", "20", "I", {}, "casfm");
cat("A. baumannii, ceftazidime, CA-SFM", "acineto", "CAZ", "14", "R", {}, "casfm");
cat("A. baumannii, minocycline, CA-SFM", "acineto", "MIN", "22", "I", {}, "casfm");

// Céfoxitine : le CA-SFM ne la chiffre que pour E. coli. L'appliquer à
// Klebsiella donnerait un chiffre juste au mauvais endroit.
cat("E. coli, céfoxitine, CA-SFM", "ecoli", "FOX", "22", "S", {}, "casfm");
cat("K. pneumoniae, céfoxitine, CA-SFM", "kpneu", "FOX", "22", null, {}, "casfm");

// Infection urinaire sans signe de gravité : le CA-SFM déplace le seuil.
cat("E. coli, cotrimoxazole, CA-SFM", "ecoli", "SXT", "14", "R", {}, "casfm");
cat("E. coli, cotrimoxazole, CA-SFM, urine", "ecoli", "SXT", "14", "S", { urin: "Oui" }, "casfm");

// La charge du disque change avec le référentiel : 10 µg pour l'EUCAST via
// l'ampicilline, 20 µg pour le CA-SFM. Une charge annoncée à tort ferait
// mesurer sur une boîte et lire sur l'autre.
(function () {
  var d = E._disquePour ? null : null;
  var r1 = E.runInterpretation(dia("ecoli", { AMX: "25" }, {}, "eucast"));
  var r2 = E.runInterpretation(dia("ecoli", { AMX: "25" }, {}, "casfm"));
  verif(r1.categories.AMX === "S" && r2.categories.AMX === "S",
        "Amoxicilline 25 mm : sensible sous les deux référentiels");
})();

// La zone d'incertitude du CA-SFM chez les anaérobies (moxifloxacine).
(function () {
  var r = E.runInterpretation(dia("cperfringens", { MXF: "19" }, {}, "casfm"));
  verif((r.interpretation.zit || []).length === 1,
        "C. perfringens, moxifloxacine 19 mm : ZIT propre au CA-SFM");
  var r2 = E.runInterpretation(dia("cperfringens", { MXF: "19" }, {}, "eucast"));
  verif(r2.categories.MXF === undefined,
        "… et l'EUCAST, lui, ne chiffre pas ce couple au disque");
})();

/* ---------- 6. zone d'incertitude technique ---------- */
dire("\nZone d'incertitude au disque");
(function () {
  // E. coli / pipéracilline-tazobactam : ZIT à 19 mm exactement.
  var r = E.runInterpretation(dia("ecoli", { TZP: "19" }));
  var z = (r.interpretation.zit || [])[0];
  verif(!!z && z.abx === "TZP", "E. coli, TZP 19 mm : signalé en ZIT");
  verif(!!z && z.unite === "mm", "… et l'unité affichée est le millimètre, pas mg/L");
  var dit = (r.interpretation.alerts || []).some(function (a) { return /19 mm/.test(a.txt); });
  verif(dit, "… l'alerte porte bien « 19 mm »");
  // Hors de l'intervalle, rien.
  var r2 = E.runInterpretation(dia("ecoli", { TZP: "26" }));
  verif(!(r2.interpretation.zit || []).length, "E. coli, TZP 26 mm : aucune ZIT");
  // L'amoxicilline-acide clavulanique a une ZIT au disque (19-20) sans en
  // avoir en CMI : l'incertitude tient à la méthode.
  var r3 = E.runInterpretation(dia("ecoli", { AMC: "20" }));
  verif((r3.interpretation.zit || []).length === 1, "E. coli, AMC 20 mm : ZIT propre au disque");
})();

/* ---------- 7. saisies aberrantes ---------- */
dire("\nSaisies impossibles ou bornées");
cat("Diamètre négatif", "ecoli", "AMP", "-5", null);
cat("Diamètre de 3 mm (plus petit que le disque)", "ecoli", "AMP", "3", null);
cat("Diamètre de 80 mm", "ecoli", "AMP", "80", null);
cat("Pas de zone, noté 0", "ecoli", "AMP", "0", "R");
cat("Pas de zone, noté 6", "ecoli", "AMP", "6", "R");
cat("Texte", "ecoli", "AMP", "abc", null);
// Une borne ne conclut que si elle suffit à elle seule.
cat("« ≥ 20 » conclut", "ecoli", "AMP", "≥20", "S");
cat("« ≥ 10 » ne conclut pas", "ecoli", "AMP", "≥10", null);
cat("« ≤ 10 » conclut", "ecoli", "AMP", "<=10", "R");
cat("« ≤ 30 » ne conclut pas", "ecoli", "AMP", "<=30", null);
// Un champ laissé vide n'est pas une mesure : rien ne doit être rendu, et
// surtout aucune alerte de non-catégorisation.
(function () {
  var r = E.runInterpretation(dia("ecoli", { AMP: "", CTX: "25" }));
  verif(r.categories.AMP === undefined, "Champ vide : aucune catégorie rendue");
  var muet = !(r.interpretation.alerts || []).some(function (a) { return /Ampicilline/i.test(a.txt); });
  verif(muet, "… et aucune alerte pour un antibiotique non mesuré");
})();

/* ---------- 7 bis. les lignes « X sauf Y » ---------- */
dire("\nLignes de l'EUCAST formulées « sauf un autre genre »");
// « Trimethoprim-sulfamethoxazole, Enterobacterales except Serratia spp. »
// NOMME Serratia pour l'exclure : la ligne parle donc bien d'E. coli. Un
// filtre naïf l'écartait, et le cotrimoxazole disparaissait de la table sans
// que rien ne le signale — l'absence d'un seuil ne lève aucune erreur.
cat("E. coli, cotrimoxazole", "ecoli", "SXT", "20", "S");
cat("E. coli, cotrimoxazole", "ecoli", "SXT", "12", "R");
// Serratia garde sa propre ligne, qui n'a pas de catégorie sensible.
cat("Serratia, cotrimoxazole — grande zone", "serratia", "SXT", "25", "I");
cat("Serratia, cotrimoxazole — petite zone", "serratia", "SXT", "10", "R");
// Même formulation pour l'imipénème, « sauf Morganellaceae ».
cat("E. coli, imipénème", "ecoli", "IPM", "25", "S");
cat("E. coli, imipénème", "ecoli", "IPM", "15", "R");
// … et les Morganellaceae gardent la leur, sans catégorie sensible : leur
// CMI d'imipénème est naturellement élevée.
cat("P. mirabilis, imipénème — grande zone", "proteus", "IPM", "28", "I");

/* ---------- 8. l'amoxicilline se lit sur le disque d'ampicilline ---------- */
dire("\nAmoxicilline : le témoin ampicilline");
// L'EUCAST écrit « Note » en face de l'amoxicilline et fait lire le disque
// d'ampicilline — mais seulement là où les deux partagent le seuil de CMI.
cat("E. coli, amoxicilline", "ecoli", "AMX", "20", "S");
cat("E. coli, amoxicilline", "ecoli", "AMX", "10", "R");
// Chez Haemophilus les CMI diffèrent (2 contre 1 mg/L) : pas d'emprunt.
cat("H. influenzae, ampicilline", "haemophilus", "AMP", "20", "S");
cat("H. influenzae, amoxicilline", "haemophilus", "AMX", "20", null);

/* ---------- 9. pneumocoque : le dépistage à l'oxacilline ---------- */
dire("\nPneumocoque : dépistage à l'oxacilline 1 µg");
(function () {
  // Dépistage négatif (≥ 20 mm) : les β-lactamines « Note » sont rendues S.
  var r = E.runInterpretation(dia("pneumocoque", { OXA: "22", E: "25" }));
  verif(r.categories.PEN === "S" && r.categories.AMX === "S" && r.categories.CTX === "S",
        "Dépistage négatif : pénicilline, amoxicilline et céfotaxime rendues S");
  var dit = (r.interpretation.rules || []).some(function (x) { return /oxacilline 1 µg négatif/.test(x.txt); });
  verif(dit, "… et la règle appliquée est énoncée");
  // L'oxacilline elle-même n'est pas un résultat à rendre.
  verif(r.categories.OXA === undefined, "… l'oxacilline reste un dépistage, pas une catégorie rendue");
  var muet = !(r.interpretation.alerts || []).some(function (a) { return /Oxacilline/i.test(a.txt); });
  verif(muet, "… et elle n'est pas signalée comme « non catégorisée »");

  // Dépistage positif (< 20 mm) : rien n'est rendu, et surtout pas « R ».
  var r2 = E.runInterpretation(dia("pneumocoque", { OXA: "14", E: "25" }));
  verif(r2.categories.PEN === undefined, "Dépistage positif : la pénicilline n'est pas rendue");
  var pasR = !["PEN", "AMX", "CTX"].some(function (k) { return r2.categories[k] === "R"; });
  verif(pasR, "… et aucune β-lactamine n'est rendue résistante sur le seul dépistage");
  var dit2 = (r2.interpretation.alerts || []).some(function (a) { return /CMI de pénicilline G/.test(a.txt); });
  verif(dit2, "… la CMI de pénicilline G est réclamée");
})();

/* ---------- 10. la lecture interprétative suit ---------- */
dire("\nLes diamètres alimentent bien la lecture interprétative");
(function () {
  // Antibiogramme de BLSE lu en millimètres : C3G petites, céfoxitine grande.
  var r = E.runInterpretation(dia("ecoli",
    { AMP: "6", AMC: "12", FOX: "24", CTX: "12", CAZ: "14", CIP: "30", GEN: "20" },
    { syn: "Positif" }));
  verif(r.categories.CTX === "R" && r.categories.CAZ === "R",
        "BLSE en millimètres : les C3G sont rendues résistantes");
  // L'EUCAST ne donne aucun diamètre de céfoxitine pour les entérobactéries,
  // alors que PhénoBac sait la juger en CMI : le dire, plutôt que de la
  // faire disparaître ou d'inventer un seuil.
  verif(r.categories.FOX === undefined, "… la céfoxitine n'est pas catégorisée au disque");
  var oriente = (r.interpretation.alerts || []).some(function (a) {
    return /Céfoxitine/i.test(a.txt) && /saisir une CMI/.test(a.txt); });
  verif(oriente, "… et le biologiste est renvoyé vers la CMI");
  verif(/BLSE/i.test(r.interpretation.name),
        "… et le phénotype reconnu est bien « " + r.interpretation.name + " »");
})();

/* ---------- 11. UNE CATÉGORIE ET « NON CATÉGORISÉ » NE COHABITENT PAS ----------

   LE DÉFAUT QUE CE BALAYAGE A ATTRAPÉ, le 2026-11-01, sur du code écrit la
   minute d'avant.

   La note de lecture du disque de vancomycine a été insérée entre
   « if (cat) results[k] = cat; » et son premier « else if ». Les deux
   branches suivantes se sont rattachées à la NOUVELLE condition, et un
   entérocoque mesuré à 11 mm est sorti ainsi :

       catégorie   VA = R
       alerte      « Vancomycine : 11 mm non catégorisé — valeur illisible »

   Deux phrases contradictoires dans le même compte rendu, sur l'alerte la
   plus grave que l'application sache rendre — un entérocoque résistant à la
   vancomycine. Aucun banc ne le voyait : chacun regardait SA question, la
   catégorie d'un côté, le message de l'autre.

   L'invariant est pourtant simple et vaut partout : un diamètre qui a donné
   une catégorie n'est pas un diamètre non catégorisé. Il se balaie, et il
   n'a besoin d'aucun document. */
dire("\nUn diamètre catégorisé n'est jamais annoncé « non catégorisé »");
(function () {
  var contradictions = [], examines = 0;
  var sondes = ["6", "11", "14", "18", "22", "28", "45"];
  Object.keys(E.ORG).forEach(function (id) {
    var groupe = E.ORG[id].bpGroup;
    if (!groupe || !E.DZ || !E.DZ[groupe]) return;
    Object.keys(E.DZ[groupe]).forEach(function (abx) {
      sondes.forEach(function (mm) {
        var d = {}; d[abx] = mm;
        var a = E.runInterpretation({ organism: id, mode: "diam", diam: d,
                                      ctx: {}, ref: "eucast" });
        examines++;
        var categorise = a.categories[abx] !== undefined;
        var annonceMuet = (a.interpretation.sansDisque || [])
          .some(function (x) { return x.abx === abx; });
        if (categorise && annonceMuet)
          contradictions.push(id + " " + abx + " " + mm + " mm : rendu « "
            + a.categories[abx] + " » ET annoncé non catégorisé");
      });
    });
  });
  verif(examines > 2000, examines + " mesures balayées, toutes espèces et "
        + "toutes molécules chiffrées au disque");
  verif(contradictions.length === 0,
        contradictions.length === 0
          ? "aucune mesure ne reçoit à la fois une catégorie et un « non catégorisé »"
          : "CONTRADICTION DANS LE COMPTE RENDU : " + contradictions.slice(0, 6).join(" ; ")
            + (contradictions.length > 6 ? " … et " + (contradictions.length - 6) + " autres" : ""));
})();

/* ---------- 12. LA NOTE DE LECTURE DU DISQUE ----------

   Le classeur écrit, à côté du chiffre, ce qui peut le contredire. Note A
   de la feuille « Enterococcus », v16.1 : un entérocoque sensible donne un
   bord de zone NET ; bord flou, colonies dans la zone ou simple doute →
   PCR ou rendre résistant, « even if the zone diameter is ≥ 12 mm ».

   Autrement dit : 13 mm peut être un VRE. PhénoBac portait les 435
   diamètres de l'EUCAST et aucune de leurs notes de lecture — pour un
   laboratoire qui mesure au pied à coulisse, c'est la moitié qui manque. */
dire("\nLa note de lecture du disque de vancomycine");
(function () {
  function alertes(org, mm, lang) {
    var d = { VA: mm };
    var a = E.runInterpretation({ organism: org, mode: "diam", diam: d,
                                  ctx: {}, ref: "eucast", lang: lang || "fr" });
    return (a.interpretation.alerts || []);
  }
  function note(org, mm, lang) {
    return alertes(org, mm, lang).filter(function (x) {
      return /bord de zone|zone edge/.test(x.txt); })[0] || null;
  }
  var n = note("efaecalis", "13");
  verif(!!n, "à 13 mm — rendu sensible — la note de lecture paraît");
  verif(!!n && n.lvl === "warn",
        "… en « warn » et non en « info » : elle peut renverser la catégorie");
  verif(!!n && /12 mm/.test(n.txt) && /PCR/.test(n.txt),
        "… et elle dit l'essentiel : PCR ou résistant, même à 12 mm");
  verif(!!n && /24 h/.test(n.txt),
        "… ainsi que les 24 h avant de rendre sensible");
  verif(note("efaecalis", "11") === null,
        "à 11 mm — déjà résistant — elle se tait : il n'y a plus rien à empêcher");
  verif(!!note("efaecium", "20"), "elle vaut pour E. faecium comme pour E. faecalis");
  var en = note("efaecalis", "13", "en");
  E.fixerLangue("fr");
  verif(!!en && /SHARP zone edge/.test(en.txt) && !/bord/.test(en.txt),
        "… et elle existe en anglais, sans reste de français");

  /* La table ne doit nommer que des groupes et des molécules que le moteur
     connaît : une clé mal orthographiée ferait une note qui ne paraît
     jamais, et le fichier resterait là, juste et inutile. */
  var faux = [];
  Object.keys(E.LECTURE_DISQUE).forEach(function (g) {
    var connu = Object.keys(E.ORG).some(function (i) { return E.ORG[i].bpGroup === g; });
    if (!connu) faux.push("groupe inconnu : " + g);
    Object.keys(E.LECTURE_DISQUE[g]).forEach(function (k) {
      if (!E.ABXNAME[k]) faux.push("molécule inconnue : " + g + "/" + k);
      if (!(E.DZ[g] && E.DZ[g][k]))
        faux.push(g + "/" + k + " n'a pas de diamètre : la note ne paraîtra jamais");
      var t = E.LECTURE_DISQUE[g][k];
      if (!t || !t.fr || !t.en) faux.push(g + "/" + k + " : note incomplète");
    });
  });
  verif(faux.length === 0,
        faux.length === 0 ? "la table ne nomme que des couples réellement chiffrés au disque"
          : "note de lecture inatteignable : " + faux.join(" ; "));
})();

dire("\n" + (KO ? KO + " échec(s) sur " + (OK + KO) + " vérifications."
                : OK + " vérifications, aucune divergence."));
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
