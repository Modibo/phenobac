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


/* ---------- chargement du moteur, avec ou sans Node ---------- */
if (typeof require === "function" && typeof module === "object" && module.exports) {
  E = require("../netlify/functions/premium-interpret")._engine;
} else {
  // jsc : ni require ni process. On fournit le strict nécessaire ; rien de
  // ce qui est simulé ici n'intervient dans le calcul des catégories.
  var mod = { exports: {} };
  var faux = function (n) {
    if (n === "crypto") return {
      createHmac: function () { return { update: function () { return this; }, digest: function () { return ""; } }; },
      timingSafeEqual: function () { return false; }
    };
    if (n.indexOf("revocation") !== -1) return { isRevoked: function () { return false; } };
    if (n.indexOf("http") !== -1) return { cors: function () { return {}; } };
    return {};
  };
  var src = readFile("netlify/functions/premium-interpret.js");
  (new Function("module", "exports", "process", "require", src))(mod, mod.exports, { env: {} }, faux);
  E = mod.exports._engine;
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
// PhénoBac ne reprend que les CMI du CA-SFM. Là où il s'écarte de l'EUCAST,
// appliquer quand même le diamètre EUCAST rendrait une catégorie qui n'est
// celle d'aucun des deux.
cat("S. pyogenes, pénicilline, EUCAST", "spyogenes", "PEN", "25", "S", {}, "eucast");
cat("S. pyogenes, pénicilline, CA-SFM", "spyogenes", "PEN", "25", null, {}, "casfm");
// Un couple sur lequel les deux référentiels s'accordent reste catégorisable.
cat("E. coli, ampicilline, CA-SFM", "ecoli", "AMP", "20", "S", {}, "casfm");

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

dire("\n" + (KO ? KO + " échec(s) sur " + (OK + KO) + " vérifications."
                : OK + " vérifications, aucune divergence."));
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
