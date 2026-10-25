// langue.js — PhénoBac en français et en anglais.
//
// POURQUOI
//
// PhénoBac est née pour l'Hôpital Sominé DOLO de Mopti, et elle est écrite en
// français. Mais le laboratoire de district qui lit ses antibiogrammes au pied
// à coulisse n'est pas une particularité malienne : c'est la règle d'Accra à
// Nairobi. Un outil qui ne parle que français se prive de la moitié du
// continent pour une raison qui n'a rien de scientifique.
//
// L'ANGLAIS N'EST PAS ICI UNE TRADUCTION, C'EST LA SOURCE
//
// L'EUCAST publie en anglais. « Sensible à forte exposition » est le français
// de « Susceptible, increased exposure » ; « zone d'incertitude technique »
// est celui d'« Area of Technical Uncertainty ». Pour tout le vocabulaire du
// référentiel, la colonne « en » ci-dessous RESTITUE le terme officiel au
// lieu de le traduire — et c'est pour cela qu'elle est fiable.
//
// Le CA-SFM, lui, ne publie qu'en français. Là où son vocabulaire diffère de
// celui de l'EUCAST — il dit « sensible à forte posologie » quand l'EUCAST dit
// « forte exposition » —, la colonne anglaise rend le sens du comité français
// et le signale. Prêter à un comité les mots d'un autre serait une petite
// falsification, et elle se verrait dans un compte rendu.
//
// CE QUI EST TRADUIT, ET CE QUI NE L'EST PAS ENCORE
//
// Tout ce qui sert à FAIRE FONCTIONNER l'application : navigation, encadrés,
// commandes, catégories S/I/R, gravité, titres du compte rendu, avertissement.
// Le COMMENTAIRE CLINIQUE du moteur — 79 000 caractères de prose : mécanismes,
// règles expertes, alertes — reste en français, et l'interface le DIT quand on
// choisit l'anglais. Une application médicale à moitié traduite qui ne
// l'annonce pas est pire qu'une application qui n'est pas traduite du tout :
// le lecteur croit avoir tout lu.
//
// outils/verifier-langues.py tient le compte de ce qui reste, et refuse que ce
// nombre augmente.
(function (racine) {
"use strict";

// « meme: true » déclare qu'un terme s'écrit PAREIL dans les deux langues.
// Sans ce drapeau, une entrée identique serait indistinguable d'une entrée
// qu'on a oublié de traduire — et le contrôle passerait au vert sur un oubli.
const C = {
  /* ---------- la langue elle-même ---------- */
  "langue.nom":            { fr: "Français", en: "English" },
  "langue.basculer":       { fr: "English", en: "Français" },
  "langue.titre":          { fr: "Switch to English", en: "Passer en français" },

  /* ---------- l'avertissement d'anglais partiel ---------- */
  "partiel.titre":         { fr: "Interface en anglais, commentaire en français",
                             en: "Interface in English, commentary in French" },
  "partiel.texte":         { fr: "L'interface, les catégories et les titres du compte rendu sont en anglais. Le commentaire interprétatif — mécanisme de résistance, règles expertes, alertes — est encore rédigé en français. Il est traduit par vagues ; rien n'est masqué entre-temps.",
                             en: "The interface, the categories and the report headings are in English. The interpretive commentary — resistance mechanism, expert rules, alerts — is still written in French. It is being translated in waves; nothing is hidden in the meantime." },

  /* ---------- navigation ---------- */
  "nav.identification":    { fr: "Identification", en: "Identification", meme: true },
  "nav.interpretation":    { fr: "Interprétation", en: "Interpretation" },
  "nav.entrainement":      { fr: "Entraînement", en: "Training" },
  "nav.cq":                { fr: "Contrôle qualité", en: "Quality control" },
  "nav.surveillance":      { fr: "Surveillance", en: "Surveillance", meme: true },
  "nav.referentiels":      { fr: "Référentiels", en: "Breakpoint tables" },
  "nav.apropos":           { fr: "À propos", en: "About" },
  "nav.attente":           { fr: "En attente", en: "Pending" },
  "marque.sous":           { fr: "Lecture interprétative", en: "Interpretive reading" },
  "page.titre":            { fr: "PhénoBac — Lecture interprétative de l'antibiogramme",
                             en: "PhénoBac — Interpretive reading of the antibiogram" },

  /* ---------- encadrés ---------- */
  "bloc.contexte":         { fr: "Contexte", en: "Context" },
  "bloc.antibiogramme":    { fr: "Antibiogramme", en: "Antibiogram" },
  "bloc.interpretation":   { fr: "Interprétation", en: "Interpretation" },
  "bloc.seuils":           { fr: "Concentrations critiques", en: "Clinical breakpoints" },
  "bloc.conception":       { fr: "Conception", en: "Design and development" },

  /* ---------- saisie ---------- */
  "champ.espece":          { fr: "Espèce identifiée", en: "Identified species" },
  "champ.prelevement":     { fr: "Prélèvement", en: "Specimen" },
  "champ.identification":  { fr: "Identification — patient / n° échantillon",
                             en: "Identification — patient / sample no." },
  "champ.valideur":        { fr: "Biologiste validateur / laboratoire",
                             en: "Validating microbiologist / laboratory" },
  "champ.optionnel":       { fr: "(optionnel)", en: "(optional)" },
  "champ.demos":           { fr: "Exemples de démonstration", en: "Worked examples" },
  "mode.diametre":         { fr: "Diamètre mm", en: "Zone diameter mm" },
  "mode.sir":              { fr: "S / I / R", en: "S / I / R", meme: true },
  "mode.cmi":              { fr: "CMI mg/L", en: "MIC mg/L" },
  "bouton.reinitialiser":  { fr: "Réinitialiser", en: "Reset" },
  "champ.referentiel":     { fr: "Référentiel", en: "Breakpoint table" },
  "champ.rendu":           { fr: "Rendu ciblé", en: "Selective reporting" },
  "rendu.complet":         { fr: "Complet", en: "Full" },
  "rendu.cible":           { fr: "Ciblé", en: "Selective" },
  "interp.vide":           { fr: "Choisissez une espèce et saisissez au moins un résultat pour obtenir le phénotype, les alertes de cohérence et le commentaire du compte-rendu.",
                             en: "Choose a species and enter at least one result to obtain the phenotype, the consistency alerts and the report commentary." },

  /* ---------- prélèvements ---------- */
  "prel.hemoculture":      { fr: "Hémoculture", en: "Blood culture" },
  "prel.ecbu":             { fr: "ECBU (urines)", en: "Urine culture" },
  "prel.pus":              { fr: "Pus / plaie", en: "Pus / wound" },
  "prel.respiratoire":     { fr: "Prélèvement respiratoire", en: "Respiratory specimen" },
  "prel.lcr":              { fr: "LCR", en: "CSF" },
  "prel.catheter":         { fr: "Cathéter", en: "Catheter" },
  "prel.autre":            { fr: "Autre", en: "Other" },

  /* ---------- LE VOCABULAIRE DU RÉFÉRENTIEL ----------
     L'anglais est ici le terme OFFICIEL de l'EUCAST, pas une traduction. */
  "cat.S":                 { fr: "Sensible", en: "Susceptible, standard dosing regimen" },
  "cat.S.court":           { fr: "Sensible", en: "Susceptible" },
  "cat.R":                 { fr: "Résistant", en: "Resistant" },
  // L'EUCAST dit « increased exposure » ; le CA-SFM dit « forte posologie ».
  // Les deux formulations ne disent pas la même chose — l'exposition dépend de
  // la dose ET du schéma —, et l'application affiche celle du référentiel
  // actif. On ne prête pas à l'un les mots de l'autre.
  "cat.I.eucast":          { fr: "Sensible à forte exposition", en: "Susceptible, increased exposure" },
  "cat.I.casfm":           { fr: "Sensible à forte posologie", en: "Susceptible, increased dosage (CA-SFM wording)" },
  "cat.nonteste":          { fr: "Non testé", en: "Not tested" },
  "cat.noncategorise":     { fr: "Non catégorisé", en: "Not categorised" },
  "zit.nom":               { fr: "Zone d'incertitude technique", en: "Area of Technical Uncertainty" },
  "zit.sigle":             { fr: "ZIT", en: "ATU" },
  "ecoff.nom":             { fr: "Seuil fondé sur l'ECOFF", en: "ECOFF-based breakpoint" },
  "conv.nom":              { fr: "Convention de laboratoire", en: "Local laboratory convention" },
  "depistage.nom":         { fr: "Dépistage", en: "Screening test" },
  "charge.disque":         { fr: "disque", en: "disk" },

  /* ---------- gravité ---------- */
  "sev.wild":              { fr: "Phénotype sauvage", en: "Wild-type phenotype" },
  "sev.mod":               { fr: "À surveiller", en: "Worth watching" },
  "sev.high":              { fr: "Préoccupant", en: "Concerning" },
  "sev.crit":              { fr: "Critique", en: "Critical" },

  /* ---------- compte rendu ---------- */
  "cr.titre":              { fr: "Compte rendu", en: "Report" },
  "cr.phenotype":          { fr: "Phénotype", en: "Phenotype" },
  "cr.mecanisme":          { fr: "Hypothèse mécanistique", en: "Mechanistic hypothesis" },
  "cr.regles":             { fr: "Règles appliquées", en: "Rules applied" },
  "cr.alertes":            { fr: "Alertes", en: "Alerts" },
  "cr.commentaire":        { fr: "Commentaire du compte rendu", en: "Report commentary" },
  "cr.antibiotiques":      { fr: "Antibiotiques", en: "Antimicrobial agents" },
  "cr.rendue":             { fr: "Catégorie rendue", en: "Category reported" },
  "cr.lue":                { fr: "Catégorie lue", en: "Category read" },
  "cr.motif":              { fr: "Motif", en: "Reason" },
  "cr.posologie":          { fr: "Posologie qui fonde le seuil", en: "Dosage underpinning the breakpoint" },
  "cr.source":             { fr: "Référentiel employé", en: "Breakpoint table used" },
  "cr.pourquoi":           { fr: "Pourquoi cette interprétation ?", en: "Why this interpretation?" },
  "cr.copier":             { fr: "Copier le raisonnement", en: "Copy the reasoning" },

  /* ---------- actions ---------- */
  "act.exporter.csv":      { fr: "Exporter (CSV)", en: "Export (CSV)" },
  "act.imprimer":          { fr: "Imprimer (PDF)", en: "Print (PDF)" },
  "act.verser":            { fr: "Verser cet isolat", en: "Add this isolate" },
  "act.activer":           { fr: "Activer", en: "Activate" },
  "act.recharger":         { fr: "Recharger", en: "Reload" },

  /* ---------- avertissement ---------- */
  "avert.titre":           { fr: "Avertissement", en: "Warning" },
  "avert.chapeau":         { fr: "Outil d'aide et de formation — pas un dispositif médical de diagnostic in vitro.",
                             en: "A decision-support and training tool — not an in vitro diagnostic medical device." },
  "avert.corps":           { fr: "PhénoBac propose une interprétation d'orientation fondée sur les phénotypes usuels, à partir de résultats que vous avez déjà lus. La validation biologique, les tests de confirmation et le référentiel en vigueur restent entièrement de la responsabilité du biologiste.",
                             en: "PhénoBac offers an indicative interpretation based on the usual phenotypes, from results you have already read. Biological validation, confirmatory testing and the breakpoint table in force remain entirely the responsibility of the microbiologist." },
  "avert.masquer":         { fr: "Ne plus afficher à l'ouverture", en: "Do not show on opening" },

  /* ---------- mise à jour ---------- */
  "maj.titre":             { fr: "Nouvelle version disponible", en: "A new version is available" },
  "maj.corps":             { fr: "Elle peut contenir des seuils corrigés.",
                             en: "It may contain corrected breakpoints." },

  /* ---------- gratuité ---------- */
  "gratuit.bandeau":       { fr: "Gratuit, sans compte, sans licence",
                             en: "Free, no account, no licence" },
  "gratuit.accroche":      { fr: "Le raisonnement expert, à portée de paillasse.",
                             en: "Expert reasoning, within reach of the bench." },

  /* ---------- présentation ---------- */
  "intro.apropos":         { fr: "À propos de PhénoBac", en: "About PhénoBac" },
  "intro.seuils":          { fr: "Seuils", en: "Breakpoints" }
};

const DEFAUT = "fr";
let _langue = DEFAUT;

function disponibles() { return ["fr", "en"]; }

/* La langue est choisie, dans cet ordre : l'adresse (?lang=), le choix
   mémorisé, la langue du navigateur, le français. L'adresse d'abord, parce
   qu'un lien partagé doit s'ouvrir dans la langue de celui qui l'a envoyé. */
function resoudre(adresse, memoire, navigateur) {
  const q = /[?&]lang=([a-z]{2})/.exec(String(adresse || ""));
  const candidats = [q && q[1], memoire, String(navigateur || "").slice(0, 2)];
  for (const c of candidats) {
    if (c && disponibles().indexOf(c) !== -1) return c;
  }
  return DEFAUT;
}

function fixer(l) {
  _langue = disponibles().indexOf(l) !== -1 ? l : DEFAUT;
  return _langue;
}
function courante() { return _langue; }
function estAnglais() { return _langue === "en"; }

/* UNE CLÉ INCONNUE DOIT SE VOIR, PAS DISPARAÎTRE.
   Rendre la chaîne vide ferait un trou dans l'interface, et un trou ne se
   signale pas : on le prend pour un espace. Rendre la clé entre crochets la
   rend immédiatement reconnaissable, en développement comme en production. */
function L(cle) {
  const e = C[cle];
  if (!e) return "⟦" + cle + "⟧";
  return e[_langue] || e[DEFAUT] || ("⟦" + cle + "⟧");
}

/* La catégorie I ne s'écrit pas pareil selon le référentiel : c'est une
   différence de fond entre les deux comités, pas une variante de style. */
function categorie(cat, casfm) {
  if (cat === "S") return L("cat.S.court");
  if (cat === "R") return L("cat.R");
  if (cat === "I") return L(casfm ? "cat.I.casfm" : "cat.I.eucast");
  return L("cat.nonteste");
}

const API = { L, categorie, fixer, courante, estAnglais, resoudre,
              disponibles, CATALOGUE: C, DEFAUT };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else racine.PhenoBacLangue = API;

})(typeof self !== "undefined" ? self : this);
