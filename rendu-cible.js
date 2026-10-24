/* rendu-cible.js — engendré par outils/extraire-rendu-cible.py.
   NE PAS ÉDITER À LA MAIN.

   Source : HAS, « Antibiogrammes ciblés pour les infections urinaires à
   Entérobactéries dans la population féminine adulte (à partir de 12 ans) »,
   validée par le Collège le 5 octobre 2023. Tableaux de la SFM et de la
   SPILF, labellisés par la HAS.

   « rendre » liste les colonnes où la case est ORANGE, c'est-à-dire où la
   molécule figure sur l'antibiogramme ciblé. Partout ailleurs elle n'est pas
   rendue — SAUF si la souche y est résistante, règle que le document pose
   explicitement et qui ne souffre aucune exception.

   PÉRIMÈTRE, et il est étroit : ECBU à entérobactéries, femme adulte à
   partir de 12 ans. Hors de là, ces tableaux ne sont pas validés. */
(function (racine) {
"use strict";
var RENDU_CIBLE = {
  sansRenseignement: {
    titre: "ECBU positif, sans renseignement clinique",
    colonnes: ["amoxS", "amoxR", "amcEtSxtR", "c3gRouBlse"],
    lignes: [
      { molecule: "Amoxicilline", codes: ["AMX"], variante: null, rendre: ["amoxS", "amoxR", "amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Pivmécillinam", codes: ["MEC"], variante: null, rendre: ["amoxS", "amoxR", "amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Fosfomycine-trométamol", codes: ["FOS"], variante: null, rendre: ["amoxS", "amoxR", "amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Nitrofurantoïne", codes: ["NIT"], variante: null, rendre: ["amoxS", "amoxR", "amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Triméthoprime", codes: ["TMP"], variante: null, rendre: ["amoxS", "amoxR", "amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Triméthoprime-sulfaméthoxazole", codes: ["SXT"], variante: null, rendre: ["amoxS", "amoxR", "amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Amoxicilline-acide clavulanique", codes: ["AMC"], variante: null, rendre: ["amoxR", "amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Céfixime", codes: ["CFM"], variante: null, rendre: ["amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Céfotaxime, ceftriaxone", codes: ["CTX", "CRO"], variante: null, rendre: ["amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Fluoroquinolones (ofloxacine, cipro-", codes: ["CIP", "OFX", "LVX"], variante: null, rendre: ["amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Témocilline", codes: ["TEM"], variante: null, rendre: ["c3gRouBlse"] },
      { molecule: "Céfoxitine", codes: ["FOX"], variante: null, rendre: ["c3gRouBlse"] },
      { molecule: "Pipéracilline-tazobactam HAS • Antibiogrammes ciblés pour les infections urinaires à Entérobactéries dans la population féminine adulte (à partir de 12 ans). • oc-tobre 2023 11", codes: ["TZP"], variante: null, rendre: ["c3gRouBlse"] },
      { molecule: "Ceftazidime", codes: ["CAZ"], variante: null, rendre: ["c3gRouBlse"] },
      { molecule: "Céfépime", codes: ["FEP"], variante: null, rendre: ["c3gRouBlse"] },
      { molecule: "Aztréonam", codes: ["ATM"], variante: null, rendre: ["c3gRouBlse"] },
      { molecule: "Amikacine, gentamicine", codes: ["AMK", "GEN"], variante: null, rendre: ["c3gRouBlse"] },
      { molecule: "Carbapénèmes (imipénème, ertapé-nème, méropénème)", codes: ["ETP", "IPM", "MEM"], variante: null, rendre: ["c3gRouBlse"] },
      { molecule: "Autres molécules (ex. nouvelles associa-tions avec inhibiteurs)", codes: [], variante: null, rendre: ["c3gRouBlse"] },
    ]
  },
  cystite: {
    titre: "ECBU positif, cystite",
    colonnes: ["premiereIntentionS", "premiereIntentionR", "premiereEtAmcEtCfmR"],
    lignes: [
      { molecule: "Amoxicilline", codes: ["AMX"], variante: null, rendre: ["premiereIntentionS", "premiereIntentionR", "premiereEtAmcEtCfmR"] },
      { molecule: "Pivmécillinam", codes: ["MEC"], variante: null, rendre: ["premiereIntentionS", "premiereIntentionR", "premiereEtAmcEtCfmR"] },
      { molecule: "Fosfomycine-trométamol", codes: ["FOS"], variante: null, rendre: ["premiereIntentionS", "premiereIntentionR", "premiereEtAmcEtCfmR"] },
      { molecule: "Nitrofurantoïne", codes: ["NIT"], variante: null, rendre: ["premiereIntentionS", "premiereIntentionR", "premiereEtAmcEtCfmR"] },
      { molecule: "Triméthoprime", codes: ["TMP"], variante: null, rendre: ["premiereIntentionS", "premiereIntentionR", "premiereEtAmcEtCfmR"] },
      { molecule: "Triméthoprime-sulfamé-", codes: ["SXT"], variante: null, rendre: ["premiereIntentionS", "premiereIntentionR", "premiereEtAmcEtCfmR"] },
      { molecule: "Amoxicilline-acide clavula-", codes: ["AMC"], variante: null, rendre: ["premiereIntentionR", "premiereEtAmcEtCfmR"] },
      { molecule: "Céfixime", codes: ["CFM"], variante: null, rendre: ["premiereIntentionR", "premiereEtAmcEtCfmR"] },
      { molecule: "Céfotaxime, ceftriaxone", codes: ["CTX", "CRO"], variante: null, rendre: ["premiereEtAmcEtCfmR"] },
      { molecule: "Fluoroquinolones (ofloxacine, cipro-floxacine, lévofloxacine)", codes: ["CIP", "OFX", "LVX"], variante: null, rendre: ["premiereEtAmcEtCfmR"] },
      { molecule: "Témocilline", codes: ["TEM"], variante: null, rendre: ["premiereEtAmcEtCfmR"] },
      { molecule: "Céfoxitine", codes: ["FOX"], variante: null, rendre: ["premiereEtAmcEtCfmR"] },
      { molecule: "Pipéracilline-tazobactam", codes: ["TZP"], variante: null, rendre: ["premiereEtAmcEtCfmR"] },
      { molecule: "Ceftazidime", codes: ["CAZ"], variante: null, rendre: ["premiereEtAmcEtCfmR"] },
      { molecule: "Céfépime", codes: ["FEP"], variante: null, rendre: ["premiereEtAmcEtCfmR"] },
      { molecule: "Aztréonam HAS • Antibiogrammes ciblés pour les infections urinaires à Entérobactéries dans la population féminine adulte (à partir de 12 ans). • oc-tobre 2023 13", codes: ["ATM"], variante: null, rendre: ["premiereEtAmcEtCfmR"] },
      { molecule: "Amikacine, gentamicine", codes: ["AMK", "GEN"], variante: null, rendre: ["premiereEtAmcEtCfmR"] },
      { molecule: "Carbapénèmes (imipé-nème, ertapénème, méro-pénème)", codes: ["ETP", "IPM", "MEM"], variante: null, rendre: ["premiereEtAmcEtCfmR"] },
      { molecule: "Autres molécules (ex. nou-velles associations avec inhibiteurs)", codes: [], variante: null, rendre: ["premiereEtAmcEtCfmR"] },
    ]
  },
  pyelonephrite: {
    titre: "ECBU positif, pyélonéphrite",
    colonnes: ["amoxS", "amoxR", "amcEtSxtR", "c3gRouBlse"],
    lignes: [
      { molecule: "Amoxicilline", codes: ["AMX"], variante: null, rendre: ["amoxS", "amoxR", "amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Triméthoprime-sulfaméthoxazole", codes: ["SXT"], variante: null, rendre: ["amoxS", "amoxR", "amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Amoxicilline-acide clavulanique ( pyé-", codes: ["AMC"], variante: null, rendre: ["amoxR", "amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Céfixime", codes: ["CFM"], variante: null, rendre: ["amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Céfotaxime et ceftriaxone", codes: ["CTX", "CRO"], variante: null, rendre: ["amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Fluoroquinolones (ofloxacine, cipro-", codes: ["CIP", "OFX", "LVX"], variante: null, rendre: ["amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Témocilline", codes: ["TEM"], variante: null, rendre: ["c3gRouBlse"] },
      { molecule: "Céfoxitine", codes: ["FOX"], variante: null, rendre: ["c3gRouBlse"] },
      { molecule: "Pipéracilline-tazobactam", codes: ["TZP"], variante: null, rendre: ["c3gRouBlse"] },
      { molecule: "Ceftazidime", codes: ["CAZ"], variante: null, rendre: ["c3gRouBlse"] },
      { molecule: "Céfépime", codes: ["FEP"], variante: null, rendre: ["c3gRouBlse"] },
      { molecule: "Aztréonam", codes: ["ATM"], variante: null, rendre: ["c3gRouBlse"] },
      { molecule: "Amikacine gentamicine", codes: ["AMK", "GEN"], variante: null, rendre: ["c3gRouBlse"] },
      { molecule: "Carbapénèmes ( imipénème, ertapé-nème, méropénème)", codes: ["ETP", "IPM", "MEM"], variante: null, rendre: ["c3gRouBlse"] },
      { molecule: "Autres molécules (ex. nouvelles as-sociations avec inhibiteurs)", codes: [], variante: null, rendre: ["c3gRouBlse"] },
    ]
  },
};
var RENDU_CIBLE_SOURCE = "HAS 2023-10-05 — antibiogrammes ciblés, ECBU à entérobactéries, femme adulte ≥ 12 ans";
var R = { RENDU_CIBLE: RENDU_CIBLE, RENDU_CIBLE_SOURCE: RENDU_CIBLE_SOURCE };
if (typeof module !== "undefined" && module.exports) module.exports = R;
else racine.PhenoBacRenduCible = R;
})(typeof self !== "undefined" ? self : this);
