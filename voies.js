/* voies.js — engendré par outils/extraire-voies.py. NE PAS ÉDITER À LA MAIN.
   Source : CA-SFM, recommandations 2026, tableaux complets.

   LES SEUILS QUI DÉPENDENT DE LA VOIE D'ADMINISTRATION.

   PhénoBac les MONTRE, elle ne catégorise pas avec : la table BP ne connaît
   que le site, et lui ajouter la voie ferait catégoriser sur une donnée qu'un
   compte rendu d'antibiogramme ne porte pas toujours. Le biologiste lit les
   deux seuils et retient celui qui s'applique.

   « S: null » veut dire AUCUNE catégorie « sensible » par cette voie — une
   décision du comité, pas une valeur manquante. */
(function (racine) {
"use strict";
var VOIES_SOURCE = "CA-SFM 2026 V1.0, tableaux complets";
var VOIES = {
  "haemo:AMC:standard": {
    iv: { S: 2, R: 2, page: 105 },
    orale: { S: null, R: 2, page: 105 },
  },
  "haemo:AMX:standard": {
    iv: { S: 2, R: 2, page: 105 },
    orale: { S: null, R: 2, page: 105 },
  },
  "strepacg:AMX:standard": {
    iv: { S: 1, R: 2, page: 85 },
    orale: { S: 0.5, R: 1, page: 85 },
  },
  "strepb:AMX:standard": {
    iv: { S: 1, R: 2, page: 85 },
    orale: { S: 0.5, R: 1, page: 85 },
  },
  "viridans:AMX:standard": {
    iv: { S: 1, R: 2, page: 85 },
    orale: { S: 0.5, R: 1, page: 85 },
  },
};

var API = { VOIES: VOIES, VOIES_SOURCE: VOIES_SOURCE };
if (typeof module !== "undefined" && module.exports) module.exports = API;
else racine.PhenoBacVoies = API;

})(typeof self !== "undefined" ? self : this);
