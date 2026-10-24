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

   LES COULEURS NE DISENT PAS TOUT. Sous chaque tableau, les notes (A) (B)
   (C) retirent des molécules que la case avait rendues, et le § 2.1.3 en
   pose sept règles de plus. « notes » dit quels appels de note portent la
   ligne ; RENDU_CIBLE_NOTES et RENDU_CIBLE_RESTRICTIONS en donnent le texte.

   PÉRIMÈTRE, et il est étroit : ECBU à entérobactéries, femme adulte à
   partir de 12 ans. Hors de là, ces tableaux ne sont pas validés. */
(function (racine) {
"use strict";
var RENDU_CIBLE = {
  sansRenseignement: {
    titre: "ECBU positif, sans renseignement clinique",
    colonnes: ["amoxS", "amoxR", "amcEtSxtR", "c3gRouBlse"],
    lignes: [
      { molecule: "Amoxicilline", codes: ["AMX"], variante: null, notes: [], rendre: ["amoxS", "amoxR", "amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Pivmécillinam", codes: ["MEC"], variante: null, notes: [], rendre: ["amoxS", "amoxR", "amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Fosfomycine-trométamol", codes: ["FOS"], variante: null, notes: [], rendre: ["amoxS", "amoxR", "amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Nitrofurantoïne", codes: ["NIT"], variante: null, notes: [], rendre: ["amoxS", "amoxR", "amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Triméthoprime", codes: ["TMP"], variante: null, notes: [], rendre: ["amoxS", "amoxR", "amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Triméthoprime-sulfaméthoxazole", codes: ["SXT"], variante: null, notes: [], rendre: ["amoxS", "amoxR", "amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Amoxicilline-acide clavulanique", codes: ["AMC"], variante: null, notes: [], rendre: ["amoxR", "amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Céfixime", codes: ["CFM"], variante: null, notes: ["A"], rendre: ["amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Céfotaxime, ceftriaxone", codes: ["CTX", "CRO"], variante: null, notes: ["A"], rendre: ["amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Fluoroquinolones (ofloxacine, cipro-", codes: ["CIP", "OFX", "LVX"], variante: null, notes: [], rendre: ["amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Témocilline", codes: ["TEM"], variante: null, notes: [], rendre: ["c3gRouBlse"] },
      { molecule: "Céfoxitine", codes: ["FOX"], variante: null, notes: [], rendre: ["c3gRouBlse"] },
      { molecule: "Pipéracilline-tazobactam HAS • Antibiogrammes ciblés pour les infections urinaires à Entérobactéries dans la population féminine adulte (à partir de 12 ans). • oc-tobre 2023 11", codes: ["TZP"], variante: null, notes: [], rendre: ["c3gRouBlse"] },
      { molecule: "Ceftazidime", codes: ["CAZ"], variante: null, notes: [], rendre: ["c3gRouBlse"] },
      { molecule: "Céfépime", codes: ["FEP"], variante: null, notes: ["A"], rendre: ["c3gRouBlse"] },
      { molecule: "Aztréonam", codes: ["ATM"], variante: null, notes: [], rendre: ["c3gRouBlse"] },
      { molecule: "Amikacine, gentamicine", codes: ["AMK", "GEN"], variante: null, notes: [], rendre: ["c3gRouBlse"] },
      { molecule: "Carbapénèmes (imipénème, ertapé-nème, méropénème)", codes: ["ETP", "IPM", "MEM"], variante: null, notes: ["B"], rendre: ["c3gRouBlse"] },
      { molecule: "Autres molécules (ex. nouvelles associa-tions avec inhibiteurs)", codes: [], variante: null, notes: ["C"], rendre: ["c3gRouBlse"] },
    ]
  },
  cystite: {
    titre: "ECBU positif, cystite",
    colonnes: ["premiereIntentionS", "premiereIntentionR", "premiereEtAmcEtCfmR"],
    lignes: [
      { molecule: "Amoxicilline", codes: ["AMX"], variante: null, notes: [], rendre: ["premiereIntentionS", "premiereIntentionR", "premiereEtAmcEtCfmR"] },
      { molecule: "Pivmécillinam", codes: ["MEC"], variante: null, notes: [], rendre: ["premiereIntentionS", "premiereIntentionR", "premiereEtAmcEtCfmR"] },
      { molecule: "Fosfomycine-trométamol", codes: ["FOS"], variante: null, notes: [], rendre: ["premiereIntentionS", "premiereIntentionR", "premiereEtAmcEtCfmR"] },
      { molecule: "Nitrofurantoïne", codes: ["NIT"], variante: null, notes: [], rendre: ["premiereIntentionS", "premiereIntentionR", "premiereEtAmcEtCfmR"] },
      { molecule: "Triméthoprime", codes: ["TMP"], variante: null, notes: [], rendre: ["premiereIntentionS", "premiereIntentionR", "premiereEtAmcEtCfmR"] },
      { molecule: "Triméthoprime-sulfamé-", codes: ["SXT"], variante: null, notes: [], rendre: ["premiereIntentionS", "premiereIntentionR", "premiereEtAmcEtCfmR"] },
      { molecule: "Amoxicilline-acide clavula-", codes: ["AMC"], variante: null, notes: [], rendre: ["premiereIntentionR", "premiereEtAmcEtCfmR"] },
      { molecule: "Céfixime", codes: ["CFM"], variante: null, notes: ["A"], rendre: ["premiereIntentionR", "premiereEtAmcEtCfmR"] },
      { molecule: "Céfotaxime, ceftriaxone", codes: ["CTX", "CRO"], variante: null, notes: [], rendre: ["premiereEtAmcEtCfmR"] },
      { molecule: "Fluoroquinolones (ofloxacine, cipro-floxacine, lévofloxacine)", codes: ["CIP", "OFX", "LVX"], variante: null, notes: [], rendre: ["premiereEtAmcEtCfmR"] },
      { molecule: "Témocilline", codes: ["TEM"], variante: null, notes: [], rendre: ["premiereEtAmcEtCfmR"] },
      { molecule: "Céfoxitine", codes: ["FOX"], variante: null, notes: [], rendre: ["premiereEtAmcEtCfmR"] },
      { molecule: "Pipéracilline-tazobactam", codes: ["TZP"], variante: null, notes: [], rendre: ["premiereEtAmcEtCfmR"] },
      { molecule: "Ceftazidime", codes: ["CAZ"], variante: null, notes: [], rendre: ["premiereEtAmcEtCfmR"] },
      { molecule: "Céfépime", codes: ["FEP"], variante: null, notes: [], rendre: ["premiereEtAmcEtCfmR"] },
      { molecule: "Aztréonam HAS • Antibiogrammes ciblés pour les infections urinaires à Entérobactéries dans la population féminine adulte (à partir de 12 ans). • oc-tobre 2023 13", codes: ["ATM"], variante: null, notes: [], rendre: ["premiereEtAmcEtCfmR"] },
      { molecule: "Amikacine, gentamicine", codes: ["AMK", "GEN"], variante: null, notes: [], rendre: ["premiereEtAmcEtCfmR"] },
      { molecule: "Carbapénèmes (imipé-nème, ertapénème, méro-pénème)", codes: ["ETP", "IPM", "MEM"], variante: null, notes: ["B"], rendre: ["premiereEtAmcEtCfmR"] },
      { molecule: "Autres molécules (ex. nou-velles associations avec inhibiteurs)", codes: [], variante: null, notes: ["C"], rendre: ["premiereEtAmcEtCfmR"] },
    ]
  },
  pyelonephrite: {
    titre: "ECBU positif, pyélonéphrite",
    colonnes: ["amoxS", "amoxR", "amcEtSxtR", "c3gRouBlse"],
    lignes: [
      { molecule: "Amoxicilline", codes: ["AMX"], variante: null, notes: [], rendre: ["amoxS", "amoxR", "amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Triméthoprime-sulfaméthoxazole", codes: ["SXT"], variante: null, notes: [], rendre: ["amoxS", "amoxR", "amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Amoxicilline-acide clavulanique ( pyé-", codes: ["AMC"], variante: null, notes: [], rendre: ["amoxR", "amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Céfixime", codes: ["CFM"], variante: null, notes: ["A"], rendre: ["amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Céfotaxime et ceftriaxone", codes: ["CTX", "CRO"], variante: null, notes: ["A"], rendre: ["amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Fluoroquinolones (ofloxacine, cipro-", codes: ["CIP", "OFX", "LVX"], variante: null, notes: [], rendre: ["amcEtSxtR", "c3gRouBlse"] },
      { molecule: "Témocilline", codes: ["TEM"], variante: null, notes: [], rendre: ["c3gRouBlse"] },
      { molecule: "Céfoxitine", codes: ["FOX"], variante: null, notes: [], rendre: ["c3gRouBlse"] },
      { molecule: "Pipéracilline-tazobactam", codes: ["TZP"], variante: null, notes: [], rendre: ["c3gRouBlse"] },
      { molecule: "Ceftazidime", codes: ["CAZ"], variante: null, notes: [], rendre: ["c3gRouBlse"] },
      { molecule: "Céfépime", codes: ["FEP"], variante: null, notes: ["A"], rendre: ["c3gRouBlse"] },
      { molecule: "Aztréonam", codes: ["ATM"], variante: null, notes: [], rendre: ["c3gRouBlse"] },
      { molecule: "Amikacine gentamicine", codes: ["AMK", "GEN"], variante: null, notes: [], rendre: ["c3gRouBlse"] },
      { molecule: "Carbapénèmes ( imipénème, ertapé-nème, méropénème)", codes: ["ETP", "IPM", "MEM"], variante: null, notes: ["B"], rendre: ["c3gRouBlse"] },
      { molecule: "Autres molécules (ex. nouvelles as-sociations avec inhibiteurs)", codes: [], variante: null, notes: ["C"], rendre: ["c3gRouBlse"] },
    ]
  },
};
/* Les notes sous chaque tableau, mot pour mot. */
var RENDU_CIBLE_NOTES = {
  sansRenseignement: {
    A: "Pour les Enterobacterales du groupe 3 (Enterobacter cloacae complex, Klebsiella aerogenes, Citrobacter freundii complex, Serratia marcescens, Morganella morganii, Providencia spp., Pantoea agglomerans, Hafnia spp.), privilégier le rendu du céfépime plutôt que le rendu des céphalosporines de 3e génération (céfixime, céfotaxime et ceftriaxone).",
    B: "En cas de sensibilité aux carbapénèmes, ces molécules (imipénème, méropénème, et ertapénème) sont à rendre uniquement : ‒ si aucune des autres β-lactamines de spectre plus étroit suivantes n’est catégorisée « sensible » ou « sensible à forte posologie » : amoxicilline-acide clavulanique, céphalosporines, témocilline, pipéracilline-tazobactam, aztréonam, ‒ sur demande du clinicien.",
    C: "Les nouvelles associations avec inhibiteurs (ceftolozane-tazobactam, ceftazidime-avibactam, imipénème-relebactam, méropénème-vaborbactam…) ou les nouvelles céphalosporines (comme le céfidérocol) doivent être rendues uniquement sur demande du clinicien, après avis spécialisé. Pour rappel, ces molécules ne doivent pas être utilisées en épargne des carbapénèmes.",
  },
  cystite: {
    A: "Pour les Enterobacterales du groupe 3 (Enterobacter cloacae complex, Klebsiella aerogenes, Citrobacter freundii complex, Serratia marcescens, Morganella morganii, Providencia spp., Pantoea agglomerans, Hafnia spp.), ne pas rendre le résultat du céfixime en cas de résistance aux molécules de première intention.",
    B: "En cas de sensibilité aux carbapénèmes, ces molécules (imipénème, méropénème, et ertapénème) sont à rendre uniquement sur demande du clinicien.",
    C: "Les nouvelles associations avec inhibiteurs (ceftolozane-tazobactam, ceftazidime-avibactam, imipénème-relebactam, méropénème-vaborbactam…) ou les nouvelles céphalosporines (comme le céfidérocol) doivent être rendues uniquement sur demande du clinicien, après avis spécialisé. Pour rappel, ces molécules ne doivent pas être utilisées en épargne des carbapénèmes.",
  },
  pyelonephrite: {
    A: "Pour les Enterobacterales du groupe 3 (Enterobacter cloacae complex, Klebsiella aerogenes, Citrobacter freundii complex, Serratia marcescens, Morganella morganii, Providencia spp., Pantoea agglomerans, Hafnia spp.), privilégier le rendu du céfépime plutôt que le rendu des céphalosporines de 3e génération (céfixime, céfotaxime et ceftriaxone).",
    B: "En cas de sensibilité aux carbapénèmes, ces molécules (imipénème, méropénème, et ertapénème) sont à rendre uniquement i) si aucune des autres β-lactamines de spectre plus étroit suivantes n’est catégorisée « sensible » ou « sensible à forte posologie » : amoxicilline-acide clavulanique, céphalosporines, témocilline, pipéracilline-tazobactam, aztréonam, ii) ou sur demande du clinicien.",
    C: "Les nouvelles associations avec inhibiteurs (ceftolozane-tazobactam, ceftazidime-avibactam, imipénème-relebactam, méropénème-vaborbactam…) ou les nouvelles céphalosporines (comme le céfidérocol) doivent être rendues uniquement sur demande du clinicien, après avis spécialisé. Pour rappel, ces molécules ne doivent pas être utilisées en épargne des carbapénèmes.",
  },
};
/* Le § 2.1.3 — « Quelles sont les molécules qui ne doivent pas figurer de
   façon systématique sur le rendu de l'antibiogramme ciblé ? » */
var RENDU_CIBLE_RESTRICTIONS = [
  { regle: "Pour un ECBU avec des renseignements cliniques précisant qu’il s’agit d’une pyélonéphrite, il n’est pas recommandé de rendre les antibiotiques indiqués pour le traitement des cystites seules (mécillinam, nitrofurantoïne, fosfomycine et triméthoprime), car leur diffusion tissulaire rénale est insuffisante pour recommander leur utilisation en cas de pyélonéphrite.",
    motif: null },
  { regle: "Quelle que soit la situation clinique (cystite ou pyélonéphrite), il est recommandé de ne pas rendre les fluoroquinolones pour les souches résistantes à l’amoxicilline, mais sensibles à l’association amoxicilline-acide clavulanique, et/ou lorsque d’autres antibiotiques per os sont actifs.",
    motif: "Pour cette situation, le choix de ne pas positionner les fluoroquinolones est en lien avec les recommandations des autorités de surveillance du médicament (EMA et ANSM) 3. Le choix de rendre le résultat du triméthoprime-sulfaméthoxazole, même pour les souches sensibles à l’amoxicilline, permet au clinicien de disposer directement d’une alternative en cas Pour les souches résistantes à l’amoxicilline, les choix proposés ci-dessus sont en accord avec les recommandations actuelles : o la recommandation actuelle de la SPILF4 précise que le choix de l’ antibiothérapie de relais des pyélonéphrites aiguës doit se discuter entre l’amoxicilline-acide clavulanique, les fluoroquinolones, le céfixime ou le triméthoprime-sulfaméthoxazole, o pour ce traitement de relais, la fiche mémo de la HAS « Pyélonéphrite aiguë de la femme »5 recommande fortement d’effectuer une désescalade avec l’antibiotique de spectre le plus étroit possible et introduit un ordre de préférence en recommandant le triméthoprime-sulfaméthoxazole, puis l’amoxicilline-acide clavulanique, puis les fluoroquinolones." },
  { regle: "En l’absence de BLSE ou de résistance aux céphalosporines de 3e génération (C3G) et si l’antibiogramme concerne une Enterobacterales du groupe 3 (Enterobacter cloacae complex, Klebsiella aerogenes, Citrobacter freundii complex, Serratia marcescens, Morganella morganii, Providencia spp., Pantoea agglomerans, Hafnia spp.), il est recommandé de privilégier le rendu du céfépime plutôt que celui des céphalosporines de 3e génération (céfixime, céfotaxime et ceftriaxone) pour les listes qui en prévoient le rendu.",
    motif: null },
  { regle: "Pour un ECBU avec des renseignements cliniques précisant qu’il s’agit d’une cystite, si l’antibiogramme concerne une Enterobacterales du groupe 3 résistante aux molécules de première intention sans résistance associée au céfixime, il est recommandé de ne pas rendre le céfixime.",
    motif: null },
  { regle: "Il est recommandé de rendre les carbapénèmes uniquement si aucune β-lactamines de spectre plus étroit (amoxicilline-acide clavulanique, céphalosporines, témocilline, pipéracilline-tazobactam, aztréonam) n’est catégorisée « sensible » ou « sensible à forte posologie », ou sur demande du clinicien.",
    motif: null },
  { regle: "En cas de cystite, il est recommandé de rendre les carbapénèmes uniquement sur demande du clinicien.",
    motif: null },
  { regle: "Il est recommandé de rendre les nouvelles associations d’antibiotiques avec inhibiteurs (ceftolozane-tazobactam, ceftazidime-avibactam, imipénème-relebactam, méropénème-vaborbactam…) ou les nouvelles céphalosporines (comme le céfidérocol) uniquement sur demande du clinicien, après avis spécialisé ; en effet, ces molécules ne doivent pas être utilisées en épargne des carbapénèmes.",
    motif: null },
];
/* Les listes que les notes citent elles-mêmes. Aucune n'est écrite ici à
   la main : une liste recopiée peut diverger du texte qu'elle applique. */
var RENDU_CIBLE_LISTES = {
  betalactaminesEtroites: ["amoxicilline-acide clavulanique", "céphalosporines", "témocilline", "pipéracilline-tazobactam", "aztréonam"],
  c3g: ["céfixime", "céfotaxime", "ceftriaxone"],
  carbapenemes: ["imipénème", "méropénème", "ertapénème"],
  groupe3: ["Enterobacter cloacae complex", "Klebsiella aerogenes", "Citrobacter freundii complex", "Serratia marcescens", "Morganella morganii", "Providencia spp", "Pantoea agglomerans", "Hafnia spp"],
  nouvelles: ["ceftolozane-tazobactam", "ceftazidime-avibactam", "imipénème-relebactam", "méropénème-vaborbactam", "céfidérocol"],
};
var RENDU_CIBLE_SOURCE = "HAS 2023-10-05 — antibiogrammes ciblés, ECBU à entérobactéries, femme adulte ≥ 12 ans";
var R = { RENDU_CIBLE: RENDU_CIBLE, RENDU_CIBLE_SOURCE: RENDU_CIBLE_SOURCE,
          RENDU_CIBLE_NOTES: RENDU_CIBLE_NOTES,
          RENDU_CIBLE_RESTRICTIONS: RENDU_CIBLE_RESTRICTIONS,
          RENDU_CIBLE_LISTES: RENDU_CIBLE_LISTES };
if (typeof module !== "undefined" && module.exports) module.exports = R;
else racine.PhenoBacRenduCible = R;
})(typeof self !== "undefined" ? self : this);
