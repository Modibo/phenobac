// moteur.js — le raisonnement phénotypique de PhénoBac.
//
// CE FICHIER EST CHARGÉ DES DEUX CÔTÉS : par le navigateur, qui interprète
// l'antibiogramme sur le poste même, et par la fonction serveur, qui expose
// le même calcul en API. Un seul exemplaire du raisonnement, donc aucune
// possibilité que les deux divergent.
//
// POURQUOI IL A QUITTÉ LE SERVEUR
//
// Le moteur y était tenu par un « verrou dur » : hors du navigateur, on ne
// pouvait pas l'extraire sans licence. C'était cohérent tant que PhénoBac
// était un produit payant. Il ne l'est plus — gratuit, sans compte, sans
// licence — et le verrou ne protégeait donc plus rien. Il continuait en
// revanche de coûter ce que l'application cherche précisément à servir : un
// laboratoire sans connexion stable ne pouvait pas interpréter son
// antibiogramme. Le moteur est désormais là où le travail se fait.
//
// CE QU'IL NE CONTIENT PAS
//
// Ni vérification de licence, ni accès réseau, ni secret, ni écriture. Il
// prend un antibiogramme et rend une interprétation ; il ne sait rien faire
// d'autre, et c'est ce qui permet de le charger partout sans précaution.
//
// Il reste PUR et SANS ÉTAT DURABLE : les quelques variables de module
// (_ref, _zit, _activeOrg…) sont remises à zéro au début de chaque appel à
// runInterpretation, qui est synchrone — rien ne peut s'intercaler entre
// cette remise à zéro et la fin du calcul.

/* Tout ce qui suit est ENFERMÉ dans cette fonction.

   Sans elle, chaque déclaration de ce fichier atterrirait dans la portée
   globale de la page, où elle entrerait en collision avec celles du script
   de l'interface : deux « const has » au même niveau suffisent à faire
   échouer la page ENTIÈRE, pas seulement la ligne fautive.

   Le corps n'est volontairement pas réindenté : décaler 1 800 lignes
   rendrait illisible le moindre écart ultérieur avec l'historique, pour un
   gain purement cosmétique. */
(function (racine) {
"use strict";

/* Référentiels servis par le moteur. Le CA-SFM n'est pas un second jeu
   complet de seuils : c'est l'EUCAST assorti des différences françaises que
   son comité publie et justifie (« Différences principales entre le CA-SFM
   et l'EUCAST », version CA-SFM 2026). Voir REFERENTIEL-CASFM.md. */
const REFERENTIELS = {
  eucast: { cle: "eucast", nom: "EUCAST", version: "16.1", publie: "2026-06-24", etat: "aligne" },
  casfm:  { cle: "casfm",  nom: "CA-SFM", version: "2026", publie: "2026-09-01", etat: "delta", base: "eucast" }
};
const REFERENTIEL = REFERENTIELS.eucast;   // défaut, conservé pour compatibilité

const isR = v => v === "R";
const isRI = v => v === "R" || v === "I";
const has = (r, k) => r[k] !== undefined && r[k] !== null && r[k] !== "";

// noms utilisés dans les messages d'incohérence (résistances naturelles)
const ABXNAME = {
  AMX: "Amoxicilline", AMP: "Ampicilline", AMC: "Amoxicilline + ac. clavulanique",
  // Molécules de l'antibiogramme ciblé urinaire. Elles manquaient ici alors
  // qu'elles existaient dans la page : tout ce qui passe par ABXNAME les
  // désignait par leur sigle. Le garde-fou 5 du rendu ciblé — « une molécule
  // nommée par une alerte n'est jamais masquée » — les cherche par leur NOM
  // dans le texte de l'alerte : absentes d'ici, elles n'étaient pas protégées.
  MEC: "Pivmécillinam", NIT: "Nitrofurantoïne", TMP: "Triméthoprime",
  CFM: "Céfixime", CRO: "Ceftriaxone", OFX: "Ofloxacine", ATM: "Aztréonam",
  TZP: "Pipéracilline + tazobactam", FOX: "Céfoxitine", CTX: "Céfotaxime (C3G)",
  CAZ: "Ceftazidime (C3G)", FEP: "Céfépime (C4G)", ETP: "Ertapénème", IPM: "Imipénème",
  MEM: "Méropénème", CIP: "Ciprofloxacine", GEN: "Gentamicine", AMK: "Amikacine",
  SXT: "Cotrimoxazole", FOS: "Fosfomycine", COL: "Colistine", PEN: "Pénicilline G",
  E: "Érythromycine", DA: "Clindamycine", VA: "Vancomycine", TEC: "Teicoplanine",
  RD: "Rifampicine", LZD: "Linézolide", HLG: "Gentamicine haut niveau",
  CAF: "Chloramphénicol", DOX: "Doxycycline",
  OXA: "Oxacilline", LVX: "Lévofloxacine", PEF: "Péfloxacine", AZM: "Azithromycine",
  TEM: "Témocilline", FDC: "Céfidérocol", DAP: "Daptomycine", MXF: "Moxifloxacine",
  MIN: "Minocycline",
  // TÉTRACYCLINE. PhénoBac portait la doxycycline et la minocycline, pas la
  // tétracycline — or c'est ELLE que l'EUCAST fait lire chez Pasteurella,
  // Kingella et Corynebacterium diphtheriae, soit comme seuil clinique, soit
  // comme DÉPISTAGE dont se déduit la doxycycline. Sans ce code, le disque le
  // plus répandu des laboratoires à moyens comptés n'avait pas de place.
  TET: "Tétracycline"
};
/* LES NOMS D'ANTIBIOTIQUES EN ANGLAIS.

   Ils paraissent dans presque chaque phrase du commentaire : une alerte qui
   dit « Fosfomycine » au milieu d'un texte anglais trahit tout de suite que la
   traduction est de surface. Les noms employés sont ceux des Dénominations
   Communes Internationales en anglais, qui sont aussi ceux du classeur de
   l'EUCAST — « Benzylpenicillin », « Trimethoprim-sulfamethoxazole » — et non
   des noms commerciaux.

   Deux mentions ne sont pas des noms de molécule mais des façons de les
   tester, et elles se traduisent comme telles : « Gentamicine haut niveau »
   est le dépistage de la résistance de haut niveau aux aminosides, et
   « Péfloxacine (dépistage FQ) » l'écran des fluoroquinolones. */
const ABXNAME_EN = {
  AMX: "Amoxicillin", AMP: "Ampicillin", AMC: "Amoxicillin-clavulanic acid",
  MEC: "Mecillinam (pivmecillinam)", NIT: "Nitrofurantoin", TMP: "Trimethoprim",
  CFM: "Cefixime", CRO: "Ceftriaxone", OFX: "Ofloxacin", ATM: "Aztreonam",
  TZP: "Piperacillin-tazobactam", FOX: "Cefoxitin", CTX: "Cefotaxime (3GC)",
  CAZ: "Ceftazidime (3GC)", FEP: "Cefepime (4GC)", ETP: "Ertapenem", IPM: "Imipenem",
  MEM: "Meropenem", CIP: "Ciprofloxacin", GEN: "Gentamicin", AMK: "Amikacin",
  SXT: "Trimethoprim-sulfamethoxazole", FOS: "Fosfomycin", COL: "Colistin",
  PEN: "Benzylpenicillin", E: "Erythromycin", DA: "Clindamycin", VA: "Vancomycin",
  TEC: "Teicoplanin", RD: "Rifampicin", LZD: "Linezolid",
  HLG: "Gentamicin, high-level screen", CAF: "Chloramphenicol", DOX: "Doxycycline",
  OXA: "Oxacillin", LVX: "Levofloxacin", PEF: "Pefloxacin (fluoroquinolone screen)",
  AZM: "Azithromycin", TEM: "Temocillin", FDC: "Cefiderocol", DAP: "Daptomycin",
  MXF: "Moxifloxacin", MIN: "Minocycline", TET: "Tetracycline"
};

/* Le nom de la molécule dans la langue courante. Passer par cette fonction
   plutôt que par ABXNAME directement est ce qui garantit qu'aucune phrase
   anglaise ne se retrouve avec un nom français au milieu. */
function nomAbx(code) {
  return (_lang === "en" ? ABXNAME_EN[code] : ABXNAME[code]) || ABXNAME[code] || code;
}

/* ---------- LES PHRASES DE RÉSISTANCE NATURELLE ----------

   Les valeurs de ORG[...].intrinsic sont des CITATIONS du document EUCAST
   « Expected Resistant Phenotypes v1.2 », et outils/verifier-naturelles.py
   les confronte à ce document : on n'y touche pas. Mais il y en a 101, pour
   72 phrases distinctes, et elles ne sont pas 72 phrases : ce sont DEUX
   morceaux assemblés —

       « Résistance naturelle attendue — <agent>. »
     + « EUCAST, phénotypes résistants attendus v1.2, règle <n>. »

   Poser tr() sur chacune aurait demandé 72 paires, et la soixante-treizième
   — celle qu'un ajout de règle fabriquera — serait arrivée MUETTE, rendue en
   français au milieu d'un rapport anglais, sans que rien ne le signale.
   On traduit donc les morceaux, et le banc outils/essai-langue.js vérifie
   que CHAQUE phrase présente dans ORG se traduit entièrement. Une phrase
   qu'on ne sait pas traduire fait ÉCHOUER le banc ; elle n'est jamais
   devinée (§ 26 : on ne remplace pas une règle scientifique absente par une
   valeur inventée — ici, par une traduction approchée). */
const NATURELLE_QUEUE_FR = " EUCAST, phénotypes résistants attendus v1.2, règle ";
const NATURELLE_QUEUE_EN = " EUCAST expected resistant phenotypes v1.2, rule ";

// L'agent, tel qu'il est nommé dans « Résistance naturelle attendue — … ».
const NATURELLE_AGENT_EN = {
  "aminopénicilline + inhibiteur": "aminopenicillin plus inhibitor",
  "aminopénicillines": "the aminopenicillins",
  "aminosides": "the aminoglycosides",
  "aminosides (bas niveau)": "the aminoglycosides (low level)",
  "aminosides (bas niveau) ; la synergie avec les β-lactamines reste acquise":
    "the aminoglycosides (low level); synergy with the beta-lactams is retained",
  "ceftazidime": "ceftazidime",
  "chloramphénicol": "chloramphenicol",
  "ciprofloxacine": "ciprofloxacin",
  "céfotaxime / ceftriaxone": "cefotaxime / ceftriaxone",
  "céphalosporines (hors ceftazidime)": "the cephalosporins (ceftazidime excepted)",
  "ertapénème": "ertapenem",
  "fosfomycine": "fosfomycin",
  "lincosamides": "the lincosamides",
  "macrolides": "the macrolides",
  "nitrofurantoïne": "nitrofurantoin",
  "pipéracilline-tazobactam": "piperacillin-tazobactam",
  "polymyxines": "the polymyxins",
  "tétracyclines": "the tetracyclines"
};

// Les phrases qui ne suivent pas le gabarit « attendue — <agent> ».
const NATURELLE_TETE_EN = {
  "Céphalosporines / céphamycines naturellement inactives.":
    "Cephalosporins and cephamycins intrinsically inactive.",
  "Céphalosporines naturellement inactives (toutes, dont C3G).":
    "Cephalosporins intrinsically inactive — all of them, the third generation included.",
  "Résistance naturelle (AmpC non inhibée par le clavulanate).":
    "Intrinsic resistance: an AmpC that clavulanate does not inhibit.",
  "Résistance naturelle (AmpC).": "Intrinsic resistance (AmpC).",
  "Résistance naturelle (carbapénémase L1) — carbapénème inactif in vivo.":
    "Intrinsic resistance (the L1 carbapenemase) — the carbapenem is inactive in vivo.",
  "Résistance naturelle (céphalosporinase AmpC chromosomique inductible).":
    "Intrinsic resistance (an inducible chromosomal AmpC cephalosporinase).",
  "Résistance naturelle (céphalosporinase AmpC chromosomique inductible) aux aminopénicillines.":
    "Intrinsic resistance to the aminopenicillins (an inducible chromosomal AmpC cephalosporinase).",
  "Résistance naturelle (céphalosporinase chromosomique K1) aux aminopénicillines.":
    "Intrinsic resistance to the aminopenicillins (the chromosomal K1 cephalosporinase).",
  "Résistance naturelle (pénicillinase SHV chromosomique) aux aminopénicillines.":
    "Intrinsic resistance to the aminopenicillins (a chromosomal SHV penicillinase).",
  "Résistance naturelle (pénicillinase chromosomique K1/OXY) aux aminopénicillines.":
    "Intrinsic resistance to the aminopenicillins (the chromosomal K1/OXY penicillinase).",
  "Résistance naturelle aux aminosides.": "Intrinsic resistance to the aminoglycosides.",
  "Résistance naturelle aux carbapénèmes.": "Intrinsic resistance to the carbapenems.",
  "Résistance naturelle aux polymyxines (colistine).":
    "Intrinsic resistance to the polymyxins (colistin).",
  "Résistance naturelle à la colistine (à ne pas rendre sensible).":
    "Intrinsic resistance to colistin — never report it susceptible.",
  "Résistance naturelle — l'acide clavulanique n'inhibe pas l'AmpC.":
    "Intrinsic resistance — clavulanic acid does not inhibit AmpC."
};

/* La traduction anglaise d'une phrase de résistance naturelle, ou null si
   on ne sait pas la traduire. RENDRE null PLUTÔT QUE LE FRANÇAIS est
   délibéré : c'est ce qui permet au banc de distinguer « traduit » de
   « laissé tel quel », et donc d'échouer. */
function naturelleEn(fr) {
  if (!fr) return fr;
  let tete = fr, queue = "";
  const i = fr.indexOf(NATURELLE_QUEUE_FR);
  if (i >= 0) {
    tete = fr.slice(0, i);
    queue = NATURELLE_QUEUE_EN + fr.slice(i + NATURELLE_QUEUE_FR.length);
  }
  if (NATURELLE_TETE_EN[tete]) return NATURELLE_TETE_EN[tete] + queue;
  const m = /^Résistance naturelle attendue — (.+)\.$/.exec(tete);
  if (m && NATURELLE_AGENT_EN[m[1]]) {
    return "Expected intrinsic resistance — " + NATURELLE_AGENT_EN[m[1]] + "." + queue;
  }
  return null;
}

// Ce que le rapport affiche : l'anglais quand on l'a, le français sinon —
// visible, et le banc l'aura déjà signalé.
function naturelle(fr) {
  return _lang === "en" ? (naturelleEn(fr) || fr) : fr;
}

/* LE NIVEAU DE CONFIANCE EST UNE CLÉ, ET IL ÉTAIT AFFICHÉ TEL QUEL.

   « confirmé », « probable », « possible » servent de valeurs d'aiguillage —
   le moteur ET la page les comparent à ces mots-là. Les traduire casserait
   les comparaisons ; les laisser afficher tels quels mettait un mot français
   dans un rapport anglais. On sépare donc la clé de son libellé : A.confiance
   reste la clé, et c'est confianceLibelle() qu'on affiche.
   outils/verifier-langues.py vérifie que la page n'affiche plus la clé. */
const CONFIANCE_EN = { "confirmé": "confirmed", "probable": "probable", "possible": "possible" };
function confianceLibelle(cle) {
  if (!cle) return cle;
  return _lang === "en" ? (CONFIANCE_EN[cle] || cle) : cle;
}


// concentrations critiques (valeurs par défaut, surchargées par bpOverride côté client)
/* ============================================================
   LES TABLES, RECONSTRUITES DEPUIS LA BASE

   Aucun seuil n'est écrit ici. base-connaissances.js fait foi ; ce bloc ne
   fait que lui redonner la forme imbriquée que le reste du moteur attend —
   BP[groupe][antibiotique], DZ[groupe][antibiotique]… — pour qu'aucune des
   fonctions de raisonnement n'ait eu à changer.

   Mettre à jour un référentiel ne demande donc plus de toucher au code.

   Une subtilité qui vaut d'être dite : « undefined » signifie qu'il n'y a pas
   de seuil, « null » que le comité n'accorde AUCUNE catégorie sensible à
   posologie standard. Les confondre ferait de la ligne de l'amoxicilline —
   qui ne porte qu'un renvoi vers le disque d'ampicilline — un seuil
   {S:null, R:null}, et le renvoi serait perdu.
   ============================================================ */
const BASE = (typeof module !== "undefined" && module.exports)
  ? require("./base-connaissances")
  : racine.PhenoBacBase;

/* Les posologies qui fondent les seuils. Fichier de données séparé, comme la
   base de règles : le § 18 veut qu'on puisse les mettre à jour sans toucher au
   code, et qu'une version passée reste rejouable. */
const POSO = (typeof module !== "undefined" && module.exports)
  ? require("./posologie")
  : (racine.PhenoBacPosologie || { POSOLOGIE: {}, POSOLOGIE_VERSION: null });
if (!BASE || !BASE.regles)
  throw new Error("base-connaissances.js doit être chargé avant moteur.js");

const BP = {}, BP_MENINGE = {}, BP_URIN = {}, BP_CASFM = {}, BP_CASFM_URIN = {},
      BP_MENINGE_CASFM = {},
      DZ = {}, DZ_MENINGE = {}, DZ_URIN = {}, DZ_CASFM = {}, DZ_CASFM_URIN = {},
      DZ_TEMOIN = {}, DZ_CASFM_ESPECE = {}, ECOFF = {},
      // Le même objet sous un nom exact : la colonne « espece » de la base se
      // remplit quel que soit le référentiel, et l'EUCAST en a désormais
      // besoin (nitrofurantoïne chez E. coli, triméthoprime chez E. coli et
      // Klebsiella). Un second TABLEAU aurait fini par diverger du premier ;
      // un second NOM ne le peut pas.
      ESPECE_LIMITE = DZ_CASFM_ESPECE,
      DISQUE = {}, DISQUE_CASFM = {},
      ZIT = {}, ZIT_CASFM = {}, ZIT_ZONE = {}, ZIT_ZONE_CASFM = {},
      HORS_EUCAST = {}, CASFM_COUVRE = {}, CASFM_COUVRE_ESPECE = {},
      // DEUX TABLES DE DÉPISTAGE, ET IL EN FALLAIT DEUX. Jusqu'au 25 octobre
      // 2026 il n'y en avait qu'une, nommée DEPISTAGE_CASFM, et
      // depistageSeuil() ne la consultait QUE sous CA-SFM. C'était juste tant
      // que les seuls dépistages venus de la base étaient ceux du CA-SFM.
      // L'EUCAST en a aussi — « Tetracycline (screen only) » chez Pasteurella,
      // dont se déduit la doxycycline — et ils tombaient dans la table du
      // mauvais référentiel : la mesure restait « non catégorisée », et
      // l'application disait à l'utilisateur que l'EUCAST ne tranche pas,
      // alors que le document explique précisément comment conclure.
      DEPISTAGE = {}, DEPISTAGE_CASFM = {};

(function batir() {
  const met = function (t, g, a, v) { (t[g] || (t[g] = {}))[a] = v; };
  const dans = function (t, g, a) { const l = t[g] || (t[g] = []); if (l.indexOf(a) === -1) l.push(a); };

  // Où va un seuil, selon ses coordonnées.
  const SEUILS = {
    "eucast:cmi:standard": BP,        "eucast:cmi:meninge":  BP_MENINGE,
    "eucast:cmi:urinaire": BP_URIN,
    "casfm:cmi:standard":  BP_CASFM,  "casfm:cmi:urinaire":  BP_CASFM_URIN,
    "casfm:cmi:meninge":   BP_MENINGE_CASFM,
    "eucast:disque:standard": DZ,       "eucast:disque:meninge":  DZ_MENINGE,
    "eucast:disque:urinaire": DZ_URIN,
    "casfm:disque:standard":  DZ_CASFM, "casfm:disque:urinaire":  DZ_CASFM_URIN
  };

  BASE.regles.forEach(function (r) {
    if (r.S !== undefined || r.R !== undefined) {
      const t = SEUILS[r.ref + ":" + r.meth + ":" + r.site];
      // Une règle dont les coordonnées n'ont pas de table de destination
      // était SILENCIEUSEMENT IGNORÉE : on pouvait ajouter un seuil à la base,
      // le voir dans le fichier, et l'application ne jamais en tenir compte.
      // Le défaut le plus coûteux est celui qui ne se signale pas.
      if (!t) throw new Error(
        "base-connaissances : aucune table pour « " + r.ref + ":" + r.meth + ":" + r.site
        + " » (" + r.groupe + "/" + r.abx + "). Le seuil serait ignoré sans rien dire.");
      met(t, r.groupe, r.abx, { S: r.S, R: r.R });
    }
    if (r.charge !== undefined)
      met(r.ref === "casfm" ? DISQUE_CASFM : DISQUE, r.groupe, r.abx, r.charge);
    if (r.zit !== undefined)
      met(r.meth === "cmi" ? (r.ref === "casfm" ? ZIT_CASFM : ZIT)
                           : (r.ref === "casfm" ? ZIT_ZONE_CASFM : ZIT_ZONE),
          r.groupe, r.abx, r.zit);
    if (r.temoin !== undefined) met(DZ_TEMOIN, r.groupe, r.abx, r.temoin);
    if (r.dep !== undefined)    met(r.ref === "casfm" ? DEPISTAGE_CASFM : DEPISTAGE, r.groupe, r.abx, r.dep);
    if (r.espece !== undefined) DZ_CASFM_ESPECE[r.groupe + ":" + r.abx] = r.espece;
    if (r.ecoff) ECOFF[r.groupe + ":" + r.abx] = true;
    if (r.conv) dans(HORS_EUCAST, r.groupe, r.abx);
    if (r.couv !== undefined) {
      dans(CASFM_COUVRE, r.groupe, r.abx);
      if (r.couv !== true) CASFM_COUVRE_ESPECE[r.groupe + ":" + r.abx] = r.couv;
    }
  });
})();

/* La règle qui a servi, retrouvée par ses coordonnées. C'est elle que
   l'interface citera pour répondre à « pourquoi ? » : source, version, date
   de validité, statut. */
function regleDe(ref, groupe, abx, meth, site) {
  const rr = BASE.regles;
  for (let i = 0; i < rr.length; i++) {
    const r = rr[i];
    if (r.ref === ref && r.groupe === groupe && r.abx === abx
        && r.meth === meth && r.site === (site || "standard")) return r;
  }
  return null;
}



// définitions d'organismes : moteur, arguments, groupe de seuils, résistances naturelles
const ORG = {
  ecoli:      { engine: "entero", args: { amino: "AMX", species: "E. coli" }, bpGroup: "entero", intrinsic: {} },
  kpneu:      { engine: "entero", args: { amino: "AMX", species: "K. pneumoniae", klebsiella: true }, bpGroup: "entero",
                intrinsic: { AMX: "Résistance naturelle (pénicillinase SHV chromosomique) aux aminopénicillines." } },
  ecloacae:   { engine: "enterobacter", bpGroup: "entero",
                intrinsic: {
                  AMX: "Résistance naturelle (céphalosporinase AmpC chromosomique inductible).",
                  AMC: "Résistance naturelle (AmpC non inhibée par le clavulanate).",
                  FOX: "Résistance naturelle (AmpC)." } },
  saureus:    { engine: "staph", bpGroup: "staph", intrinsic: {CAZ: "Résistance naturelle attendue — ceftazidime. EUCAST, phénotypes résistants attendus v1.2, règle 4.5."} },
  sepidermidis:  { engine: "staph", args: { species: "Staphylococcus epidermidis", coNS: true }, bpGroup: "scn", intrinsic: {CAZ: "Résistance naturelle attendue — ceftazidime. EUCAST, phénotypes résistants attendus v1.2, règle 4.5."} },
  ssaprophyticus:{ engine: "staph", args: { species: "Staphylococcus saprophyticus", coNS: true }, bpGroup: "scn", intrinsic: {CAZ: "Résistance naturelle attendue — ceftazidime. EUCAST, phénotypes résistants attendus v1.2, règle 4.1.", FOS: "Résistance naturelle attendue — fosfomycine. EUCAST, phénotypes résistants attendus v1.2, règle 4.1."} },
  slugdunensis:  { engine: "staph", args: { species: "Staphylococcus lugdunensis", coNS: true }, bpGroup: "scn", intrinsic: {CAZ: "Résistance naturelle attendue — ceftazidime. EUCAST, phénotypes résistants attendus v1.2, règle 4.5."} },
  shaemolyticus: { engine: "staph", args: { species: "Staphylococcus haemolyticus", coNS: true }, bpGroup: "scn", intrinsic: {CAZ: "Résistance naturelle attendue — ceftazidime. EUCAST, phénotypes résistants attendus v1.2, règle 4.5."} },
  spyogenes:   { engine: "strep", args: { species: "Streptococcus pyogenes", group: "A" }, bpGroup: "strepacg", intrinsic: {CAZ: "Résistance naturelle attendue — ceftazidime. EUCAST, phénotypes résistants attendus v1.2, règle 4.6.", GEN: "Résistance naturelle attendue — aminosides (bas niveau) ; la synergie avec les β-lactamines reste acquise. EUCAST, phénotypes résistants attendus v1.2, règle 4.6."} },
  /* Streptococcus dysgalactiae — groupes C et G de Lancefield. Aucun seuil
     nouveau n'est nécessaire : la table de l'EUCAST s'intitule « Streptococcus
     groups A, B, C and G », et le groupe « strepacg » de PhénoBac EST cette
     table. Jusqu'ici, une souche C ou G obligeait à choisir S. pyogenes —
     c'est-à-dire à écrire une espèce fausse sur le compte rendu pour obtenir
     les bons seuils. La règle 4.6 des phénotypes attendus vise
     « Streptococcus spp. » et les couvre donc aussi. */
  sdysgalactiae: { engine: "strep", args: { species: "Streptococcus dysgalactiae", group: "CG" }, bpGroup: "strepacg",
                intrinsic: {CAZ: "Résistance naturelle attendue — ceftazidime. EUCAST, phénotypes résistants attendus v1.2, règle 4.6.", GEN: "Résistance naturelle attendue — aminosides. EUCAST, phénotypes résistants attendus v1.2, règle 4.6."} },
  sagalactiae: { engine: "strep", args: { species: "Streptococcus agalactiae", group: "B" }, bpGroup: "strepb", intrinsic: {CAZ: "Résistance naturelle attendue — ceftazidime. EUCAST, phénotypes résistants attendus v1.2, règle 4.6.", GEN: "Résistance naturelle attendue — aminosides (bas niveau) ; la synergie avec les β-lactamines reste acquise. EUCAST, phénotypes résistants attendus v1.2, règle 4.6."} },
  sviridans:   { engine: "strep", args: { species: "Streptocoque du groupe viridans", group: "viridans" }, bpGroup: "viridans", intrinsic: {CAZ: "Résistance naturelle attendue — ceftazidime. EUCAST, phénotypes résistants attendus v1.2, règle 4.6.", GEN: "Résistance naturelle attendue — aminosides (bas niveau) ; la synergie avec les β-lactamines reste acquise. EUCAST, phénotypes résistants attendus v1.2, règle 4.6."} },
  steno:      { engine: "stenoburk", args: { species: "Stenotrophomonas maltophilia", type: "steno" }, bpGroup: "steno",
                // Doxycycline ÉCARTÉE des attendues : la règle 2.8 coche « tétracyclines »,
                // mais la note du même document la restreint — « S. maltophilia is
                // always resistant to tetracycline whereas susceptibility to
                // doxycycline, minocycline and tigecycline vary ». La déclarer
                // attendue résistante ferait lever une fausse alerte sur une souche
                // sensible, cas que le document dit exister.
                intrinsic: {IPM: "Résistance naturelle (carbapénémase L1) — carbapénème inactif in vivo.",
                  MEM: "Résistance naturelle (carbapénémase L1) — carbapénème inactif in vivo.",
                  ETP: "Résistance naturelle aux carbapénèmes.",
                  GEN: "Résistance naturelle aux aminosides.",
                  AMK: "Résistance naturelle aux aminosides.", AMX: "Résistance naturelle attendue — aminopénicillines. EUCAST, phénotypes résistants attendus v1.2, règle 2.8.", AMC: "Résistance naturelle attendue — aminopénicilline + inhibiteur. EUCAST, phénotypes résistants attendus v1.2, règle 2.8.", TZP: "Résistance naturelle attendue — pipéracilline-tazobactam. EUCAST, phénotypes résistants attendus v1.2, règle 2.8.", CTX: "Résistance naturelle attendue — céfotaxime / ceftriaxone. EUCAST, phénotypes résistants attendus v1.2, règle 2.8.", FOS: "Résistance naturelle attendue — fosfomycine. EUCAST, phénotypes résistants attendus v1.2, règle 2.8.",} },
  burk:       { engine: "stenoburk", args: { species: "Burkholderia cepacia", type: "burk" }, bpGroup: "burk",
                intrinsic: {COL: "Résistance naturelle aux polymyxines (colistine).",
                  GEN: "Résistance naturelle aux aminosides.",
                  AMK: "Résistance naturelle aux aminosides.", AMX: "Résistance naturelle attendue — aminopénicillines. EUCAST, phénotypes résistants attendus v1.2, règle 2.3.", AMC: "Résistance naturelle attendue — aminopénicilline + inhibiteur. EUCAST, phénotypes résistants attendus v1.2, règle 2.3.", TZP: "Résistance naturelle attendue — pipéracilline-tazobactam. EUCAST, phénotypes résistants attendus v1.2, règle 2.3.", CTX: "Résistance naturelle attendue — céfotaxime / ceftriaxone. EUCAST, phénotypes résistants attendus v1.2, règle 2.3.", ETP: "Résistance naturelle attendue — ertapénème. EUCAST, phénotypes résistants attendus v1.2, règle 2.3.", CIP: "Résistance naturelle attendue — ciprofloxacine. EUCAST, phénotypes résistants attendus v1.2, règle 2.3.", CAF: "Résistance naturelle attendue — chloramphénicol. EUCAST, phénotypes résistants attendus v1.2, règle 2.3.", FOS: "Résistance naturelle attendue — fosfomycine. EUCAST, phénotypes résistants attendus v1.2, règle 2.3."} },
  haemophilus:  { engine: "fastid", args: { species: "Haemophilus influenzae", type: "haemophilus" }, bpGroup: "haemo", intrinsic: {} },
  nmeningitidis:{ engine: "fastid", args: { species: "Neisseria meningitidis", type: "meningitidis" }, bpGroup: "nmening", intrinsic: {} },
  ngonorrhoeae: { engine: "fastid", args: { species: "Neisseria gonorrhoeae", type: "gonorrhoeae" }, bpGroup: "ngono", intrinsic: {} },
  moraxella:    { engine: "fastid", args: { species: "Moraxella catarrhalis", type: "moraxella" }, bpGroup: "moraxella", intrinsic: {} },
  listeria:   { engine: "gramposrod", args: { species: "Listeria monocytogenes", type: "listeria" }, bpGroup: "listeria",
                intrinsic: {CTX: "Céphalosporines naturellement inactives (toutes, dont C3G).",
                  FOX: "Céphalosporines / céphamycines naturellement inactives.", CAZ: "Résistance naturelle attendue — ceftazidime. EUCAST, phénotypes résistants attendus v1.2, règle 4.11.", FEP: "Résistance naturelle attendue — céphalosporines (hors ceftazidime). EUCAST, phénotypes résistants attendus v1.2, règle 4.11."} },
  coryne:     { engine: "gramposrod", args: { species: "Corynebacterium spp.", type: "coryne" }, bpGroup: "coryne", intrinsic: {FOS: "Résistance naturelle attendue — fosfomycine. EUCAST, phénotypes résistants attendus v1.2, règle 4.10."} },
  bfragilis:  { engine: "anaerobe", args: { species: "Bacteroides fragilis", type: "bfragilis" }, bpGroup: "bfragilis", intrinsic: {} },
  cperfringens:{ engine: "anaerobe", args: { species: "Clostridium perfringens", type: "cperfringens", penCouvre: true }, bpGroup: "cperfringens", intrinsic: {} },
  cdifficile: { engine: "anaerobe", args: { species: "Clostridioides difficile", type: "cdifficile" }, bpGroup: "cdifficile", intrinsic: {} },

  /* Anaérobies à Gram négatif. Le tableau 5 des phénotypes attendus les dit
     « usually resistant to aztreonam, aminoglycosides, polymyxin B/colistin » —
     c'est une phrase de préambule, qui ne porte pas de numéro de règle et ne
     vise aucune espèce en particulier. Elle n'est donc pas transcrite en
     résistance naturelle, comme pour les anaérobies déjà présents : ces
     molécules ne figurent simplement pas au panel.

     Fusobacterium a DEUX entrées parce que le document sépare les deux
     espèces sur l'amoxicilline-acide clavulanique et la
     pipéracilline-tazobactam. */
  prevotella: { engine: "anaerobe", args: { species: "Prevotella spp.", type: "prevotella", penCouvre: true }, bpGroup: "prevotella", intrinsic: {} },
  fnecrophorum: { engine: "anaerobe", args: { species: "Fusobacterium necrophorum", type: "fusobacterium", penCouvre: true }, bpGroup: "fnecrophorum", intrinsic: {} },
  fnucleatum: { engine: "anaerobe", args: { species: "Fusobacterium nucleatum", type: "fusobacterium", penCouvre: true }, bpGroup: "fnucleatum", intrinsic: {} },

  /* Anaérobies à Gram POSITIF — feuille « Anaerobic bacteria_G-positive » du
     classeur v16.1. Trois profils cliniques, pas dix : les clostridies, les
     Cutibacterium (infections sur matériel) et les cocci à Gram positif
     anaérobies. Le type gouverne le commentaire ; les seuils, eux, restent
     propres à chaque espèce, parce que le document les sépare. */
  /* PAS d'« intrinsic » POUR LA VANCOMYCINE DE C. INNOCUUM, ET C'EST VOULU.
     L'espèce est bien résistante à la vancomycine, et le moteur le DIT (voir
     anaerobeInterpret). Mais la colonne « intrinsic » de PhénoBac porte les
     résistances naturelles du document EUCAST « Expected Resistant
     Phenotypes », chacune avec son numéro de règle — et C. innocuum n'y
     figure pas. L'y inscrire reviendrait à citer un document qui ne le dit
     pas. Le risque pratique est nul : l'EUCAST ne donnant aucun seuil de
     vancomycine pour cette espèce, elle ne se catégorise pas et le panel ne
     la propose pas. § 26. */
  cinnocuum: { engine: "anaerobe", args: { species: "Clostridium innocuum", type: "clostridium" }, bpGroup: "cinnocuum", intrinsic: {} },
  cramosum: { engine: "anaerobe", args: { species: "Clostridium ramosum", type: "clostridium", penCouvre: true }, bpGroup: "cramosum", intrinsic: {} },
  csepticum: { engine: "anaerobe", args: { species: "Clostridium septicum", type: "clostridium", penCouvre: true }, bpGroup: "csepticum", intrinsic: {} },
  ctertium: { engine: "anaerobe", args: { species: "Clostridium tertium", type: "clostridium" }, bpGroup: "ctertium", intrinsic: {} },
  cacnes: { engine: "anaerobe", args: { species: "Cutibacterium acnes", type: "cutibacterium", penCouvre: true }, bpGroup: "cacnes", intrinsic: {} },
  cavidum: { engine: "anaerobe", args: { species: "Cutibacterium avidum", type: "cutibacterium", penCouvre: true }, bpGroup: "cavidum", intrinsic: {} },
  finegoldia: { engine: "anaerobe", args: { species: "Finegoldia magna", type: "gpac", penCouvre: true }, bpGroup: "finegoldia", intrinsic: {} },
  parvimonas: { engine: "anaerobe", args: { species: "Parvimonas micra", type: "gpac", penCouvre: true }, bpGroup: "parvimonas", intrinsic: {} },
  peptostrepto: { engine: "anaerobe", args: { species: "Peptostreptococcus anaerobius", type: "gpac", penCouvre: true }, bpGroup: "peptostrepto", intrinsic: {} },
  peptoniphilus: { engine: "anaerobe", args: { species: "Peptoniphilus spp.", type: "gpac", penCouvre: true }, bpGroup: "peptoniphilus", intrinsic: {} },


  /* Espèces aérobies ajoutées le 25 octobre 2026, lues dans le classeur v16.1.

     AUCUNE « résistance naturelle » déclarée ici, et c'est voulu. Aeromonas
     est bien inactivée par les aminopénicillines, Achromobacter par les
     aminosides — mais la colonne « intrinsic » de PhénoBac porte les
     phénotypes du document EUCAST « Expected Resistant Phenotypes », chacun
     avec son numéro de règle, et ces espèces n'y figurent pas. Le moteur le
     DIT dans son commentaire, en s'appuyant sur ce qui est vérifiable : les
     molécules que le classeur ne chiffre pas. § 26. */
  pasteurella: { engine: "autresbgn", args: { species: "Pasteurella multocida", type: "pasteurella" }, bpGroup: "pasteurella", intrinsic: {} },
  aeromonas:   { engine: "autresbgn", args: { species: "Aeromonas spp.", type: "aeromonas" }, bpGroup: "aeromonas", intrinsic: {} },
  achromobacter:{ engine: "autresbgn", args: { species: "Achromobacter xylosoxidans", type: "achromobacter" }, bpGroup: "achromobacter", intrinsic: {} },
  kingella:    { engine: "autresbgn", args: { species: "Kingella kingae", type: "kingella" }, bpGroup: "kingella", intrinsic: {} },
  aerococcus:  { engine: "aerococcus", args: { species: "Aerococcus urinae / A. sanguinicola" }, bpGroup: "aerococcus", intrinsic: {} },
  cdiphtheriae:{ engine: "gramposrod", args: { species: "Corynebacterium diphtheriae", type: "diphtheriae" }, bpGroup: "cdiphtheriae", intrinsic: {} },
  culcerans:   { engine: "gramposrod", args: { species: "Corynebacterium ulcerans", type: "diphtheriae", ulcerans: true }, bpGroup: "culcerans", intrinsic: {} },

  campylobacter:{ engine: "curved", args: { species: "Campylobacter jejuni", type: "campylobacter" }, bpGroup: "campylo", intrinsic: {} },
  vibrio:     { engine: "curved", args: { species: "Vibrio cholerae", type: "vibrio" }, bpGroup: "vibrio", intrinsic: {} },
  efaecalis:  { engine: "enterococcus", args: { species: "E. faecalis", ampExpectedS: true }, bpGroup: "enteroc", intrinsic: {CAZ: "Résistance naturelle attendue — ceftazidime. EUCAST, phénotypes résistants attendus v1.2, règle 4.7.", CTX: "Résistance naturelle attendue — céphalosporines (hors ceftazidime). EUCAST, phénotypes résistants attendus v1.2, règle 4.7.", FOX: "Résistance naturelle attendue — céphalosporines (hors ceftazidime). EUCAST, phénotypes résistants attendus v1.2, règle 4.7.", FEP: "Résistance naturelle attendue — céphalosporines (hors ceftazidime). EUCAST, phénotypes résistants attendus v1.2, règle 4.7.", GEN: "Résistance naturelle attendue — aminosides (bas niveau). EUCAST, phénotypes résistants attendus v1.2, règle 4.7.", E: "Résistance naturelle attendue — macrolides. EUCAST, phénotypes résistants attendus v1.2, règle 4.7.", AZM: "Résistance naturelle attendue — macrolides. EUCAST, phénotypes résistants attendus v1.2, règle 4.7.", DA: "Résistance naturelle attendue — lincosamides. EUCAST, phénotypes résistants attendus v1.2, règle 4.7."} },
  efaecium:   { engine: "enterococcus", args: { species: "E. faecium", ampExpectedS: false }, bpGroup: "enteroc", intrinsic: {CAZ: "Résistance naturelle attendue — ceftazidime. EUCAST, phénotypes résistants attendus v1.2, règle 4.9.", CTX: "Résistance naturelle attendue — céphalosporines (hors ceftazidime). EUCAST, phénotypes résistants attendus v1.2, règle 4.9.", FOX: "Résistance naturelle attendue — céphalosporines (hors ceftazidime). EUCAST, phénotypes résistants attendus v1.2, règle 4.9.", FEP: "Résistance naturelle attendue — céphalosporines (hors ceftazidime). EUCAST, phénotypes résistants attendus v1.2, règle 4.9.", GEN: "Résistance naturelle attendue — aminosides (bas niveau). EUCAST, phénotypes résistants attendus v1.2, règle 4.9.", E: "Résistance naturelle attendue — macrolides. EUCAST, phénotypes résistants attendus v1.2, règle 4.9.", AZM: "Résistance naturelle attendue — macrolides. EUCAST, phénotypes résistants attendus v1.2, règle 4.9."} },
  paeru:      { engine: "pseudo", bpGroup: "pseudo", intrinsic: {AMX: "Résistance naturelle attendue — aminopénicillines. EUCAST, phénotypes résistants attendus v1.2, règle 2.7.", AMC: "Résistance naturelle attendue — aminopénicilline + inhibiteur. EUCAST, phénotypes résistants attendus v1.2, règle 2.7.", CTX: "Résistance naturelle attendue — céfotaxime / ceftriaxone. EUCAST, phénotypes résistants attendus v1.2, règle 2.7.", ETP: "Résistance naturelle attendue — ertapénème. EUCAST, phénotypes résistants attendus v1.2, règle 2.7.", CAF: "Résistance naturelle attendue — chloramphénicol. EUCAST, phénotypes résistants attendus v1.2, règle 2.7.", DOX: "Résistance naturelle attendue — tétracyclines. EUCAST, phénotypes résistants attendus v1.2, règle 2.7."} },
  acineto:    { engine: "acineto", bpGroup: "acineto", intrinsic: {AMX: "Résistance naturelle attendue — aminopénicillines. EUCAST, phénotypes résistants attendus v1.2, règle 2.1.", AMC: "Résistance naturelle attendue — aminopénicilline + inhibiteur. EUCAST, phénotypes résistants attendus v1.2, règle 2.1.", CTX: "Résistance naturelle attendue — céfotaxime / ceftriaxone. EUCAST, phénotypes résistants attendus v1.2, règle 2.1.", ETP: "Résistance naturelle attendue — ertapénème. EUCAST, phénotypes résistants attendus v1.2, règle 2.1.", FOS: "Résistance naturelle attendue — fosfomycine. EUCAST, phénotypes résistants attendus v1.2, règle 2.1.", DOX: "Résistance naturelle attendue — tétracyclines. EUCAST, phénotypes résistants attendus v1.2, règle 2.1."} },
  proteus:    { engine: "proteus", bpGroup: "morganella", intrinsic: {DOX: "Résistance naturelle attendue — tétracyclines. EUCAST, phénotypes résistants attendus v1.2, règle 1.12.", COL: "Résistance naturelle attendue — polymyxines. EUCAST, phénotypes résistants attendus v1.2, règle 1.12.", NIT: "Résistance naturelle attendue — nitrofurantoïne. EUCAST, phénotypes résistants attendus v1.2, règle 1.12."} },
  salmonella: { engine: "salmonella", bpGroup: "salmonella", intrinsic: {} },
  pneumocoque:{ engine: "pneumo", bpGroup: "pneumo", intrinsic: {CAZ: "Résistance naturelle attendue — ceftazidime. EUCAST, phénotypes résistants attendus v1.2, règle 4.6.", GEN: "Résistance naturelle attendue — aminosides (bas niveau) ; la synergie avec les β-lactamines reste acquise. EUCAST, phénotypes résistants attendus v1.2, règle 4.6."} },

  // --- Extension Entérobactéries (moteurs réutilisés) ---
  koxytoca:   { engine: "entero", args: { amino: "AMX", species: "K. oxytoca", klebsiella: true }, bpGroup: "entero",
                intrinsic: { AMX: "Résistance naturelle (pénicillinase chromosomique K1/OXY) aux aminopénicillines." } },
  kaerogenes: { engine: "enterobacter", args: { species: "Klebsiella aerogenes" }, bpGroup: "entero",
                intrinsic: {
                  AMX: "Résistance naturelle (céphalosporinase AmpC chromosomique inductible).",
                  AMC: "Résistance naturelle (AmpC non inhibée par le clavulanate).",
                  FOX: "Résistance naturelle (AmpC)." } },
  serratia:   { engine: "enterobacter", args: { species: "Serratia marcescens" }, bpGroup: "serratia",
                intrinsic: {
                  AMX: "Résistance naturelle (céphalosporinase AmpC chromosomique inductible).",
                  AMC: "Résistance naturelle (AmpC non inhibée par le clavulanate).",
                  FOX: "Résistance naturelle (AmpC).",
                  COL: "Résistance naturelle à la colistine (à ne pas rendre sensible)." } },
  cfreundii:  { engine: "enterobacter", args: { species: "Citrobacter freundii" }, bpGroup: "entero",
                intrinsic: {
                  AMX: "Résistance naturelle (céphalosporinase AmpC chromosomique inductible).",
                  AMC: "Résistance naturelle (AmpC non inhibée par le clavulanate).",
                  FOX: "Résistance naturelle (AmpC)." } },
  pvulgaris:  { engine: "proteus", args: { species: "Proteus vulgaris" }, bpGroup: "morganella",
                intrinsic: {AMX: "Résistance naturelle (céphalosporinase chromosomique K1) aux aminopénicillines.", DOX: "Résistance naturelle attendue — tétracyclines. EUCAST, phénotypes résistants attendus v1.2, règle 1.14.", COL: "Résistance naturelle attendue — polymyxines. EUCAST, phénotypes résistants attendus v1.2, règle 1.14.", NIT: "Résistance naturelle attendue — nitrofurantoïne. EUCAST, phénotypes résistants attendus v1.2, règle 1.14."} },
  shigella:   { engine: "entero", args: { amino: "AMX", species: "Shigella spp." }, bpGroup: "entero", intrinsic: {} },

  /* Morganella et Providencia — entérobactéries du GROUPE 3 au sens de la note
     (A) des tableaux d'antibiogramme ciblé de la HAS. Elles y étaient nommées
     depuis que ces tableaux sont appliqués, mais PhénoBac ne permettait pas de
     les choisir : une règle écrite pour des espèces qu'on ne pouvait pas
     saisir. Elles partagent le groupe de seuils des Proteae (« morganella »)
     et le moteur à AmpC inductible d'Enterobacter — c'est ce que leur
     classement en groupe 3 veut dire.

     La céfoxitine n'est PAS déclarée résistante pour elles : le document la
     coche pour Citrobacter freundii et Enterobacter, pas pour celles-ci. On
     transcrit ce qui est écrit. */
  mmorganii:  { engine: "enterobacter", args: { species: "Morganella morganii" }, bpGroup: "morganella",
                intrinsic: {AMX: "Résistance naturelle (céphalosporinase AmpC chromosomique inductible) aux aminopénicillines. EUCAST, phénotypes résistants attendus v1.2, règle 1.10.", AMC: "Résistance naturelle — l'acide clavulanique n'inhibe pas l'AmpC. EUCAST, phénotypes résistants attendus v1.2, règle 1.10.", DOX: "Résistance naturelle attendue — tétracyclines. EUCAST, phénotypes résistants attendus v1.2, règle 1.10.", COL: "Résistance naturelle attendue — polymyxines. EUCAST, phénotypes résistants attendus v1.2, règle 1.10.", NIT: "Résistance naturelle attendue — nitrofurantoïne. EUCAST, phénotypes résistants attendus v1.2, règle 1.10."} },
  providencia:{ engine: "enterobacter", args: { species: "Providencia spp." }, bpGroup: "morganella",
                intrinsic: {AMX: "Résistance naturelle (céphalosporinase AmpC chromosomique inductible) aux aminopénicillines. EUCAST, phénotypes résistants attendus v1.2, règle 1.15.", AMC: "Résistance naturelle — l'acide clavulanique n'inhibe pas l'AmpC. EUCAST, phénotypes résistants attendus v1.2, règle 1.15.", DOX: "Résistance naturelle attendue — tétracyclines. EUCAST, phénotypes résistants attendus v1.2, règle 1.15.", COL: "Résistance naturelle attendue — polymyxines. EUCAST, phénotypes résistants attendus v1.2, règle 1.15.", NIT: "Résistance naturelle attendue — nitrofurantoïne. EUCAST, phénotypes résistants attendus v1.2, règle 1.15."} }
};

// organisme actif pour finalize (défini juste avant l'appel, calcul synchrone)
/* ============================================================
   CONDITIONS TECHNIQUES DE RÉALISATION — § 9

   Le § 9 demande de vérifier, avant toute validation, le milieu, les
   conditions d'incubation et la pureté de la culture. J'avais d'abord refusé :
   rien dans un antibiogramme ne dit sur quelle gélose il a poussé, et une
   alerte fondée sur une supposition apprend à ignorer les alertes.

   Ce qui change tout : l'utilisateur DÉCLARE ses conditions, et PhénoBac les
   confronte à ce que le référentiel EXIGE pour cette espèce. On ne devine
   plus rien — on compare deux faits documentés. Une condition non renseignée
   ne déclenche donc jamais rien : le silence n'est pas une non-conformité.

   SOURCES, verbatim :

   — EUCAST disk diffusion method, Version 13.0 (January 2025)
       Table 1 « Media for antimicrobial susceptibility testing »
       Table 3 « Incubation conditions for antimicrobial susceptibility test plates »
       § 2.2  « The medium should have a level depth of 4.0 ± 0.5 mm »
       § 3.3  « Adjust the density of the organism suspension to 0.5
               (acceptable variation 0.4-0.6) McFarland »
       § 3.4  règle des 15-15-15 : suspension employée dans les 15 min,
               disques posés dans les 15 min, plaques à l'étuve dans les 15 min
       § 6.3.1 « Incubation beyond the recommended time limits should not be
               performed as this may result in growth within inhibition zones
               and reporting isolates as false resistant. »
       § 7.1.1 « If individual colonies can be seen, the inoculum is too light
               and the test must be repeated. »
       § 8.9.1 « In case of double zones, or distinct colonies within zones,
               check for purity and repeat the test if necessary. If cultures
               are pure, colonies within zones should be taken into account
               when measuring the diameter. »
       Annexe A, Table A1 : Campylobacter jejuni et coli — MH-F, microaérobie,
               41 ± 1 °C, 24 ± 1 h.

   — EUCAST disk diffusion methodology for selected rapidly growing anaerobic
     bacteria on Fastidious Anaerobe Agar with defibrinated horse blood,
     Version 3.0 (June 2026)
       Milieu : FAA-HB, 5 % de sang de cheval défibriné mécaniquement, sans
               autre additif ; épaisseur 4,0 ± 0,5 mm.
       Inoculum : McFarland 1,0 (0,9-1,1) — et non 0,5.
       Incubation : anaérobiose, 35-37 °C, 16-20 h. « Prolonged incubation
               (beyond 20 h) is not allowed as it will affect zone sizes and
               invalidate interpretative criteria. »
       Le document liste les espèces pour lesquelles la méthode est validée et
       précise : « It cannot be used for other species of anaerobic bacteria ».
       Clostridioides difficile n'y figure pas.

   — EUCAST Clinical Breakpoint Tables v. 16.1 (valid from 2026-06-24)
       Neisseria gonorrhoeae et Neisseria meningitidis : « Disk diffusion
       criteria for antimicrobial susceptibility testing […] have not yet been
       defined and an MIC method should be used. »

   CE QUI N'EST PAS COUVERT, et qui reste donc muet. Burkholderia cepacia ne
   figure dans aucune de ces tables — l'EUCAST n'y chiffre que B. pseudomallei.
   Inventer pour elle un milieu « par analogie » serait exactement ce que le
   § 26 interdit.
   ============================================================ */
const COND_MH    = { milieu: "MH",     atmo: "air",    tmin: 34, tmax: 36, hmin: 16, hmax: 20, mcf: "0.5" };
const COND_MHF   = { milieu: "MH-F",   atmo: "co2",    tmin: 34, tmax: 36, hmin: 16, hmax: 20, mcf: "0.5" };
const COND_ANAER = { milieu: "FAA-HB", atmo: "anaero", tmin: 35, tmax: 37, hmin: 16, hmax: 20, mcf: "1.0" };

const CONDITIONS = {
  // Table 1 + Table 3 : Mueller-Hinton, air ambiant.
  entero: COND_MH, morganella: COND_MH, salmonella: COND_MH, serratia: COND_MH,
  pseudo: COND_MH, steno: COND_MH, acineto: COND_MH, staph: COND_MH, scn: COND_MH,
  vibrio: COND_MH,
  // Même ligne, avec la réserve des glycopeptides (Table 3).
  enteroc: Object.assign({}, COND_MH, {
    note: "Pour les glycopeptides, l'EUCAST demande 24 h : une souche qui paraît sensible à 16-20 h "
        + "doit être réincubée et relue à 24 h, les colonies résistantes pouvant n'apparaître que là." }),
  // Table 1 + Table 3 : MH-F, 4-6 % de CO2.
  strepacg: COND_MHF, strepb: COND_MHF, pneumo: COND_MHF, viridans: COND_MHF,
  haemo: COND_MHF, moraxella: COND_MHF, listeria: COND_MHF,
  coryne: Object.assign({}, COND_MHF, {
    note: "Une souche dont la croissance est insuffisante à 16-20 h est réincubée aussitôt et lue "
        + "après 40-44 h au total (EUCAST, Table 3)." }),
  // Annexe A : la seule espèce à 41 °C, et la seule en microaérobie.
  campylo: { milieu: "MH-F", atmo: "micro", tmin: 40, tmax: 42, hmin: 23, hmax: 25, mcf: "0.5",
    note: "Une souche de C. coli dont la croissance est insuffisante à 24 h est réincubée aussitôt "
        + "et lue après 40-48 h au total (EUCAST, annexe A)." },
  // Manuel des anaérobies v3.0.
  bfragilis: COND_ANAER, cperfringens: COND_ANAER,
  // Déclarés hors méthode, chacun pour sa raison propre.
  cdifficile: { horsMethode:
    "La méthode de diffusion en gélose de l'EUCAST pour les anaérobies (v3.0, juin 2026) est validée "
  + "pour une liste nommée d'espèces, dont Clostridioides difficile ne fait pas partie ; le document "
  + "précise qu'elle ne peut pas servir aux autres. Déterminer la CMI." },
  ngono: { horsMethode:
    "L'EUCAST (tables v16.1) écrit qu'aucun critère de diffusion en gélose n'est défini pour "
  + "Neisseria gonorrhoeae et qu'une méthode de CMI doit être employée." },
  nmening: { horsMethode:
    "L'EUCAST (tables v16.1) écrit qu'aucun critère de diffusion en gélose n'est défini pour "
  + "Neisseria meningitidis et qu'une méthode de CMI doit être employée." }
  // burk : volontairement absent — voir le commentaire ci-dessus.
};

const COND_MILIEU_DIT = { "MH": "Mueller-Hinton", "MH-F": "MH-F (MH + 5 % sang de cheval + 20 mg/L β-NAD)",
                          "FAA-HB": "FAA-HB (gélose anaérobie + 5 % sang de cheval)", "autre": "un autre milieu" };
const COND_ATMO_DIT   = { air: "l'air ambiant", co2: "4-6 % de CO2", micro: "la microaérobie",
                          anaero: "l'anaérobiose", autre: "une autre atmosphère" };

let _activeOrg = null;
let _activeId = null;
// Couples tombant dans la zone d'incertitude technique pour la requête en cours.
let _zit = [];
let _sansDisque = [];
let _depistage = null;
let _depistageEchoue = [];
// Mode de saisie et contexte déclaré : finalize() en a besoin pour confronter
// les conditions de réalisation à ce que le référentiel exige.
let _mode = "sir";
let _ctx = {};
// Le rendu ciblé est une POLITIQUE DU LABORATOIRE : il voyage avec la demande,
// il n'est pas un réglage du moteur. Un laboratoire qui ne l'a pas choisi rend
// tout, et c'est l'état par défaut.
let _renduCibleActif = false;

/* ------------------------------------------------------------
   Lecture interprétative — rendre R ce qui a été lu S ou SFP.

   C'est le geste le plus lourd de conséquence de l'application : il
   contredit la paillasse. On ne l'efface donc jamais — on enregistre
   le résultat brut, le résultat rendu et le motif, et le compte-rendu
   affiche les deux. Le biologiste doit pouvoir refaire le raisonnement.

   Un antibiotique non testé n'est pas rendu résistant : on ne conclut
   pas sur une molécule qu'on n'a pas lue.
   ------------------------------------------------------------ */
function rendreR(A, r, codes, motif) {
  codes.forEach(k => {
    const v = r[k];
    if (v === undefined || v === null || v === "") return;  // non testé : on se tait
    if (v === "R") return;                                  // déjà résistant
    // Une catégorie n'est jamais que S ou I à ce stade. Une valeur arbitraire
    // n'a pas de sens clinique et n'a rien à faire dans un compte rendu : on
    // ne la réinterprète pas et on ne la recopie pas.
    if (v !== "S" && v !== "I") return;
    A.rendu = A.rendu || [];
    if (A.rendu.some(x => x.abx === k)) return;             // une seule fois
    A.rendu.push({ abx: k, brut: v, rendu: "R", motif: motif });
  });
}

// Une carbapénémase a-t-elle été confirmée, et laquelle ?
function carbaConfirmee(c) {
  const v = (c && typeof c.carba === "string") ? c.carba : "";
  return { confirmee: v.indexOf("Oui") === 0, oxa48: v.indexOf("OXA-48") !== -1 };
}

/* ------------------------------------------------------------
   Règles CA-SFM communes à plusieurs chapitres, appliquées à la fin
   de chaque moteur. Elles ne changent pas de catégorie : elles disent
   au biologiste ce que le référentiel français exige en plus.
   ------------------------------------------------------------ */
// Groupes de seuils correspondant aux Enterobacterales.
const GROUPES_ENTEROBACTERALES_SRV = ["entero", "salmonella", "morganella", "serratia"];

function reglesCasfm(A, r) {
  if (!estCasfm()) return;
  const g = (_activeOrg && _activeOrg.bpGroup) || "";
  const id = _activeId || "";

  // p. 5 — la rifampicine n'est jamais employée seule (hors prophylaxie du
  // méningocoque et d'Haemophilus). L'EUCAST ne le signale pas ; le CA-SFM si.
  if ((r.RD === "S" || r.RD === "I") && id !== "nmeningitidis" && id !== "haemophilus") {
    A.rules.push({ k: "✚", txt: "CA-SFM : la rifampicine ne doit être rendue qu'assortie de la mention « à utiliser en association »." });
  }

  // p. 2 — masquage du méropénème chez Pseudomonas : prescrire un carbapénème
  // quand une β-lactamine de spectre plus étroit reste active est un mésusage.
  if (g === "pseudo" && (r.MEM === "S" || r.MEM === "I")) {
    const etroites = ["TZP", "CAZ", "FEP"].filter(k => r[k] === "S" || r[k] === "I");
    if (etroites.length) {
      A.rules.push({ k: "⊘", txt: "CA-SFM : règle de masquage — ne pas rendre le méropénème tant qu'une β-lactamine de spectre plus étroit reste active (" + etroites.map(k => nomAbx(k)).join(", ") + ")." });
    }
  }

  // p. 9 — la lévofloxacine est moins active que la ciprofloxacine sur
  // Pseudomonas, et le CA-SFM la veut à forte posologie au minimum.
  if (g === "pseudo" && (r.LVX === "S" || r.LVX === "I")) {
    A.rules.push({ k: "!", txt: "CA-SFM : lévofloxacine à forte posologie au minimum ; son activité est à considérer comme inférieure à celle de la ciprofloxacine." });
  }

  // p. 14 et 15 — recherche de β-lactamase par test chromogénique avant de
  // rendre une pénicilline sensible. L'EUCAST ne l'exige pas.
  if (id === "nmeningitidis" && ["PEN", "AMX", "AMP"].some(k => r[k] === "S" || r[k] === "I")) {
    A.alerts.push({ lvl: "warn", txt: "CA-SFM : rechercher une β-lactamase par test chromogénique avant de rendre la pénicilline G ou une aminopénicilline sensible — ces souches réémergent." });
  }
  if (id === "moraxella" && ["AMX", "AMP"].some(k => r[k] === "S" || r[k] === "I")) {
    A.alerts.push({ lvl: "warn", txt: "CA-SFM : rechercher la β-lactamase par test chromogénique. Les souches non productrices (< 1 %) peuvent être rendues sensibles aux aminopénicillines ; les autres sont résistantes." });
  }

  // p. 11 — S. saprophyticus : le dépistage à l'ampicilline ne suffit pas.
  if (id === "ssaprophyticus" && (r.AMX === "S" || r.AMP === "S")) {
    A.alerts.push({ lvl: "warn", txt: "CA-SFM : un dépistage négatif à l'ampicilline ne suffit pas chez S. saprophyticus — vérifier aussi que la souche est méticillino-sensible avant de rendre l'amoxicilline sensible." });
  }

  // p. 16 et 17 — anaérobies : le CA-SFM travaille sur gélose Brucella (BBA)
  // et non sur FAA, et ne teste ni pénicilline G ni ampicilline.
  if (g === "bfragilis" || g === "cperfringens" || g === "cdifficile") {
    A.rules.push({ k: "⚗", txt: "CA-SFM : antibiogramme des anaérobies sur gélose Brucella (BBA), pas sur FAA ; amoxicilline testée directement plutôt que déduite de la pénicilline G." });
    if (g === "cdifficile") {
      A.alerts.push({ lvl: "info", txt: "CA-SFM : l'antibiogramme de C. difficile isolé de selles n'est pas recommandé en France, et le comité ne propose pas de seuils propres à cette espèce." });
    }
  }

  // p. 10 — Burkholderia cepacia complex : chapitre supprimé en 2026.
  if (g === "burk") {
    A.alerts.push({ lvl: "warn", txt: "CA-SFM 2026 : le chapitre Burkholderia cepacia et ses concentrations critiques cliniques ont été supprimés. Seule la microdilution en milieu liquide est adaptée, et les CMI s'interprètent face aux valeurs PK/PD (fiche pratique, annexe 3)." });
  }

  // p. 18 — genres pour lesquels le CA-SFM adapte les valeurs du CLSI.
  if (g === "acineto") {
    A.rules.push({ k: "📕", txt: "CA-SFM : pipéracilline-tazobactam, ceftazidime, céfépime et minocycline sur des valeurs adaptées du CLSI M100 — l'EUCAST n'en propose pas. Pour la minocycline, le seuil « R » est celui de l'ECOFF (2 mg/L)." });
  }
  if (g === "steno") {
    A.rules.push({ k: "📕", txt: "CA-SFM : lévofloxacine et minocycline sur des valeurs adaptées du CLSI M100. La lévofloxacine est retenue à 1 mg/L, l'ECOFF EUCAST à 4 mg/L exposerait à des doses toxiques ; la minocycline a son seuil « R » à l'ECOFF (2 mg/L)." });
  }

  // p. 5 — céfidérocol. L'EUCAST refuse d'y voir de vraies valeurs critiques
  // cliniques pour les non-fermentants et propose une stratification en trois
  // niveaux de probabilité ; le CA-SFM s'en tient à deux niveaux, sur la
  // valeur PK/PD. Chez les entérobactéries, il écarte la méthode des disques.
  if (r.FDC !== undefined && r.FDC !== null && r.FDC !== "") {
    if (g === "acineto" || g === "steno") {
      A.rules.push({ k: "📕", txt: "CA-SFM : pour le céfidérocol, le rendu est à deux niveaux — « utilisation possible » ou « utilisation déconseillée » — sur la valeur critique PK/PD de 2 mg/L, et non une catégorisation clinique. Les diamètres ne servent qu'à dépister les souches sensibles." });
    } else if (GROUPES_ENTEROBACTERALES_SRV.indexOf(g) !== -1) {
      A.rules.push({ k: "⚗", txt: "CA-SFM : céfidérocol à tester uniquement par microdilution en milieu liquide chez les entérobactéries — la corrélation diamètre/CMI fait défaut sur les souches multirésistantes, celles où le test est utile." });
    }
  }
}

/* ============================================================
   POURQUOI CE PHÉNOTYPE, ET AVEC QUELLE ASSURANCE

   Le § 7 du cahier des charges demande, pour chaque hypothèse, les arguments
   en faveur, les éléments discordants et un niveau de confiance. Le moteur
   rendait une conclusion ; il rend maintenant le chemin qui y mène.

   LES CRITÈRES SONT ÉNONCÉS AU POINT DE DÉCISION, à côté de la condition qui
   les teste. C'est délibéré : une grille écrite à part, dans un coin du
   fichier, finirait par décrire autre chose que ce que le moteur fait
   réellement — et un raisonnement faux présenté comme une explication est
   pire qu'une conclusion sans explication.

   Trois niveaux de confiance, adossés à ce qu'on a en main et non à une
   impression :

     confirmé   un test de confirmation figure au dossier et l'appuie
     probable   le profil est complet et rien ne le contredit
     possible   un élément discorde, ou une molécule clé n'a pas été testée

   « Possible » n'est pas un demi-échec : c'est l'état normal d'un
   antibiogramme incomplet, et le dire vaut mieux que de conclure quand même.
   ============================================================ */
function parce(A, r, grille) {
  const g = grille || {};
  A.pour = []; A.contre = []; A.nonTeste = [];

  (g.pour || []).forEach(function (cr) {
    const code = cr[0], attendu = cr[1], texte = cr[2];
    const nom = nomAbx(code);
    if (!has(r, code)) { A.nonTeste.push({ abx: code, txt: nom + " — " + texte }); return; }
    const v = r[code];
    if (attendu.indexOf(v) !== -1) A.pour.push({ abx: code, cat: v, txt: nom + " " + v + " : " + texte });
    else A.contre.push({ abx: code, cat: v, txt: nom + " " + v + " : " + texte + " — attendu ici" });
  });

  // Ce qui, si on l'observe, affaiblit l'hypothèse. Son absence ne prouve
  // rien et ne vaut donc pas argument : on se tait.
  (g.contre || []).forEach(function (cr) {
    const code = cr[0], attendu = cr[1], texte = cr[2];
    if (!has(r, code)) return;
    if (attendu.indexOf(r[code]) !== -1)
      A.contre.push({ abx: code, cat: r[code], txt: (nomAbx(code)) + " " + r[code] + " : " + texte });
  });

  if (g.confirme) {
    A.confirmation = g.confirme;
    A.confiance = "confirmé";          // clé stable : voir confianceLibelle()
  } else if (A.contre.length) {
    A.confiance = "possible";
  } else if (A.nonTeste.length) {
    A.confiance = "possible";
  } else {
    A.confiance = "probable";
  }
  if (g.aConfirmerPar) A.aConfirmerPar = g.aConfirmerPar;
  return A;
}

/* ============================================================
   CONTRÔLES DE COHÉRENCE

   § 9 du cahier des charges. Le moteur n'en faisait qu'un : signaler une
   molécule rendue « S » alors qu'une résistance naturelle est attendue. Les
   suivants s'ajoutent, et aucun n'est inventé — chacun repose soit sur une
   impossibilité mécanistique, soit sur une absence de seuil, soit sur un
   désaccord entre deux mesures qui devraient s'accorder.

   Ce qui N'EST PAS fait, et qu'il vaut mieux dire : la pureté de la culture
   et la validité du milieu ne se déduisent pas d'un antibiogramme. Les
   inventer aurait produit des alertes sans fondement, ce qui apprend aux
   utilisateurs à les ignorer — le pire résultat possible pour une alerte.

   QUATRE NIVEAUX, comme le demande le § 9 :

     info     information, aucune action attendue
     warn     à vérifier avant de rendre
     crit     alerte majeure
     stop     interprétation impossible en l'état

   Et une règle absolue : une alerte ne modifie JAMAIS une donnée brute. La
   lecture interprétative, elle, en modifie — mais elle est déclarée, montrée
   à côté du résultat lu, et motivée. C'est l'inverse d'un silence.
   ============================================================ */

// Espèces dont la céphalosporinase est INDUCTIBLE. Le clavulanate l'induit,
// si bien qu'une amoxicilline-acide clavulanique peut y paraître moins active
// que l'amoxicilline seule. Ailleurs, ce serait une impossibilité.
const AMPC_INDUCTIBLE = ["enterobacter"];

/* Un inhibiteur ne retire qu'un obstacle : l'association ne peut pas être
   moins active que la molécule seule. Sauf chez les espèces ci-dessus, où
   l'inhibiteur induit l'enzyme — et c'est alors un résultat attendu, pas une
   erreur. */
const COUPLES_INHIBITEUR = [
  ["AMX", "AMC", "l'acide clavulanique ne retire qu'un obstacle"],
  ["AMP", "AMC", "l'acide clavulanique ne retire qu'un obstacle"]
];

/* Les prélèvements que l'interface propose, et le site de seuils que chacun
   appelle. Les référentiels ne distinguent que TROIS sites — ordinaire,
   urinaire, méningé — et seuls deux prélèvements en appellent un autre que
   l'ordinaire. Les autres n'ont rien à dire au moteur, et c'est écrit ici
   plutôt que supposé. */
const PRELEVEMENT_SITE = {
  "LCR": { ctx: "mening", dit: "méningé", table: "mening",
           quoi: "les seuils méningés, plus stricts" },
  "ECBU (urines)": { ctx: "urin", dit: "cystite simple", table: "urin",
           quoi: "les seuils urinaires" }
};

/* Les molécules saisies dont le SITE change le seuil. Sans elles,
   l'avertissement n'aurait aucune conséquence — et un avertissement sans
   conséquence finit par être ignoré, y compris le jour où il en a une. */
function moleculesDuSite(table, groupe, r) {
  const src = table === "mening" ? BP_MENINGE : BP_URIN;
  const t = (src || {})[groupe] || {};
  return Object.keys(t).filter(function (k) {
    return r[k] !== undefined && r[k] !== "";
  });
}

/* L'EUCAST DONNE CERTAINS SEUILS ENTRE PARENTHÈSES, et ce n'est pas une
   coquetterie typographique. Ils sont fondés sur l'ECOFF : ils séparent la
   souche sauvage de celle qui a acquis un mécanisme, et — le document l'écrit
   — « ECOFFs do not predict clinical susceptibility ». La note 12 va plus
   loin : « clinical evidence as monotherapy is usually lacking […] Reporting
   S or I should be avoided and if considered necessary, there should be a
   comment to explain the need for adjunctive measures ».

   PhénoBac appliquait la valeur et perdait la réserve. Il rendait donc une
   colistine ou un aminoside « sensible » sur un seuil qui ne le promet pas.
   Il ne CHANGE pas la catégorie — le document ne le demande pas — il joint le
   commentaire que le document réclame. */
function seuilEcoff(group, k) { return !!ECOFF[group + ":" + k]; }

function coherence(A, r, org, c) {
  const ajoute = (lvl, txt) => A.alerts.push({ lvl: lvl, txt: txt });

  /* --- 0 bis. Les seuils fondés sur l'ECOFF ---
     La parenthèse est celle de l'EUCAST. Sous CA-SFM, c'est le seuil français
     qui s'applique, et le comité y a ses propres choix : joindre la réserve de
     l'autre référentiel la rendrait fausse. */
  if (org && org.bpGroup && !estCasfm()) {
    const vises = Object.keys(r).filter(function (k) {
      return (r[k] === "S" || r[k] === "I") && seuilEcoff(org.bpGroup, k);
    });
    if (vises.length) {
      A.rules.push({ k: "⟨⟩", txt:
        "EUCAST : " + vises.map(function (k) { return nomAbx(k); }).join(", ")
        + tr(" — seuil donné entre parenthèses, fondé sur l'ECOFF. Il distingue la souche "
           + "sauvage de celle qui a acquis un mécanisme, et ne prédit PAS le succès "
           + "clinique : la preuve en monothérapie manque le plus souvent. Le référentiel "
           + "demande d'éviter de rendre « sensible » sans commentaire, et de préciser "
           + "les mesures associées (note 12).",
             " — breakpoint given in brackets, based on the ECOFF. It separates the wild type "
           + "from an isolate that has acquired a mechanism, and does NOT predict clinical "
           + "success: evidence as monotherapy is usually lacking. The table asks that "
           + "\"susceptible\" not be reported without a comment, and that the accompanying "
           + "measures be stated (note 12).") });
    }
  }

  /* --- 0. LE PRÉLÈVEMENT DÉCLARÉ ET LE CONTEXTE DISENT-ILS LA MÊME CHOSE ? ---

     Le champ « Prélèvement » paraît sur le compte rendu et part à la
     surveillance, mais il ne commandait RIEN. Le site des seuils vient de
     questions séparées. On pouvait donc choisir « LCR », ne pas répondre à la
     question méningée, et obtenir des seuils de site ordinaire sur un isolat
     de liquide céphalo-rachidien — avec « Prélèvement : LCR » imprimé juste à
     côté. Les deux champs pouvaient se contredire sans que rien ne le dise.

     On ne décide pas à la place du biologiste : c'est lui qui sait si le
     prélèvement relève du cadre méningé ou de la cystite simple. On le
     CONFRONTE, ce qui est le rôle même du § 9. */
  const prel = c && c.prelevement;
  if (prel) {
    const attendu = PRELEVEMENT_SITE[prel];
    if (attendu && c[attendu.ctx] !== "Oui") {
      const vises = moleculesDuSite(attendu.table, org && org.bpGroup, r);
      if (vises.length) {
        ajoute("warn", "Prélèvement déclaré « " + prel + " », mais le contexte « "
          + attendu.dit + " » n'est pas renseigné : "
          + vises.map(function (k) { return nomAbx(k); }).join(", ")
          + (vises.length > 1 ? " sont catégorisé" : " est catégorisé")
          + (vises.length > 1 ? "s" : "") + " sur les seuils de site ordinaire, et non sur "
          + attendu.quoi + ".");
      }
    }
    Object.keys(PRELEVEMENT_SITE).forEach(function (p) {
      const d = PRELEVEMENT_SITE[p];
      if (p !== prel && c[d.ctx] === "Oui") {
        ajoute("warn", "Contexte « " + d.dit + " » renseigné, mais le prélèvement déclaré "
          + "est « " + prel + " » : le compte rendu portera l'un et les seuils l'autre. "
          + "Corrigez l'un des deux.");
      }
    });
  }

  /* --- 1. L'association moins active que la molécule seule --- */
  const inductible = org && AMPC_INDUCTIBLE.indexOf(org.engine) !== -1;
  COUPLES_INHIBITEUR.forEach(function (x) {
    const seule = x[0], assoc = x[1];
    if (r[seule] !== "S" || !isRI(r[assoc])) return;
    if (inductible) {
      ajoute("info", `${nomAbx(seule)} sensible et ${nomAbx(assoc)} non : chez cette espèce, `
        + `l'acide clavulanique INDUIT la céphalosporinase. Le résultat est attendu et n'est pas une erreur.`);
    } else {
      ajoute("warn", `${nomAbx(seule)} sensible et ${nomAbx(assoc)} non : ${x[2]}, `
        + `l'association ne peut donc pas être moins active que la molécule seule. `
        + `Erreur de transcription ou inversion de disques probable — vérifier avant de rendre.`);
    }
  });

  /* --- 2. Méticilline : deux mesures qui doivent s'accorder --- */
  if (org && org.engine === "staph" && has(r, "FOX") && has(r, "OXA")
      && isRI(r.FOX) !== isRI(r.OXA)) {
    ajoute("warn", "Céfoxitine et oxacilline en désaccord : elles dépistent la même résistance. "
      + "La céfoxitine fait référence ; confirmer par détection de la PLP2a ou recherche de mecA/mecC "
      + "avant de conclure.");
  }

  /* --- 3. Identification douteuse plutôt que faute de frappe --- */
  if (org && org.intrinsic) {
    const contredites = Object.keys(org.intrinsic).filter(k => r[k] === "S");
    if (contredites.length >= 2) {
      /* § 25 : en cas d'incertitude, ne pas deviner. Si l'espèce est
         probablement fausse, le phénotype qu'on en tirerait l'est aussi —
         et un phénotype faux est plus dangereux qu'une absence de
         conclusion. On le dit, et on le dit AVANT le verdict. */
      const listeContredites = contredites.map(k => nomAbx(k)).join(", ");
      A.nonSecurise = tr(
        `${contredites.length} résistances naturelles de cette espèce sont contredites (${listeContredites}). `
        + `Une seule serait une erreur de saisie ; plusieurs ensemble évoquent une identification `
        + `erronée. Reprendre l'identification avant d'interpréter cet antibiogramme : le phénotype `
        + `ci-dessous ne vaut que si l'espèce est la bonne.`,
        `${contredites.length} intrinsic resistances of this species are contradicted (${listeContredites}). `
        + `One alone would be a data-entry error; several together suggest a wrong identification. `
        + `Repeat the identification before interpreting this susceptibility test: the phenotype below `
        + `holds only if the species is right.`);
      ajoute("stop", A.nonSecurise);
    }
  }

  /* --- 4. Molécules que le référentiel ne sait pas juger ici --- */
  // Déjà dit couple par couple en mode diamètre ; en S/I/R, le résultat est
  // repris tel quel et rien ne signalait l'absence de seuil.
  return A;
}

/* Les conditions déclarées, confrontées à ce que le référentiel exige.

   Trois principes, et ils ne souffrent pas d'exception :
     — une condition non renseignée ne produit RIEN. Le silence n'est pas une
       non-conformité, et une alerte qui tombe parce qu'on n'a pas répondu
       apprend à fermer le panneau ;
     — chaque alerte dit ce qui a été déclaré, ce qui est exigé, et l'effet
       attendu sur la mesure : un diamètre faussement grand ne se corrige pas
       de la même façon qu'un diamètre faussement petit ;
     — ce qui invalide la mesure arrête l'interprétation. Rendre un phénotype
       tiré de diamètres non interprétables serait pire que ne rien rendre.
*/
function conditionsTechniques(A, org, ctx, mode) {
  if (!org || !ctx) return;
  const ajoute = (lvl, txt) => A.alerts.push({ lvl: lvl, txt: txt });
  const stop = txt => { A.nonSecurise = txt; ajoute("stop", txt); };

  /* --- La pureté. Elle vaut quel que soit le mode de saisie : un
         antibiogramme de culture mixte n'appartient à aucune espèce. --- */
  if (ctx.pur === "mixte")
    stop("Culture déclarée NON PURE. Un antibiogramme lu sur plusieurs espèces mélangées ne se "
       + "rapporte à aucune : chaque diamètre est la somme de ce que font deux souches. Réisoler sur "
       + "milieu non sélectif et recommencer. Aucune interprétation n'est rendue.");

  if (mode !== "diam") return;   // tout ce qui suit est propre à la méthode des disques

  /* --- La croissance. EUCAST § 7.1.1 : le test DOIT être recommencé. --- */
  if (ctx.nappe === "colonies")
    stop("Colonies individuelles visibles au lieu d'une nappe confluente : l'inoculum était trop "
       + "léger. L'EUCAST (§ 7.1.1) impose de recommencer le test — un inoculum trop léger agrandit "
       + "toutes les zones, et rend sensible ce qui ne l'est pas. Aucune interprétation n'est rendue.");

  /* --- Les zones doubles. La règle est nuancée, et la nuance compte. --- */
  if (ctx.zones === "doubles") {
    if (ctx.pur === "pur")
      ajoute("info", "Zones doubles ou colonies dans les zones, sur une culture vérifiée pure : "
        + "l'EUCAST (§ 8.9.1) demande alors de TENIR COMPTE de ces colonies dans la mesure du "
        + "diamètre — c'est-à-dire de mesurer la zone intérieure, pas la zone extérieure.");
    else
      ajoute("crit", "Zones doubles ou colonies dans les zones, sans vérification de pureté. "
        + "L'EUCAST (§ 8.9.1) demande de contrôler la pureté et de recommencer si nécessaire : "
        + "c'est le premier signe d'une culture mixte. Vérifier avant de rendre.");
  }

  const C = CONDITIONS[org.bpGroup];

  /* --- L'espèce relève-t-elle seulement de la méthode des disques ? --- */
  if (C && C.horsMethode) { stop(C.horsMethode); return; }
  if (!C) return;          // espèce non couverte par les documents : on se tait

  /* --- Le milieu. --- */
  if (ctx.milieu && ctx.milieu !== C.milieu)
    ajoute("crit", "Gélose déclarée : " + (COND_MILIEU_DIT[ctx.milieu] || ctx.milieu) + ". Le référentiel "
      + "exige pour cette espèce " + (COND_MILIEU_DIT[C.milieu] || C.milieu) + ". Les diamètres critiques "
      + "ont été établis sur ce milieu-là et sur aucun autre : lus sur un autre, ils ne sont pas "
      + "comparables aux seuils.");

  /* --- L'atmosphère. --- */
  if (ctx.atmo && ctx.atmo !== C.atmo)
    ajoute("crit", "Atmosphère déclarée : " + (COND_ATMO_DIT[ctx.atmo] || ctx.atmo) + ". Le référentiel "
      + "exige " + (COND_ATMO_DIT[C.atmo] || C.atmo) + " pour cette espèce. Le CO2 acidifie la gélose et "
      + "déplace les zones de plusieurs millimètres, dans un sens qui dépend de la molécule.");

  /* --- La température. --- */
  if (ctx.tempC !== undefined && ctx.tempC !== null && ctx.tempC !== "") {
    const tc = parseFloat(String(ctx.tempC).replace(",", "."));
    if (!isNaN(tc) && (tc < C.tmin || tc > C.tmax))
      ajoute("crit", "Température déclarée : " + tc + " °C. Le référentiel exige " + C.tmin + "-" + C.tmax
        + " °C pour cette espèce. Hors de cet intervalle, la croissance et la diffusion ne se font plus "
        + "à la même vitesse, et les diamètres ne valent plus.");
  }

  /* --- La durée. Les deux sens d'erreur n'ont pas le même danger. --- */
  if (ctx.dureeH !== undefined && ctx.dureeH !== null && ctx.dureeH !== "") {
    const h = parseFloat(String(ctx.dureeH).replace(",", "."));
    if (!isNaN(h) && h > C.hmax)
      ajoute("crit", "Incubation déclarée : " + h + " h, au-delà des " + C.hmin + "-" + C.hmax + " h exigées. "
        + "L'EUCAST (§ 6.3.1) l'interdit : une incubation prolongée fait pousser des colonies DANS les "
        + "zones et fait rendre résistantes des souches qui ne le sont pas."
        + (C.note ? " " + C.note : ""));
    else if (!isNaN(h) && h < C.hmin)
      ajoute("crit", "Incubation déclarée : " + h + " h, en deçà des " + C.hmin + "-" + C.hmax + " h exigées. "
        + "Une lecture trop précoce donne des zones trop grandes, et fait rendre sensible ce qui ne l'est pas.");
  }

  /* --- L'épaisseur de la gélose. --- */
  if (ctx.epaisseur === "hors")
    ajoute("warn", "Épaisseur de gélose déclarée hors de 4,0 ± 0,5 mm (EUCAST § 2.2). Une gélose trop "
      + "épaisse rétrécit toutes les zones — donc fait rendre résistant ; trop mince, elle les agrandit. "
      + "L'erreur porte sur TOUTES les molécules à la fois, et les catégories restent plausibles.");

  /* --- L'inoculum. --- */
  if (ctx.mcf && ctx.mcf !== C.mcf) {
    if (ctx.mcf === "sans")
      ajoute("warn", "Inoculum non ajusté à un étalon de McFarland. L'EUCAST (§ 3.3) le chiffre à "
        + C.mcf + " pour cette espèce : un inoculum plus dense rétrécit les zones, un inoculum plus "
        + "léger les agrandit.");
    else
      ajoute("crit", "Inoculum déclaré à McFarland " + ctx.mcf + ". Le référentiel exige McFarland "
        + C.mcf + " pour cette espèce.");
  }

  /* --- Les délais. --- */
  if (ctx.delais === "non")
    ajoute("warn", "Règle des 15-15-15 non respectée (EUCAST § 3.4, 4.6 et 6.1 : suspension employée "
      + "dans les 15 min, disques posés dans les 15 min, plaques à l'étuve dans les 15 min). Un délai "
      + "avant la pose des disques laisse la souche pousser et rétrécit les zones ; un délai après la "
      + "pose laisse l'antibiotique diffuser et les agrandit.");

  /* --- Les réserves propres à l'espèce. Elles ne dépendent d'aucune
         non-conformité : elles disent ce que le référentiel demande EN PLUS
         pour cette espèce, et ne valent d'être rappelées qu'à celui qui a
         ouvert le panneau — sinon elles s'ajouteraient à chaque antibiogramme. --- */
  const renseigne = ["milieu","atmo","tempC","dureeH","epaisseur","mcf","delais","nappe","zones"]
    .some(k => ctx[k] !== undefined && ctx[k] !== null && ctx[k] !== "");
  if (C.note && renseigne) ajoute("info", C.note);
}

/* ============================================================
   LE COMMENTAIRE EN CINQ MOMENTS — § 15

   Le § 15 veut un commentaire « court, professionnel et directement
   copiable » qui DISTINGUE cinq choses : l'observation, l'interprétation,
   l'hypothèse mécanistique, les limites, et l'éventuel test complémentaire.
   Soixante commentaires sont rédigés dans ce fichier, phénotype par
   phénotype, et ils sont bons — mais ils portent surtout l'interprétation et
   la conduite. Les quatre autres moments existaient ailleurs, en pièces
   détachées : A.pour, A.mech, A.contre, A.confiance, A.aConfirmerPar.

   On les COMPOSE donc, plutôt que de réécrire soixante textes — ce qui en
   abîmerait la clinique pour servir une mise en forme.

   TROIS RÈGLES DE RÉDACTION, et la première est de sécurité :

     — § 3 : tant qu'aucun test ne l'a tranchée, une hypothèse mécanistique
       se dit « compatible avec », « évoque », « suggère ». Jamais
       « confirmé ». Le moment 3 porte donc cette prudence dans sa formule
       même, et non dans le bon vouloir de celui qui a rédigé le texte ;

     — un moment sans matière est OMIS. Une rubrique vide — « Limites :
       néant » — apprend à sauter les rubriques, et c'est celle des limites
       qu'on sauterait ;

     — le texte se termine par la validation biologique. C'est la dernière
       phrase de l'exemple du § 15, et la seule qui doit toujours s'y
       trouver.
   ============================================================ */
const COMMENT_MOMENTS = ["Observation", "Interprétation", "Hypothèse mécanistique",
                         "Limites", "Test complémentaire"];

function commentaireStructure(A) {
  const m = [];

  /* 1. OBSERVATION — ce qui a été lu, et rien de plus. Les arguments en
     faveur SONT les observations : « céfotaxime R », « céfoxitine S ».
     On reprend la molécule et sa catégorie, sans le commentaire qui les
     explique — celui-ci relève déjà de l'interprétation. */
  const vus = (A.pour || []).map(x => nomAbx(x.abx) + " " + x.cat);
  if (vus.length) m.push({ moment: tr("Observation", "Observation"),
    texte: tr("Profil observé : ", "Phenotype observed: ") + vus.join(", ") + "." });

  /* 2. INTERPRÉTATION — le texte rédigé pour ce phénotype. */
  if (A.comment) m.push({ moment: tr("Interprétation", "Interpretation"), texte: A.comment });

  /* 3. HYPOTHÈSE MÉCANISTIQUE — § 3 : prudente tant qu'elle n'est pas
     confirmée, affirmée quand un test l'a tranchée. */
  /* Un phénotype sauvage n'a pas d'hypothèse mécanistique : il n'y a pas de
     mécanisme à supposer. « Profil compatible avec aucun mécanisme acquis »
     est une contorsion, et le moment 2 l'a déjà dit mieux. Le § 15 veut
     cinq moments distingués, pas cinq moments remplis de force. */
  if (A.mech && !(A.sev === "wild" && !A.confirmation)) {
    // Beaucoup de textes de mécanisme finissent déjà par « À confirmer
    // (…) » : le moment 5 le redira mieux, avec la conduite. On retire donc
    // cette queue ici, au lieu de la laisser dire deux fois — un commentaire
    // qui se répète se fait sauter des lignes.
    const mech = A.mech.replace(/\s*À confirmer[^.]*\.?\s*$/i, "").trim();
    // Deux phrases plutôt qu'un deux-points enchâssé : « confirmé par X :
    // β-lactamase : synergie positive » enchaîne deux fois le même signe de
    // ponctuation et se lit mal.
    m.push({ moment: tr("Hypothèse mécanistique", "Mechanistic hypothesis"),
      texte: A.confirmation
        ? majuscule(mech) + (/[.!?]$/.test(mech) ? "" : ".")
          + tr(" Mécanisme confirmé par ", " Mechanism confirmed by ") + minuscule(A.confirmation) + "."
        : tr("Profil compatible avec ", "Phenotype consistent with ") + minuscule(mech)
          + (/[.!?]$/.test(mech) ? "" : ".") });
  }

  /* 4. LIMITES — ce qui empêche d'affirmer. Le niveau de confiance, les
     éléments discordants, et les molécules clés non testées. */
  const limites = [];
  if (A.confiance === "possible")
    limites.push(tr("hypothèse seulement possible en l'état",
                    "the hypothesis is only possible as things stand"));
  if ((A.contre || []).length)
    limites.push(tr("élément(s) discordant(s) : ", "discordant finding(s): ")
      + A.contre.map(x => x.txt).join(" ; "));
  if ((A.nonTeste || []).length)
    limites.push(tr("molécule(s) clé(s) non testée(s) : ", "key agent(s) not tested: ")
      + A.nonTeste.map(x => nomAbx(x.abx)).join(", "));
  if (!A.confirmation && A.aConfirmerPar)
    limites.push(tr("aucun test n'a confirmé le mécanisme", "no test has confirmed the mechanism"));
  if (limites.length) m.push({ moment: tr("Limites", "Limitations"),
    texte: majuscule(limites.join(" ; ")) + "." });

  /* 5. TEST COMPLÉMENTAIRE — seulement s'il reste quelque chose à trancher. */
  // Le texte du test porte souvent sa propre condition (« …, si le profil
  // surprend », « …, qui change la conduite »). L'enchâsser dans une phrase
  // plus longue en casserait la syntaxe : on le laisse entier, et la réserve
  // du § 15 vient APRÈS, dans une phrase à elle.
  if (!A.confirmation && A.aConfirmerPar) {
    const tst = A.aConfirmerPar.trim().replace(/\.$/, "");
    m.push({ moment: tr("Test complémentaire", "Further testing"),
      texte: tr("Pour trancher : ", "To settle it: ") + tst
           + tr(". À apprécier selon le contexte et le référentiel du laboratoire.",
                ". To be judged against the clinical context and the laboratory's own standard.") });
  }

  return m;
}

/* Changer la casse de la première lettre — mais SEULEMENT si c'est une
   lettre latine. « β-lactamase » commence par un bêta grec, que
   toUpperCase() transforme en « Β » : le mot devient méconnaissable, et
   c'est l'un des plus fréquents de toute l'application. */
const LATINE = /^[a-zA-ZÀ-ÖØ-öø-ÿ]/;
function minuscule(s) {
  return (s && LATINE.test(s)) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}
function majuscule(s) {
  return (s && LATINE.test(s)) ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/* Le texte à copier : les cinq moments à la suite, puis la validation
   biologique. Les étiquettes ne figurent PAS dans le texte copié — un
   compte rendu de laboratoire ne porte pas « Observation : » en tête de
   phrase. Elles servent à l'écran, où elles montrent que les cinq moments
   sont distingués. */
function commentaireCopiable(moments) {
  const corps = (moments || []).map(x => x.texte.trim()).filter(Boolean).join(" ");
  return (corps ? corps + " " : "") + "Validation biologique requise.";
}

/* ============================================================
   LA POSOLOGIE QUI FONDE LE SEUIL — § 15 du cahier « rendu et posologie »

   Une catégorie S ou I n'est valide que pour un schéma d'administration
   précis. « Sensible à forte posologie » sans la dose est inexploitable : le
   clinicien prescrira la dose habituelle, c'est-à-dire précisément celle dont
   le seuil dit qu'elle ne suffira pas.

   CE QUE CETTE FONCTION NE FAIT PAS. Elle ne prescrit rien. Elle rapporte le
   schéma que l'EUCAST a employé pour établir le seuil, pour le contexte
   déclaré. Aucune adaptation au poids, à la fonction rénale, à l'âge ou à la
   grossesse : le § 13 l'interdit, et ce serait de la prescription.
   ============================================================ */
function posologiePour(code, cat, ctx) {
  const schemas = POSO.POSOLOGIE[code];
  if (!schemas || !schemas.length) return null;
  const c = ctx || {};

  return schemas.map(function (e) {
    // Le contexte choisit la colonne, exactement comme il choisit le seuil.
    // Rendre un seuil méningé avec une dose ordinaire serait incohérent.
    if (c.mening === "Oui" && e.particulier && /^Meningitis/i.test(e.particulier)) {
      // La colonne « situations particulières » peut en contenir PLUSIEURS :
      // le céfotaxime y porte la méningite puis une note sur S. aureus. On
      // coupe au repère suivant, faute de quoi on rendrait deux consignes
      // collées comme si c'en était une seule.
      const m = e.particulier.replace(/^Meningitis\s*:?\s*/i, "")
                             .split(/\s(?=[A-Z][A-Za-z.\s]{2,20}:)/)[0].trim();
      return { voie: e.voie, schema: m, motif: tr("contexte méningé", "meningitis") };
    }
    if (c.urin === "Oui" && e.urinaire)
      return { voie: e.voie, schema: e.urinaire, motif: tr("cystite simple", "uncomplicated UTI") };

    // Catégorie I : c'est la posologie FORTE qui fonde le seuil. Quand
    // l'EUCAST n'en définit pas, on le dit — on n'en invente pas (§ 26).
    if (cat === "I") {
      return e.forte
        ? { voie: e.voie, schema: e.forte,
            motif: tr("sensible à forte posologie", "susceptible, increased exposure") }
        : { voie: e.voie, schema: null, motif: tr("forte", "increased exposure"),
            note: tr("l'EUCAST ne définit pas de posologie forte pour cette molécule",
                     "EUCAST defines no high-exposure dosage for this agent") };
    }
    return { voie: e.voie, schema: e.standard, motif: tr("posologie standard", "standard dosage") };
  }).filter(function (x) { return x.schema || x.note; });
}

/* ============================================================
   RENDU CIBLÉ — recommandation HAS du 5 octobre 2023

   Rendre une partie seulement des antibiotiques testés, pour épargner les
   molécules « critiques » — fluoroquinolones et carbapénèmes en premier lieu.
   C'est le levier de maîtrise des antibiotiques le plus puissant dont dispose
   un laboratoire : il ne coûte rien et agit sur chaque prescription.

   MASQUER EST UN ACTE GRAVE. Cinq garde-fous, tous tirés du document :

     1. DÉSACTIVÉ par défaut. Sans décision du laboratoire, tout est rendu.
     2. PÉRIMÈTRE ÉTROIT, et s'en écarter n'est pas une approximation :
        entérobactéries, ECBU, patiente de 12 ans ou plus. Hors de là la
        recommandation n'est pas validée, et le rendu reste complet.
     3. UNE MOLÉCULE RÉSISTANTE EST TOUJOURS RENDUE. Le document l'écrit :
        « en plus des molécules prévues dans le rendu ciblé, il est
        recommandé de rendre également les autres antibiotiques testés pour
        lesquels la souche est catégorisée résistante ».
     4. RIEN N'EST EFFACÉ. Les molécules masquées restent dans l'état, dans
        les exports et dans la surveillance — le document le demande aussi :
        « l'antibiogramme complet reste disponible sur demande ».
     5. UNE ALERTE NE SE MASQUE JAMAIS. Une molécule qui porte une alerte de
        cohérence est rendue visible, alerte comprise. Taire un signal de
        danger pour économiser une ligne serait indéfendable.
   ============================================================ */
const RC = (typeof module !== "undefined" && module.exports)
  ? require("./rendu-cible")
  : (racine.PhenoBacRenduCible || { RENDU_CIBLE: {}, RENDU_CIBLE_SOURCE: null });

// Les groupes de seuils qui SONT des entérobactéries. Salmonella et Shigella
// en font partie, mais un ECBU n'en isole pas : le périmètre les écarte de
// lui-même, par le prélèvement.
const RC_GROUPES = ["entero", "morganella", "salmonella", "serratia"];

/* Les molécules « de première intention » de la cystite ne sont pas une liste
   que j'écris : ce sont celles que le tableau rend dans sa première colonne.
   La donnée définit sa propre condition, et aucune liste parallèle ne peut
   diverger d'elle. */
function rcPremiereIntention() {
  const tb = RC.RENDU_CIBLE.cystite;
  if (!tb) return [];
  const col = tb.colonnes[0];
  const out = [];
  tb.lignes.forEach(function (l) {
    if (l.rendre.indexOf(col) !== -1) l.codes.forEach(function (c) {
      if (out.indexOf(c) === -1) out.push(c);
    });
  });
  return out;
}

/* « Sensible » au sens du document : « sensible à posologie standard ou
   sensible à forte posologie » — donc S ou I. Le lire autrement ferait
   basculer de colonne, et masquerait des molécules actives. */
function rcActif(v) { return v === "S" || v === "I"; }

/* La colonne du tableau, choisie par le phénotype. On va du plus résistant au
   moins résistant : un profil BLSE relève de la dernière colonne même si
   l'amoxicilline y est accessoirement résistante. */
function rcColonne(cle, r, A) {
  const tb = RC.RENDU_CIBLE[cle];
  if (!tb) return null;
  if (cle === "cystite") {
    const prem = rcPremiereIntention().filter(function (c) { return r[c] !== undefined; });
    const uneActive = prem.some(function (c) { return rcActif(r[c]); });
    if (uneActive) return "premiereIntentionS";
    if (!rcActif(r.AMC) && !rcActif(r.CFM)) return "premiereEtAmcEtCfmR";
    return "premiereIntentionR";
  }
  // Tableaux « sans renseignement » et « pyélonéphrite » : mêmes colonnes.
  const blse = /BLSE/i.test(A && A.name || "");
  const c3gAtteinte = (r.CTX !== undefined && !rcActif(r.CTX))
                   || (r.CRO !== undefined && !rcActif(r.CRO))
                   || (r.CAZ !== undefined && !rcActif(r.CAZ));
  if (blse || c3gAtteinte) return "c3gRouBlse";
  if (r.AMC !== undefined && !rcActif(r.AMC)
      && r.SXT !== undefined && !rcActif(r.SXT)) return "amcEtSxtR";
  if (r.AMX !== undefined && !rcActif(r.AMX)) return "amoxR";
  return "amoxS";
}

/* ============================================================
   § 2.1.3 ET LES NOTES (A) (B) (C) — CE QUE LES COULEURS NE DISENT PAS

   Les cases coloriées ne sont que la moitié de la recommandation. Sous
   chaque tableau, trois notes retirent des molécules que la case avait
   rendues, et le § 2.1.3 en pose sept règles de plus. Rendre le tableau
   sans les notes, c'est mettre un carbapénème sur la feuille là où le
   document l'écarte — l'inverse exact de ce qu'on cherche.

   Les listes viennent du document (RENDU_CIBLE_LISTES, lues DANS les notes
   qui les citent). Ne restent ici que deux choses, et elles sont dites :
   la correspondance entre un nom français et un code PhénoBac, et la
   condition de chaque règle.
   ============================================================ */

/* Nom du document → codes PhénoBac. Une famille en vaut plusieurs ; une
   molécule que PhénoBac ne teste pas vaut la liste vide, et c'est une
   réponse, pas un oubli. La vérification plus bas refuse tout nom absent
   d'ici : un nom non traduit serait une règle silencieusement sautée. */
const RC_NOM_CODES = {
  "amoxicilline-acide clavulanique": ["AMC"],
  "céphalosporines": null,                 // famille : résolue sur les tableaux
  "témocilline": ["TEM"],
  "pipéracilline-tazobactam": ["TZP"],
  "aztréonam": ["ATM"],
  "imipénème": ["IPM"], "méropénème": ["MEM"], "ertapénème": ["ETP"],
  "céfixime": ["CFM"], "céfotaxime": ["CTX"], "ceftriaxone": ["CRO"],
  "céfidérocol": ["FDC"],
  "ceftolozane-tazobactam": [], "ceftazidime-avibactam": [],
  "imipénème-relebactam": [], "méropénème-vaborbactam": []
};

/* Les entérobactéries du groupe 3, nommées par la note (A). PhénoBac n'en
   connaît que quatre ; les quatre autres valent null, ce qui est une
   réponse vérifiable — le banc refuse qu'une espèce du groupe 3 entre dans
   PhénoBac sans être classée ici. */
const RC_GROUPE3_ORG = {
  "Enterobacter cloacae complex": "ecloacae",
  "Klebsiella aerogenes": "kaerogenes",
  "Citrobacter freundii complex": "cfreundii",
  "Serratia marcescens": "serratia",
  "Morganella morganii": "mmorganii",
  "Providencia spp": "providencia",
  "Pantoea agglomerans": null,
  "Hafnia spp": null
};

/* La famille « céphalosporines » de la note (B) n'est pas une liste que
   j'écris : ce sont les lignes de céphalosporine DES TABLEAUX eux-mêmes. */
function rcCephalosporines() {
  const out = [];
  Object.keys(RC.RENDU_CIBLE || {}).forEach(function (cle) {
    RC.RENDU_CIBLE[cle].lignes.forEach(function (l) {
      if (/^c[ée]f|^ceft/i.test(l.molecule)) l.codes.forEach(function (c) {
        if (out.indexOf(c) === -1) out.push(c);
      });
    });
  });
  if (out.length < 5) throw new Error(
    "rendu ciblé : " + out.length + " céphalosporine(s) trouvée(s) dans les tableaux. "
    + "La note (B) s'appuie sur cette famille ; incomplète, elle laisserait rendre un "
    + "carbapénème alors qu'une céphalosporine reste active.");
  return out;
}

/* Traduit une liste du document en codes PhénoBac, et s'arrête sur un nom
   qu'elle ne sait pas traduire. */
function rcCodes(noms) {
  const out = [];
  (noms || []).forEach(function (nom) {
    const cle = nom.toLowerCase().trim();
    if (!(cle in RC_NOM_CODES)) throw new Error(
      "rendu ciblé : « " + nom + " » est cité par une note de la HAS mais n'a pas de "
      + "correspondance dans RC_NOM_CODES. La règle qui s'appuie sur cette liste serait "
      + "appliquée à côté, sans rien dire.");
    const codes = RC_NOM_CODES[cle] === null ? rcCephalosporines() : RC_NOM_CODES[cle];
    codes.forEach(function (c) { if (out.indexOf(c) === -1) out.push(c); });
  });
  return out;
}

/* Les codes d'une ligne du tableau, désignée par son libellé. Encore une
   fois : la donnée, pas une liste parallèle. */
function rcCodesLigne(cle, motif) {
  const tb = RC.RENDU_CIBLE[cle];
  const out = [];
  if (tb) tb.lignes.forEach(function (l) {
    if (motif.test(l.molecule)) l.codes.forEach(function (c) {
      if (out.indexOf(c) === -1) out.push(c);
    });
  });
  return out;
}

function rcGroupe3() {
  for (const esp in RC_GROUPE3_ORG) if (RC_GROUPE3_ORG[esp] === _activeId) return esp;
  return null;
}

/* Applique les notes et le § 2.1.3 à la liste des molécules que la couleur
   avait prévues. Retourne la liste corrigée, et le JOURNAL de ce qui a été
   retiré ou ajouté — car un masquage sans motif affichable est un masquage
   qu'on ne peut pas discuter. */
function rcRestreindre(cle, colonne, prevues, r, c, A) {
  const notes = (RC.RENDU_CIBLE_NOTES || {})[cle] || {};
  const listes = RC.RENDU_CIBLE_LISTES || {};
  const demande = c.demandeRecours === "Oui";
  const esp3 = rcGroupe3();
  const journal = [], horsPortee = [];
  const actif = function (k) { return r[k] === "S" || r[k] === "I"; };

  function oter(codes, lettre, pourquoi) {
    const pris = [];
    codes.forEach(function (k) {
      const i = prevues.indexOf(k);
      if (i !== -1) { prevues.splice(i, 1); pris.push(k); }
    });
    if (pris.length) journal.push({ sens: "retiré", codes: pris, note: lettre,
                                    texte: notes[lettre] || null, motif: pourquoi });
  }
  function mettre(codes, lettre, pourquoi) {
    const pris = [];
    codes.forEach(function (k) {
      if (r[k] !== undefined && r[k] !== "" && prevues.indexOf(k) === -1) {
        prevues.push(k); pris.push(k);
      }
    });
    if (pris.length) journal.push({ sens: "ajouté", codes: pris, note: lettre,
                                    texte: notes[lettre] || null, motif: pourquoi });
  }

  /* --- Note (A) — le céfépime plutôt que les C3G, pour le groupe 3 ---
     « En l'absence de BLSE ou de résistance aux C3G » : c'est exactement
     toute colonne autre que « C3G résistante ou BLSE ». */
  const c3g = rcCodes(listes.c3g);
  // « PRIVILÉGIER le rendu du céfépime PLUTÔT QUE » : c'est une substitution,
  // pas un retrait. Sans céfépime actif il n'y a rien à préférer, et retirer
  // les C3G laisserait la feuille sans céphalosporine utilisable.
  if (esp3 && cle !== "cystite" && colonne !== "c3gRouBlse" && actif("FEP")
      && c3g.some(function (k) { return prevues.indexOf(k) !== -1; })) {
    oter(c3g, "A", esp3 + tr(" appartient au groupe 3 : la HAS fait préférer le céfépime "
                           + "aux céphalosporines de 3e génération.",
                             " belongs to group 3: HAS prefers cefepime to the "
                           + "third-generation cephalosporins."));
    mettre(["FEP"], "A", tr("il remplace les céphalosporines de 3e génération.",
                            "it replaces the third-generation cephalosporins."));
  }

  /* --- Note (A) de la cystite — autre texte, autre règle --- */
  if (esp3 && cle === "cystite" && colonne !== "premiereIntentionS") {
    oter(["CFM"], "A", esp3 + tr(" appartient au groupe 3, et la souche résiste aux "
                               + "molécules de première intention.",
                                 " belongs to group 3, and the isolate is resistant to the "
                               + "first-line agents."));
  }

  /* --- Note (B) — les carbapénèmes, molécules de dernier recours --- */
  const carba = rcCodes(listes.carbapenemes);
  const etroites = rcCodes(listes.betalactaminesEtroites);
  if (demande) {
    mettre(carba, "B", tr("demandés par le clinicien.", "requested by the clinician."));
  } else if (cle === "cystite") {
    oter(carba, "B", tr("en cystite, le document ne les rend que sur demande du clinicien.",
      "in cystitis, the document reports them only at the clinician's request."));
  } else {
    const restent = etroites.filter(actif);
    if (restent.length) {
      oter(carba, "B", tr("une β-lactamine de spectre plus étroit reste active (",
                          "a narrower-spectrum beta-lactam is still active (")
                     + restent.map(function (k) { return nomAbx(k); }).join(", ") + ").");
    }
  }

  /* --- Note (C) — nouvelles associations et nouvelles céphalosporines --- */
  const nouvelles = rcCodes(listes.nouvelles);
  if (nouvelles.length) {
    if (demande) mettre(nouvelles, "C", tr("demandées par le clinicien.", "requested by the clinician."));
    else oter(nouvelles, "C", tr("rendues sur demande du clinicien, après avis spécialisé.",
      "reported at the clinician's request, after specialist advice."));
  }

  /* --- § 2.1.3 — les fluoroquinolones ---
     Le document écarte les fluoroquinolones dans DEUX cas. Le premier se
     lit sur l'antibiogramme : amoxicilline résistante, association sensible.
     Le second — « lorsque d'autres antibiotiques per os sont actifs » —
     suppose de savoir quelles molécules se prennent par la bouche, et
     PhénoBac n'a pas cette donnée : la table de posologies de l'EUCAST ne
     couvre ni le pivmécillinam, ni la nitrofurantoïne, ni le triméthoprime,
     ni le céfixime. Inventer la voie d'administration de quatre molécules
     pour masquer davantage serait exactement ce que le § 26 interdit. La
     règle est donc appliquée à MOITIÉ, et la moitié qui manque est dite. */
  const fq = rcCodesLigne(cle, /^Fluoroquinolones/i);
  if (cle !== "sansRenseignement" && fq.length) {
    if (r.AMX !== undefined && !actif("AMX") && actif("AMC")) {
      oter(fq, null, tr("§ 2.1.3 : souche résistante à l'amoxicilline mais sensible à "
                      + "l'association — le document écarte alors les fluoroquinolones.",
                        "\u00A7 2.1.3: an isolate resistant to amoxicillin but susceptible to the "
                      + "combination — the document then sets the fluoroquinolones aside."));
    }
    if (fq.some(function (k) { return prevues.indexOf(k) !== -1 && actif(k); }))
      horsPortee.push(tr("§ 2.1.3 écarte aussi les fluoroquinolones « lorsque d'autres "
        + "antibiotiques per os sont actifs ». PhénoBac ne connaît pas la voie "
        + "d'administration de toutes les molécules urinaires — la table de posologies "
        + "de l'EUCAST ne couvre ni le pivmécillinam, ni la nitrofurantoïne, ni le "
        + "triméthoprime, ni le céfixime — et n'applique pas cette moitié de la règle. "
        + "Une fluoroquinolone figure donc ici là où le document pourrait la retirer.",
          "\u00A7 2.1.3 also sets the fluoroquinolones aside \u0022when other oral antibiotics are "
        + "active\u0022. PhenoBac does not know the route of administration of every urinary "
        + "agent — the EUCAST dosage table covers neither pivmecillinam, nor nitrofurantoin, "
        + "nor trimethoprim, nor cefixime — and does not apply that half of the rule. A "
        + "fluoroquinolone therefore appears here where the document might remove it."));
  }

  return { prevues: prevues, journal: journal, horsPortee: horsPortee };
}

/* ============================================================
   § 2.1.4 — LES COMMENTAIRES QUI DOIVENT FIGURER AU COMPTE RENDU

   « Il est recommandé de faire figurer sur le compte rendu un commentaire
   précisant que tout ECBU positif ne nécessite pas obligatoirement de
   traitement antibiotique… » Le document ne se contente pas de dire quoi
   rendre : il dit quoi ÉCRIRE à côté. Une feuille amputée sans ces phrases
   laisse le clinicien devant une liste plus courte, sans savoir pourquoi,
   ni qu'une colonisation ne se traite pas, ni qu'il peut demander le reste.

   Chaque tableau a ses propres commentaires et ils DIFFÈRENT : la
   pyélonéphrite ne porte ni « en cas de cystite simple », ni le conseil sur
   le triméthoprime seul. Les commentaires numérotés, eux, sont attachés à
   des lignes du tableau — « (1) » sur le pivmécillinam, « (2) » sur le
   cotrimoxazole — et ne valent que si la molécule est effectivement rendue :
   conseiller le triméthoprime seul sur un compte rendu qui ne porte pas le
   cotrimoxazole n'aiderait personne.
   ============================================================ */
function commentairesCible(cle, rendues) {
  const tous = (RC.RENDU_CIBLE_COMMENTAIRES || {})[cle] || [];
  const tb = RC.RENDU_CIBLE[cle];
  const out = [];
  tous.forEach(function (c) {
    if (!c.appel) { out.push({ texte: c.texte, appel: null }); return; }
    // La condition est DANS la donnée : quelles lignes portent cet appel.
    const concernes = [];
    if (tb) tb.lignes.forEach(function (l) {
      if ((l.notes || []).indexOf(c.appel) !== -1)
        l.codes.forEach(function (k) { if (concernes.indexOf(k) === -1) concernes.push(k); });
    });
    if (concernes.some(function (k) { return rendues.indexOf(k) !== -1; }))
      out.push({ texte: c.texte, appel: c.appel, molecules: concernes.filter(function (k) {
        return rendues.indexOf(k) !== -1; }) });
  });
  return out;
}

function renduCible(A, r, ctx, org, actif) {
  const c = ctx || {};
  if (!actif) return null;                         // garde-fou 1

  // Garde-fou 2 : le périmètre. Chaque refus est NOMMÉ — « non applicable »
  // sans motif laisserait croire à une panne.
  if (!org || RC_GROUPES.indexOf(org.bpGroup) === -1)
    return { applique: false, motif: tr("la recommandation ne vaut que pour les entérobactéries",
      "the recommendation applies to the Enterobacterales only") };
  if (c.urin !== "Oui")
    return { applique: false, motif: tr("la recommandation ne vaut que pour les ECBU ; "
           + "renseignez le prélèvement urinaire",
             "the recommendation applies to urine cultures only; record the specimen as urine") };
  if (c.patiente !== "Oui")
    return { applique: false, motif: tr("la recommandation n'est validée que chez la femme adulte "
           + "à partir de 12 ans ; hors de ce cadre le rendu reste complet",
             "the recommendation is validated only in women aged 12 years and over; outside "
           + "that setting the full report stands") };

  const cle = c.typeIU === "Cystite" ? "cystite"
            : c.typeIU === "Pyélonéphrite" ? "pyelonephrite"
            : "sansRenseignement";
  const tb = RC.RENDU_CIBLE[cle];
  if (!tb) return { applique: false, motif: tr("tableau décisionnel absent", "decision table missing") };
  const colonne = rcColonne(cle, r, A);

  // Ce que le tableau prévoit de rendre dans cette colonne.
  let prevues = [];
  tb.lignes.forEach(function (l) {
    if (l.rendre.indexOf(colonne) !== -1) l.codes.forEach(function (x) {
      if (prevues.indexOf(x) === -1) prevues.push(x);
    });
  });

  // … puis ce que les notes et le § 2.1.3 en retirent, ou y ajoutent.
  const restr = rcRestreindre(cle, colonne, prevues, r, c, A);
  prevues = restr.prevues;

  // Les molécules qui portent une alerte : jamais masquées (garde-fou 5).
  const alertees = {};
  (A.alerts || []).forEach(function (al) {
    Object.keys(r).forEach(function (k) {
      if (al.txt && nomAbx(k) && al.txt.indexOf(nomAbx(k)) !== -1) alertees[k] = true;
    });
  });

  const masquees = [], rendues = [];
  Object.keys(r).forEach(function (k) {
    if (r[k] === undefined || r[k] === "") return;
    if (prevues.indexOf(k) !== -1) { rendues.push(k); return; }
    if (!rcActif(r[k])) { rendues.push(k); return; }   // garde-fou 3 : R toujours rendu
    if (alertees[k]) { rendues.push(k); return; }      // garde-fou 5
    masquees.push(k);
  });

  /* GARDE-FOU 6 — LE PLANCHER DE SÉCURITÉ, ET IL EST DE PHÉNOBAC, PAS DE LA HAS.
     Le document suppose un dialogue : « l'antibiogramme complet reste disponible
     sur demande », « sur demande du clinicien ». Une feuille imprimée dans un
     laboratoire de Mopti n'a pas ce dialogue. Si l'application des notes laissait
     une feuille où AUCUNE molécule active ne figure, alors que la souche en a une,
     le masquage est levé en entier et la feuille le dit. Ce n'est pas une règle
     scientifique — c'est le refus de rendre une feuille qui ne soigne personne. */
  const estActif = function (k) { return r[k] === "S" || r[k] === "I"; };
  let plancher = null;
  if (!rendues.some(estActif) && masquees.some(estActif)) {
    // On lève le strict nécessaire, et dans l'ordre que le document lui-même
    // donne : les molécules de dernier recours restent en dernier.
    const listes = RC.RENDU_CIBLE_LISTES || {};
    const recours = rcCodes(listes.carbapenemes || []).concat(rcCodes(listes.nouvelles || []));
    let lever = masquees.filter(function (k) {
      return estActif(k) && recours.indexOf(k) === -1;
    });
    if (!lever.length) lever = masquees.filter(estActif);
    lever.forEach(function (k) {
      rendues.push(k);
      masquees.splice(masquees.indexOf(k), 1);
    });
    plancher = "Aucune molécule active ne figurait sur la feuille une fois le rendu "
             + "ciblé appliqué. Le masquage a été levé pour "
             + lever.map(function (k) { return nomAbx(k); }).join(", ")
             + " : rendre un antibiogramme sans aucun antibiotique utilisable n'aide "
             + "personne.";
  }

  /* Le journal ne doit affirmer que ce qui s'est produit. Une molécule retirée
     par une note puis rendue parce qu'elle est résistante, ou relevée par le
     plancher, n'a PAS été masquée : le dire serait faux. */
  const journal = [];
  restr.journal.forEach(function (j) {
    const vus = j.codes.filter(function (k) {
      return j.sens === "retiré" ? masquees.indexOf(k) !== -1 : rendues.indexOf(k) !== -1;
    });
    if (vus.length) journal.push({ sens: j.sens, codes: vus, note: j.note,
                                   texte: j.texte, motif: j.motif });
  });

  return {
    applique: true, tableau: cle, titre: tb.titre, colonne: colonne,
    rendues: rendues.sort(), masquees: masquees.sort(),
    restrictions: journal, horsPortee: restr.horsPortee,
    commentaires: commentairesCible(cle, rendues),
    plancher: plancher, notes: (RC.RENDU_CIBLE_NOTES || {})[cle] || null,
    source: tr(RC.RENDU_CIBLE_SOURCE,
      "HAS, 5 October 2023 — targeted antibiograms, urine cultures with Enterobacterales, "
      + "women aged 12 and over"),

    /* LES COMMENTAIRES ET LES NOTES DE LA HAS RESTENT EN FRANÇAIS, ET C'EST
       UNE DÉCISION, PAS UN OUBLI. Ce sont des CITATIONS VERBATIM d'une
       recommandation française qui n'existe qu'en français : les traduire
       produirait un texte qui ressemble à la recommandation sans en être
       une, et qu'un laboratoire pourrait recopier dans un compte rendu en
       croyant citer la HAS. C'est la même raison qui fait que l'anglais de
       l'EUCAST est la SOURCE et non une traduction.

       Un lecteur anglophone doit savoir pourquoi ce bloc est en français,
       sans quoi il le prendrait pour une traduction manquante. On le lui
       dit, en anglais. Le banc exempte ces deux chemins NOMMÉMENT et
       vérifie qu'ils sont encore atteints : l'exemption ne peut pas devenir
       une porte ouverte. */
    citation: _lang === "en"
      ? "The comments and notes below are quoted verbatim, in French, from the HAS "
        + "recommendation of 5 October 2023. PhenoBac does not translate them: a "
        + "translated quotation is no longer the recommendation it cites."
      : null
  };
}

function finalize(A, r) {
  const org = _activeOrg;
  if (org && org.intrinsic) {
    for (const k in org.intrinsic) {
      if (r[k] === "S") {
        A.alerts.push({ lvl: "warn",
          txt: tr(`Incohérence : ${nomAbx(k)} rendue S alors qu'une résistance naturelle est attendue. ${naturelle(org.intrinsic[k])} Vérifier la saisie.`,
                  `Inconsistency: ${nomAbx(k)} reported S where intrinsic resistance is expected. ${naturelle(org.intrinsic[k])} Check the data entry.`) });
      }
    }
  }
  if (_depistage) {
    _depistage.rules.forEach(x => A.rules.push(x));
    _depistage.alerts.forEach(x => A.alerts.push(x));
    if (_depistage.sev && A.sev === "wild") A.sev = _depistage.sev;
  }
  coherence(A, r, org, _ctx);
  // § 9 : les conditions de réalisation déclarées, confrontées au référentiel.
  conditionsTechniques(A, org, _ctx, _mode);
  reglesCasfm(A, r);
  // § 15 : les cinq moments, composés APRÈS les règles CA-SFM — elles
  // complètent parfois A.comment, et le composer avant figerait un texte
  // tronqué.
  // La posologie de chaque molécule catégorisée, pour l'écran et le rendu.
  A.posologies = {};
  Object.keys(r || {}).forEach(function (k) {
    if (r[k] !== "S" && r[k] !== "I") return;
    const p = posologiePour(k, r[k], _ctx);
    if (p && p.length) A.posologies[k] = p;
  });

  // Le rendu ciblé se calcule APRÈS les alertes : une molécule qui en porte
  // une ne doit jamais être masquée, et il faut donc les connaître.
  A.renduCible = renduCible(A, r, _ctx, org, _renduCibleActif);

  A.moments = commentaireStructure(A);
  A.commentaireCopiable = commentaireCopiable(A.moments);

  if (_depistageEchoue.length) {
    /* DEUX RÉFÉRENTIELS, DEUX CONDUITES, ET ELLES NE DISENT PAS LA MÊME CHOSE.
       Ce message était écrit pour le dépistage de la pénicilline G du CA-SFM
       chez les streptocoques : « ne pas conclure résistant, faire une CMI ».
       Depuis que l'EUCAST apporte ses propres dépistages — la tétracycline
       chez Pasteurella, dont se déduit la doxycycline — le même texte
       s'affichait sous EUCAST, en citant le CA-SFM et en donnant une
       consigne qui n'est pas la sienne : l'EUCAST, lui, autorise
       expressément à rendre résistant faute de CMI. Attribuer à un
       référentiel la règle de l'autre est pire qu'un silence. */
    const casfm = estCasfm();
    _depistageEchoue.forEach(d => {
      const entete = tr(`${nomAbx(d.abx)} : ${d.mm} mm, en dessous du seuil de dépistage (${d.seuil} mm). `,
                        `${nomAbx(d.abx)}: ${d.mm} mm, below the screening cut-off (${d.seuil} mm). `);
      A.alerts.push({ lvl: "warn", txt: entete + (casfm
        ? tr(`Le CA-SFM n'autorise pas à conclure « résistant » au disque pour ce couple — la résistance aux `
           + `β-lactamines est exceptionnelle dans ce groupe, et un petit diamètre est d'abord un problème `
           + `technique. Déterminer la CMI avant de priver le malade de son traitement de référence.`,
             `The CA-SFM does not allow "resistant" to be concluded by disk for this pair — beta-lactam `
           + `resistance is exceptional in this group, and a small zone is first of all a technical `
           + `problem. Determine the MIC before depriving the patient of the reference treatment.`)
        : tr(`L'écran est POSITIF : l'EUCAST demande alors de déterminer la sensibilité de chaque `
           + `molécule de la classe, ou de les rendre résistantes. Le dépistage ne conclut que dans `
           + `un sens — au-dessus du seuil, il dit « sensible » ; en dessous, il ne dit rien de plus `
           + `que « il faut regarder ».`,
             `The screen is POSITIVE: EUCAST then asks for each agent of the class to be tested `
           + `individually, or reported resistant. A screen concludes in one direction only — above `
           + `the cut-off it says "susceptible"; below it, it says no more than "this needs looking at".`)) });
    });
    A.rules.push({ k: "≈", txt: casfm
      ? tr("CA-SFM : le disque de pénicilline G ne sert ici qu'à reconnaître les souches sensibles. "
         + "En dessous du seuil, il faut une CMI — le disque ne tranche pas.",
           "CA-SFM: here the benzylpenicillin disk serves only to recognise susceptible isolates. "
         + "Below the cut-off an MIC is required — the disk does not decide.")
      : tr("EUCAST : ce disque est un ÉCRAN, pas un seuil clinique. Au-dessus, il autorise à rendre "
         + "la classe sensible sans autre test ; en dessous, il faut tester chaque molécule ou la "
         + "rendre résistante.",
           "EUCAST: this disk is a SCREEN, not a clinical breakpoint. Above the cut-off it allows the "
         + "class to be reported susceptible without further testing; below it, each agent must be "
         + "tested or reported resistant.") });
  }

  /* Diamètres mesurés que le moteur n'a pas traduits. Les taire reviendrait
     à présenter comme « non testé » un antibiotique que le laboratoire a bel
     et bien posé sur la boîte. */
  if (_sansDisque.length) {
    A.sansDisque = _sansDisque.slice();
    _sansDisque.forEach(d => {
      A.alerts.push({ lvl: "info",
        txt: tr(`${nomAbx(d.abx)} : ${d.valeur} mm non catégorisé — ${d.raison}.`,
                `${nomAbx(d.abx)}: ${d.valeur} mm not categorised — ${d.raison}.`) });
    });
  }

  /* Zone d'incertitude technique.
     PhénoBac ne dégrade JAMAIS la catégorie de lui-même : l'EUCAST le permet
     parmi d'autres options, le CA-SFM le déconseille expressément — la
     pratique deviendrait systématique et fausserait la surveillance de la
     résistance. La décision revient au biologiste, au vu du contexte. */
  if (_zit.length) {
    A.zit = _zit.slice();
    _zit.forEach(z => {
      const nom = nomAbx(z.abx);
      // L'unité suit la méthode : mg/L pour une CMI, mm pour un diamètre.
      // Sans cela, un diamètre serait annoncé en milligrammes par litre.
      const u = z.unite || "mg/L";
      A.alerts.push({ lvl: "warn",
        txt: tr(`${nom} à ${z.mic} ${u} : valeur en zone d'incertitude technique (ZIT ${z.valeur} ${u}). `
              + `La catégorie « ${z.cat || "—"} » n'est pas reproductible à cette valeur — la traiter comme incertaine.`,
                `${nom} at ${z.mic} ${u}: the value falls in the area of technical uncertainty (ATU ${z.valeur} ${u}). `
              + `The category "${z.cat || "—"}" is not reproducible at this value — treat it as uncertain.`) });
    });
    A.rules.push({ k: "≈", txt: tr("Conduite à tenir : répéter le test si une erreur technique est plausible ; recourir à une autre méthode (CMI par microdilution, test génotypique) ; signaler l'incertitude sur le compte rendu.",
      "What to do: repeat the test if a technical error is plausible; use another method (MIC by broth microdilution, a genotypic test); state the uncertainty on the report.") });
    A.rules.push(estCasfm()
      ? { k: "≈", txt: tr("CA-SFM : ne pas dégrader la catégorie dans celle immédiatement inférieure — la pratique tendrait à devenir systématique et fausserait la surveillance épidémiologique. Signaler l'incertitude plutôt que l'occulter.",
          "CA-SFM: do not downgrade to the category immediately below — the practice would tend to become routine and would distort resistance surveillance. State the uncertainty rather than conceal it.") }
      : { k: "≈", txt: tr("EUCAST : dégrader la catégorie (S→I, I→R, S→R) est permis s'il reste d'autres options thérapeutiques, à condition de le commenter et de conserver la souche. PhénoBac ne le fait pas de lui-même.",
          "EUCAST: downgrading the category (S→I, I→R, S→R) is allowed where other therapeutic options remain, provided it is commented and the isolate is kept. PhénoBac does not do it on its own.") });
  }

  if (A.alerts.length === 0) {
    A.alerts.push({ lvl: "info", txt: tr("Aucune incohérence détectée avec les résistances naturelles attendues.",
      "No inconsistency found with the expected intrinsic resistances.") });
  }
  return A;
}

function enteroInterpret(r, c, { amino, species, klebsiella, imipenemIntrinsic }) {
  const A = { sev: "wild", name: tr("Souche sauvage", "Wild-type isolate"),
    mech: tr("Aucun mécanisme de résistance acquis aux β-lactamines détecté.",
             "No acquired beta-lactam resistance mechanism detected."), alerts: [], rules: [], comment: "" };
  const carbaKeys = imipenemIntrinsic ? ["ETP", "MEM"] : ["ETP", "IPM", "MEM"];
  let carba = carbaKeys.some(k => isRI(r[k]));
  if (imipenemIntrinsic && isR(r.IPM)) carba = true;
  const c3g = isRI(r.CTX) || isRI(r.CAZ);
  const aminoR = isR(r[amino]);

  if (carba) {
    A.sev = "crit"; A.name = tr("Suspicion de carbapénémase", "Suspected carbapenemase");
    A.mech = tr("Sensibilité diminuée à au moins un carbapénème. À confirmer (carba NP, immuno-chromatographie, biologie moléculaire) avant conclusion.",
                "Reduced susceptibility to at least one carbapenem. To be confirmed (Carba NP, lateral-flow immunoassay, molecular testing) before concluding.");
    parce(A, r, {
      pour: carbaKeys.map(function (k) {
        return [k, "RI", tr("sensibilité diminuée à un carbapénème — c'est ce qui fait suspecter l'enzyme",
                            "reduced susceptibility to a carbapenem — this is what raises the suspicion of the enzyme")];
      }),
      aConfirmerPar: tr("carba NP, immuno-chromatographie ou biologie moléculaire",
                        "Carba NP, lateral-flow immunoassay or molecular testing")
    });
    A.alerts.push({ lvl: "crit", txt: tr("Isolat hautement résistant : précautions complémentaires contact et signalement (EOH / hygiène).",
      "Highly resistant isolate: contact precautions and notification of the infection control team.") });
    A.alerts.push({ lvl: "warn", txt: tr("Confirmer le mécanisme : discordance imipénème/méropénème/ertapénème possible (imperméabilité vs carbapénémase vraie).",
      "Confirm the mechanism: imipenem / meropenem / ertapenem may disagree (impermeability versus a true carbapenemase).") });
    A.rules.push({ k: "→R", txt: tr("Interpréter l'ensemble des β-lactamines avec prudence tant que le mécanisme n'est pas confirmé.",
      "Interpret all beta-lactams with caution until the mechanism is confirmed.") });
    A.comment = tr(`${species} de sensibilité diminuée aux carbapénèmes. Suspicion de carbapénémase à confirmer. Souche à signaler, précautions complémentaires contact.`,
                   `${species} with reduced susceptibility to carbapenems. Suspected carbapenemase, to be confirmed. Notifiable isolate; contact precautions.`);

    // CA-SFM 2026, p. 8 : une fois la carbapénémase confirmée, les carbapénèmes
    // sont rendus résistants quelles que soient les CMI et quel que soit le
    // type d'enzyme — leur activité in vivo est incertaine et les alternatives
    // doivent être privilégiées. L'EUCAST, lui, se borne à un commentaire.
    if (estCasfm()) {
      const cb = carbaConfirmee(c);
      if (cb.confirmee) {
        A.name = tr("Carbapénémase confirmée", "Confirmed carbapenemase");
        A.mech = tr("Carbapénémase confirmée. Le CA-SFM 2026 rend les carbapénèmes résistants quelles que soient les concentrations minimales inhibitrices.",
                    "Confirmed carbapenemase. The CA-SFM 2026 reports carbapenems as resistant whatever the minimum inhibitory concentrations.");
        // Le mécanisme n'est plus à confirmer : les consignes d'attente
        // n'ont plus lieu d'être et brouilleraient le compte-rendu.
        A.rules = A.rules.filter(x => x.txt.indexOf("tant que le mécanisme") === -1);
        A.alerts = A.alerts.filter(x => x.txt.indexOf("Confirmer le mécanisme") === -1);
        rendreR(A, r, ["ETP", "IPM", "MEM"],
          tr("Carbapénémase confirmée — CA-SFM 2026, chapitre 5.1 et annexe 5.",
             "Confirmed carbapenemase — CA-SFM 2026, chapter 5.1 and annex 5."));
        A.rules.push({ k: "→R", txt: tr("CA-SFM : ertapénème, imipénème et méropénème rendus résistants, quel que soit le type d'enzyme et quelles que soient les CMI.",
          "CA-SFM: ertapenem, imipenem and meropenem are reported resistant, whatever the type of enzyme and whatever the MICs.") });
        if (cb.oxa48) {
          rendreR(A, r, ["CTX"], tr("OXA-48 — CA-SFM : céfotaxime et ceftriaxone rendus résistants.",
                                    "OXA-48 — CA-SFM: cefotaxime and ceftriaxone reported resistant."));
          A.rules.push({ k: "→R", txt: tr("OXA-48 : céfotaxime et ceftriaxone rendus résistants (règle CA-SFM depuis 2023).",
            "OXA-48: cefotaxime and ceftriaxone reported resistant (CA-SFM rule since 2023).") });
        }
        A.comment = tr(`${species} productrice de carbapénémase confirmée. Conformément au CA-SFM, les carbapénèmes sont rendus résistants quelles que soient les concentrations minimales inhibitrices ; privilégier les alternatives thérapeutiques. Souche à signaler, précautions complémentaires contact.`,
          `${species} producing a confirmed carbapenemase. In line with the CA-SFM, carbapenems are reported resistant whatever the minimum inhibitory concentrations; prefer alternative treatments. Notifiable isolate; contact precautions.`);
      } else {
        A.alerts.push({ lvl: "warn", txt: tr("CA-SFM : confirmez le mécanisme. Une carbapénémase confirmée fait rendre les carbapénèmes résistants quelles que soient les CMI.",
          "CA-SFM: confirm the mechanism. A confirmed carbapenemase makes all carbapenems resistant whatever the MICs.") });
      }
    } else {
      A.rules.push({ k: "=", txt: tr("EUCAST v16.0 : les carbapénèmes qui apparaissent S ou I sont rendus tels quels, avec la consigne de les employer à forte posologie et en association.",
        "EUCAST v16.0: carbapenems that test S or I are reported as tested, with the advice to use them at high dosage and in combination.") });
    }
    return finalize(A, r);
  }

  if (c3g) {
    if (c && c.syn === "Positif") {
      A.sev = "high"; A.name = tr("BLSE", "ESBL");
      A.mech = tr("β-lactamase à spectre étendu : synergie C3G + clavulanate positive. La céfoxitine reste habituellement sensible.",
                  "Extended-spectrum beta-lactamase: 3GC + clavulanate synergy positive. Cefoxitin usually remains susceptible.");
      parce(A, r, {
        pour: [["CTX", "RI", tr("céphalosporine de 3e génération atteinte", "third-generation cephalosporin affected")],
               ["CAZ", "RI", tr("céphalosporine de 3e génération atteinte", "third-generation cephalosporin affected")],
               ["FOX", "S", tr("céfoxitine conservée — la BLSE ne l'atteint pas, contrairement à une céphalosporinase",
                               "cefoxitin preserved — an ESBL does not affect it, unlike a cephalosporinase")]],
        contre: [["FOX", "RI", tr("une céfoxitine atteinte oriente vers une céphalosporinase, ou vers une BLSE accompagnée d'une imperméabilité",
                                  "an affected cefoxitin points to a cephalosporinase, or to an ESBL together with impermeability")]],
        confirme: tr("synergie C3G + acide clavulanique positive", "3GC + clavulanic acid synergy positive")
      });
      A.alerts.push({ lvl: "warn", txt: tr("Précautions complémentaires contact ; signalement selon la politique locale.",
        "Contact precautions; notification according to local policy.") });
      A.rules.push({ k: "?", txt: tr("Céfépime : interpréter selon la CMI (effet inoculum possible).",
        "Cefepime: interpret on the MIC (an inoculum effect is possible).") });
      // Ici les deux référentiels divergent franchement (CA-SFM 2026, p. 8) :
      // l'EUCAST a cessé de réinterpréter les C3G/C4G et l'aztréonam en cas de
      // BLSE ; le CA-SFM est revenu en 2024 à la lecture interprétative.
      if (estCasfm()) {
        A.rules.push({ k: "→R", txt: tr("CA-SFM : lecture interprétative — pénicillines, C1G, C2G, C3G et aztréonam rendus R quel que soit le résultat in vitro.",
          "CA-SFM: interpretive reading — penicillins, 1st, 2nd and 3rd generation cephalosporins and aztreonam are reported R whatever the in vitro result.") });
        rendreR(A, r, [amino, "CTX", "CAZ"], tr("BLSE — lecture interprétative du CA-SFM (retour décidé en 2024).",
                                                "ESBL — CA-SFM interpretive reading (reinstated in 2024)."));
        A.comment = tr(`${species} productrice de β-lactamase à spectre étendu (BLSE). Conformément au CA-SFM, l'ensemble des pénicillines et des céphalosporines de 1re à 3e génération ainsi que l'aztréonam sont rendus résistants, indépendamment du résultat in vitro. Souche à signaler, précautions complémentaires contact.`,
          `${species} producing an extended-spectrum beta-lactamase (ESBL). In line with the CA-SFM, all penicillins, 1st to 3rd generation cephalosporins and aztreonam are reported resistant, irrespective of the in vitro result. Notifiable isolate; contact precautions.`);
      } else {
        A.rules.push({ k: "=", txt: tr("EUCAST : pas de réinterprétation — céphalosporines et aztréonam rendus tels que testés (tableau v16.1 ; Expert Rules v3.3).",
          "EUCAST: no reinterpretation — cephalosporins and aztreonam are reported as tested (tables v16.1; Expert Rules v3.3).") });
        A.alerts.push({ lvl: "info", txt: tr("L'EUCAST ne réinterprète plus les C3G/C4G ni l'aztréonam en cas de BLSE ; le CA-SFM, si. Changez de référentiel pour comparer les deux rendus.",
          "EUCAST no longer reinterprets 3GC/4GC or aztreonam in the presence of an ESBL; the CA-SFM does. Switch tables to compare the two reports.") });
        A.comment = tr(`${species} productrice de β-lactamase à spectre étendu (BLSE). Conformément à l'EUCAST, les céphalosporines et l'aztréonam sont rendus tels qu'ils ont été testés. Souche à signaler, précautions complémentaires contact.`,
          `${species} producing an extended-spectrum beta-lactamase (ESBL). In line with EUCAST, cephalosporins and aztreonam are reported exactly as tested. Notifiable isolate; contact precautions.`);
      }
    } else if (isRI(r.FOX)) {
      A.sev = "high"; A.name = tr("Céphalosporinase hyperproduite (AmpC)", "Hyperproduced cephalosporinase (AmpC)");
      A.mech = tr("Résistance C3G + céfoxitine sans synergie au clavulanate : profil de céphalosporinase déréprimée / plasmidique.",
                  "Resistance to 3GC and cefoxitin with no clavulanate synergy: the profile of a derepressed or plasmid-borne cephalosporinase.");
      parce(A, r, {
        pour: [["FOX", "RI", tr("céfoxitine atteinte — la céphalosporinase l'hydrolyse, la BLSE non",
                                "cefoxitin affected — a cephalosporinase hydrolyses it, an ESBL does not")],
               ["CTX", "RI", tr("céphalosporine de 3e génération atteinte", "third-generation cephalosporin affected")],
               ["CAZ", "RI", tr("céphalosporine de 3e génération atteinte", "third-generation cephalosporin affected")]],
        contre: [["FEP", "R", tr("la céfépime est habituellement conservée face à une céphalosporinase ; atteinte, elle évoque une BLSE surajoutée",
                                 "cefepime is usually preserved against a cephalosporinase; if affected, it suggests an added ESBL")]],
        aConfirmerPar: tr("recherche de BLSE associée (synergie sur gélose au cloxacilline) si la céfépime est atteinte",
                          "look for an associated ESBL (synergy on cloxacillin agar) if cefepime is affected")
      });
      A.rules.push({ k: "?", txt: tr("Céfépime souvent conservé — vérifier la CMI.",
        "Cefepime often preserved — check the MIC.") });
      if (estCasfm()) {
        A.rules.push({ k: "→R", txt: tr("CA-SFM : lecture interprétative — C1G à C3G et céfoxitine rendues R ; associations avec inhibiteur peu fiables.",
          "CA-SFM: interpretive reading — 1st to 3rd generation cephalosporins and cefoxitin reported R; beta-lactamase inhibitor combinations unreliable.") });
        rendreR(A, r, [amino, "CTX", "CAZ", "FOX"], tr("Céphalosporinase hyperproduite — lecture interprétative du CA-SFM.",
                                                       "Hyperproduced cephalosporinase — CA-SFM interpretive reading."));
      } else {
        A.rules.push({ k: "=", txt: tr("EUCAST : pas de réinterprétation — céphalosporines rendues telles que testées ; associations avec inhibiteur peu fiables.",
          "EUCAST: no reinterpretation — cephalosporins reported as tested; beta-lactamase inhibitor combinations unreliable.") });
      }
      A.comment = tr(`${species} exprimant une céphalosporinase hyperproduite (AmpC). Céphalosporines de 1re à 3e génération et céfoxitine concernées ; céfépime à interpréter selon la CMI.`,
        `${species} expressing a hyperproduced cephalosporinase (AmpC). First to third generation cephalosporins and cefoxitin are affected; interpret cefepime on the MIC.`);
    } else {
      A.sev = "high"; A.name = tr("Résistance aux C3G — mécanisme à préciser", "Third-generation cephalosporin resistance — mechanism undetermined");
      A.mech = tr("Résistance aux C3G sans donnée de synergie. Réaliser le test de synergie clavulanate pour trancher BLSE vs AmpC.",
                  "Resistance to 3GC with no synergy result. Perform the clavulanate synergy test to separate an ESBL from an AmpC.");
      parce(A, r, {
        pour: [["CTX", "RI", tr("céfotaxime atteinte", "cefotaxime affected")],
               ["CAZ", "RI", tr("ceftazidime atteinte", "ceftazidime affected")],
               ["FOX", "S", tr("céfoxitine conservée : une céphalosporinase l'aurait touchée, ce qui oriente plutôt vers une BLSE — sans la synergie, cela ne suffit pas",
                               "cefoxitin preserved: a cephalosporinase would have affected it, which points rather to an ESBL — without the synergy test this is not enough")]],
        aConfirmerPar: tr("synergie C3G + acide clavulanique : c'est elle, et elle seule, qui sépare une BLSE d'une céphalosporinase",
                          "3GC + clavulanic acid synergy: it alone separates an ESBL from a cephalosporinase")
      });
      A.alerts.push({ lvl: "info", txt: tr("Compléter par le test de synergie C3G + ac. clavulanique.",
        "Complete with the 3GC + clavulanic acid synergy test.") });
      A.comment = tr(`${species} résistante aux C3G, mécanisme à préciser (test de synergie recommandé).`,
        `${species} resistant to third-generation cephalosporins, mechanism undetermined (synergy test recommended).`);
    }
    return finalize(A, r);
  }

  if (aminoR && !klebsiella) {
    if (isRI(r.AMC)) {
      A.sev = "mod"; A.name = tr("Pénicillinase (haut niveau) ou résistance à l'inhibiteur",
                                 "Penicillinase (high level) or inhibitor-resistant enzyme");
      A.mech = tr("Aminopénicilline R et association clavulanique diminuée, C3G conservées.",
                  "Aminopenicillin resistant and the clavulanate combination reduced, with third-generation cephalosporins preserved.");
      parce(A, r, {
        pour: [[amino, "RI", tr("aminopénicilline atteinte — l'enzyme l'hydrolyse", "aminopenicillin affected — the enzyme hydrolyses it")],
               ["AMC", "RI", tr("l'acide clavulanique ne la restaure pas : enzyme en excès, ou peu affine pour l'inhibiteur",
                                "clavulanic acid does not restore it: either too much enzyme, or an enzyme with little affinity for the inhibitor")],
               ["CTX", "S", tr("céfotaxime conservée : l'enzyme n'atteint pas les C3G, ce qui écarte une BLSE",
                               "cefotaxime preserved: the enzyme does not reach the third-generation cephalosporins, which rules out an ESBL")]],
        aConfirmerPar: tr("rien ne sépare in vitro une pénicillinase hyperproduite d'une enzyme résistante à l'inhibiteur ; seule la biologie moléculaire trancherait, et le rendu est le même",
                          "nothing separates a hyperproduced penicillinase from an inhibitor-resistant enzyme in vitro; only molecular testing would, and the report is the same either way")
      });
      A.comment = tr(`${species} : pénicillinase de haut niveau (ou faible affinité pour l'inhibiteur). Aminopénicillines résistantes, C3G actives.`,
        `${species}: high-level penicillinase (or low affinity for the inhibitor). Aminopenicillins resistant, third-generation cephalosporins active.`);
    } else {
      A.sev = "mod"; A.name = tr("Pénicillinase de bas niveau", "Low-level penicillinase");
      A.mech = tr("Résistance isolée aux aminopénicillines, restaurée par le clavulanate. Profil fréquent.",
                  "Isolated aminopenicillin resistance, restored by clavulanate. A common profile.");
      parce(A, r, {
        pour: [[amino, "RI", tr("aminopénicilline atteinte — l'enzyme l'hydrolyse", "aminopenicillin affected — the enzyme hydrolyses it")],
               ["AMC", "S", tr("l'acide clavulanique la restaure : c'est la signature d'une pénicillinase de bas niveau",
                               "clavulanic acid restores it: that is the signature of a low-level penicillinase")],
               ["CTX", "S", tr("céfotaxime conservée : l'enzyme n'atteint pas les C3G, ce qui écarte une BLSE",
                               "cefotaxime preserved: the enzyme does not reach the third-generation cephalosporins, which rules out an ESBL")]]
      });
      A.comment = tr(`${species} : pénicillinase de bas niveau. Aminopénicillines résistantes, association clavulanique et C3G actives.`,
        `${species}: low-level penicillinase. Aminopenicillins resistant; the clavulanate combination and third-generation cephalosporins remain active.`);
    }
    return finalize(A, r);
  }

  /* « Phénotype sauvage » est une CONCLUSION, pas un reste. Elle mérite ses
     arguments comme les autres — et surtout, elle doit dire sur quoi elle ne
     repose pas : conclure « aucun mécanisme acquis » sans avoir testé de C3G,
     c'est conclure sur rien. parce() range alors la molécule parmi les non
     testées et abaisse la confiance à « possible », ce qui est exactement ce
     qu'il faut dire. */
  if (klebsiella) {
    A.name = tr("Souche sauvage", "Wild-type isolate"); A.sev = "wild";
    A.mech = tr("Pas de mécanisme acquis détecté (la résistance aux aminopénicillines est naturelle chez Klebsiella).",
                "No acquired mechanism detected (aminopenicillin resistance is intrinsic in Klebsiella).");
    parce(A, r, {
      pour: [["AMC", "S", tr("l'association clavulanique reste active : la pénicillinase chromosomique naturelle est de bas niveau",
                             "the clavulanate combination remains active: the natural chromosomal penicillinase is low-level")],
             ["CTX", "S", tr("céfotaxime conservée : pas de BLSE ni de céphalosporinase acquise",
                             "cefotaxime preserved: neither an ESBL nor an acquired cephalosporinase")],
             ["CAZ", "S", tr("ceftazidime conservée", "ceftazidime preserved")]]
    });
    A.comment = tr(`${species} de phénotype sauvage. La résistance aux aminopénicillines est naturelle (pénicillinase chromosomique).`,
      `${species}, wild-type phenotype. Aminopenicillin resistance is intrinsic (chromosomal penicillinase).`);
    return finalize(A, r);
  }

  parce(A, r, {
    pour: [[amino, "S", tr("aminopénicilline active : aucune pénicillinase acquise", "aminopenicillin active: no acquired penicillinase")],
           ["CTX", "S", tr("céfotaxime conservée : ni BLSE ni céphalosporinase", "cefotaxime preserved: neither ESBL nor cephalosporinase")],
           ["CAZ", "S", tr("ceftazidime conservée", "ceftazidime preserved")]]
  });
  A.comment = tr(`${species} de phénotype sauvage, sans mécanisme de résistance acquis détecté sur le panel testé.`,
    `${species}, wild-type phenotype, with no acquired resistance mechanism detected on the panel tested.`);
  return finalize(A, r);
}

function enterobacterInterpret(r, c, a) {
  const sp = (a && a.species) || "Enterobacter cloacae";
  const A = { sev: "wild", name: tr("AmpC à bas niveau (phénotype de base)", "Low-level AmpC (baseline phenotype)"),
    mech: `${sp} exprime naturellement une céphalosporinase AmpC inductible.`, alerts: [], rules: [], comment: "" };
  const carba = ["ETP", "IPM", "MEM"].some(k => isRI(r[k]));
  const c3g = isRI(r.CTX) || isRI(r.CAZ);

  if (carba) {
    A.sev = "crit"; A.name = tr("Suspicion de carbapénémase", "Suspected carbapenemase");
    A.mech = tr("Sensibilité diminuée aux carbapénèmes chez une souche AmpC : imperméabilité + AmpC vs carbapénémase vraie. À confirmer.",
                "Reduced carbapenem susceptibility in an AmpC isolate: impermeability plus AmpC, or a true carbapenemase. To be confirmed.");
    parce(A, r, {
      pour: [["ETP", "RI", tr("ertapénème atteint — c'est le carbapénème le plus sensible à l'association imperméabilité + AmpC, et souvent le premier touché",
                              "ertapenem affected — it is the carbapenem most sensitive to impermeability plus AmpC, and often the first to go")],
             ["IPM", "RI", tr("imipénème atteint", "imipenem affected")],
             ["MEM", "RI", tr("méropénème atteint", "meropenem affected")]],
      confirme: carbaConfirmee(c).confirmee
        ? tr("confirmation de carbapénémase déclarée au dossier", "a carbapenemase confirmation recorded in the file") : null,
      aConfirmerPar: carbaConfirmee(c).confirmee ? null
        : tr("confirmation de carbapénémase — sans elle, l'imperméabilité associée à l'AmpC naturelle donne le même profil",
             "carbapenemase confirmation — without it, impermeability together with the natural AmpC gives the same phenotype")
    });
    A.alerts.push({ lvl: "crit", txt: tr("Précautions complémentaires contact et signalement.",
      "Contact precautions and notification.") });
    A.rules.push({ k: "→R", txt: tr("β-lactamines à interpréter avec prudence jusqu'à confirmation.",
      "Interpret the beta-lactams with caution until confirmation.") });
    A.comment = tr(`${sp} de sensibilité diminuée aux carbapénèmes. Suspicion de carbapénémase à confirmer. Souche à signaler.`,
      `${sp} with reduced carbapenem susceptibility. A carbapenemase is suspected and must be confirmed. Notifiable isolate.`);
    // Même règle que pour les autres entérobactéries (CA-SFM 2026, p. 8).
    if (estCasfm()) {
      const cb = carbaConfirmee(c);
      if (cb.confirmee) {
        A.name = tr("Carbapénémase confirmée (sur fond d'AmpC)", "Confirmed carbapenemase (on an AmpC background)");
        A.mech = tr("Carbapénémase confirmée chez une souche à AmpC naturelle. Le CA-SFM 2026 rend les carbapénèmes résistants quelles que soient les CMI.",
                    "A confirmed carbapenemase in an isolate with a natural AmpC. CA-SFM 2026 reports carbapenems as resistant whatever the MICs.");
        A.rules = A.rules.filter(x => x.txt.indexOf("jusqu'à confirmation") === -1);
        rendreR(A, r, ["ETP", "IPM", "MEM"],
          tr("Carbapénémase confirmée — CA-SFM 2026, chapitre 5.1 et annexe 5.",
             "Confirmed carbapenemase — CA-SFM 2026, chapter 5.1 and appendix 5."));
        A.rules.push({ k: "→R", txt: tr("CA-SFM : carbapénèmes rendus résistants quelles que soient les CMI.",
          "CA-SFM: carbapenems reported resistant whatever the MICs.") });
        if (cb.oxa48) {
          rendreR(A, r, ["CTX"], tr("OXA-48 — CA-SFM : céfotaxime et ceftriaxone rendus résistants.",
            "OXA-48 — CA-SFM: cefotaxime and ceftriaxone reported resistant."));
          A.rules.push({ k: "→R", txt: tr("OXA-48 : céfotaxime et ceftriaxone rendus résistants.",
            "OXA-48: cefotaxime and ceftriaxone reported resistant.") });
        }
        A.comment = tr(`${sp} producteur d'une carbapénémase confirmée. Conformément au CA-SFM, les carbapénèmes sont rendus résistants quelles que soient les concentrations minimales inhibitrices. Souche à signaler.`,
          `${sp} producing a confirmed carbapenemase. Following CA-SFM, carbapenems are reported resistant whatever the minimum inhibitory concentrations. Notifiable isolate.`);
      } else {
        A.alerts.push({ lvl: "warn", txt: tr("CA-SFM : confirmez le mécanisme. Une carbapénémase confirmée fait rendre les carbapénèmes résistants quelles que soient les CMI.",
          "CA-SFM: confirm the mechanism. A confirmed carbapenemase makes carbapenems reportable as resistant whatever the MICs.") });
      }
    }
  } else if (c3g) {
    if (c && c.syn === "Positif") {
      A.sev = "crit"; A.name = tr("AmpC + BLSE surajoutée", "AmpC plus a superimposed ESBL");
      A.mech = tr("Résistance C3G avec synergie clavulanate positive : BLSE en plus de la céphalosporinase naturelle.",
                  "Third-generation cephalosporin resistance with a positive clavulanate synergy: an ESBL on top of the natural cephalosporinase.");
      parce(A, r, {
        pour: [["CTX", "RI", tr("céfotaxime atteinte", "cefotaxime affected")],
               ["CAZ", "RI", tr("ceftazidime atteinte", "ceftazidime affected")]],
        // La céphalosporinase naturelle n'atteint pas le céfépime ; une BLSE,
        // si. C'est ce qui sépare les deux hypothèses une fois la synergie vue.
        contre: [["FEP", "S", tr("céfépime conservé : attendu face à l'AmpC seule, plus surprenant si une BLSE s'y ajoute — vérifier la CMI",
                                 "cefepime preserved: expected against AmpC alone, more surprising if an ESBL is added — check the MIC")]],
        confirme: tr("synergie C3G + acide clavulanique positive", "a positive cephalosporin plus clavulanate synergy")
      });
      A.rules.push({ k: "?", txt: tr("Céfépime souvent touché en cas de BLSE + AmpC — vérifier la CMI.",
        "Cefepime is often affected when an ESBL joins an AmpC — check the MIC.") });
      if (estCasfm()) {
        A.rules.push({ k: "→R", txt: tr("CA-SFM : lecture interprétative — pénicillines, C1G à C3G et aztréonam rendus R.",
          "CA-SFM: interpretive reading — penicillins, 1st to 3rd generation cephalosporins and aztreonam reported R.") });
        rendreR(A, r, ["AMX", "AMP", "CTX", "CAZ"], tr("BLSE surajoutée — lecture interprétative du CA-SFM.",
          "Superimposed ESBL — CA-SFM interpretive reading."));
        A.comment = tr(`${sp} producteur d'une BLSE surajoutée à sa céphalosporinase naturelle. Conformément au CA-SFM, pénicillines, C1G à C3G et aztréonam sont rendus résistants. Souche à signaler.`,
          `${sp} producing an ESBL on top of its natural cephalosporinase. Following CA-SFM, penicillins, 1st to 3rd generation cephalosporins and aztreonam are reported resistant. Notifiable isolate.`);
      } else {
        A.rules.push({ k: "=", txt: tr("EUCAST : pas de réinterprétation — céphalosporines et aztréonam rendus tels que testés.",
          "EUCAST: no reinterpretation — cephalosporins and aztreonam reported as tested.") });
        A.comment = tr(`${sp} producteur d'une BLSE surajoutée à sa céphalosporinase naturelle. Conformément à l'EUCAST, les céphalosporines et l'aztréonam sont rendus tels qu'ils ont été testés. Souche à signaler.`,
          `${sp} producing an ESBL on top of its natural cephalosporinase. Following EUCAST, cephalosporins and aztreonam are reported exactly as tested. Notifiable isolate.`);
      }
    } else {
      A.sev = "high"; A.name = tr("Céphalosporinase déréprimée (AmpC hyperproduite)", "Derepressed cephalosporinase (AmpC overproduction)");
      A.mech = tr("Résistance C3G sans synergie clavulanate : dérepression de l'AmpC chromosomique.",
                  "Third-generation cephalosporin resistance with no clavulanate synergy: derepression of the chromosomal AmpC.");
      parce(A, r, {
        pour: [["CTX", "RI", tr("céfotaxime atteinte", "cefotaxime affected")],
               ["CAZ", "RI", tr("ceftazidime atteinte", "ceftazidime affected")],
               ["AMC", "RI", tr("l'acide clavulanique ne restaure rien : il n'inhibe pas l'AmpC, à la différence d'une BLSE",
                                "clavulanic acid restores nothing: unlike with an ESBL, it does not inhibit AmpC")]],
        contre: [["FEP", "RI", tr("céfépime atteint : il est habituellement conservé face à une céphalosporinase — atteint, il évoque une BLSE surajoutée",
                                  "cefepime affected: it is usually preserved against a cephalosporinase, so being affected suggests a superimposed ESBL")]],
        aConfirmerPar: tr("recherche de synergie C3G + acide clavulanique, pour écarter une BLSE surajoutée, et CMI du céfépime",
          "a cephalosporin plus clavulanic acid synergy test, to rule out a superimposed ESBL, and a cefepime MIC")
      });
      A.rules.push({ k: "?", txt: tr("Céfépime habituellement conservé (stable vis-à-vis de l'AmpC) — vérifier la CMI.",
        "Cefepime usually preserved, being stable to AmpC — check the MIC.") });
      if (estCasfm()) {
        A.rules.push({ k: "→R", txt: tr("CA-SFM : lecture interprétative — C1G à C3G rendues R ; associations avec inhibiteur inefficaces.",
          "CA-SFM: interpretive reading — 1st to 3rd generation cephalosporins reported R; inhibitor combinations are ineffective.") });
        rendreR(A, r, ["AMX", "AMP", "AMC", "CTX", "CAZ"], tr("Céphalosporinase déréprimée — lecture interprétative du CA-SFM.",
          "Derepressed cephalosporinase — CA-SFM interpretive reading."));
      } else {
        A.rules.push({ k: "=", txt: tr("EUCAST : pas de réinterprétation — céphalosporines rendues telles que testées ; associations avec inhibiteur inefficaces.",
          "EUCAST: no reinterpretation — cephalosporins reported as tested; inhibitor combinations are ineffective.") });
      }
      A.comment = tr(`${sp} exprimant une céphalosporinase déréprimée (AmpC hyperproduite). C3G résistantes, céfépime à interpréter selon la CMI. Attention au risque de sélection de mutants sous C3G.`,
        `${sp} expressing a derepressed cephalosporinase (AmpC overproduction). Third-generation cephalosporins resistant, cefepime to be interpreted on the MIC. Beware the risk of selecting mutants under third-generation cephalosporin treatment.`);
    }
  } else {
    A.mech = tr("Phénotype AmpC inductible de base : C3G actives in vitro mais risque de dérepression sous traitement.",
                "Baseline inducible AmpC phenotype: third-generation cephalosporins active in vitro, but derepression may occur under treatment.");
    // Conclure « pas de dérepression » SANS avoir testé une C3G n'est pas une
    // conclusion : parce() range la molécule non testée et rend « possible ».
    parce(A, r, {
      pour: [["CTX", "S", tr("céfotaxime conservée : l'AmpC naturelle reste réprimée",
                             "cefotaxime preserved: the natural AmpC remains repressed")],
             ["CAZ", "S", tr("ceftazidime conservée — c'est elle que la dérepression touche le plus vite",
                             "ceftazidime preserved — it is the first to be affected by derepression")]],
      aConfirmerPar: tr("aucun test ne confirme l'absence de dérepression : c'est le traitement par C3G qui la révélerait, d'où la surveillance",
        "no test confirms the absence of derepression: third-generation cephalosporin treatment is what would reveal it, hence the monitoring")
    });
    A.alerts.push({ lvl: "info", txt: tr("Sous C3G, risque de sélection de mutants déréprimés : surveillance recommandée.",
      "Under third-generation cephalosporins, derepressed mutants may be selected: monitoring is advised.") });
    A.comment = tr(`${sp} de phénotype AmpC inductible sans dérepression détectée. Prudence avec les C3G (risque d'échappement par dérepression).`,
      `${sp} with an inducible AmpC phenotype and no derepression detected. Use third-generation cephalosporins with caution: derepression may allow escape.`);
  }
  return finalize(A, r);
}

function staphInterpret(r, c, a) {
  const sp = (a && a.species) || "Staphylococcus aureus";
  const coNS = !!(a && a.coNS);
  const metiS = coNS ? tr("méticillino-sensible", "methicillin-susceptible")
                     : tr("sensible à la méticilline (SASM)", "methicillin-susceptible (MSSA)");
  const metiR = coNS ? tr("SCN méticillino-résistant", "Methicillin-resistant coagulase-negative staphylococcus")
                     : tr("SARM", "MRSA");
  const A = { sev: "wild",
    name: coNS ? tr(`${sp} — méticillino-sensible`, `${sp} — methicillin-susceptible`)
               : tr("Staphylococcus aureus sensible (SASM)", "Methicillin-susceptible Staphylococcus aureus (MSSA)"),
    mech: tr("Céfoxitine sensible : pas de résistance à la méticilline (mecA/mecC).",
             "Cefoxitin susceptible: no methicillin resistance (mecA/mecC)."), alerts: [], rules: [], comment: "" };

  const mrsa = isRI(r.FOX) || isRI(r.OXA);
  if (mrsa) {
    A.sev = "crit"; A.name = metiR;
    A.mech = tr("Résistance à la méticilline (mecA/mecC) : toutes les β-lactamines usuelles sont inactives.",
                "Methicillin resistance (mecA/mecC): all the usual beta-lactams are inactive.");
    parce(A, r, {
      pour: [["FOX", "RI", tr("céfoxitine atteinte — c'est elle qui dépiste la résistance à la méticilline, mieux que l'oxacilline",
                              "cefoxitin affected — it is cefoxitin that screens for methicillin resistance, better than oxacillin")],
             ["OXA", "RI", tr("oxacilline atteinte", "oxacillin affected")]],
      contre: [["PEN", "S", tr("une pénicilline G conservée est inattendue chez une souche résistante à la méticilline : vérifier l'identification et la pureté",
                               "a preserved benzylpenicillin is unexpected in a methicillin-resistant isolate: check the identification and the purity of the culture")]],
      aConfirmerPar: tr("détection de la PLP2a, ou recherche de mecA/mecC, si le profil surprend",
                        "PBP2a detection, or mecA/mecC testing, if the profile is surprising")
    });
    A.alerts.push({ lvl: "crit", txt: coNS
      ? tr("Résistance à la méticilline : β-lactamines inactives. Impact majeur sur les infections de matériel étranger / prothèse.",
           "Methicillin resistance: beta-lactams inactive. Major consequences for foreign-body and prosthetic infections.")
      : tr("Précautions complémentaires contact et signalement (portage, épidémiologie).",
           "Contact precautions and notification (carriage, epidemiology).") });
    A.rules.push({ k: "→R", txt: tr("Toutes les β-lactamines rendues R (hors céphalosporines anti-SARM).",
      "All beta-lactams reported R (except the anti-MRSA cephalosporins).") });
    A.comment = tr(`${sp} résistant à la méticilline (${metiR}). Par harmonisation, l'ensemble des β-lactamines (hors céphalosporines anti-SARM) sont rendues résistantes.`,
                   `${sp} resistant to methicillin (${metiR}). By convention, all beta-lactams (except the anti-MRSA cephalosporins) are reported resistant.`)
      + (coNS ? "" : tr(" Souche à signaler, précautions complémentaires contact.",
                        " Notifiable isolate; contact precautions."));
  } else if (isR(r.PEN)) {
    A.sev = "mod"; A.name = coNS ? tr(`${sp} — pénicillinase`, `${sp} — penicillinase`)
                                 : tr("SASM producteur de pénicillinase", "Penicillinase-producing MSSA");
    A.mech = tr("Pénicilline G résistante par pénicillinase (blaZ) ; méticilline / oxacilline actives.",
                "Benzylpenicillin resistant through a penicillinase (blaZ); methicillin and oxacillin remain active.");
    parce(A, r, {
      pour: [["PEN", "R", tr("pénicilline G atteinte — l'enzyme l'hydrolyse", "benzylpenicillin affected — the enzyme hydrolyses it")],
             ["FOX", "S", tr("céfoxitine conservée : la méticilline reste active, ce qui sépare la pénicillinase de la méticillino-résistance",
                             "cefoxitin preserved: methicillin remains active, which separates a penicillinase from methicillin resistance")]],
      aConfirmerPar: tr("test à la nitrocéfine, si le rendu de la pénicilline G doit être affirmé",
                        "a nitrocefin test, if the benzylpenicillin result must be asserted")
    });
    A.rules.push({ k: "→R", txt: tr("Pénicilline G et aminopénicillines sans inhibiteur rendues R.",
      "Benzylpenicillin and aminopenicillins without an inhibitor reported R.") });
    A.comment = tr(`${sp} ${metiS}, producteur de pénicillinase. Pénicilline G résistante ; pénicillines M et associations avec inhibiteur actives.`,
      `${sp}, ${metiS}, penicillinase-producing. Benzylpenicillin resistant; isoxazolyl penicillins and inhibitor combinations active.`);
  } else {
    parce(A, r, {
      pour: [["FOX", "S", tr("céfoxitine conservée : pas de résistance à la méticilline (mecA/mecC)",
                             "cefoxitin preserved: no methicillin resistance (mecA/mecC)")],
             ["PEN", "S", tr("pénicilline G conservée : pas de pénicillinase (blaZ) non plus",
                             "benzylpenicillin preserved: no penicillinase (blaZ) either")]]
    });
    A.comment = tr(`${sp} ${metiS} sans mécanisme de résistance acquis détecté sur le panel testé.`,
      `${sp}, ${metiS}, with no acquired resistance mechanism detected on the panel tested.`);
  }

  if (isR(r.E) && r.DA === "S") {
    if (c && c.dtest === "Positif") {
      A.alerts.push({ lvl: "warn", txt: tr("MLSb inductible (D-test positif) : la clindamycine est rendue R malgré une sensibilité apparente in vitro.",
        "Inducible MLSb (positive D-test): clindamycin is reported R despite apparent susceptibility in vitro.") });
      A.rules.push({ k: "→R", txt: tr("Clindamycine rendue R (résistance inductible démontrée).",
        "Clindamycin reported R (inducible resistance demonstrated).") });
      A.comment += tr(" Résistance inductible à la clindamycine (MLSb, D-test positif) : clindamycine rendue résistante.",
        " Inducible clindamycin resistance (MLSb, positive D-test): clindamycin reported resistant.");
    // « PAS ENCORE RÉPONDU » EST AUSSI UN D-TEST NON FAIT, et c'est même
    // l'état de DÉPART de tout antibiogramme : la question s'affiche sans
    // réponse cochée. La condition ne reconnaissait que « Non fait »
    // explicitement choisi — si bien qu'au moment où le rappel compte le
    // plus, personne ne le voyait. Pire : décocher une réponse déjà donnée
    // faisait disparaître l'avertissement en silence.
    } else if (!c || !c.dtest || c.dtest === "Non fait") {
      A.alerts.push({ lvl: "info", txt: tr("Érythromycine R et clindamycine S : réaliser un D-test avant de rendre la clindamycine.",
        "Erythromycin R and clindamycin S: perform a D-test before reporting clindamycin.") });
    }
  }

  if (isRI(r.VA)) {
    A.sev = "crit";
    A.alerts.unshift({ lvl: "crit", txt: tr("Sensibilité diminuée à la vancomycine (VISA/VRSA) : événement rare et grave — vérifier la CMI et confirmer d'urgence.",
      "Reduced susceptibility to vancomycin (VISA/VRSA): a rare and serious event — check the MIC and confirm urgently.") });
    if (A.comment) A.comment += tr(" Sensibilité diminuée aux glycopeptides à confirmer d'urgence.",
      " Reduced glycopeptide susceptibility, to be confirmed urgently.");
  } else if (coNS && isRI(r.TEC)) {
    if (A.sev === "wild" || A.sev === "mod") A.sev = "high";
    A.alerts.push({ lvl: "warn", txt: tr("Sensibilité diminuée à la téicoplanine : fréquente chez certains SCN (notamment S. haemolyticus). Vérifier la CMI ; la vancomycine reste souvent active.",
      "Reduced susceptibility to teicoplanin: common in some coagulase-negative staphylococci, notably S. haemolyticus. Check the MIC; vancomycin often remains active.") });
    A.comment += tr(" Sensibilité diminuée à la téicoplanine.", " Reduced teicoplanin susceptibility.");
  }
  return finalize(A, r);
}

function enteroCoccusInterpret(r, c, { species, ampExpectedS }) {
  const A = { sev: "wild", name: tr("Entérocoque de phénotype sauvage", "Wild-type enterococcus"),
    mech: tr("Rappel : résistance naturelle aux céphalosporines, au cotrimoxazole in vivo et aux aminosides à bas niveau.",
             "Remember: intrinsic resistance to cephalosporins, to trimethoprim-sulfamethoxazole in vivo, and low-level resistance to aminoglycosides."),
    alerts: [], rules: [], comment: "" };

  if (isRI(r.VA)) {
    A.sev = "crit"; A.name = tr("ERV — Entérocoque résistant aux glycopeptides", "VRE — vancomycin-resistant enterococcus");
    A.mech = tr("Résistance à la vancomycine (gènes vanA/vanB le plus souvent). Confirmer le génotype.",
                "Vancomycin resistance, usually through vanA or vanB. Confirm the genotype.");
    parce(A, r, {
      pour: [["VA", "RI", tr("vancomycine atteinte — c'est la définition du phénotype", "vancomycin affected — that is the definition of the phenotype")],
             ["TEC", "RI", tr("téicoplanine également atteinte : oriente vers vanA plutôt que vanB",
                              "teicoplanin also affected: this points to vanA rather than vanB")]],
      aConfirmerPar: tr("génotypage van (vanA / vanB), qui distingue les deux et change la conduite",
                        "van genotyping (vanA / vanB), which separates the two and changes management")
    });
    A.alerts.push({ lvl: "crit", txt: tr("Précautions complémentaires contact renforcées et signalement immédiat (EOH). Risque épidémique.",
      "Reinforced contact precautions and immediate notification of the infection control team. Outbreak risk.") });
    A.rules.push({ k: "✚", txt: tr("Options à discuter selon l'antibiogramme : linézolide (souvent actif).",
      "Options to discuss on the antibiogram: linezolid, which is often active.") });
    A.comment = tr(`${species} résistant aux glycopeptides (ERV). Souche à signaler d'urgence, précautions complémentaires contact renforcées. Génotype van à confirmer.`,
      `${species} resistant to glycopeptides (VRE). Notify urgently; reinforced contact precautions. The van genotype is to be confirmed.`);
  } else {
    parce(A, r, {
      pour: [["VA", "S", tr("vancomycine active : pas de gène van", "vancomycin active: no van gene")],
             ["AMP", "S", tr("ampicilline active — c'est elle qui traite, et elle fonde la synergie avec un aminoside",
                             "ampicillin active — it is the treating agent, and it underpins synergy with an aminoglycoside")]],
      contre: [["HLG", "RI", tr("haut niveau de résistance à la gentamicine : la synergie β-lactamine + aminoside est perdue",
                                "high-level gentamicin resistance: the beta-lactam plus aminoglycoside synergy is lost")]]
    });
    A.comment = tr(`${species} sans résistance acquise majeure détectée sur le panel testé.`,
      `${species} with no major acquired resistance detected on the panel tested.`);
  }

  if (isR(r.AMP)) {
    if (ampExpectedS) {
      A.alerts.push({ lvl: "warn", txt: tr("Ampicilline R chez E. faecalis : inhabituel — vérifier l'identification et le résultat.",
        "Ampicillin R in E. faecalis: unusual — check the identification and the result.") });
    }
    A.rules.push({ k: "→R", txt: tr("Ampicilline R : impact sur les associations synergiques (β-lactamine + aminoside).",
      "Ampicillin R: this affects synergistic combinations (beta-lactam plus aminoglycoside).") });
    if (A.sev === "wild") A.sev = "mod";
  }

  if (isRI(r.HLG)) {
    A.alerts.push({ lvl: "warn", txt: tr("Haut niveau de résistance à la gentamicine (HLAR) : perte de la synergie β-lactamine + aminoside.",
      "High-level aminoglycoside resistance (HLAR): the beta-lactam plus aminoglycoside synergy is lost.") });
    A.rules.push({ k: "✕", txt: tr("Ne pas compter sur l'association aminoside pour un effet bactéricide synergique.",
      "Do not rely on an aminoglycoside combination for a synergistic bactericidal effect.") });
    if (A.sev === "wild") A.sev = "mod";
    A.comment += tr(" Haut niveau de résistance aux aminosides (perte de synergie).",
      " High-level aminoglycoside resistance (synergy lost).");
  }
  return finalize(A, r);
}

function pseudoInterpret(r, c) {
  const A = { sev: "wild", name: tr("Pseudomonas aeruginosa sauvage", "Wild-type Pseudomonas aeruginosa"),
    mech: tr("Rappel : résistances naturelles nombreuses (aminopénicillines, C1G–C2G, céfotaxime, ertapénème, cotrimoxazole…).",
             "Remember: many intrinsic resistances (aminopenicillins, 1st and 2nd generation cephalosporins, cefotaxime, ertapenem, trimethoprim-sulfamethoxazole…)."),
    alerts: [], rules: [], comment: "" };

  const classes = [
    isRI(r.TZP) || isRI(r.CAZ) || isRI(r.FEP),
    isRI(r.IPM) || isRI(r.MEM),
    isRI(r.CIP),
    isRI(r.GEN) || isRI(r.AMK)
  ].filter(Boolean).length;

  // Les familles comptées ci-dessus, dites en clair pour la grille.
  const antiPyo = tr("β-lactamine anti-pyocyanique atteinte", "antipseudomonal beta-lactam affected");
  const carbaT = tr("carbapénème atteint", "carbapenem affected");
  const aminoT = tr("aminoside atteint", "aminoglycoside affected");
  const FAMILLES = [["TZP", "RI", antiPyo],
                    ["CAZ", "RI", antiPyo],
                    ["FEP", "RI", antiPyo],
                    ["IPM", "RI", carbaT],
                    ["MEM", "RI", carbaT],
                    ["CIP", "RI", tr("fluoroquinolone atteinte", "fluoroquinolone affected")],
                    ["GEN", "RI", aminoT],
                    ["AMK", "RI", aminoT]];

  const carba = isRI(r.IPM) || isRI(r.MEM);
  const onlyColistin = has(r, "COL") && r.COL === "S" &&
    ["TZP", "CAZ", "FEP", "IPM", "MEM", "CIP", "GEN", "AMK"].every(k => !has(r, k) || isRI(r[k]));

  if (onlyColistin && classes >= 3) {
    A.sev = "crit"; A.name = tr("Pseudomonas toto-résistant (XDR)", "Extensively drug-resistant Pseudomonas (XDR)");
    A.mech = tr("Résistance à quasiment toutes les familles anti-pyocyaniques, colistine encore active.",
                "Resistance to almost every antipseudomonal class, with colistin still active.");
    parce(A, r, {
      pour: FAMILLES.concat([["COL", "S", tr("colistine encore active — c'est ce qui sépare le toto-résistant du multirésistant",
                                             "colistin still active — that is what separates extensively from multidrug resistant")]]),
      aConfirmerPar: tr("CMI de colistine par microdilution en milieu liquide : la méthode des disques ne vaut pas pour elle",
                        "a colistin MIC by broth microdilution: disk diffusion is not valid for this agent")
    });
    A.alerts.push({ lvl: "crit", txt: tr("Précautions complémentaires contact et signalement. Avis référent en antibiothérapie.",
      "Contact precautions and notification. Seek advice from the antimicrobial stewardship team.") });
    A.comment = tr("Pseudomonas aeruginosa toto-résistant (XDR) : seule la colistine reste active sur le panel. Souche à signaler ; avis spécialisé indispensable.",
      "Extensively drug-resistant Pseudomonas aeruginosa (XDR): colistin alone remains active on the panel. Notifiable isolate; specialist advice is essential.");
  } else if (classes >= 3) {
    A.sev = "high"; A.name = tr("Pseudomonas multirésistant (MDR)", "Multidrug-resistant Pseudomonas (MDR)");
    A.mech = tr("Résistance acquise à au moins trois familles anti-pyocyaniques.",
                "Acquired resistance to at least three antipseudomonal classes.");
    parce(A, r, { pour: FAMILLES });
    A.alerts.push({ lvl: "warn", txt: tr("Précautions complémentaires contact ; options thérapeutiques limitées.",
      "Contact precautions; treatment options are limited.") });
    A.comment = tr("Pseudomonas aeruginosa multirésistant (MDR). Options thérapeutiques restreintes — voir antibiogramme détaillé.",
      "Multidrug-resistant Pseudomonas aeruginosa (MDR). Treatment options are narrow — see the full antibiogram.");
  } else if (carba) {
    A.sev = "high"; A.name = tr("Résistance aux carbapénèmes", "Carbapenem resistance");
    A.mech = tr("Sensibilité diminuée aux carbapénèmes : imperméabilité (perte OprD) et/ou carbapénémase.",
                "Reduced carbapenem susceptibility: impermeability (loss of OprD) and/or a carbapenemase.");
    parce(A, r, {
      pour: [["IPM", "RI", tr("imipénème atteint — la perte de la porine OprD l'atteint en premier",
                              "imipenem affected — loss of the OprD porin affects it first")],
             ["MEM", "RI", tr("méropénème atteint", "meropenem affected")]],
      contre: [["CAZ", "S", tr("une ceftazidime conservée oriente vers une imperméabilité plutôt que vers une carbapénémase",
                               "a preserved ceftazidime points to impermeability rather than to a carbapenemase")]],
      aConfirmerPar: tr("recherche de carbapénémase, qui change la conduite d'hygiène",
                        "testing for a carbapenemase, which changes infection-control measures")
    });
    A.alerts.push({ lvl: "warn", txt: tr("Discordance imipénème/méropénème possible ; envisager confirmation de carbapénémase.",
      "Imipenem and meropenem may disagree; consider confirming a carbapenemase.") });
    A.comment = tr("Pseudomonas aeruginosa de sensibilité diminuée aux carbapénèmes (imperméabilité et/ou carbapénémase à préciser).",
      "Pseudomonas aeruginosa with reduced carbapenem susceptibility (impermeability and/or a carbapenemase, to be determined).");
  } else if (classes > 0) {
    A.sev = "mod"; A.name = tr("Résistance acquise partielle", "Partial acquired resistance");
    A.mech = tr("Résistance acquise à une ou deux familles ; reste des anti-pyocyaniques conservé.",
                "Acquired resistance to one or two classes; the remaining antipseudomonal agents are preserved.");
    parce(A, r, { pour: FAMILLES });
    A.comment = tr("Pseudomonas aeruginosa avec résistance acquise partielle — se référer à l'antibiogramme.",
      "Pseudomonas aeruginosa with partial acquired resistance — refer to the antibiogram.");
  } else {
    parce(A, r, {
      pour: [["CAZ", "S", tr("ceftazidime active : pas de céphalosporinase AmpC déréprimée",
                             "ceftazidime active: no derepressed AmpC cephalosporinase")],
             ["IPM", "S", tr("imipénème actif : porine OprD conservée", "imipenem active: the OprD porin is intact")],
             ["CIP", "S", tr("fluoroquinolone active", "fluoroquinolone active")],
             ["GEN", "S", tr("aminoside actif", "aminoglycoside active")]]
    });
    A.comment = tr("Pseudomonas aeruginosa de phénotype sauvage sur le panel testé.",
      "Wild-type Pseudomonas aeruginosa on the panel tested.");
  }
  return finalize(A, r);
}

function acinetoInterpret(r, c) {
  // Les familles anti-Acinetobacter, énoncées une fois et réutilisées par
  // chaque conclusion — comme chez Pseudomonas. Une liste par phénotype
  // finirait par diverger d'un phénotype à l'autre.
  const aminoA = tr("aminoside atteint", "aminoglycoside affected");
  const FAM_ACI = [["TZP", "RI", tr("pipéracilline-tazobactam atteinte", "piperacillin-tazobactam affected")],
                   ["CAZ", "RI", tr("ceftazidime atteinte", "ceftazidime affected")],
                   ["FEP", "RI", tr("céfépime atteint", "cefepime affected")],
                   ["IPM", "RI", tr("imipénème atteint", "imipenem affected")],
                   ["MEM", "RI", tr("méropénème atteint", "meropenem affected")],
                   ["CIP", "RI", tr("fluoroquinolone atteinte", "fluoroquinolone affected")],
                   ["GEN", "RI", aminoA],
                   ["AMK", "RI", aminoA]];
  const A = { sev: "wild", name: tr("Acinetobacter baumannii sauvage", "Wild-type Acinetobacter baumannii"),
    mech: tr("Rappel : résistances naturelles nombreuses (aminopénicillines, C1G–C2G, ertapénème, aztréonam, fosfomycine).",
             "Remember: many intrinsic resistances (aminopenicillins, 1st and 2nd generation cephalosporins, ertapenem, aztreonam, fosfomycin)."),
    alerts: [], rules: [], comment: "" };
  const carba = isRI(r.IPM) || isRI(r.MEM);
  const classes = [
    isRI(r.TZP) || isRI(r.CAZ) || isRI(r.FEP),
    carba,
    isRI(r.CIP),
    isRI(r.GEN) || isRI(r.AMK)
  ].filter(Boolean).length;
  const onlyColistin = has(r, "COL") && r.COL === "S" &&
    ["TZP", "CAZ", "FEP", "IPM", "MEM", "CIP", "GEN", "AMK", "SXT"].every(k => !has(r, k) || isRI(r[k]));

  if (onlyColistin && classes >= 3) {
    A.sev = "crit"; A.name = tr("Acinetobacter toto-résistant (XDR)", "Extensively drug-resistant Acinetobacter (XDR)");
    A.mech = tr("Résistance à quasiment toutes les familles disponibles, colistine encore active.",
                "Resistance to almost every available class, with colistin still active.");
    parce(A, r, {
      pour: FAM_ACI.concat([["COL", "S", tr("colistine encore active — c'est ce qui sépare le toto-résistant du multirésistant",
                                            "colistin still active — that is what separates extensively from multidrug resistant")]]),
      aConfirmerPar: tr("CMI de colistine par microdilution en milieu liquide : la méthode des disques ne vaut pas pour elle",
                        "a colistin MIC by broth microdilution: disk diffusion is not valid for this agent")
    });
    A.alerts.push({ lvl: "crit", txt: tr("Précautions complémentaires contact renforcées et signalement (potentiel épidémique en réanimation). Avis référent indispensable.",
      "Reinforced contact precautions and notification (outbreak potential in intensive care). Specialist advice is essential.") });
    A.comment = tr("Acinetobacter baumannii toto-résistant (XDR) : seule la colistine reste active sur le panel. Souche à signaler ; avis spécialisé indispensable.",
      "Extensively drug-resistant Acinetobacter baumannii (XDR): colistin alone remains active on the panel. Notifiable isolate; specialist advice is essential.");
  } else if (carba) {
    A.sev = "crit"; A.name = tr("Suspicion de carbapénémase (OXA / métallo-)", "Suspected carbapenemase (OXA or metallo-)");
    A.mech = tr("Sensibilité diminuée aux carbapénèmes : oxacillinases (OXA-23/24/58) le plus souvent, parfois métallo-β-lactamase.",
                "Reduced carbapenem susceptibility: most often an oxacillinase (OXA-23/24/58), sometimes a metallo-beta-lactamase.");
    parce(A, r, {
      pour: [["IPM", "RI", tr("imipénème atteint", "imipenem affected")],
             ["MEM", "RI", tr("méropénème atteint", "meropenem affected")]],
      // L'ertapénème est naturellement inactif sur Acinetobacter : l'invoquer
      // comme argument ferait passer une résistance naturelle pour un mécanisme
      // acquis. Il n'a donc rien à faire dans cette grille.
      contre: [["COL", "RI", tr("colistine atteinte elle aussi : la dernière ligne tombe — vérifier par microdilution avant de le rendre",
                                "colistin affected as well: the last line falls — confirm by broth microdilution before reporting it")]],
      aConfirmerPar: tr("confirmation du mécanisme (test de synergie aux inhibiteurs, ou biologie moléculaire) : OXA et métallo-β-lactamase n'ouvrent pas les mêmes options",
                        "confirmation of the mechanism (inhibitor synergy test, or molecular testing): an OXA and a metallo-beta-lactamase do not open the same options")
    });
    A.alerts.push({ lvl: "crit", txt: tr("Précautions complémentaires contact et signalement. Options thérapeutiques très limitées.",
      "Contact precautions and notification. Treatment options are very limited.") });
    A.rules.push({ k: "→R", txt: tr("β-lactamines à interpréter avec prudence ; confirmer le mécanisme.",
      "Interpret the beta-lactams with caution; confirm the mechanism.") });
    A.comment = tr("Acinetobacter baumannii de sensibilité diminuée aux carbapénèmes (carbapénémase probable). Souche à signaler, précautions complémentaires contact.",
      "Acinetobacter baumannii with reduced carbapenem susceptibility (a carbapenemase is likely). Notifiable isolate; contact precautions.");
  } else if (classes >= 3) {
    A.sev = "high"; A.name = tr("Acinetobacter multirésistant (MDR)", "Multidrug-resistant Acinetobacter (MDR)");
    A.mech = tr("Résistance acquise à au moins trois familles.", "Acquired resistance to at least three classes.");
    parce(A, r, { pour: FAM_ACI });
    A.alerts.push({ lvl: "warn", txt: tr("Précautions complémentaires contact ; options limitées.",
      "Contact precautions; options are limited.") });
    A.comment = tr("Acinetobacter baumannii multirésistant (MDR). Options thérapeutiques restreintes — voir antibiogramme détaillé.",
      "Multidrug-resistant Acinetobacter baumannii (MDR). Treatment options are narrow — see the full antibiogram.");
  } else if (classes > 0) {
    A.sev = "mod"; A.name = tr("Résistance acquise partielle", "Partial acquired resistance");
    A.mech = tr("Résistance acquise à une ou deux familles.", "Acquired resistance to one or two classes.");
    parce(A, r, { pour: FAM_ACI });
    A.comment = tr("Acinetobacter baumannii avec résistance acquise partielle — se référer à l'antibiogramme.",
      "Acinetobacter baumannii with partial acquired resistance — refer to the antibiogram.");
  } else {
    parce(A, r, {
      pour: [["IPM", "S", tr("imipénème actif : ni oxacillinase ni métallo-β-lactamase décelée",
                             "imipenem active: neither an oxacillinase nor a metallo-beta-lactamase detected")],
             ["CAZ", "S", tr("ceftazidime active", "ceftazidime active")],
             ["CIP", "S", tr("fluoroquinolone active", "fluoroquinolone active")],
             ["GEN", "S", tr("aminoside actif", "aminoglycoside active")]]
    });
    A.comment = tr("Acinetobacter baumannii de phénotype sauvage sur le panel testé.",
      "Wild-type Acinetobacter baumannii on the panel tested.");
  }
  return finalize(A, r);
}

function proteusInterpret(r, c, a) {
  const sp = (a && a.species) || "Proteus mirabilis";
  const A = enteroInterpret(r, c, { amino: "AMX", species: sp, imipenemIntrinsic: true });
  A.alerts.push({ lvl: "info", txt: tr(`Rappel : ${sp} est naturellement résistant à la colistine, aux tétracyclines, à la tigécycline et à la nitrofurantoïne (à ne pas rendre sensibles).`,
    `Reminder: ${sp} is intrinsically resistant to colistin, the tetracyclines, tigecycline and nitrofurantoin — never report them susceptible.`) });
  if (r.IPM === "I" && !isRI(r.MEM) && !isRI(r.ETP)) {
    A.alerts.push({ lvl: "info", txt: "Imipénème « I » isolé : sensibilité naturellement diminuée chez Proteus, sans valeur de carbapénémase. Se fier au méropénème." });
  }
  return A;
}

function salmonellaInterpret(r, c) {
  const A = enteroInterpret(r, c, { amino: "AMX", species: "Salmonella spp." });

  const fqLow = isRI(r.PEF) || r.CIP === "I";
  const fqHigh = r.CIP === "R";
  if (fqHigh) {
    if (A.sev === "wild" || A.sev === "mod") { A.sev = "high"; A.name = tr("Résistance aux fluoroquinolones", "Fluoroquinolone resistance"); }
    A.alerts.push({ lvl: "warn", txt: tr("Ciprofloxacine R : ne pas utiliser les fluoroquinolones en cas de fièvre typhoïde / infection invasive.",
      "Ciprofloxacin R: do not use the fluoroquinolones in typhoid fever or invasive infection.") });
    A.rules.push({ k: "✕", txt: tr("Fluoroquinolones à proscrire (échec clinique documenté sur les infections invasives à Salmonella).",
      "The fluoroquinolones are contraindicated: clinical failure is documented in invasive Salmonella infection.") });
    A.comment += tr(" Résistance aux fluoroquinolones : privilégier C3G ou azithromycine selon le site.",
      " Fluoroquinolone resistance: prefer a third-generation cephalosporin or azithromycin, according to the site.");
  } else if (fqLow) {
    if (A.sev === "wild") { A.sev = "mod"; A.name = "Résistance de bas niveau aux fluoroquinolones"; }
    // C'EST LE CAS OÙ L'EXPLICATION COMPTE LE PLUS : l'antibiogramme peut
    // montrer une ciprofloxacine sensible, et le clinicien ne comprendrait pas
    // qu'on la déconseille. Le dépistage par la péfloxacine est tout l'argument.
    parce(A, r, {
      pour: [["PEF", "RI", "péfloxacine atteinte — c'est le disque de DÉPISTAGE : il révèle une mutation gyrA ou un gène qnr que la ciprofloxacine peut masquer"],
             ["CIP", "I", "ciprofloxacine en sensibilité intermédiaire"]],
      contre: [["CIP", "S", "ciprofloxacine apparemment sensible : c'est précisément le piège que le dépistage par la péfloxacine existe pour déjouer"]],
      aConfirmerPar: "CMI de la ciprofloxacine, si le rendu doit être argumenté auprès du clinicien"
    });
    A.alerts.push({ lvl: "warn", txt: "Péfloxacine R (ou ciprofloxacine « I ») : résistance de bas niveau aux FQ (qnr / mutation gyrA). La ciprofloxacine peut apparaître sensible in vitro mais exposer à un échec clinique en typhoïde." });
    A.rules.push({ k: "→R", txt: "Rendre les fluoroquinolones résistantes malgré une CMI de ciprofloxacine apparemment basse." });
    A.comment += " Résistance de bas niveau aux fluoroquinolones détectée (dépistage péfloxacine) : fluoroquinolones déconseillées, préférer C3G ou azithromycine.";
  }

  A.alerts.push({ lvl: "info", txt: tr("Rappel Salmonella : aminosides et C1G/C2G actifs in vitro mais inefficaces in vivo — ne pas les proposer pour une infection systémique.",
    "Salmonella reminder: aminoglycosides and 1st/2nd generation cephalosporins are active in vitro but ineffective in vivo — do not offer them for systemic infection.") });
  return A;
}

function pneumoInterpret(r, c) {
  const A = { sev: "wild", name: tr("Pneumocoque sensible à la pénicilline", "Penicillin-susceptible pneumococcus"),
    mech: tr("Dépistage oxacilline en faveur d'une sensibilité conservée aux β-lactamines.",
             "The oxacillin screen favours preserved beta-lactam susceptibility."), alerts: [], rules: [], comment: "" };
  const mening = c && c.mening === "Oui";

  const oxaR = isRI(r.OXA);
  const betaR = isRI(r.PEN) || isRI(r.AMX) || isRI(r.CTX);
  if (betaR) {
    A.sev = "high"; A.name = tr("PSDP — sensibilité diminuée aux β-lactamines",
                                "PNSP — pneumococcus with reduced beta-lactam susceptibility");
    A.mech = tr("Pneumocoque de sensibilité diminuée à la pénicilline et/ou aux céphalosporines (modification des PLP).",
                "Pneumococcus with reduced susceptibility to penicillin and/or cephalosporins (altered penicillin-binding proteins).");
    parce(A, r, {
      pour: [["PEN", "RI", tr("pénicilline G atteinte", "benzylpenicillin affected")],
             ["AMX", "RI", tr("amoxicilline atteinte", "amoxicillin affected")],
             ["CTX", "RI", tr("céfotaxime atteint — l'atteinte des céphalosporines est plus tardive que celle de la pénicilline",
                              "cefotaxime affected — cephalosporins are affected later than penicillin")]],
      aConfirmerPar: tr("CMI de pénicilline G, d'amoxicilline et de céfotaxime, qui ne se recouvrent pas",
                        "MICs of benzylpenicillin, amoxicillin and cefotaxime, which do not overlap")
    });
    A.rules.push({ k: "CMI", txt: tr("Rendre pénicilline, amoxicilline et céfotaxime selon leur CMI (les catégories diffèrent par molécule).",
      "Report penicillin, amoxicillin and cefotaxime on their MICs (the categories differ from one agent to the next).") });
    if (mening) A.alerts.push({ lvl: "crit", txt: tr("Contexte méningé : appliquer les seuils méningés (stricts). Céfotaxime/ceftriaxone à forte dose ; avis spécialisé.",
      "Meningitis: apply the meningeal breakpoints, which are strict. High-dose cefotaxime or ceftriaxone; seek specialist advice.") });
    A.comment = tr(`Streptococcus pneumoniae de sensibilité diminuée aux β-lactamines (PSDP). Rendre pénicilline G, amoxicilline et céfotaxime selon leurs CMI respectives${mening ? ", avec les seuils méningés" : ""}.`,
      `Streptococcus pneumoniae with reduced beta-lactam susceptibility (PNSP). Report benzylpenicillin, amoxicillin and cefotaxime on their respective MICs${mening ? ", using the meningeal breakpoints" : ""}.`);
  } else if (oxaR) {
    A.sev = "mod"; A.name = tr("Dépistage oxacilline positif — CMI requises", "Oxacillin screen positive — MICs required");
    A.mech = tr("Diamètre oxacilline diminué : sensibilité aux β-lactamines à confirmer par les CMI de pénicilline, amoxicilline et céfotaxime.",
                "Reduced oxacillin zone: beta-lactam susceptibility must be confirmed by the MICs of penicillin, amoxicillin and cefotaxime.");
    parce(A, r, {
      pour: [["OXA", "RI", tr("dépistage à l'oxacilline positif — il signale une modification des protéines liant les pénicillines, PAS une résistance clinique",
                              "oxacillin screen positive — it signals altered penicillin-binding proteins, NOT clinical resistance")]],
      aConfirmerPar: tr("CMI de pénicilline G, d'amoxicilline et de céfotaxime : le dépistage ne tranche pas, il alerte",
                        "MICs of benzylpenicillin, amoxicillin and cefotaxime: the screen does not decide, it warns")
    });
    A.alerts.push({ lvl: "warn", txt: tr("Déterminer les CMI de pénicilline G, amoxicilline et céfotaxime avant de conclure.",
      "Determine the MICs of benzylpenicillin, amoxicillin and cefotaxime before concluding.") });
    A.comment = tr("Streptococcus pneumoniae : dépistage oxacilline positif. Déterminer les CMI de pénicilline, amoxicilline et céfotaxime pour catégorisation.",
      "Streptococcus pneumoniae: oxacillin screen positive. Determine the MICs of penicillin, amoxicillin and cefotaxime in order to categorise.");
  } else {
    A.comment = tr("Streptococcus pneumoniae sensible à la pénicilline (dépistage oxacilline négatif).",
      "Streptococcus pneumoniae susceptible to penicillin (oxacillin screen negative).");
  }

  if (isR(r.E) && r.DA === "S") {
    A.alerts.push({ lvl: "info", txt: tr("Érythromycine R et clindamycine S : rechercher une résistance inductible (D-test) avant de rendre la clindamycine.",
      "Erythromycin R and clindamycin S: look for inducible resistance (D-test) before reporting clindamycin.") });
  } else if (isR(r.E) && isR(r.DA)) {
    A.rules.push({ k: "MLS", txt: tr("Résistance constitutive MLSb (macrolides + lincosamides).",
      "Constitutive MLSb resistance (macrolides and lincosamides).") });
  }

  if (isRI(r.VA)) {
    A.sev = "crit";
    A.alerts.unshift({ lvl: "crit", txt: tr("Vancomycine non sensible chez un pneumocoque : exceptionnel — vérifier l'identification et la CMI d'urgence.",
      "Vancomycin not susceptible in a pneumococcus: exceptional — check the identification and the MIC urgently.") });
  }
  return finalize(A, r);
}

function strepInterpret(r, c, a) {
  const sp = (a && a.species) || "Streptococcus";
  const grp = (a && a.group) || "viridans";
  const betaHem = grp === "A" || grp === "B" || grp === "CG";
  const A = { sev: "wild", name: "", mech: "", alerts: [], rules: [], comment: "" };
  const penRI = isRI(r.PEN) || isRI(r.AMX) || isRI(r.CTX);

  if (betaHem) {
    A.name = tr(`${sp} — sensible à la pénicilline`, `${sp} — penicillin-susceptible`);
    A.mech = tr("Streptocoque β-hémolytique : la pénicilline G reste l'antibiotique de référence (aucune résistance acquise décrite).",
                "Beta-haemolytic streptococcus: benzylpenicillin remains the reference agent (no acquired resistance has been described).");
    A.comment = tr(`${sp}. Pénicilline G / amoxicilline : traitement de référence, sensibilité conservée.`,
                   `${sp}. Benzylpenicillin / amoxicillin: reference treatment, susceptibility preserved.`);
    parce(A, r, {
      pour: [["PEN", "S", tr("pénicilline G active — aucune résistance acquise n'est décrite chez les streptocoques β-hémolytiques",
                             "benzylpenicillin active — no acquired resistance has been described in beta-haemolytic streptococci")],
             ["AMX", "S", tr("amoxicilline active", "amoxicillin active")]]
    });
    if (penRI) {
      A.sev = "high"; A.name = tr("Sensibilité β-lactamine inhabituelle", "Unusual beta-lactam susceptibility");
      A.mech = tr("Résistance/sensibilité diminuée aux β-lactamines chez un streptocoque β-hémolytique.",
                  "Resistance or reduced beta-lactam susceptibility in a beta-haemolytic streptococcus.");
      parce(A, r, {
        pour: [["PEN", "RI", tr("pénicilline G atteinte", "benzylpenicillin affected")],
               ["AMX", "RI", tr("amoxicilline atteinte", "amoxicillin affected")],
               ["CTX", "RI", tr("céfotaxime atteinte", "cefotaxime affected")]],
        aConfirmerPar: tr("vérification de l'identification et CMI : aucune résistance acquise à la pénicilline n'est décrite dans cette espèce, l'erreur d'identification est l'hypothèse la plus probable",
                          "checking the identification, and an MIC: no acquired penicillin resistance has been described in this species, so a misidentification is the most likely explanation")
      });
      A.alerts.push({ lvl: "warn", txt: tr("Résistance aux β-lactamines chez un streptocoque β-hémolytique : exceptionnel — vérifier l'identification et la CMI.",
        "Beta-lactam resistance in a beta-haemolytic streptococcus: exceptional — check the identification and the MIC.") });
      A.comment = tr(`${sp} : profil β-lactamine inhabituel, à confirmer.`, `${sp}: unusual beta-lactam profile, to be confirmed.`);
    }
  } else {
    if (penRI) {
      A.sev = "high"; A.name = tr("Sensibilité diminuée aux β-lactamines (PLP)", "Reduced beta-lactam susceptibility (PBP)");
      A.mech = tr("Streptocoque du groupe viridans avec sensibilité diminuée à la pénicilline (modification des PLP).",
                  "Viridans group streptococcus with reduced penicillin susceptibility (altered penicillin-binding proteins).");
      parce(A, r, {
        pour: [["PEN", "RI", tr("pénicilline G atteinte — par modification des protéines liant la pénicilline, non par une β-lactamase",
                                "benzylpenicillin affected — through altered penicillin-binding proteins, not through a beta-lactamase")],
               ["AMX", "RI", tr("amoxicilline atteinte", "amoxicillin affected")],
               ["CTX", "RI", tr("céfotaxime atteinte : l'atteinte s'étend aux C3G", "cefotaxime affected: the change extends to the third-generation cephalosporins")]],
        contre: [["CTX", "S", tr("céfotaxime conservée : l'altération des PLP reste partielle, ce qui laisse une porte thérapeutique",
                                 "cefotaxime preserved: the alteration of the binding proteins is partial, which leaves a therapeutic option")]],
        aConfirmerPar: tr("CMI de la pénicilline, de l'amoxicilline et de la ceftriaxone — ici le rendu catégoriel ne suffit pas, surtout en endocardite",
                          "MICs of penicillin, amoxicillin and ceftriaxone — a categorical result is not enough here, least of all in endocarditis")
      });
      A.rules.push({ k: "CMI", txt: tr("Rendre pénicilline, amoxicilline et ceftriaxone selon leurs CMI respectives.",
        "Report penicillin, amoxicillin and ceftriaxone on their respective MICs.") });
      A.alerts.push({ lvl: "warn", txt: tr("Contexte endocardite : une sensibilité diminuée à la pénicilline modifie le schéma (association à un aminoside à discuter).",
        "In endocarditis, reduced penicillin susceptibility changes the regimen (adding an aminoglycoside is to be discussed).") });
      A.comment = tr(`${sp} de sensibilité diminuée aux β-lactamines. Interpréter pénicilline / amoxicilline / ceftriaxone selon la CMI.`,
        `${sp} with reduced beta-lactam susceptibility. Interpret penicillin, amoxicillin and ceftriaxone on the MIC.`);
    } else {
      A.name = tr(`${sp} — sensible à la pénicilline`, `${sp} — penicillin-susceptible`);
      A.mech = tr("Streptocoque du groupe viridans sensible aux β-lactamines.",
                  "Viridans group streptococcus susceptible to beta-lactams.");
      parce(A, r, {
        pour: [["PEN", "S", tr("pénicilline G active : protéines liant la pénicilline non modifiées",
                               "benzylpenicillin active: penicillin-binding proteins unaltered")],
               ["AMX", "S", tr("amoxicilline active", "amoxicillin active")]]
      });
      A.comment = tr(`${sp} sensible à la pénicilline.`, `${sp} susceptible to penicillin.`);
    }
  }

  if (isR(r.E) && r.DA === "S") {
    if (c && c.dtest === "Positif") {
      A.alerts.push({ lvl: "warn", txt: tr("MLSb inductible (D-test positif) : clindamycine rendue R malgré une sensibilité apparente in vitro.",
        "Inducible MLSb (positive D-test): clindamycin reported R despite apparent susceptibility in vitro.") });
      A.rules.push({ k: "→R", txt: tr("Clindamycine rendue R (résistance inductible démontrée).",
        "Clindamycin reported R (inducible resistance demonstrated).") });
      A.comment += tr(" Résistance inductible à la clindamycine (MLSb, D-test positif).",
        " Inducible clindamycin resistance (MLSb, positive D-test).");
    // « PAS ENCORE RÉPONDU » EST AUSSI UN D-TEST NON FAIT, et c'est même
    // l'état de DÉPART de tout antibiogramme : la question s'affiche sans
    // réponse cochée. La condition ne reconnaissait que « Non fait »
    // explicitement choisi — si bien qu'au moment où le rappel compte le
    // plus, personne ne le voyait. Pire : décocher une réponse déjà donnée
    // faisait disparaître l'avertissement en silence.
    } else if (!c || !c.dtest || c.dtest === "Non fait") {
      A.alerts.push({ lvl: "info", txt: tr("Érythromycine R et clindamycine S : réaliser un D-test avant de rendre la clindamycine.",
        "Erythromycin R and clindamycin S: perform a D-test before reporting clindamycin.") });
    }
  } else if (isR(r.E) && isR(r.DA)) {
    A.rules.push({ k: "MLS", txt: tr("Résistance constitutive MLSb (macrolides + lincosamides).",
      "Constitutive MLSb resistance (macrolides and lincosamides).") });
    if (A.sev === "wild") A.sev = "mod";
  }

  if (isRI(r.VA)) {
    A.sev = "crit";
    A.alerts.unshift({ lvl: "crit", txt: tr("Vancomycine non sensible chez un streptocoque : exceptionnel — vérifier l'identification et la CMI d'urgence.",
      "Vancomycin not susceptible in a streptococcus: exceptional — check the identification and the MIC urgently.") });
  }
  return finalize(A, r);
}

function stenoburkInterpret(r, c, a) {
  const sp = (a && a.species) || "Bacille non fermentant";
  const type = (a && a.type) || "steno";
  const A = { sev: "high", name: tr(`${sp} — multirésistance naturelle`, `${sp} — intrinsic multidrug resistance`),
              mech: "", alerts: [], rules: [], comment: "" };

  if (type === "steno") {
    A.mech = tr("Stenotrophomonas maltophilia : deux β-lactamases chromosomiques (L1 métallo-carbapénémase + L2 céphalosporinase) et résistance naturelle aux aminosides.",
                "Stenotrophomonas maltophilia: two chromosomal beta-lactamases (the L1 metallo-carbapenemase and the L2 cephalosporinase) and intrinsic resistance to the aminoglycosides.");
    A.rules.push({ k: "✕", txt: tr("Carbapénèmes intrinsèquement inactifs (L1) — ne pas utiliser même si « S » in vitro.",
      "Carbapenems intrinsically inactive (L1) — do not use them even when they test \u0022S\u0022 in vitro.") });
    A.rules.push({ k: "✕", txt: tr("Aminosides naturellement inactifs.", "Aminoglycosides intrinsically inactive.") });
    A.rules.push({ k: "✚", txt: tr("Cotrimoxazole = référence ; alternatives : lévofloxacine, minocycline, ceftazidime (selon CMI).",
      "Co-trimoxazole is the reference treatment; alternatives are levofloxacin, minocycline and ceftazidime, on the MIC.") });
    // Ici l'argument n'est pas une résistance acquise : c'est que le
    // traitement de référence tient encore. Le reste du profil est naturel,
    // et l'invoquer comme argument ferait passer l'espèce pour résistante.
    parce(A, r, {
      pour: [["SXT", "S", tr("cotrimoxazole actif — c'est le traitement de référence de cette espèce",
                             "co-trimoxazole active — it is the reference treatment for this species")]],
      contre: [["SXT", "R", tr("cotrimoxazole résistant : le traitement de référence tombe, avis référent indispensable",
                               "co-trimoxazole resistant: the reference treatment is lost, specialist advice is essential")],
               ["IPM", "S", tr("imipénème rendu sensible : la carbapénémase L1 est NATURELLE chez cette espèce — ne pas s'y fier",
                               "imipenem reported susceptible: the L1 carbapenemase is INTRINSIC in this species — do not rely on it")]],
      aConfirmerPar: tr("CMI du cotrimoxazole et de la lévofloxacine si le traitement de référence est mis en défaut",
        "co-trimoxazole and levofloxacin MICs if the reference treatment is in doubt")
    });
    A.comment = tr("Stenotrophomonas maltophilia : multirésistance naturelle. Les carbapénèmes et les aminosides sont naturellement inactifs (à ne pas rendre sensibles). Le cotrimoxazole est le traitement de référence.",
      "Stenotrophomonas maltophilia: intrinsic multidrug resistance. Carbapenems and aminoglycosides are intrinsically inactive and must never be reported susceptible. Co-trimoxazole is the reference treatment.");
    if (isR(r.SXT)) {
      A.sev = "crit";
      A.alerts.push({ lvl: "crit", txt: tr("Cotrimoxazole résistant : perte du traitement de référence — avis référent en antibiothérapie indispensable.",
        "Co-trimoxazole resistant: the reference treatment is lost — specialist antimicrobial advice is essential.") });
      A.comment += tr(" Cotrimoxazole résistant : options très limitées, avis spécialisé.",
        " Co-trimoxazole resistant: options are very limited, seek specialist advice.");
    }
    A.alerts.push({ lvl: "info", txt: tr("Colistine : activité inconstante sur S. maltophilia — ne pas s'y fier.",
      "Colistin: activity against S. maltophilia is inconsistent — do not rely on it.") });
  } else {
    A.mech = tr("Burkholderia cepacia : résistance naturelle aux aminosides et aux polymyxines (colistine), et à de nombreux β-lactames.",
                "Burkholderia cepacia: intrinsic resistance to the aminoglycosides, to the polymyxins (colistin) and to many beta-lactams.");
    A.rules.push({ k: "✕", txt: tr("Colistine / polymyxines intrinsèquement inactives — ne jamais rendre sensibles.",
      "Colistin and the polymyxins intrinsically inactive — never report them susceptible.") });
    A.rules.push({ k: "✕", txt: tr("Aminosides naturellement inactifs.", "Aminoglycosides intrinsically inactive.") });
    A.rules.push({ k: "✚", txt: tr("Options : cotrimoxazole, ceftazidime, méropénème, minocycline (selon CMI).",
      "Options: co-trimoxazole, ceftazidime, meropenem and minocycline, on the MIC.") });
    parce(A, r, {
      pour: [["SXT", "S", tr("cotrimoxazole actif", "co-trimoxazole active")],
             ["CAZ", "S", tr("ceftazidime active", "ceftazidime active")],
             ["MEM", "S", tr("méropénème actif", "meropenem active")]],
      contre: [["COL", "S", tr("colistine rendue sensible : la résistance aux polymyxines est NATURELLE chez cette espèce — ne jamais la rendre sensible",
                               "colistin reported susceptible: polymyxin resistance is INTRINSIC in this species — never report it susceptible")]],
      aConfirmerPar: tr("CMI des options retenues : chez Burkholderia, le rendu catégoriel par diffusion est peu fiable",
        "MICs for the options chosen: in Burkholderia, categorical reporting by disc diffusion is unreliable")
    });
    A.comment = tr("Burkholderia cepacia : multirésistance naturelle. Colistine et aminosides naturellement inactifs (à ne pas rendre sensibles). Options : cotrimoxazole, ceftazidime, méropénème, minocycline selon la CMI.",
      "Burkholderia cepacia: intrinsic multidrug resistance. Colistin and the aminoglycosides are intrinsically inactive and must never be reported susceptible. Options: co-trimoxazole, ceftazidime, meropenem and minocycline, on the MIC.");
    if (isR(r.SXT) && isRI(r.CAZ) && isRI(r.MEM)) {
      A.sev = "crit";
      A.alerts.push({ lvl: "crit", txt: tr("Cotrimoxazole, ceftazidime et méropénème inactifs : impasse thérapeutique — avis référent indispensable.",
        "Co-trimoxazole, ceftazidime and meropenem all inactive: a therapeutic dead end — specialist advice is essential.") });
    }
  }
  A.alerts.push({ lvl: "warn", txt: tr("Précautions complémentaires contact ; germe d'intérêt en réanimation et mucoviscidose.",
    "Contact precautions; an organism of concern in intensive care and in cystic fibrosis.") });
  return finalize(A, r);
}

function fastidInterpret(r, c, a) {
  const sp = (a && a.species) || tr("Bactérie exigeante", "Fastidious organism");
  const type = (a && a.type) || "haemophilus";
  const A = { sev: "wild", name: "", mech: "", alerts: [], rules: [], comment: "" };
  const blac = c && c.blac;

  if (type === "haemophilus") {
    const ampR = isRI(r.AMP) || isRI(r.AMX);
    const amcR = isRI(r.AMC);
    if (blac === "Positif") {
      if (amcR) {
        A.sev = "high"; A.name = tr("BLPACR (β-lactamase + PLP3)", "BLPACR (beta-lactamase + altered PBP3)");
        A.mech = tr("Double mécanisme : β-lactamase ET modification de PLP3 (ftsI).",
                    "Two mechanisms at once: a beta-lactamase AND an altered PBP3 (ftsI).");
        parce(A, r, {
          pour: [["AMP", "RI", tr("ampicilline atteinte", "ampicillin affected")],
                 ["AMC", "RI", tr("l'association avec le clavulanate reste atteinte : l'inhibiteur ne restaure pas tout, donc une PLP3 modifiée s'ajoute à l'enzyme",
                                  "the clavulanate combination is still affected: the inhibitor does not restore everything, so an altered PBP3 is present on top of the enzyme")]],
          confirme: tr("test à la β-lactamase (nitrocéfine) positif", "a positive beta-lactamase (nitrocefin) test")
        });
        A.rules.push({ k: "→R", txt: tr("Aminopénicillines et associations avec inhibiteur R ; sensibilité aux C3G diminuée — vérifier la CMI de céfotaxime.",
          "Aminopenicillins and inhibitor combinations R; reduced susceptibility to third-generation cephalosporins — check the cefotaxime MIC.") });
        A.comment = tr(`${sp} BLPACR (β-lactamase + PLP3 modifiée). Aminopénicillines et amoxicilline-clavulanate résistantes ; C3G à interpréter selon la CMI.`,
          `${sp}, BLPACR (beta-lactamase plus altered PBP3). Aminopenicillins and amoxicillin-clavulanate resistant; interpret third-generation cephalosporins on the MIC.`);
      } else {
        A.sev = "mod"; A.name = tr("BLPAR (β-lactamase +)", "BLPAR (beta-lactamase positive)");
        A.mech = tr("β-lactamase (TEM-1 le plus souvent) : aminopénicillines hydrolysées, restaurées par le clavulanate.",
                    "A beta-lactamase, usually TEM-1: aminopenicillins are hydrolysed and restored by clavulanate.");
        parce(A, r, {
          pour: [["AMP", "RI", tr("ampicilline atteinte — l'enzyme l'hydrolyse", "ampicillin affected — the enzyme hydrolyses it")],
                 ["AMC", "S", tr("le clavulanate restaure l'activité : c'est la signature d'une β-lactamase seule",
                                 "clavulanate restores activity: that is the signature of a beta-lactamase alone")]],
          confirme: tr("test à la β-lactamase (nitrocéfine) positif", "a positive beta-lactamase (nitrocefin) test")
        });
        A.rules.push({ k: "→R", txt: tr("Ampicilline / amoxicilline R ; amoxicilline-clavulanate et C3G actives.",
          "Ampicillin and amoxicillin R; amoxicillin-clavulanate and third-generation cephalosporins active.") });
        A.comment = tr(`${sp} producteur de β-lactamase (BLPAR). Ampicilline/amoxicilline résistantes ; amoxicilline-clavulanate et céphalosporines de 3e génération actives.`,
          `${sp} producing a beta-lactamase (BLPAR). Ampicillin and amoxicillin resistant; amoxicillin-clavulanate and third-generation cephalosporins active.`);
      }
    } else if (ampR) {
      if (amcR || blac === "Négatif") {
        A.sev = "high"; A.name = tr("BLNAR (PLP3 modifiée)", "BLNAR (altered PBP3)");
        A.mech = tr("Résistance à l'ampicilline sans β-lactamase : modification de PLP3 (ftsI). Le clavulanate ne restaure pas l'activité.",
                    "Ampicillin resistance without a beta-lactamase: an altered PBP3 (ftsI). Clavulanate does not restore activity.");
        parce(A, r, {
          pour: [["AMP", "RI", tr("ampicilline atteinte", "ampicillin affected")],
                 ["AMC", "RI", tr("le clavulanate ne restaure rien : la cible est modifiée, il n'y a pas d'enzyme à inhiber",
                                  "clavulanate restores nothing: the target is altered, there is no enzyme to inhibit")]],
          confirme: blac === "Négatif" ? tr("test à la β-lactamase (nitrocéfine) négatif", "a negative beta-lactamase (nitrocefin) test") : null,
          aConfirmerPar: blac === "Négatif" ? null : tr("test à la β-lactamase (nitrocéfine), qui sépare ce phénotype d'une β-lactamase",
            "a beta-lactamase (nitrocefin) test, which separates this phenotype from a beta-lactamase")
        });
        A.rules.push({ k: "→R", txt: tr("Aminopénicillines R ; associations avec inhibiteur peu fiables ; sensibilité aux C3G diminuée — vérifier la CMI.",
          "Aminopenicillins R; inhibitor combinations unreliable; reduced susceptibility to third-generation cephalosporins — check the MIC.") });
        A.alerts.push({ lvl: "warn", txt: tr("BLNAR : privilégier une C3G (céfotaxime/ceftriaxone) pour les formes invasives, après vérification de la CMI.",
          "BLNAR: prefer a third-generation cephalosporin (cefotaxime or ceftriaxone) for invasive disease, after checking the MIC.") });
        A.comment = tr(`${sp} BLNAR (PLP3 modifiée, β-lactamase négative). Aminopénicillines résistantes non restaurées par le clavulanate ; C3G selon la CMI.`,
          `${sp}, BLNAR (altered PBP3, beta-lactamase negative). Aminopenicillins resistant and not restored by clavulanate; third-generation cephalosporins on the MIC.`);
      } else {
        A.sev = "mod"; A.name = tr("Ampicilline R — mécanisme à préciser", "Ampicillin R — mechanism undetermined");
        parce(A, r, {
          pour: [["AMP", "RI", tr("ampicilline atteinte", "ampicillin affected")],
                 ["AMC", "S", tr("le clavulanate restaure l'activité, ce qui oriente vers une β-lactamase — mais sans la nitrocéfine, ce n'est qu'une orientation",
                                 "clavulanate restores activity, which points to a beta-lactamase — but without the nitrocefin test this is only a pointer")]],
          aConfirmerPar: tr("test à la β-lactamase (nitrocéfine) : c'est lui qui sépare BLPAR de BLNAR, et les deux ne se traitent pas de la même façon",
            "a beta-lactamase (nitrocefin) test: it is what separates BLPAR from BLNAR, and the two are not treated the same way")
        });
        A.alerts.push({ lvl: "info", txt: tr("Réaliser le test à la β-lactamase (nitrocéfine) pour distinguer BLPAR de BLNAR.",
          "Perform the beta-lactamase (nitrocefin) test to tell BLPAR from BLNAR.") });
        A.comment = tr(`${sp} : ampicilline résistante, mécanisme à préciser (test β-lactamase recommandé).`,
          `${sp}: ampicillin resistant, mechanism undetermined (a beta-lactamase test is recommended).`);
      }
    } else {
      A.name = tr(`${sp} — sensible à l'ampicilline`, `${sp} — ampicillin-susceptible`);
      A.mech = tr("Pas de β-lactamase ni de modification de PLP détectée.",
                  "Neither a beta-lactamase nor an altered penicillin-binding protein detected.");
      parce(A, r, {
        pour: [["AMP", "S", tr("ampicilline active : ni β-lactamase, ni PLP3 modifiée",
                               "ampicillin active: no beta-lactamase and no altered PBP3")],
               ["AMC", "S", tr("association clavulanique active", "the clavulanate combination is active")]]
      });
      A.comment = tr(`${sp} sensible à l'ampicilline (souche sauvage).`, `${sp} susceptible to ampicillin (wild type).`);
    }
    if (isRI(r.CTX)) A.alerts.push({ lvl: "warn", txt: tr("Sensibilité diminuée au céfotaxime : inhabituel — vérifier la CMI (BLNAR/BLPACR de haut niveau).",
      "Reduced cefotaxime susceptibility: unusual — check the MIC (high-level BLNAR or BLPACR).") });
    A.alerts.push({ lvl: "info", txt: tr("Formes invasives / méningite : C3G (céfotaxime, ceftriaxone) = référence.",
      "Invasive disease and meningitis: a third-generation cephalosporin (cefotaxime, ceftriaxone) is the reference treatment.") });
  }

  else if (type === "meningitidis") {
    const penRI = isRI(r.PEN) || isRI(r.AMX);
    if (penRI) {
      A.sev = "mod"; A.name = tr("Sensibilité diminuée à la pénicilline (penA/PLP2)", "Reduced penicillin susceptibility (penA / PBP2)");
      A.mech = tr("Modification de PLP2 : sensibilité diminuée à la pénicilline G et à l'amoxicilline.",
                  "An altered PBP2: reduced susceptibility to benzylpenicillin and amoxicillin.");
      parce(A, r, {
        pour: [["PEN", "RI", tr("pénicilline G atteinte sans β-lactamase décelée — la cible est modifiée",
                                "benzylpenicillin affected with no beta-lactamase detected — the target is altered")]],
        aConfirmerPar: tr("CMI de ceftriaxone, qui conditionne le traitement", "a ceftriaxone MIC, which determines the treatment")
      });
      A.rules.push({ k: "CMI", txt: tr("Rendre la pénicilline selon la CMI ; la C3G reste active.",
        "Report penicillin on the MIC; the third-generation cephalosporin remains active.") });
      A.comment = tr(`${sp} de sensibilité diminuée à la pénicilline. La céfotaxime/ceftriaxone reste le traitement de référence des formes invasives.`,
        `${sp} with reduced penicillin susceptibility. Cefotaxime or ceftriaxone remains the reference treatment for invasive disease.`);
    } else {
      A.name = tr(`${sp} — sensible à la pénicilline`, `${sp} — penicillin-susceptible`);
      parce(A, r, {
        pour: [["PEN", "S", tr("pénicilline G active : protéine liant la pénicilline PLP2 non modifiée",
                               "benzylpenicillin active: penicillin-binding protein PBP2 unaltered")],
               ["CTX", "S", tr("céfotaxime active — c'est elle qui traite les formes invasives",
                               "cefotaxime active — it is what treats invasive disease")]]
      });
      A.comment = tr(`${sp} sensible à la pénicilline. Céfotaxime/ceftriaxone = référence des formes invasives.`,
        `${sp} susceptible to penicillin. Cefotaxime or ceftriaxone is the reference treatment for invasive disease.`);
    }
    if (isRI(r.CTX)) { A.sev = "crit"; A.alerts.unshift({ lvl: "crit", txt: tr("Sensibilité diminuée à la C3G chez un méningocoque : exceptionnel — vérifier d'urgence.",
      "Reduced third-generation cephalosporin susceptibility in a meningococcus: exceptional — verify urgently.") }); }
    A.alerts.push({ lvl: "info", txt: tr("Prophylaxie des sujets contacts : rifampicine ou ciprofloxacine (vérifier leur sensibilité).",
      "Prophylaxis of close contacts: rifampicin or ciprofloxacin (check their susceptibility).") });
  }

  else if (type === "gonorrhoeae") {
    const ppng = blac === "Positif" || isRI(r.PEN);
    if (isRI(r.CTX)) {
      A.sev = "crit"; A.name = tr("Sensibilité diminuée à la ceftriaxone", "Reduced ceftriaxone susceptibility");
      A.mech = tr("Sensibilité diminuée aux C3G : menace majeure (échecs thérapeutiques).",
                  "Reduced susceptibility to third-generation cephalosporins: a major threat, with treatment failures.");
      parce(A, r, {
        pour: [["CTX", "RI", tr("céfotaxime/ceftriaxone atteinte — c'est le dernier traitement de première intention du gonocoque",
                                "cefotaxime or ceftriaxone affected — it is the last remaining first-line treatment for gonorrhoea")]],
        aConfirmerPar: tr("CMI de la ceftriaxone et envoi au centre national de référence : ce rendu engage une déclaration",
          "a ceftriaxone MIC and referral to the national reference centre: this result triggers a notification")
      });
      A.alerts.push({ lvl: "crit", txt: tr("Sensibilité diminuée à la ceftriaxone/céfotaxime : signalement et avis référent — enjeu de santé publique.",
        "Reduced ceftriaxone or cefotaxime susceptibility: notify and seek specialist advice — this is a public health matter.") });
      A.comment = tr(`${sp} de sensibilité diminuée à la ceftriaxone. Souche à signaler ; avis spécialisé indispensable.`,
        `${sp} with reduced ceftriaxone susceptibility. Notifiable isolate; specialist advice is essential.`);
    } else if (ppng) {
      A.sev = "high"; A.name = tr("PPNG (β-lactamase +)", "PPNG (penicillinase-producing)");
      A.mech = tr("Pénicillinase plasmidique : pénicilline inactive.", "A plasmid-borne penicillinase: penicillin is inactive.");
      parce(A, r, {
        pour: [["PEN", "RI", tr("pénicilline G atteinte — la pénicillinase plasmidique l'hydrolyse",
                                "benzylpenicillin affected — the plasmid-borne penicillinase hydrolyses it")],
               ["CTX", "S", tr("ceftriaxone conservée : l'enzyme ne l'atteint pas, le traitement de référence tient",
                               "ceftriaxone preserved: the enzyme does not reach it, the reference treatment still holds")]],
        confirme: blac === "Positif" ? tr("test à la β-lactamase (nitrocéfine) positif", "a positive beta-lactamase (nitrocefin) test") : null,
        aConfirmerPar: blac === "Positif" ? null
          : tr("test à la β-lactamase (nitrocéfine) : la résistance à la pénicilline peut aussi venir d'une mutation chromosomique",
               "a beta-lactamase (nitrocefin) test: penicillin resistance may also arise from a chromosomal mutation")
      });
      A.rules.push({ k: "→R", txt: tr("Pénicilline / amoxicilline R. Ceftriaxone = traitement de référence.",
        "Penicillin and amoxicillin R. Ceftriaxone is the reference treatment.") });
      A.comment = tr(`${sp} producteur de pénicillinase (PPNG). Pénicilline résistante ; ceftriaxone = référence.`,
        `${sp} producing a penicillinase (PPNG). Penicillin resistant; ceftriaxone is the reference treatment.`);
    } else {
      A.name = tr(`${sp} — sensible à la pénicilline`, `${sp} — penicillin-susceptible`);
      parce(A, r, {
        pour: [["PEN", "S", tr("pénicilline G active : pas de pénicillinase", "benzylpenicillin active: no penicillinase")],
               ["CTX", "S", tr("ceftriaxone active — traitement de référence", "ceftriaxone active — the reference treatment")]]
      });
      A.comment = tr(`${sp} sans mécanisme de résistance majeur détecté. Ceftriaxone = traitement de référence.`,
        `${sp} with no major resistance mechanism detected. Ceftriaxone is the reference treatment.`);
    }
    if (isR(r.AZM)) A.alerts.push({ lvl: "warn", txt: tr("Azithromycine résistante : à prendre en compte dans le schéma.",
      "Azithromycin resistant: to be taken into account in the regimen.") });
    if (isR(r.CIP)) A.alerts.push({ lvl: "info", txt: tr("Ciprofloxacine résistante : fréquent chez le gonocoque, fluoroquinolones à éviter en probabiliste.",
      "Ciprofloxacin resistant: common in gonococci, so avoid fluoroquinolones empirically.") });
  }

  else {
    const blR = blac === "Positif" || isRI(r.PEN) || isRI(r.AMX);
    if (blR) {
      A.sev = "mod"; A.name = tr("β-lactamase (BRO) +", "BRO beta-lactamase positive");
      A.mech = tr("β-lactamase BRO (quasi constante chez M. catarrhalis) : aminopénicillines hydrolysées.",
                  "The BRO beta-lactamase, almost constant in M. catarrhalis: aminopenicillins are hydrolysed.");
      parce(A, r, {
        pour: [["PEN", "RI", tr("pénicilline atteinte — la β-lactamase BRO l'hydrolyse", "penicillin affected — the BRO beta-lactamase hydrolyses it")],
               ["AMX", "RI", tr("amoxicilline atteinte", "amoxicillin affected")],
               ["AMC", "S", tr("le clavulanate restaure l'activité : l'enzyme est inhibée", "clavulanate restores activity: the enzyme is inhibited")]],
        confirme: blac === "Positif" ? tr("test à la β-lactamase (nitrocéfine) positif", "a positive beta-lactamase (nitrocefin) test") : null
      });
      A.rules.push({ k: "→R", txt: tr("Ampicilline/amoxicilline R ; amoxicilline-clavulanate, céphalosporines et macrolides actifs.",
        "Ampicillin and amoxicillin R; amoxicillin-clavulanate, cephalosporins and macrolides active.") });
      A.comment = tr(`${sp} producteur de β-lactamase BRO. Aminopénicillines résistantes ; amoxicilline-clavulanate, C2G/C3G et macrolides actifs.`,
        `${sp} producing the BRO beta-lactamase. Aminopenicillins resistant; amoxicillin-clavulanate, 2nd and 3rd generation cephalosporins and macrolides active.`);
    } else {
      A.name = tr(`${sp} — β-lactamase négative`, `${sp} — beta-lactamase negative`);
      parce(A, r, {
        pour: [["AMX", "S", tr("amoxicilline active — rare chez M. catarrhalis, où la β-lactamase BRO est quasi constante",
                               "amoxicillin active — rare in M. catarrhalis, where the BRO beta-lactamase is almost constant")],
               ["PEN", "S", tr("pénicilline active", "penicillin active")]],
        aConfirmerPar: tr("test à la β-lactamase (nitrocéfine) : l'absence d'enzyme est ici l'exception, elle mérite d'être vérifiée",
          "a beta-lactamase (nitrocefin) test: the absence of the enzyme is the exception here, and deserves checking")
      });
      A.comment = tr(`${sp} β-lactamase négative (rare). Aminopénicillines actives.`,
        `${sp}, beta-lactamase negative (rare). Aminopenicillins active.`);
    }
  }

  return finalize(A, r);
}

function gramposrodInterpret(r, c, a) {
  const sp = (a && a.species) || tr("Bacille à Gram positif", "Gram-positive rod");
  const type = (a && a.type) || "listeria";
  const A = { sev: "wild", name: "", mech: "", alerts: [], rules: [], comment: "" };

  if (type === "listeria") {
    A.sev = "mod";
    A.name = tr("Listeria monocytogenes — céphalosporines naturellement inactives",
                "Listeria monocytogenes — cephalosporins intrinsically inactive");
    A.mech = tr("Résistance naturelle à TOUTES les céphalosporines (C1G–C4G, C3G comprises) et à la fosfomycine.",
                "Intrinsic resistance to ALL cephalosporins, first to fourth generation, the third generation included, and to fosfomycin.");
    A.rules.push({ k: "✕", txt: tr("Céphalosporines naturellement inactives — ne jamais utiliser ni rendre S (piège classique en méningite).",
      "Cephalosporins intrinsically inactive — never use them, never report them S; this is the classic trap in meningitis.") });
    A.rules.push({ k: "✚", txt: tr("Ampicilline / amoxicilline = référence ; associer la gentamicine (synergie) dans les formes neuroméningées ou sévères.",
      "Ampicillin or amoxicillin is the reference treatment; add gentamicin, which is synergistic, in neuromeningeal or severe disease.") });
    A.rules.push({ k: "✚", txt: tr("Cotrimoxazole = alternative (allergie aux β-lactamines).",
      "Co-trimoxazole is the alternative, for beta-lactam allergy.") });
    parce(A, r, {
      pour: [["AMP", "S", tr("ampicilline active — c'est le traitement de référence, les céphalosporines étant naturellement inactives",
                             "ampicillin active — it is the reference treatment, the cephalosporins being intrinsically inactive")],
             ["AMX", "S", tr("amoxicilline active", "amoxicillin active")],
             ["GEN", "S", tr("gentamicine active : on l'associe dans les formes sévères",
                             "gentamicin active: it is added in severe disease")]],
      contre: [["AMP", "RI", tr("ampicilline non sensible : exceptionnel chez Listeria — vérifier l'identification avant tout",
                                "ampicillin not susceptible: exceptional in Listeria — check the identification first of all")]]
    });
    A.comment = tr("Listeria monocytogenes. Rappel majeur : les céphalosporines (dont les C3G) sont naturellement inactives — ampicilline/amoxicilline = traitement de référence, associées à la gentamicine dans les formes sévères.",
      "Listeria monocytogenes. The point to remember: the cephalosporins, the third generation included, are intrinsically inactive — ampicillin or amoxicillin is the reference treatment, with gentamicin added in severe disease.");
    if (isRI(r.AMP) || isRI(r.AMX)) {
      A.sev = "high";
      A.alerts.push({ lvl: "warn", txt: tr("Ampicilline non sensible chez Listeria : exceptionnel — vérifier l'identification et la CMI.",
        "Ampicillin not susceptible in Listeria: exceptional — check the identification and the MIC.") });
      A.comment += tr(" Ampicilline non sensible : à confirmer d'urgence.",
        " Ampicillin not susceptible: to be confirmed urgently.");
    }
  } else if (type === "diphtheriae") {
    /* LA SEULE ESPÈCE DE PHÉNOBAC OÙ L'ANTIBIOGRAMME N'EST PAS LA QUESTION.
       La diphtérie se traite par l'ANTITOXINE, en urgence : c'est la toxine
       qui tue, pas le germe. L'antibiotique interrompt la contagion et
       raccourcit le portage. Rendre un antibiogramme propre sans dire cela,
       c'est répondre à côté. */
    const ulc = !!(a && a.ulcerans);
    A.sev = "crit";
    A.name = sp + tr(" — URGENCE : l'antitoxine avant l'antibiotique",
                     " — EMERGENCY: antitoxin before antibiotic");
    A.mech = tr("La gravité tient à la TOXINE diphtérique, pas au germe. Le caractère "
              + "toxinogène se cherche par le gène tox (PCR) ou le test d'Elek — "
              + "l'antibiogramme ne le dit pas.",
                "The severity comes from the diphtheria TOXIN, not from the organism. "
              + "Toxigenicity is sought by the tox gene (PCR) or the Elek test — the "
              + "susceptibility test does not tell you.");
    A.alerts.push({ lvl: "crit", txt: tr("Suspicion de diphtérie : prévenir le clinicien "
      + "IMMÉDIATEMENT, sans attendre l'antibiogramme. L'antitoxine se donne sur la "
      + "présomption clinique ; chaque heure compte. Maladie à déclaration obligatoire.",
        "Suspected diphtheria: tell the clinician IMMEDIATELY, without waiting for the "
      + "susceptibility test. Antitoxin is given on clinical suspicion; every hour counts. "
      + "A notifiable disease.") });
    A.rules.push({ k: "!", txt: tr("Chercher le caractère toxinogène (gène tox / test d'Elek) : "
      + "c'est lui qui décide de la conduite, pas la sensibilité aux antibiotiques.",
        "Seek toxigenicity (tox gene or Elek test): that is what decides management, not "
      + "antibiotic susceptibility.") });
    A.rules.push({ k: "✚", txt: tr("Antibiotique : pénicilline G ou érythromycine (14 jours), "
      + "pour interrompre la contagion et tarir le portage. Dépistage et antibioprophylaxie "
      + "de l'entourage ; mise à jour de la vaccination.",
        "Antibiotic: benzylpenicillin or erythromycin for 14 days, to stop transmission and "
      + "clear carriage. Screen and give prophylaxis to close contacts; bring vaccination "
      + "up to date.") });
    A.rules.push({ k: "!", txt: tr("L'EUCAST ne reconnaît AUCUNE catégorie « sensible » à "
      + "posologie standard pour la pénicilline G, la céfotaxime et la ciprofloxacine chez "
      + "cette espèce (note 13 du classeur) : elles ne se rendent qu'en I ou en R.",
        "EUCAST recognises NO \u0022susceptible, standard dosing\u0022 category for "
      + "benzylpenicillin, cefotaxime or ciprofloxacin in this species (note 13 of the "
      + "breakpoint tables): they can only be reported I or R.") });
    if (ulc) {
      A.rules.push({ k: "!", txt: tr("C. ulcerans est une ZOONOSE — lait cru, bovins, animaux "
        + "de compagnie — et non une transmission interhumaine : l'enquête ne vise pas le "
        + "même entourage. L'EUCAST ne lui donne pas de seuil de clindamycine : « le "
        + "sauvage y est moins sensible ».",
          "C. ulcerans is a ZOONOSIS — raw milk, cattle, companion animals — not a "
        + "person-to-person infection: the contact investigation looks elsewhere. EUCAST "
        + "gives it no clindamycin breakpoint: \u0022the wild type is less susceptible\u0022.") });
    }
    parce(A, r, {
      pour: [["E", "S", tr("érythromycine active — c'est le traitement qui tarit le portage",
                           "erythromycin active — it is the treatment that clears carriage")],
             ["PEN", "I", tr("pénicilline G utilisable à forte exposition : l'EUCAST ne lui reconnaît pas de catégorie S chez cette espèce",
                             "benzylpenicillin usable at increased exposure: EUCAST recognises no S category for it in this species")]],
      contre: [["E", "R", tr("érythromycine résistante : il reste la pénicilline G, et l'avis spécialisé",
                             "erythromycin resistant: benzylpenicillin remains, and specialist advice")]],
      aConfirmerPar: tr("la recherche du gène tox ou le test d'Elek : c'est le caractère "
                      + "toxinogène, et non l'antibiogramme, qui commande le traitement",
                        "a tox gene assay or the Elek test: it is toxigenicity, not the "
                      + "susceptibility test, that governs treatment")
    });
    A.comment = sp + " : " + (ulc ? tr("zoonose (lait cru, animaux). ", "a zoonosis (raw milk, animals). ") : "")
              + tr("LA PRIORITÉ EST L'ANTITOXINE, donnée sur la présomption clinique — "
                 + "c'est la toxine qui tue. L'antibiotique (pénicilline G ou érythromycine, "
                 + "14 jours) interrompt la contagion. Chercher le caractère toxinogène ; "
                 + "déclaration obligatoire ; entourage à dépister et à vacciner.",
                   "THE PRIORITY IS THE ANTITOXIN, given on clinical suspicion — it is the "
                 + "toxin that kills. The antibiotic (benzylpenicillin or erythromycin, 14 "
                 + "days) stops transmission. Seek toxigenicity; a notifiable disease; "
                 + "screen and vaccinate close contacts.");
  } else {
    if (isR(r.PEN)) {
      A.sev = "high"; A.name = tr("Corynebacterium multirésistant probable (groupe JK)",
                                  "Probably multidrug-resistant Corynebacterium (group JK)");
      A.mech = tr("Les Corynebacterium du groupe JK (C. jeikeium) sont souvent multirésistants.",
                  "Group JK corynebacteria (C. jeikeium) are often multidrug-resistant.");
      parce(A, r, {
        pour: [["PEN", "R", tr("pénicilline résistante — chez Corynebacterium, cela oriente vers le groupe JK",
                               "penicillin resistant — in Corynebacterium this points to group JK")],
               ["VA", "S", tr("vancomycine active : elle l'est constamment dans ce genre, et c'est elle qui traite",
                              "vancomycin active: it always is in this genus, and it is what treats")]],
        aConfirmerPar: tr("identification de l'espèce : « groupe JK » reste une orientation tirée du profil, pas une identification",
          "species identification: \u0022group JK\u0022 remains a pointer drawn from the phenotype, not an identification")
      });
      A.rules.push({ k: "✚", txt: tr("Vancomycine = référence (constamment active). Pénicilline résistante.",
        "Vancomycin is the reference treatment, always active. Penicillin resistant.") });
      A.comment = tr(`${sp} (groupe JK probable) : profil multirésistant — vancomycine constamment active, traitement de référence.`,
        `${sp} (probably group JK): a multidrug-resistant phenotype — vancomycin is always active and is the reference treatment.`);
    } else {
      A.name = tr(`${sp} — sensible à la pénicilline`, `${sp} — penicillin-susceptible`);
      parce(A, r, {
        pour: [["PEN", "S", tr("pénicilline active : profil éloigné de celui du groupe JK",
                               "penicillin active: a phenotype far from that of group JK")],
               ["VA", "S", tr("vancomycine active — recours constant dans ce genre",
                              "vancomycin active — the constant fallback in this genus")]]
      });
      A.rules.push({ k: "✚", txt: tr("Vancomycine constamment active (recours).",
        "Vancomycin always active, as the fallback.") });
      A.comment = tr(`${sp} sensible à la pénicilline. La vancomycine reste constamment active.`,
        `${sp}, penicillin-susceptible. Vancomycin remains always active.`);
    }
  }
  return finalize(A, r);
}

/* LES NOTES DU CLASSEUR, QUI VIVAIENT DANS UNE COLONNE QU'ON NE LISAIT PAS.

   La colonne I des feuilles d'anaérobies porte deux phrases qui changent ce
   qu'un laboratoire peut rendre, et une troisième qui évite de rendre faux :

     « Isolates susceptible to benzylpenicillin can be reported susceptible to
       all beta-lactam agents with breakpoints (including those with Note)
       without further testing » — un seul disque de pénicilline G suffit
       alors à rendre huit β-lactamines. Dans un laboratoire qui compte ses
       disques, ce n'est pas un détail ;

     « Susceptibility can be inferred from ampicillin » — l'amoxicilline n'a
       pas de disque et se lit sur celui de l'ampicilline. C'est porté par la
       colonne « temoin » de la base ;

     « Metronidazole resistance is rare, but inadequate anaerobic conditions
       may lead to false resistance » — la cause la plus probable d'un
       métronidazole résistant n'est pas la souche, c'est la jarre.

   PhénoBac n'INVENTE aucune catégorie à partir de la première : rendre
   « sensible » une molécule qu'on n'a pas testée serait fabriquer un
   résultat. Elle le DIT, et c'est le biologiste qui rend. § 13. */
function notesAnaerobie(A, r, a) {
  if (a && a.penCouvre && r.PEN === "S") {
    A.rules.push({ k: "✚", txt: tr("Pénicilline G sensible : l'EUCAST autorise à rendre "
      + "sensibles TOUTES les β-lactamines à seuil de cette espèce, sans les tester "
      + "(classeur v16.1, note de la table). PhénoBac ne les rend pas d'office — "
      + "c'est au biologiste de le faire, en connaissance de cause.",
        "Benzylpenicillin susceptible: EUCAST allows ALL beta-lactams with a breakpoint "
      + "for this species to be reported susceptible without further testing (v16.1 "
      + "tables, note to the table). PhénoBac does not report them automatically — that "
      + "is for the microbiologist to decide, knowingly.") });
  }
  if (isRI(r.MTZ)) {
    A.alerts.push({ lvl: "warn", txt: tr("Avant de rendre le métronidazole non sensible : "
      + "vérifier l'ANAÉROBIOSE de l'incubation. Une jarre qui a mal pris donne une "
      + "fausse résistance, et c'est la cause la plus fréquente. Vérifier ensuite "
      + "l'identification, puis refaire l'antibiogramme (EUCAST v16.1).",
        "Before reporting metronidazole as not susceptible: check the ANAEROBIC "
      + "conditions of the incubation. A jar that failed gives a false resistance, and "
      + "that is the commonest cause. Then check the identification, and repeat the "
      + "susceptibility test (EUCAST v16.1).") });
  }
}

function anaerobeInterpret(r, c, a) {
  const sp = (a && a.species) || "Anaérobie";
  const type = (a && a.type) || "bfragilis";
  const A = { sev: "wild", name: "", mech: "", alerts: [], rules: [], comment: "" };

  if (type === "bfragilis") {
    A.sev = "mod"; A.name = "Bacteroides fragilis";
    A.mech = tr("β-lactamase (cepA) fréquente ; résistance naturelle aux aminosides ; sensibilité à la clindamycine devenue variable.",
                "A beta-lactamase (cepA) is common; intrinsic resistance to aminoglycosides; clindamycin susceptibility has become variable.");
    A.rules.push({ k: "✕", txt: tr("Aminosides naturellement inactifs (anaérobie).",
      "Aminoglycosides intrinsically inactive (anaerobe).") });
    A.rules.push({ k: "✚", txt: tr("Métronidazole = référence ; alternatives : amoxicilline-clavulanate, pipéracilline-tazobactam, carbapénèmes.",
      "Metronidazole is the reference agent; alternatives are amoxicillin-clavulanate, piperacillin-tazobactam and the carbapenems.") });
    A.rules.push({ k: "→R", txt: tr("Pénicilline / ampicilline R (β-lactamase) ; restaurées par clavulanate / tazobactam.",
      "Penicillin and ampicillin R (beta-lactamase); restored by clavulanate or tazobactam.") });
    parce(A, r, {
      pour: [["MTZ", "S", tr("métronidazole actif — c'est le traitement de référence des infections à anaérobies",
                             "metronidazole active — it is the reference treatment for anaerobic infections")],
             ["AMC", "S", tr("l'inhibiteur restaure l'activité : la β-lactamase cepA est inhibée",
                             "the inhibitor restores activity: the cepA beta-lactamase is inhibited")]],
      contre: [["MTZ", "RI", tr("métronidazole non sensible : rare et grave, à confirmer avant de le rendre",
                                "metronidazole not susceptible: rare and serious, to be confirmed before reporting")],
               ["DA", "R", tr("clindamycine résistante : fréquent chez B. fragilis, à ne pas employer en probabiliste",
                              "clindamycin resistant: common in B. fragilis, not to be used empirically")]]
    });
    A.comment = tr("Bacteroides fragilis : β-lactamase fréquente (pénicillines R, restaurées par les inhibiteurs). Métronidazole = traitement de référence ; aminosides naturellement inactifs.",
      "Bacteroides fragilis: a beta-lactamase is common (penicillins R, restored by the inhibitors). Metronidazole is the reference treatment; aminoglycosides are intrinsically inactive.");
    if (isRI(r.MTZ)) { A.sev = "crit"; A.alerts.push({ lvl: "crit", txt: tr("Résistance au métronidazole : rare et grave — avis référent.",
      "Metronidazole resistance: rare and serious — seek specialist advice.") }); A.comment += tr(" Métronidazole non sensible : à confirmer d'urgence.",
      " Metronidazole not susceptible: to be confirmed urgently."); }
    if (isRI(r.IPM) || isRI(r.MEM)) A.alerts.push({ lvl: "warn", txt: tr("Sensibilité diminuée aux carbapénèmes : carbapénémase (cfiA) possible — confirmer.",
      "Reduced carbapenem susceptibility: a carbapenemase (cfiA) is possible — confirm.") });
    if (isR(r.DA)) A.alerts.push({ lvl: "info", txt: tr("Clindamycine résistante : fréquent chez B. fragilis, ne pas utiliser en probabiliste.",
      "Clindamycin resistant: common in B. fragilis, do not use empirically.") });
  }
  else if (type === "cperfringens") {
    A.name = tr("Clostridium perfringens — sensible à la pénicilline", "Clostridium perfringens — penicillin-susceptible");
    A.mech = tr("Anaérobie à Gram positif sensible aux β-lactamines.", "A Gram-positive anaerobe susceptible to beta-lactams.");
    A.rules.push({ k: "✚", txt: tr("Pénicilline G = référence ; associer la clindamycine (effet antitoxine) dans la gangrène gazeuse.",
      "Benzylpenicillin is the reference agent; add clindamycin for its antitoxin effect in gas gangrene.") });
    parce(A, r, {
      pour: [["PEN", "S", tr("pénicilline G active — traitement de référence", "benzylpenicillin active — the reference treatment")],
             ["DA", "S", tr("clindamycine active : on l'associe pour son effet antitoxine dans la gangrène gazeuse",
                            "clindamycin active: it is added for its antitoxin effect in gas gangrene")]],
      contre: [["PEN", "RI", tr("pénicilline non sensible : inhabituel — vérifier l'identification et la CMI",
                                "penicillin not susceptible: unusual — check the identification and the MIC")]]
    });
    A.comment = tr("Clostridium perfringens : pénicilline G = traitement de référence, associée à la clindamycine (effet antitoxine) dans les formes graves.",
      "Clostridium perfringens: benzylpenicillin is the reference treatment, combined with clindamycin for its antitoxin effect in severe disease.");
    if (isRI(r.PEN)) { A.sev = "high"; A.alerts.push({ lvl: "warn", txt: tr("Pénicilline non sensible : inhabituel — vérifier l'identification et la CMI.",
      "Penicillin not susceptible: unusual — check the identification and the MIC.") }); }
  }
  else if (type === "prevotella" || type === "fusobacterium") {
    const gn = type === "prevotella" ? "Prevotella" : "Fusobacterium";
    A.sev = "mod"; A.name = sp;
    A.mech = tr("Anaérobie à Gram négatif. La β-lactamase est fréquente chez "
              + gn + " : les pénicillines seules ne sont pas fiables, les associations "
              + "avec inhibiteur et les carbapénèmes le sont.",
                "A Gram-negative anaerobe. A beta-lactamase is common in "
              + gn + ": penicillins alone are not reliable, whereas inhibitor "
              + "combinations and the carbapenems are.");
    A.rules.push({ k: "✕", txt: tr("Aminosides, aztréonam et colistine naturellement inactifs sur les anaérobies — ne pas les rendre sensibles.",
      "Aminoglycosides, aztreonam and colistin are intrinsically inactive against anaerobes — never report them susceptible.") });
    A.rules.push({ k: "✚", txt: tr("Métronidazole = référence ; alternatives : amoxicilline-acide clavulanique, pipéracilline-tazobactam, carbapénèmes.",
      "Metronidazole is the reference agent; alternatives are amoxicillin-clavulanic acid, piperacillin-tazobactam and the carbapenems.") });
    parce(A, r, {
      pour: [["MTZ", "S", tr("métronidazole actif — c'est le traitement de référence des anaérobies",
                             "metronidazole active — it is the reference treatment for anaerobes")],
             ["AMC", "S", tr("l'inhibiteur restaure l'activité : la β-lactamase est inhibée",
                             "the inhibitor restores activity: the beta-lactamase is inhibited")],
             ["MEM", "S", tr("méropénème actif", "meropenem active")]],
      contre: [["MTZ", "RI", tr("métronidazole non sensible : rare et grave chez un anaérobie, à confirmer avant de le rendre",
                                "metronidazole not susceptible: rare and serious in an anaerobe, to be confirmed before reporting")],
               ["PEN", "RI", tr("pénicilline atteinte : β-lactamase, attendue dans ce genre",
                                "penicillin affected: a beta-lactamase, expected in this genus")]]
    });
    A.comment = sp + tr(" : anaérobie à Gram négatif. Métronidazole = traitement de référence ; "
                      + "β-lactamase fréquente, d'où des pénicillines seules peu fiables. "
                      + "Aminosides et colistine naturellement inactifs.",
                        ": a Gram-negative anaerobe. Metronidazole is the reference treatment; "
                      + "a beta-lactamase is common, which makes penicillins alone unreliable. "
                      + "Aminoglycosides and colistin are intrinsically inactive.");
    if (isRI(r.MTZ)) {
      A.sev = "crit";
      A.alerts.push({ lvl: "crit", txt: tr("Résistance au métronidazole chez un anaérobie : rare et grave — avis référent.",
        "Metronidazole resistance in an anaerobe: rare and serious — seek specialist advice.") });
    }
    if (isRI(r.IPM) || isRI(r.MEM)) {
      A.alerts.push({ lvl: "warn", txt: tr("Sensibilité diminuée aux carbapénèmes chez un anaérobie : confirmer le mécanisme.",
        "Reduced carbapenem susceptibility in an anaerobe: confirm the mechanism.") });
    }
    if (type === "fusobacterium" && /nucleatum/.test(sp)) {
      A.alerts.push({ lvl: "info", txt: tr("F. nucleatum : l'EUCAST ne chiffre ni l'amoxicilline-acide clavulanique ni la pipéracilline-tazobactam pour cette espèce — elles ne sont pas catégorisées.",
        "F. nucleatum: EUCAST gives no breakpoint for amoxicillin-clavulanic acid or piperacillin-tazobactam in this species — they are not categorised.") });
    }
  }
  else if (type === "clostridium") {
    /* C. innocuum, ramosum, septicum, tertium. L'EUCAST les chiffre
       SÉPARÉMENT, et les quatre tables ne se ressemblent pas : l'une n'a pas
       de vancomycine, l'autre pas de pénicilline G, une troisième pas de
       clindamycine. Un groupe de seuils commun appliquerait le chiffre de
       l'une à l'autre — « un chiffre juste au mauvais endroit ». */
    A.sev = "mod"; A.name = sp;
    A.mech = tr("Clostridie anaérobie à Gram positif. Le document chiffre chaque espèce "
              + "à part : l'identification jusqu'à l'espèce commande les seuils.",
                "A Gram-positive anaerobic clostridium. The document sets breakpoints species "
              + "by species: identification to species level determines which ones apply.");
    A.rules.push({ k: "✚", txt: tr("Métronidazole = référence des infections à anaérobies ; "
      + "β-lactamines actives selon l'espèce.",
        "Metronidazole is the reference agent for anaerobic infections; beta-lactam activity "
      + "depends on the species.") });
    parce(A, r, {
      pour: [["MTZ", "S", tr("métronidazole actif — traitement de référence des anaérobies", "metronidazole active — the reference treatment for anaerobes")],
             ["AMP", "S", tr("ampicilline active", "ampicillin active")],
             ["MEM", "S", tr("méropénème actif", "meropenem active")]],
      contre: [["MTZ", "RI", tr("métronidazole non sensible chez une clostridie : rare, et d'abord suspect d'une anaérobiose insuffisante",
                                "metronidazole not susceptible in a clostridium: rare, and first of all suspicious of insufficient anaerobiosis")]]
    });
    A.comment = sp + tr(" : clostridie anaérobie. Métronidazole = traitement de référence.",
                        ": an anaerobic clostridium. Metronidazole is the reference treatment.");

    if (/innocuum/.test(sp)) {
      A.rules.push({ k: "✕", txt: tr("Vancomycine naturellement inactive chez C. innocuum — "
        + "ne jamais la rendre sensible. L'EUCAST ne lui donne d'ailleurs aucun seuil de "
        + "vancomycine, non plus que de pénicilline G ni de carbapénème.",
          "Vancomycin is intrinsically inactive in C. innocuum — never report it susceptible. "
        + "EUCAST gives this species no vancomycin breakpoint at all, and none for "
        + "benzylpenicillin or the carbapenems either.") });
      A.comment += tr(" Vancomycine naturellement inactive dans cette espèce : c'est ce qui "
                    + "la distingue des autres clostridies.",
                      " Vancomycin is intrinsically inactive in this species: that is what "
                    + "sets it apart from the other clostridia.");
    }
    if (/ramosum/.test(sp)) {
      A.rules.push({ k: "!", txt: tr("L'EUCAST ne donne pour C. ramosum ni seuil de "
        + "vancomycine ni seuil de clindamycine : ces deux molécules ne se catégorisent pas.",
          "EUCAST gives C. ramosum no breakpoint for vancomycin and none for clindamycin: "
        + "neither agent can be categorised.") });
    }
    if (/tertium/.test(sp)) {
      A.rules.push({ k: "!", txt: tr("C. tertium est AÉROTOLÉRANTE : elle pousse en aérobiose "
        + "et se confond avec un Bacillus ou un lactobacille. L'EUCAST ne lui donne ni "
        + "pénicilline G, ni clindamycine, ni pipéracilline-tazobactam.",
          "C. tertium is AEROTOLERANT: it grows aerobically and is easily mistaken for a "
        + "Bacillus or a lactobacillus. EUCAST gives it no breakpoint for benzylpenicillin, "
        + "clindamycin or piperacillin-tazobactam.") });
    }
    if (/septicum/.test(sp)) {
      A.sev = "high";
      A.alerts.push({ lvl: "warn", txt: tr("Clostridium septicum : son isolement — surtout "
        + "dans une hémoculture — impose de chercher une néoplasie colique ou une "
        + "neutropénie. L'association est constante et connue ; le signaler au clinicien "
        + "fait partie du compte rendu.",
          "Clostridium septicum: isolating it — above all from a blood culture — requires a "
        + "search for a colonic malignancy or for neutropenia. The association is consistent "
        + "and well known; telling the clinician is part of the report.") });
      A.comment += tr(" Isolement de C. septicum : rechercher une néoplasie colique ou une "
                    + "neutropénie.",
                      " C. septicum isolated: look for a colonic malignancy or neutropenia.");
    }
  }
  else if (type === "cutibacterium") {
    /* C. acnes, C. avidum. Flore cutanée : le problème n'est pas de les
       traiter, c'est de savoir si elles infectent. */
    A.sev = "mod"; A.name = sp;
    A.mech = tr("Bacille à Gram positif anaérobie de la flore cutanée. Pathogène sur "
              + "MATÉRIEL — prothèse d'épaule, dérivation ventriculaire, ostéosynthèse — "
              + "et contaminant de prélèvement partout ailleurs.",
                "A Gram-positive anaerobic rod of the skin flora. A pathogen on IMPLANTED "
              + "MATERIAL — shoulder prostheses, ventricular shunts, internal fixation — and "
              + "a specimen contaminant everywhere else.");
    A.rules.push({ k: "✚", txt: tr("Pénicilline G / amoxicilline = référence ; clindamycine "
      + "et linézolide en alternative.",
        "Benzylpenicillin or amoxicillin is the reference agent; clindamycin and linezolid "
      + "are alternatives.") });
    A.rules.push({ k: "!", txt: tr("CROISSANCE LENTE : la culture anaérobie doit être tenue "
      + "14 jours. Rendue à 48 heures, une infection de prothèse à Cutibacterium est "
      + "rendue stérile.",
        "SLOW GROWTH: the anaerobic culture must be held for 14 days. Reported at 48 hours, "
      + "a Cutibacterium prosthetic infection is reported as sterile.") });
    A.rules.push({ k: "!", txt: tr("Un seul prélèvement positif ne vaut pas infection : il "
      + "faut la concordance de plusieurs prélèvements profonds. Sur un prélèvement "
      + "superficiel, c'est la flore du malade.",
        "A single positive specimen does not amount to infection: several deep specimens must "
      + "agree. On a superficial swab, this is the patient's own flora.") });
    parce(A, r, {
      pour: [["PEN", "S", tr("pénicilline G active — c'est le traitement de référence", "benzylpenicillin active — it is the reference treatment")],
             ["AMX", "S", tr("amoxicilline active", "amoxicillin active")],
             ["DA", "S", tr("clindamycine active : alternative, et bonne diffusion osseuse",
                            "clindamycin active: an alternative, with good bone penetration")]],
      contre: [["PEN", "RI", tr("pénicilline G atteinte : rare dans ce genre, et le document demande de la confirmer",
                                "benzylpenicillin affected: rare in this genus, and the document asks for it to be confirmed")]],
      aConfirmerPar: tr("la concordance de plusieurs prélèvements profonds : un Cutibacterium "
                      + "isolé une fois est le plus souvent un contaminant",
                        "agreement between several deep specimens: a Cutibacterium isolated "
                      + "once is most often a contaminant")
    });
    A.comment = sp + tr(" : bacille anaérobie de la flore cutanée, pathogène sur matériel. "
                      + "Pénicilline G / amoxicilline = référence. Culture à tenir 14 jours ; "
                      + "l'interprétation demande plusieurs prélèvements profonds concordants.",
                        ": an anaerobic rod of the skin flora, pathogenic on implanted material. "
                      + "Benzylpenicillin or amoxicillin is the reference treatment. Hold the "
                      + "culture for 14 days; interpretation requires several concordant deep "
                      + "specimens.");
    if (isRI(r.PEN) || isRI(r.AMX) || isRI(r.AMP)) {
      A.sev = "high";
      A.alerts.push({ lvl: "warn", txt: tr("Résistance aux β-lactamines chez Cutibacterium : "
        + "l'EUCAST la dit RARE et demande de confirmer l'identification ET l'antibiogramme "
        + "de toute souche de ce type (classeur v16.1, note de la table).",
          "Beta-lactam resistance in Cutibacterium: EUCAST calls it RARE and asks for both the "
        + "identification AND the susceptibility result of any such isolate to be confirmed "
        + "(v16.1 tables, note to the table).") });
    }
  }
  else if (type === "gpac") {
    /* Finegoldia, Parvimonas, Peptostreptococcus, Peptoniphilus : les cocci
       à Gram positif anaérobies. Un seul récit clinique, quatre tables de
       seuils, parce que le document les sépare. */
    A.sev = "mod"; A.name = sp + tr(" — coque à Gram positif anaérobie", " — anaerobic Gram-positive coccus");
    A.mech = tr("Flore cutanée et buccale. Isolés des plaies chroniques et du pied "
              + "diabétique, des abcès, des infections pleuropulmonaires et "
              + "ostéo-articulaires, le plus souvent en flore mixte.",
                "Skin and oral flora. Recovered from chronic wounds and the diabetic foot, "
              + "from abscesses, and from pleuropulmonary and bone and joint infections, "
              + "most often as part of a mixed flora.");
    A.rules.push({ k: "✚", txt: tr("β-lactamines et métronidazole actifs ; clindamycine "
      + "d'activité variable.",
        "Beta-lactams and metronidazole are active; clindamycin activity is variable.") });
    A.rules.push({ k: "!", txt: tr("Presque toujours en association avec d'autres germes : "
      + "le traitement vise la flore entière, pas ce seul isolat.",
        "Almost always alongside other organisms: treatment addresses the whole flora, not "
      + "this isolate alone.") });
    parce(A, r, {
      pour: [["PEN", "S", tr("pénicilline G active", "benzylpenicillin active")],
             ["AMC", "S", tr("amoxicilline-acide clavulanique active : couvre aussi la flore associée",
                             "amoxicillin-clavulanic acid active: it also covers the accompanying flora")],
             ["MTZ", "S", tr("métronidazole actif — référence des anaérobies", "metronidazole active — the reference agent for anaerobes")]],
      contre: [["DA", "RI", tr("clindamycine atteinte : fréquent dans ce groupe, à ne pas employer en probabiliste",
                               "clindamycin affected: common in this group, not to be used empirically")],
               ["MTZ", "RI", tr("métronidazole non sensible : d'abord suspect d'une anaérobiose insuffisante",
                                "metronidazole not susceptible: first of all suspicious of insufficient anaerobiosis")]]
    });
    A.comment = sp + tr(" : coque à Gram positif anaérobie, le plus souvent en flore mixte. "
                      + "β-lactamines et métronidazole actifs ; clindamycine variable.",
                        ": an anaerobic Gram-positive coccus, usually part of a mixed flora. "
                      + "Beta-lactams and metronidazole are active; clindamycin is variable.");
    A.alerts.push({ lvl: "info", txt: tr("Résistance INDUCTIBLE à la clindamycine possible dans "
      + "ce groupe : elle se cherche par antagonisme entre les disques d'érythromycine et de "
      + "clindamycine, posés à 12–16 mm l'un de l'autre. L'EUCAST précise que sa portée "
      + "clinique n'est pas établie.",
        "INDUCIBLE clindamycin resistance is possible in this group: look for antagonism "
      + "between the erythromycin and clindamycin disks, placed 12–16 mm apart. EUCAST notes "
      + "that its clinical significance is unknown.") });
  }
  else {
    A.sev = "mod"; A.name = tr("Clostridioides difficile — pas d'antibiogramme de routine",
                               "Clostridioides difficile — no routine susceptibility testing");
    A.mech = tr("Diagnostic par toxines / GDH / PCR ; l'antibiogramme n'est pas réalisé en routine.",
                "Diagnosis rests on toxin, GDH and PCR testing; susceptibility testing is not performed routinely.");
    // PAS DE GRILLE ICI, ET C'EST VOULU. Une grille d'arguments explique un
    // phénotype lu sur un antibiogramme ; ici il n'y en a pas, et le rendu dit
    // précisément qu'il ne faut pas en faire. Fabriquer des arguments à partir
    // de molécules qu'on ne teste pas donnerait au raisonnement une apparence
    // de rigueur fondée sur rien. L'absence est déclarée pour qu'on ne la
    // prenne pas pour un oubli.
    A.sansGrille = tr("le diagnostic repose sur la recherche de toxines, pas sur un antibiogramme : "
                    + "il n'y a pas de profil à argumenter",
                      "the diagnosis rests on toxin detection, not on a susceptibility test: "
                    + "there is no profile to argue about");
    A.rules.push({ k: "✚", txt: tr("Traitement : vancomycine orale ou fidaxomicine (référence) ; métronidazole oral en alternative (formes non sévères).",
      "Treatment: oral vancomycin or fidaxomicin as the reference; oral metronidazole as an alternative in non-severe disease.") });
    A.rules.push({ k: "!", txt: tr("Arrêter si possible l'antibiotique inducteur ; précautions contact (spores).",
      "Stop the inducing antibiotic where possible; contact precautions (spores).") });
    A.comment = tr("Clostridioides difficile : colite post-antibiotique. Pas d'antibiogramme de routine — traitement par vancomycine orale ou fidaxomicine, métronidazole oral en alternative.",
      "Clostridioides difficile: antibiotic-associated colitis. No routine susceptibility testing — treat with oral vancomycin or fidaxomicin, with oral metronidazole as an alternative.");
    A.alerts.push({ lvl: "info", txt: tr("Hygiène : spores résistantes aux hydro-alcooliques — lavage des mains et désinfection sporicide.",
      "Infection control: the spores resist alcohol-based hand rubs — wash hands and use a sporicidal disinfectant.") });
  }
  notesAnaerobie(A, r, a);
  return finalize(A, r);
}

/* ============================================================
   autresbgn — Pasteurella, Aeromonas, Achromobacter, Kingella.

   Quatre bacilles à Gram négatif que PhénoBac ne couvrait pas, et qu'on
   n'isole pas dans les mêmes circonstances : une morsure, une plaie souillée
   d'eau douce, un malade de réanimation ou de mucoviscidose, un petit enfant
   qui boite. Le récit clinique est ce qui manque le plus au biologiste quand
   l'espèce est rare — une liste de S et de R ne dit pas quoi en faire.
   ============================================================ */
function autresbgnInterpret(r, c, a) {
  const sp = (a && a.species) || tr("Bacille à Gram négatif", "Gram-negative rod");
  const type = (a && a.type) || "pasteurella";
  const A = { sev: "wild", name: "", mech: "", alerts: [], rules: [], comment: "" };

  if (type === "pasteurella") {
    A.name = tr("Pasteurella multocida — morsure animale", "Pasteurella multocida — animal bite");
    A.mech = tr("Flore buccale du chien et du chat. Cellulite d'installation RAPIDE, "
              + "souvent en moins de 24 heures après la morsure.",
                "Oral flora of dogs and cats. A RAPIDLY developing cellulitis, often "
              + "within 24 hours of the bite.");
    A.rules.push({ k: "✚", txt: tr("Amoxicilline-acide clavulanique = référence : elle couvre "
      + "Pasteurella, les anaérobies de la gueule et les staphylocoques de la peau, qui "
      + "sont ensemble dans la plaie.",
        "Amoxicillin-clavulanic acid is the reference treatment: it covers Pasteurella, the "
      + "anaerobes from the animal's mouth and the staphylococci from the skin, which are "
      + "together in the wound.") });
    A.rules.push({ k: "✕", txt: tr("PIÈGE CLASSIQUE : oxacilline, céphalosporines de première "
      + "génération et clindamycine sont INACTIVES sur Pasteurella. Traiter une morsure "
      + "« comme une infection cutanée » avec un antistaphylococcique, c'est passer à côté.",
        "THE CLASSIC TRAP: oxacillin, first-generation cephalosporins and clindamycin are "
      + "INACTIVE against Pasteurella. Treating a bite \u0022as a skin infection\u0022 with an "
      + "anti-staphylococcal agent misses the organism.") });
    A.rules.push({ k: "!", txt: tr("La morsure pose aussi les questions de la rage et du tétanos : "
      + "elles ne se lisent pas sur un antibiogramme.",
        "A bite also raises rabies and tetanus: neither can be read off a susceptibility test.") });
    parce(A, r, {
      pour: [["AMC", "S", tr("amoxicilline-clavulanate active — c'est le traitement de référence de la morsure",
                             "amoxicillin-clavulanate active — it is the reference treatment for a bite")],
             ["PEN", "S", tr("pénicilline G active : Pasteurella l'est habituellement",
                             "benzylpenicillin active: Pasteurella usually is")],
             ["DOX", "S", tr("doxycycline active : alternative en cas d'allergie aux β-lactamines",
                             "doxycycline active: the alternative in beta-lactam allergy")]],
      contre: [["PEN", "RI", tr("pénicilline G atteinte : inhabituel, à confirmer",
                                "benzylpenicillin affected: unusual, to be confirmed")]]
    });
    A.comment = tr("Pasteurella multocida : morsure de chien ou de chat, cellulite rapide. "
                 + "Amoxicilline-acide clavulanique = traitement de référence. Oxacilline, "
                 + "C1G et clindamycine sont inactives — ne pas traiter comme une infection "
                 + "cutanée banale. Penser rage et tétanos.",
                   "Pasteurella multocida: a dog or cat bite with rapid cellulitis. "
                 + "Amoxicillin-clavulanic acid is the reference treatment. Oxacillin, "
                 + "first-generation cephalosporins and clindamycin are inactive — do not "
                 + "treat this as an ordinary skin infection. Consider rabies and tetanus.");
    if (isRI(r.PEN) || isRI(r.AMX)) {
      A.sev = "mod";
      A.alerts.push({ lvl: "info", txt: tr("β-lactamase possible chez Pasteurella : rare, mais "
        + "décrite. L'amoxicilline-acide clavulanique reste alors active.",
          "A beta-lactamase is possible in Pasteurella: rare, but described. "
        + "Amoxicillin-clavulanic acid then remains active.") });
    }
  }
  else if (type === "aeromonas") {
    A.sev = "mod";
    A.name = tr("Aeromonas spp. — plaie souillée d'eau douce",
                "Aeromonas spp. — a wound contaminated by fresh water");
    A.mech = tr("Eaux douces et saumâtres. Plaies souillées, diarrhées, et bactériémies "
              + "graves chez le cirrhotique. L'espèce porte plusieurs β-lactamases "
              + "INDUCTIBLES — céphalosporinase, pénicillinase et carbapénémase — d'où une "
              + "résistance qui peut apparaître SOUS traitement.",
                "Fresh and brackish water. Contaminated wounds, diarrhoea, and severe "
              + "bacteraemia in cirrhotic patients. The genus carries several INDUCIBLE "
              + "beta-lactamases — a cephalosporinase, a penicillinase and a carbapenemase "
              + "— so resistance can appear DURING treatment.");
    A.rules.push({ k: "!", txt: tr("β-lactamases inductibles : une souche rendue sensible à une "
      + "β-lactamine peut se dérépresser en cours de traitement. Sur une infection grave, "
      + "refaire un antibiogramme si l'évolution n'est pas celle qu'on attend.",
        "Inducible beta-lactamases: an isolate reported susceptible to a beta-lactam may "
      + "derepress during treatment. In severe infection, repeat the susceptibility test "
      + "if the course is not what you expect.") });
    A.rules.push({ k: "✚", txt: tr("Ciprofloxacine ou cotrimoxazole = appuis habituels ; "
      + "céfépime et ceftazidime chiffrées par l'EUCAST.",
        "Ciprofloxacin or co-trimoxazole are the usual mainstays; EUCAST gives breakpoints "
      + "for cefepime and ceftazidime.") });
    A.rules.push({ k: "!", txt: tr("L'EUCAST ne chiffre pour ce genre NI aminopénicilline, NI "
      + "céphalosporine de première génération, NI carbapénème : ces molécules ne se "
      + "catégorisent pas, et ce silence du document est lui-même une indication.",
        "For this genus EUCAST gives NO breakpoint for an aminopenicillin, a "
      + "first-generation cephalosporin or a carbapenem: these agents cannot be "
      + "categorised, and the document's silence is itself informative.") });
    parce(A, r, {
      pour: [["CIP", "S", tr("ciprofloxacine active — appui habituel, et non soumise aux β-lactamases",
                             "ciprofloxacin active — a usual mainstay, and not subject to the beta-lactamases")],
             ["SXT", "S", tr("cotrimoxazole actif : alternative", "co-trimoxazole active: the alternative")],
             ["CAZ", "S", tr("ceftazidime active", "ceftazidime active")]],
      contre: [["CIP", "RI", tr("ciprofloxacine atteinte : les options se réduisent aux β-lactamines, que les enzymes inductibles menacent",
                                "ciprofloxacin affected: the options narrow to the beta-lactams, which the inducible enzymes threaten")]]
    });
    A.comment = tr("Aeromonas : plaie souillée d'eau douce, diarrhée, bactériémie du "
                 + "cirrhotique. β-lactamases inductibles — une résistance peut apparaître "
                 + "sous traitement. Fluoroquinolone ou cotrimoxazole en appui.",
                   "Aeromonas: a wound contaminated by fresh water, diarrhoea, bacteraemia "
                 + "in a cirrhotic patient. Inducible beta-lactamases — resistance may "
                 + "appear during treatment. A fluoroquinolone or co-trimoxazole as the mainstay.");
  }
  else if (type === "achromobacter") {
    A.sev = "mod";
    A.name = tr("Achromobacter xylosoxidans — bacille non fermentant",
                "Achromobacter xylosoxidans — a non-fermenting rod");
    A.mech = tr("Non fermentant de l'environnement hydrique. Colonisation et infection "
              + "respiratoire de la mucoviscidose, infections sur cathéter et en "
              + "réanimation. Naturellement peu sensible : le document ne chiffre que "
              + "quatre molécules, et c'est la réponse.",
                "A non-fermenter from water environments. Respiratory colonisation and "
              + "infection in cystic fibrosis, catheter infections and infections in "
              + "intensive care. Intrinsically poorly susceptible: the document gives "
              + "breakpoints for only four agents, and that is the answer.");
    A.rules.push({ k: "✚", txt: tr("Pipéracilline-tazobactam, méropénème et cotrimoxazole : "
      + "ce sont les trois seules molécules que l'EUCAST chiffre pour cette espèce.",
        "Piperacillin-tazobactam, meropenem and co-trimoxazole: these are the only three "
      + "agents EUCAST gives breakpoints for in this species.") });
    A.rules.push({ k: "✕", txt: tr("Aminosides, ceftriaxone et céfotaxime, aztréonam : pas de "
      + "seuil, et une activité qu'on ne peut pas affirmer. Ne pas les rendre.",
        "Aminoglycosides, ceftriaxone and cefotaxime, aztreonam: no breakpoint, and an "
      + "activity that cannot be asserted. Do not report them.") });
    A.rules.push({ k: "!", txt: tr("Céfidérocol : l'EUCAST ne fixe pas de seuil clinique, faute "
      + "de données. Une CMI ≤ 0,5 mg/L signale une souche sans mécanisme acquis, sans "
      + "promettre le résultat clinique.",
        "Cefiderocol: EUCAST sets no clinical breakpoint, for lack of data. An MIC of "
      + "0.5 mg/L or less marks an isolate without an acquired mechanism, without "
      + "promising a clinical outcome.") });
    parce(A, r, {
      pour: [["SXT", "S", tr("cotrimoxazole actif — souvent la meilleure option dans cette espèce",
                             "co-trimoxazole active — often the best option in this species")],
             ["MEM", "S", tr("méropénème actif", "meropenem active")],
             ["TZP", "S", tr("pipéracilline-tazobactam active", "piperacillin-tazobactam active")]],
      contre: [["MEM", "RI", tr("méropénème atteint : les options deviennent très étroites, avis spécialisé",
                                "meropenem affected: the options become very narrow, seek specialist advice")],
               ["SXT", "RI", tr("cotrimoxazole atteint", "co-trimoxazole affected")]]
    });
    A.comment = tr("Achromobacter xylosoxidans : non fermentant de la mucoviscidose, du "
                 + "cathéter et de la réanimation. L'EUCAST ne chiffre que la "
                 + "pipéracilline-tazobactam, le méropénème et le cotrimoxazole — les autres "
                 + "molécules ne se catégorisent pas.",
                   "Achromobacter xylosoxidans: a non-fermenter of cystic fibrosis, "
                 + "catheters and intensive care. EUCAST gives breakpoints only for "
                 + "piperacillin-tazobactam, meropenem and co-trimoxazole — the other "
                 + "agents cannot be categorised.");
    if (isRI(r.MEM) && isRI(r.SXT)) {
      A.sev = "high";
      A.alerts.push({ lvl: "warn", txt: tr("Méropénème ET cotrimoxazole atteints : il ne reste "
        + "presque rien de chiffré pour cette espèce — avis spécialisé, et discuter une "
        + "association.",
          "Meropenem AND co-trimoxazole both affected: almost nothing with a breakpoint "
        + "remains for this species — seek specialist advice, and discuss a combination.") });
    }
  }
  else {
    A.name = tr("Kingella kingae — infection ostéo-articulaire de l'enfant",
                "Kingella kingae — bone and joint infection in children");
    A.mech = tr("Groupe HACEK, flore oropharyngée du petit enfant. Première cause "
              + "d'arthrite et de spondylodiscite entre 6 mois et 4 ans.",
                "A HACEK organism, part of the oropharyngeal flora of young children. The "
              + "leading cause of septic arthritis and discitis between 6 months and 4 years.");
    A.rules.push({ k: "!", txt: tr("ELLE POUSSE MAL SUR GÉLOSE : ensemencer le liquide "
      + "articulaire dans un FLACON D'HÉMOCULTURE, et penser à la PCR. Une culture "
      + "classique négative n'écarte pas Kingella — c'est ainsi qu'on rend « stérile » "
      + "une arthrite qui ne l'est pas.",
        "IT GROWS POORLY ON AGAR: inoculate the joint fluid into a BLOOD CULTURE BOTTLE, "
      + "and consider PCR. A negative conventional culture does not rule Kingella out — "
      + "that is how a septic arthritis gets reported \u0022sterile\u0022.") });
    A.rules.push({ k: "✚", txt: tr("Amoxicilline ou céphalosporine de troisième génération = "
      + "référence ; l'évolution est habituellement rapide.",
        "Amoxicillin or a third-generation cephalosporin is the reference treatment; "
      + "recovery is usually rapid.") });
    A.rules.push({ k: "!", txt: tr("β-lactamase : rare mais décrite. Sa détection (céphalosporine "
      + "chromogène) suffit à rendre résistantes les pénicillines SANS inhibiteur ; aucun "
      + "autre mécanisme de résistance aux β-lactamines n'est connu dans l'espèce.",
        "Beta-lactamase: rare but described. Detecting it (chromogenic cephalosporin) is "
      + "enough to report the penicillins WITHOUT an inhibitor as resistant; no other "
      + "beta-lactam resistance mechanism is known in the species.") });
    parce(A, r, {
      pour: [["AMX", "S", tr("amoxicilline active — traitement de référence",
                             "amoxicillin active — the reference treatment")],
             ["CRO", "S", tr("ceftriaxone active", "ceftriaxone active")],
             ["PEN", "S", tr("pénicilline G active : le profil habituel de l'espèce",
                             "benzylpenicillin active: the usual phenotype of the species")]],
      contre: [["PEN", "R", tr("pénicilline G résistante : chercher la β-lactamase, seul mécanisme décrit",
                               "benzylpenicillin resistant: look for the beta-lactamase, the only mechanism described")]]
    });
    A.comment = tr("Kingella kingae : arthrite ou spondylodiscite du petit enfant. Ensemencer "
                 + "en flacon d'hémoculture et penser à la PCR — elle pousse mal sur gélose. "
                 + "Amoxicilline ou C3G = traitement de référence.",
                   "Kingella kingae: septic arthritis or discitis in a young child. "
                 + "Inoculate a blood culture bottle and consider PCR — it grows poorly on "
                 + "agar. Amoxicillin or a third-generation cephalosporin is the reference "
                 + "treatment.");
    if (isR(r.PEN)) {
      A.sev = "mod";
      A.alerts.push({ lvl: "info", txt: tr("Pénicilline G résistante : rechercher la β-lactamase. "
        + "Les pénicillines avec inhibiteur et les C3G restent actives.",
          "Benzylpenicillin resistant: look for the beta-lactamase. The penicillins with an "
        + "inhibitor and the third-generation cephalosporins remain active.") });
    }
  }
  return finalize(A, r);
}

/* ============================================================
   aerococcus — Aerococcus urinae et A. sanguinicola.

   Coques à Gram positif qu'on prend pour des streptocoques ou des
   staphylocoques, et qui infectent l'homme âgé par les urines. Plusieurs de
   leurs seuils ne valent QUE pour la cystite simple : les appliquer à une
   bactériémie rendrait sensible ce qui ne l'est pas.
   ============================================================ */
function aerococcusInterpret(r, c, a) {
  const sp = (a && a.species) || "Aerococcus spp.";
  const A = { sev: "wild", name: sp + tr(" — infection urinaire de l'homme âgé",
                                         " — urinary tract infection in older men"),
              mech: "", alerts: [], rules: [], comment: "" };
  A.mech = tr("Coque à Gram positif, catalase négative, en amas ou en courtes chaînes : on "
            + "le rend souvent pour un streptocoque ou un staphylocoque. Infections "
            + "urinaires de l'homme âgé — obstacle prostatique, sonde — et parfois "
            + "endocardite.",
              "A catalase-negative Gram-positive coccus, in clusters or short chains: it is "
            + "often taken for a streptococcus or a staphylococcus. Urinary tract infection "
            + "in older men — prostatic obstruction, a catheter — and sometimes endocarditis.");
  A.rules.push({ k: "✚", txt: tr("Pénicilline G / amoxicilline = référence ; la vancomycine "
    + "est constamment active et reste le recours.",
      "Benzylpenicillin or amoxicillin is the reference treatment; vancomycin is always "
    + "active and remains the fallback.") });
  A.rules.push({ k: "!", txt: tr("Identification : catalase NÉGATIVE, ce qui l'écarte des "
    + "staphylocoques. Un « streptocoque » isolé d'une urine chez un homme âgé mérite "
    + "d'être regardé de près.",
      "Identification: catalase NEGATIVE, which rules out the staphylococci. A "
    + "\u0022streptococcus\u0022 from the urine of an older man deserves a closer look.") });
  A.rules.push({ k: "!", txt: tr("Ciprofloxacine, lévofloxacine et nitrofurantoïne : l'EUCAST "
    + "ne les chiffre que pour la CYSTITE SIMPLE. Sur une hémoculture, ces seuils ne "
    + "s'appliquent pas.",
      "Ciprofloxacin, levofloxacin and nitrofurantoin: EUCAST gives breakpoints for them "
    + "only in UNCOMPLICATED CYSTITIS. On a blood culture, those breakpoints do not apply.") });
  A.rules.push({ k: "!", txt: tr("Un Aerococcus en HÉMOCULTURE fait chercher une endocardite : "
    + "l'espèce en donne, et la porte d'entrée est urinaire.",
      "An Aerococcus in a BLOOD CULTURE calls for a search for endocarditis: the species "
    + "causes it, and the portal of entry is urinary.") });
  parce(A, r, {
    pour: [["AMP", "S", tr("ampicilline active — c'est le traitement de référence",
                           "ampicillin active — it is the reference treatment")],
           ["PEN", "S", tr("pénicilline G active", "benzylpenicillin active")],
           ["VA", "S", tr("vancomycine active : recours constant dans ce genre",
                          "vancomycin active: the constant fallback in this genus")]],
    contre: [["PEN", "RI", tr("pénicilline G atteinte : inhabituel, vérifier l'identification",
                              "benzylpenicillin affected: unusual, check the identification")]]
  });
  A.comment = tr("Aerococcus urinae / sanguinicola : coque à Gram positif catalase négative, "
               + "infection urinaire de l'homme âgé. Pénicilline G / amoxicilline = "
               + "référence, vancomycine constamment active. Les seuils de ciprofloxacine, "
               + "lévofloxacine et nitrofurantoïne ne valent que pour la cystite simple ; "
               + "en hémoculture, chercher une endocardite.",
                 "Aerococcus urinae / sanguinicola: a catalase-negative Gram-positive "
               + "coccus causing urinary tract infection in older men. Benzylpenicillin or "
               + "amoxicillin is the reference treatment, vancomycin is always active. The "
               + "ciprofloxacin, levofloxacin and nitrofurantoin breakpoints hold only for "
               + "uncomplicated cystitis; on a blood culture, look for endocarditis.");
  return finalize(A, r);
}

function curvedInterpret(r, c, a) {
  const sp = (a && a.species) || tr("Bacille courbe", "Curved rod");
  const type = (a && a.type) || "campylobacter";
  const A = { sev: "wild", name: "", mech: "", alerts: [], rules: [], comment: "" };

  if (type === "campylobacter") {
    A.name = "Campylobacter jejuni";
    A.mech = tr("Macrolides = référence ; fluoroquinolones souvent résistantes (mutation gyrA).",
                "The macrolides are the reference treatment; the fluoroquinolones are often resistant (a gyrA mutation).");
    A.rules.push({ k: "✚", txt: tr("Azithromycine / érythromycine = traitement de référence.",
      "Azithromycin or erythromycin is the reference treatment.") });
    parce(A, r, {
      pour: [["AZM", "S", tr("azithromycine active — c'est le traitement de référence",
                             "azithromycin active — it is the reference treatment")],
             ["E", "S", tr("érythromycine active", "erythromycin active")]],
      contre: [["AZM", "R", tr("macrolide résistant : perte du traitement de référence",
                               "macrolide resistant: the reference treatment is lost")],
               ["CIP", "RI", tr("ciprofloxacine atteinte (mutation gyrA) : fréquent, et c'est pourquoi les fluoroquinolones ne conviennent pas en probabiliste",
                                "ciprofloxacin affected (a gyrA mutation): common, and that is why the fluoroquinolones are not suitable empirically")]]
    });
    A.comment = tr("Campylobacter jejuni : macrolides (azithromycine) = traitement de référence.",
      "Campylobacter jejuni: a macrolide, azithromycin, is the reference treatment.");
    if (isRI(r.CIP)) A.alerts.push({ lvl: "info", txt: tr("Ciprofloxacine résistante : fréquent — fluoroquinolones à éviter en probabiliste.",
      "Ciprofloxacin resistant: common — avoid the fluoroquinolones empirically.") });
    if (isR(r.AZM) || isR(r.E)) { A.sev = "high"; A.alerts.push({ lvl: "warn", txt: tr("Macrolide résistant : perte du traitement de référence — avis spécialisé.",
      "Macrolide resistant: the reference treatment is lost — seek specialist advice.") });
      A.comment += tr(" Macrolide résistant : options limitées.", " Macrolide resistant: options are limited."); }
  } else {
    A.name = "Vibrio cholerae";
    A.mech = tr("Traitement adjuvant à la réhydratation ; doxycycline = référence, azithromycine en alternative.",
                "Treatment is adjunctive to rehydration; doxycycline is the reference, azithromycin the alternative.");
    A.rules.push({ k: "✚", txt: tr("Doxycycline = référence ; azithromycine / fluoroquinolone selon la sensibilité. La réhydratation reste le pilier du traitement.",
      "Doxycycline is the reference treatment; azithromycin or a fluoroquinolone according to susceptibility. Rehydration remains the mainstay.") });
    parce(A, r, {
      pour: [["DOX", "S", tr("doxycycline active — antibiotique de référence, en appoint de la réhydratation",
                             "doxycycline active — the reference antibiotic, alongside rehydration")],
             ["AZM", "S", tr("azithromycine active : alternative", "azithromycin active: the alternative")]],
      contre: [["DOX", "R", tr("doxycycline résistante", "doxycycline resistant")],
               ["SXT", "R", tr("cotrimoxazole résistant : profil multirésistant fréquent en contexte épidémique",
                               "co-trimoxazole resistant: a multidrug-resistant phenotype common in outbreaks")]]
    });
    A.comment = tr("Vibrio cholerae : la réhydratation est prioritaire ; l'antibiotique (doxycycline de référence, azithromycine en alternative) raccourcit la maladie.",
      "Vibrio cholerae: rehydration comes first; the antibiotic — doxycycline as the reference, azithromycin as the alternative — shortens the illness.");
    if (isR(r.DOX) && isR(r.SXT)) { A.sev = "high"; A.alerts.push({ lvl: "warn", txt: tr("Souche multirésistante (doxycycline + cotrimoxazole R) : fréquent en contexte épidémique — s'appuyer sur l'antibiogramme.",
      "A multidrug-resistant isolate (doxycycline and co-trimoxazole both R): common in outbreaks — rely on the susceptibility test.") }); }
  }
  return finalize(A, r);
}

const ENGINE = {
  entero: enteroInterpret, enterobacter: enterobacterInterpret, staph: staphInterpret,
  enterococcus: enteroCoccusInterpret, pseudo: pseudoInterpret, acineto: acinetoInterpret,
  proteus: proteusInterpret, salmonella: salmonellaInterpret, pneumo: pneumoInterpret,
  strep: strepInterpret, stenoburk: stenoburkInterpret, fastid: fastidInterpret,
  gramposrod: gramposrodInterpret, anaerobe: anaerobeInterpret, curved: curvedInterpret,
  autresbgn: autresbgnInterpret, aerococcus: aerococcusInterpret
};

/* ---------- CMI -> S/I/R (porté) ---------- */
function parseMic(str) {
  if (str === undefined || str === null) return null;
  let s = String(str).trim().replace(",", ".").replace(/\s+/g, "");
  if (!s) return null;
  let op = "=";
  if (/^(<=|≤)/.test(s)) { op = "<="; s = s.replace(/^(<=|≤)/, ""); }
  else if (/^(>=|≥)/.test(s)) { op = ">="; s = s.replace(/^(>=|≥)/, ""); }
  else if (/^>/.test(s)) { op = ">"; s = s.replace(/^>/, ""); }
  else if (/^</.test(s)) { op = "<"; s = s.replace(/^</, ""); }
  const v = parseFloat(s);
  if (isNaN(v) || v < 0) return null;
  return { op, v };
}
function catFromMic(str, bp) {
  if (!bp) return null;
  const p = parseMic(str); if (!p) return null;
  const { op, v } = p, { S, R } = bp;
  const sans = (S === null || S === undefined);   // aucune catégorie « sensible »

  /* UNE BORNE NE DONNE PAS UNE VALEUR. « ≥ 0,25 » dit que la CMI vaut AU MOINS
     0,25 : elle peut valoir 0,25, et elle peut valoir 8. Le code retombait sur
     « v <= S » et rendait « S » — il déclarait active une molécule qui pouvait
     être résistante, à partir d'une mesure qui ne le disait pas. C'est le sens
     dangereux de l'erreur, et aucun banc ne le voyait.

     Symétriquement, « ≤ 2 » sous un seuil S ≤ 0,5 ne dit pas « résistant » :
     la CMI peut valoir 0,25. Le code rendait « R », privant le malade d'un
     antibiotique peut-être actif.

     La fonction jumelle des diamètres faisait déjà le bon choix, et l'écrivait :
     « Mieux vaut ne rien rendre que deviner. » On ne conclut donc que si la
     borne SUFFIT À ELLE SEULE, et l'on rend « null » sinon — ce que l'interface
     sait déjà présenter comme une catégorisation impossible. */
  if (op === "<=" || op === "<") {
    // Borne supérieure : la pire valeur possible est v. Elle tranche si même
    // elle reste sensible — ou, faute de catégorie « sensible », si elle
    // reste en deçà de la résistance.
    if (!sans && v <= S) return "S";
    if (sans && v <= R) return "I";
    return null;
  }
  if (op === ">" || op === ">=") {
    // Borne inférieure : la meilleure valeur possible est v (ou juste
    // au-dessus). Elle tranche si même elle est déjà résistante.
    if (op === ">=" ? v > R : v >= R) return "R";
    return null;
  }

  if (sans) return v > R ? "R" : "I";
  if (v <= S) return "S";
  if (v > R) return "R";
  return "I";
}
/* ------------------------------------------------------------
   Couples germe / antibiotique pour lesquels EUCAST v16.1 ne fixe
   AUCUN seuil chiffré : soit la feuille l'indique explicitement
   (Burkholderia cepacia), soit la ligne renvoie à une note ou à un
   test de dépistage (oxacilline et céfoxitine sur staphylocoque,
   gentamicine haut niveau chez l'entérocoque, aminopénicillines sur
   streptocoque A/B/C/G).

   Les valeurs employées ici sont des CONVENTIONS DE LABORATOIRE, pas
   des seuils officiels. Elles restent utiles — un antibiotique testé
   doit pouvoir être catégorisé — mais l'interface le signale, pour
   qu'on ne les prenne pas pour de l'EUCAST.

   Cette liste est produite par outils/comparer-eucast.py ; elle se
   régénère à chaque changement de version du référentiel.
   ------------------------------------------------------------ */


// Ce seuil est-il une convention de laboratoire plutôt qu'un seuil EUCAST ?
function horsEucast(groupe, code){
  const l = HORS_EUCAST[groupe];
  return !!l && l.indexOf(code) !== -1;
}

/* ------------------------------------------------------------
   Seuils du PRÉLÈVEMENT MÉNINGÉ (LCR).
   EUCAST donne, pour quelques couples, deux jeux de seuils : « meningitis »
   et « indications other than meningitis ». Le premier est plus strict — la
   diffusion dans le liquide céphalo-rachidien est mauvaise.
   Ces valeurs ne remplacent les seuils courants QUE si le contexte méningé
   est renseigné (ctx.mening === "Oui").

   Attention en relisant le tableau officiel : « meningitis » apparaît AUSSI
   dans « indications other than meningitis ». Confondre les deux inverse les
   seuils.  Les lignes sans valeur chiffrée (renvoi « Note ») sont écartées :
   H. influenzae / ampicilline et amoxicilline en méningite sont dans ce cas.
   ------------------------------------------------------------ */


/* ============================================================
   CA-SFM — DIFFÉRENCES AVEC L'EUCAST (copie conforme du client).
   Source : « Différences principales entre le CA-SFM et l'EUCAST »,
   version CA-SFM 2026. Chaque entrée porte sa page.
   Tout couple absent de ces tables garde sa valeur EUCAST.
   outils/verifier-tables.py échoue si ces tables divergent du client.
   ============================================================ */

// p. 6 — infection urinaire sans signe de gravité : le CA-SFM refuse
// l'abaissement du cotrimoxazole à 0,5 mg/L dans l'urine.

// p. 14 — méningite à méningocoque : seuil unique sur l'amoxicilline.

// p. 18 et p. 7 — couples sans seuil EUCAST que le CA-SFM couvre.



// Référentiel de la requête en cours (fixé juste avant le calcul, synchrone).
/* ====================================================================
   LA LANGUE DU COMMENTAIRE.

   Le moteur rédige. Mécanisme de résistance, règles expertes, alertes,
   commentaire du compte rendu : c'est là qu'est la valeur de PhénoBac, et
   c'était la dernière partie encore uniquement française.

   DEUX FAÇONS DE S'Y PRENDRE, ET UNE SEULE TIENT.

   Sortir les 501 phrases dans un catalogue à clés aurait éloigné le texte du
   raisonnement qui le produit : on aurait lu « T("staph.sarm.mech") » là où il
   faut voir ce qui sera écrit au biologiste. Dans un moteur dont la prose EST
   le produit, cacher la prose est le mauvais choix.

   On écrit donc les deux langues CÔTE À CÔTE, à l'endroit même où la phrase
   est composée : tr("…", "…"). Le français reste lisible en place — il sert
   aussi de documentation —, l'anglais se relit en regard, et une phrase
   ajoutée sans sa traduction se voit à l'œil nu comme au contrôle.

   LE MOTEUR NE DÉPEND PAS DE LA PAGE. Il porte sa propre langue et l'expose ;
   la page la lui pose quand l'utilisateur bascule. Les bancs d'essai, qui
   vérifient le texte français, tournent donc inchangés — le défaut par défaut
   est le français, et c'est voulu : une application mal configurée doit rendre
   la langue de ceux pour qui elle a été écrite.
   ==================================================================== */
let _lang = "fr";
function fixerLangue(l) { _lang = (l === "en") ? "en" : "fr"; return _lang; }
function langueCourante() { return _lang; }

/* tr(français, anglais). L'anglais du référentiel n'est pas une traduction :
   c'est le terme de l'EUCAST, qui publie en anglais. */
function tr(fr, en) { return _lang === "en" && en ? en : fr; }

let _ref = "eucast";
const estCasfm = () => _ref === "casfm";

/* LE CADRE D'UNE LECTURE : le référentiel actif et l'espèce.

   Ces deux variables commandent TOUTE consultation de seuil — quelle table
   répond, quelle restriction d'espèce s'applique — et runInterpretation les
   posait au début de chaque appel, sans qu'on puisse les poser autrement.
   Les fonctions de consultation (getBP, getDZ, zitPour…) étaient donc
   inutilisables du dehors avec un autre état que le dernier calculé.

   C'est ce qui a conduit la page à RECOPIER ces douze fonctions pour pouvoir
   les appeler avec le sien. Et deux copies divergent toujours : le
   25 octobre 2026, celle de la page rendait « S » une CMI notée « ≥ 0,25 »
   que le moteur, corrigé la veille, refusait de trancher. L'écran disait
   sensible, le compte rendu ne disait rien, et c'était l'écran que le
   biologiste regardait.

   Le cadre s'ouvre donc. La page emprunte les fonctions au lieu de les
   réécrire, et outils/verifier-tables.py refuse qu'elle en reprenne la
   logique. */
function cadrer(ref, organismId) {
  const r = String(ref || "eucast");
  _ref = Object.prototype.hasOwnProperty.call(REFERENTIELS, r) ? r : "eucast";
  _activeId = organismId || null;
  return _ref;
}

/* ============================================================
   ZONES D'INCERTITUDE TECHNIQUE (ZIT / ATU) — copie conforme du client.

   La ZIT n'est pas une catégorie clinique : c'est un avertissement sur la
   reproductibilité de la catégorie rendue, à une valeur de CMI définie.

   Sources : EUCAST v16.1, colonne « ATU » ; CA-SFM 2026, colonne « ZIT ».
   outils/verifier-tables.py échoue si ces tables divergent du client.
   ============================================================ */



function zitPour(bpOverride, group, k, ctx) {
  if (bpOverride && bpOverride[group + ":" + k]) return null;   // seuils saisis : la ZIT publiée ne s'y rapporte plus
  if (k === "CIP" && ctx && ctx.mening === "Oui") return null;  // ligne « méningites », sans ZIT
  if (estCasfm() && ZIT_CASFM[group] && ZIT_CASFM[group][k] !== undefined) return ZIT_CASFM[group][k];
  const z = ZIT[group] && ZIT[group][k];
  return (z === undefined) ? null : z;
}

function enZit(str, bpOverride, group, k, ctx) {
  const z = zitPour(bpOverride, group, k, ctx);
  if (z === null) return false;
  const p = parseMic(str);
  if (!p || p.v !== z) return false;
  // « > 0,5 » est franchement au-dessus, « < 0,5 » franchement en dessous.
  return p.op !== ">" && p.op !== "<";
}

function getBP(bpOverride, group, k, ctx) {
  const o = bpOverride && bpOverride[group + ":" + k];
  if (o && o.S !== undefined && o.R !== undefined) return o;   // saisie de l'utilisateur : prioritaire
  const c = ctx || {};
  // Le contexte méningé l'emporte sur tout le reste : un LCR n'est pas une urine.
  if (c.mening === "Oui") {
    if (estCasfm() && BP_MENINGE_CASFM[group] && BP_MENINGE_CASFM[group][k]) return BP_MENINGE_CASFM[group][k];
    if (BP_MENINGE[group] && BP_MENINGE[group][k]) return BP_MENINGE[group][k];
  }
  if (estCasfm()) {
    if (c.urin === "Oui" && BP_CASFM_URIN[group] && BP_CASFM_URIN[group][k]) return BP_CASFM_URIN[group][k];
    if (BP_CASFM[group] && BP_CASFM[group][k]) return BP_CASFM[group][k];
  }
  // L'EUCAST a lui aussi des seuils propres à la cystite simple : le
  // pivmécillinam, le céfixime, la nitrofurantoïne et le triméthoprime n'y
  // sont chiffrés QUE pour cette indication. Hors contexte urinaire ils
  // n'ont pas de seuil du tout, et l'application doit le dire plutôt que
  // d'appliquer un seuil d'une autre indication.
  // La restriction d'espèce vaut pour la CMI comme pour le disque. Elle ne
  // valait d'abord que pour le disque, et la nitrofurantoïne se trouvait
  // catégorisée en CMI chez Klebsiella alors que l'EUCAST ne la valide que
  // chez E. coli — un chiffre juste au mauvais endroit.
  if (c.urin === "Oui" && BP_URIN[group] && BP_URIN[group][k] && especeAutorisee(group, k))
    return BP_URIN[group][k];
  /* Hors cystite, une molécule qui n'a QUE des seuils urinaires n'en a pas.
     Cette ligne est une ceinture par-dessus des bretelles, et l'épreuve par
     mutation l'a montré : la retirer ne change rien, puisque le retour final
     rend déjà « null » quand BP[group][k] n'existe pas. Elle reste parce
     qu'elle DIT l'intention — et que la table ordinaire pourrait un jour
     recevoir un seuil pour l'une de ces molécules sans qu'on y pense. */
  if (BP_URIN[group] && BP_URIN[group][k] && !(BP[group] && BP[group][k])) return null;
  return (BP[group] && BP[group][k]) || null;
}


/* ============================================================
   DIAMÈTRES CRITIQUES (méthode des disques), EUCAST v16.1.

   Un laboratoire sans automate lit son antibiogramme au pied à
   coulisse. Lui demander une catégorie S/I/R, c'est lui demander de
   faire lui-même la conversion — précisément l'étape que cet outil
   existe pour lui épargner.

   DEUX PIÈGES, et ils sont graves :

   1. LE SENS EST INVERSÉ. En CMI, « petit » veut dire sensible ; au
      disque, c'est « grand ». Un seuil lu à l'envers rendrait
      résistante toute souche sensible, sans qu'aucune erreur ne soit
      visible nulle part.

   2. LA CHARGE DU DISQUE FAIT PARTIE DU SEUIL. « 23 mm » ne veut rien
      dire sans savoir si le disque portait 10 ou 30 µg. La charge est
      donc conservée à côté de la valeur, et affichée à la saisie.

   S:null reprend la convention de la table des CMI : l'EUCAST ne
   prévoit AUCUNE catégorie « sensible » à posologie standard pour ce
   couple (il écrit un seuil de 50 mm, qu'aucune boîte ne produit).

   Un couple ABSENT de cette table n'est pas un oubli : l'EUCAST ne
   reconnaît pas la méthode des disques pour lui — colistine, et
   vancomycine sur staphylocoque, en sont les exemples classiques. Le
   moteur refuse alors de catégoriser et réclame une CMI.

   Produit par outils/extraire-diametres.py ; outils/verifier-tables.py
   échoue si ces valeurs divergent du tableau officiel.
   ============================================================ */


/* Charge du disque, en µg (« 1 unit » pour la pénicilline G). */


/* LCR. L'EUCAST ne chiffre au disque qu'une poignée de couples ; pour le
   pneumocoque et pour Haemophilus il renvoie à la CMI. Le moteur doit
   alors REFUSER de catégoriser plutôt qu'appliquer le seuil ordinaire,
   qui serait trop permissif pour une méningite. */


/* Zone d'incertitude technique, au disque. Contrairement à la CMI, c'est
   un INTERVALLE de millimètres : entre ces deux bornes la lecture n'est
   pas reproductible. Noter que l'amoxicilline-acide clavulanique y figure
   alors qu'elle n'a pas de ZIT en CMI — l'incertitude est propre à la
   méthode, pas à la molécule. */


/* ============================================================
   DIAMÈTRES — DIFFÉRENCES DU CA-SFM 2026.

   Même principe que pour les CMI : PhénoBac ne recopie pas le CA-SFM, il
   n'enregistre que ce par quoi il S'ÉCARTE de l'EUCAST. Tout couple absent
   de ces tables garde son diamètre EUCAST.

   Source : « Recommandations CA-SFM / EUCAST », version 2026, chapitre 5.
   Les pages citées sont les pages IMPRIMÉES du communiqué.
   outils/lire-casfm.py permet d'y retourner ligne par ligne.

   Un couple qui figure ici alors que l'EUCAST ne le chiffre pas n'est pas
   une invention : c'est le CA-SFM qui le couvre (minocycline sur
   Acinetobacter, moxifloxacine sur les anaérobies, céfoxitine sur E. coli).
   ============================================================ */


/* p. 55, 48, 78 et 64 — infection urinaire sans signe de gravité. */


/* Charges propres au CA-SFM. Celle de la pipéracilline-tazobactam sur
   Acinetobacter — 100-10 µg au lieu de 30-6 — est l'exemple même de ce
   qu'un diamètre ne dit pas tout seul. */


/* p. 127 — zone d'incertitude propre au CA-SFM, au disque. */


/* Couples que le CA-SFM ne chiffre que pour certaines espèces : hors
   d'elles, il n'y a pas de seuil, et en emprunter un serait une faute. */


/* p. 90 — Streptocoques A, C et G : le disque de pénicilline G ne sert qu'à
   DÉPISTER les souches sensibles. « Si le diamètre est < 23 mm, utiliser une
   méthode [de CMI] » : le CA-SFM refuse donc de rendre « résistant » sur le
   disque, là où l'EUCAST l'autorise. La résistance aux β-lactamines étant
   exceptionnelle dans ce groupe, un petit diamètre est d'abord un problème
   technique — et le rendre « R » ferait perdre au malade son traitement de
   référence sur une mesure douteuse. */


/* Là où le CA-SFM s'écarte de l'EUCAST en CMI, appliquer quand même le
   diamètre EUCAST rendrait une catégorie qui n'est celle d'aucun des deux
   référentiels. Deux cas, un seul refus :

     - le diamètre CA-SFM est connu (DZ_CASFM / DZ_CASFM_URIN) : on l'emploie ;
     - il ne l'est pas alors que la CMI diverge : on ne rend rien, et on dit
       pourquoi.

   Un couple sur lequel les deux référentiels s'accordent en CMI garde son
   diamètre EUCAST sans autre forme de procès. */
function dzCasfm(group, k, ctx) {
  const c = ctx || {};
  if (c.urin === "Oui" && DZ_CASFM_URIN[group] && DZ_CASFM_URIN[group][k])
    return DZ_CASFM_URIN[group][k];
  return (DZ_CASFM[group] && DZ_CASFM[group][k]) || null;
}

function dzCasfmDivergent(group, k, ctx) {
  const c = ctx || {};
  if (dzCasfm(group, k, c)) return false;          // le CA-SFM chiffre ce couple
  if (c.mening === "Oui" && BP_MENINGE_CASFM[group] && BP_MENINGE_CASFM[group][k]) return true;
  if (c.urin === "Oui" && BP_CASFM_URIN[group] && BP_CASFM_URIN[group][k]) return true;
  return !!(BP_CASFM[group] && BP_CASFM[group][k]);
}

/* L'EUCAST n'attribue pas de diamètre propre à l'amoxicilline : ses lignes
   portent « Note », et le disque d'ampicilline sert de témoin. Cette
   substitution ne vaut QUE chez les entérobactéries, où les deux molécules
   partagent déjà le même seuil de CMI (8 mg/L). Ailleurs — Haemophilus,
   Listeria, Moraxella, corynébactéries — les CMI diffèrent, et emprunter le
   diamètre de l'ampicilline rendrait une catégorie fausse.

   Nuance conservée ici pour mémoire : pour l'amoxicilline ORALE d'origine
   urinaire, l'EUCAST fait rendre « I » et non « S » à partir d'une
   ampicilline sensible. PhénoBac rend l'amoxicilline générale, comme pour
   les CMI. */


function getDZ(dzOverride, group, k, ctx) {
  const o = dzOverride && dzOverride[group + ":" + k];
  if (o && o.S !== undefined && o.R !== undefined) return o;   // saisie de l'utilisateur : prioritaire
  const c = ctx || {};
  // Le témoin ampicilline est une règle de l'EUCAST. Le CA-SFM donnant à
  // l'amoxicilline son propre disque, l'emprunt n'a plus lieu d'être.
  const temoin = !estCasfm() && DZ_TEMOIN[group] && DZ_TEMOIN[group][k];
  if (temoin) return getDZ(dzOverride, group, temoin, c);
  if (estCasfm()) {
    // Restriction d'espèce : le CA-SFM ne chiffre la céfoxitine que pour
    // E. coli. L'appliquer à Klebsiella donnerait un chiffre juste au
    // mauvais endroit — le défaut le plus difficile à repérer.
    // Un dépistage n'est pas un seuil à deux bords : il se traite à part,
    // dans la boucle de traduction, pour ne pas rendre « R » ce que le
    // CA-SFM refuse de trancher au disque.
    if (DEPISTAGE_CASFM[group] && DEPISTAGE_CASFM[group][k]) return null;
    const limite = DZ_CASFM_ESPECE[group + ":" + k];
    if (!limite || (_activeId && limite.indexOf(_activeId) !== -1)) {
      const d = dzCasfm(group, k, c);
      if (d) return d;
    }
    if (dzCasfmDivergent(group, k, c)) return null;
  }
  if (c.mening === "Oui") {
    // Si le couple a un seuil méningé en CMI mais aucun au disque, c'est
    // que l'EUCAST l'interdit : ne pas retomber sur le seuil ordinaire.
    if (DZ_MENINGE[group] && DZ_MENINGE[group][k]) return DZ_MENINGE[group][k];
    if (BP_MENINGE[group] && BP_MENINGE[group][k]) return null;
  }
  // Cystite simple : l'EUCAST chiffre quelques molécules POUR CETTE
  // INDICATION SEULEMENT, et parfois pour quelques espèces seulement — la
  // nitrofurantoïne chez E. coli, le triméthoprime chez E. coli et
  // Klebsiella. Appliquer ces seuils ailleurs donnerait un chiffre juste au
  // mauvais endroit, le défaut le plus difficile à repérer.
  if (c.urin === "Oui" && DZ_URIN[group] && DZ_URIN[group][k]
      && especeAutorisee(group, k)) return DZ_URIN[group][k];
  // Hors cystite, une molécule qui n'a QUE des seuils urinaires n'en a pas :
  // ne pas retomber sur un seuil d'une autre indication.
  if (DZ_URIN[group] && DZ_URIN[group][k] && !(DZ[group] && DZ[group][k])) return null;
  return (DZ[group] && DZ[group][k]) || null;
}

/* La restriction d'espèce d'un seuil, s'il en porte une. Sert aux seuils
   urinaires de l'EUCAST comme à ceux du CA-SFM : une seule règle, une seule
   place où elle peut être oubliée. */
function especeAutorisee(group, k) {
  const limite = ESPECE_LIMITE[group + ":" + k];
  if (!limite) return true;
  return !!_activeId && limite.indexOf(_activeId) !== -1;
}

/* ---------- Diamètre -> S/I/R ---------- */
// La charge du disque, en tenant compte du témoin (l'amoxicilline se lit
// sur le disque d'ampicilline).
function disquePour(group, k) {
  // En CA-SFM, l'amoxicilline a son propre disque : la charge annoncée doit
  // changer avec le référentiel, sans quoi on mesurerait sur 20 µg en
  // lisant un seuil établi pour 10.
  if (estCasfm() && DISQUE_CASFM[group] && DISQUE_CASFM[group][k])
    return { charge: DISQUE_CASFM[group][k], temoin: null };
  const temoin = (DZ_TEMOIN[group] && DZ_TEMOIN[group][k]) || k;
  const d = DISQUE[group] && DISQUE[group][temoin];
  return d ? { charge: d, temoin: temoin === k ? null : temoin } : null;
}

function parseDiam(str) {
  if (str === undefined || str === null) return null;
  let s = String(str).trim().replace(",", ".").replace(/\s+/g, "").replace(/mm$/i, "");
  if (!s) return null;
  let op = "=";
  if (/^(<=|≤)/.test(s)) { op = "<="; s = s.replace(/^(<=|≤)/, ""); }
  else if (/^(>=|≥)/.test(s)) { op = ">="; s = s.replace(/^(>=|≥)/, ""); }
  else if (/^>/.test(s)) { op = ">"; s = s.replace(/^>/, ""); }
  else if (/^</.test(s)) { op = "<"; s = s.replace(/^</, ""); }
  let v = parseFloat(s);
  if (isNaN(v) || v < 0 || v > 60) return null;      // au-delà, ce n'est plus une boîte de 90 mm
  if (v > 0 && v < 6) return null;                   // impossible : le disque mesure déjà 6 mm
  if (v === 0) v = 6;                                // « pas de zone » se note 0 ou 6
  return { op, v };
}

function catFromDiam(str, dz) {
  if (!dz) return null;
  const p = parseDiam(str); if (!p) return null;
  const { op, v } = p, { S, R } = dz;

  // Un opérateur ne donne qu'une borne. « ≥ 25 » conclut si 25 suffit déjà
  // à être sensible ; sinon la mesure peut être n'importe où au-dessus et
  // l'on ne conclut pas. Mieux vaut ne rien rendre que deviner.
  if (op === ">=" || op === ">") return (S !== null && S !== undefined && v >= S) ? "S" : null;
  if (op === "<=" || op === "<")  return (v < R) ? "R" : null;

  // Sens inversé par rapport à la CMI : grand diamètre = sensible.
  if (S === null || S === undefined) return v < R ? "R" : "I";
  if (v >= S) return "S";
  if (v < R) return "R";
  return "I";
}

// Pourquoi ce diamètre n'a pas pu être traduit. Un refus sans motif
// laisserait croire à une panne ; chacun de ces trois cas est au contraire
// une décision du référentiel, et le biologiste doit savoir laquelle.
/* Les espèces auxquelles un seuil est restreint, nommées comme le biologiste
   les lit. Sans cela le message citerait des identifiants (« ecoli »). */
function especesDites(group, k) {
  const limite = ESPECE_LIMITE[group + ":" + k] || [];
  const noms = limite.map(function (id) {
    return (ORG[id] && ORG[id].args && ORG[id].args.species) || id;
  });
  return noms.length ? noms.join(", ") : "certaines espèces seulement";
}

function raisonSansDisque(group, k, ctx) {
  const c = ctx || {};
  if (estCasfm() && dzCasfmDivergent(group, k, c))
    return tr("le CA-SFM retient un seuil différent de l'EUCAST pour ce couple, et PhénoBac ne reprend que ses seuils de CMI — saisir une CMI, ou repasser en EUCAST",
              "the CA-SFM sets a different breakpoint from EUCAST for this pair, and PhénoBac carries only its MIC values — enter an MIC, or switch back to EUCAST");
  if (c.mening === "Oui" && !(DZ_MENINGE[group] && DZ_MENINGE[group][k])
      && BP_MENINGE[group] && BP_MENINGE[group][k])
    return tr("l'EUCAST ne chiffre pas ce couple au disque dans le LCR et renvoie à la CMI — le seuil ordinaire serait trop permissif pour une méningite",
              "EUCAST gives no zone diameter for this pair in CSF and refers to the MIC — the ordinary breakpoint would be too permissive for meningitis");
  /* UNE ABSENCE DOIT DIRE SA PROPRE RAISON, pas la plus courante.

     « L'EUCAST ne reconnaît pas la méthode des disques pour ce couple » était
     la seule explication donnée, et elle est FAUSSE dès qu'un seuil existe
     mais ne s'applique pas ici. Le 25 octobre 2026, la fosfomycine l'a
     montré : le document lui donne bien un disque de 200 µg, mais pour
     E. coli et pour l'infection urinaire. Sur une Klebsiella, le message
     envoyait faire une CMI qui ne serait pas catégorisée davantage ; sur un
     E. coli hors contexte urinaire, il cachait qu'il suffisait de répondre à
     une question. Une mauvaise raison coûte un examen et fait douter de
     l'outil. */
  if (!(DZ[group] && DZ[group][k])) {
    const urinaire = DZ_URIN[group] && DZ_URIN[group][k];
    // L'ESPÈCE D'ABORD, LE CONTEXTE ENSUITE. Sur une Klebsiella hors contexte
    // urinaire, les deux raisons valent — mais seule la première est
    // RÉPARABLE par l'utilisateur, et l'annoncer serait lui faire cocher une
    // question qui ne changera rien.
    if (urinaire && !especeAutorisee(group, k))
      return tr("l'EUCAST ne chiffre ce couple que pour ", "EUCAST sets this breakpoint only for ")
           + especesDites(group, k)
           + tr(" — pour les autres espèces du groupe, le document renvoie à une note "
              + "et ne donne aucun seuil, ni au disque ni en CMI",
                " — for the other species in the group the document refers to a note "
              + "and gives no breakpoint at all, neither by disk nor by MIC");
    if (urinaire && c.urin !== "Oui")
      return tr("l'EUCAST ne chiffre ce couple que pour l'infection urinaire — répondre à "
              + "la question du contexte, en haut de la page, suffit à le catégoriser",
                "EUCAST sets this breakpoint for urinary tract infection only — answering "
              + "the context question at the top of the page is enough to categorise it");
    return horsEucast(group, k)
      ? tr("l'EUCAST ne chiffre ce couple ni en CMI ni au disque ; PhénoBac ne dispose que d'une convention de laboratoire, applicable à une CMI — saisir une CMI",
           "EUCAST gives no breakpoint for this pair, by MIC or by disk; PhénoBac has only a local laboratory convention, which applies to an MIC — enter an MIC")
      : tr("l'EUCAST ne reconnaît pas la méthode des disques pour ce couple — une CMI est nécessaire",
           "EUCAST does not accept disk diffusion for this pair — an MIC is required");
  }
  if (!especeAutorisee(group, k))
    return tr("l'EUCAST ne chiffre ce couple que pour ", "EUCAST sets this breakpoint only for ")
         + especesDites(group, k)
         + tr(" — pour les autres espèces du groupe, le document ne donne aucun seuil",
              " — for the other species in the group the document gives no breakpoint");
  return tr("valeur illisible : un diamètre s'écrit en millimètres, entre 6 (pas de zone) et 60",
            "unreadable value: a zone diameter is written in millimetres, between 6 (no zone) and 60");
}

/* ---------- Pneumocoque : le dépistage par l'oxacilline 1 µg ----------

   Sans cette règle, un laboratoire qui lit son pneumocoque au disque
   n'obtiendrait RIEN sur les β-lactamines — la question la plus importante
   pour cette espèce. L'EUCAST écrit « Note » en face de la pénicilline G,
   de l'amoxicilline et du céfotaxime, et renvoie au dépistage :

     « The oxacillin 1 µg disk diffusion screening test or a benzylpenicillin
       MIC test shall be used to exclude beta-lactam resistance mechanisms.
       When the screen is negative (oxacillin zone diameter ≥ 20 mm […]) all
       beta-lactam agents for which clinical breakpoints are available,
       including those with "Note", can be reported susceptible without
       further testing. When the screen is positive (zone diameter < 20 mm
       […]), see flow chart. »
       — EUCAST v16.1, feuille S. pneumoniae, note 1

   Dépistage négatif : les β-lactamines sont rendues S. Dépistage positif :
   PhénoBac ne rend rien et réclame une CMI de pénicilline G. Il ne rend
   surtout pas « résistant » — un dépistage positif signale une PLP modifiée,
   pas une résistance clinique, et beaucoup de ces souches restent traitables
   à forte posologie. */
const OXA_PNEUMO = 20;
const BETALACT_PNEUMO = ["PEN", "AMX", "CTX"];

// Renvoie ses messages au lieu de les poser : le dépistage doit remplir les
// catégories AVANT que le moteur ne raisonne sur le phénotype, alors que les
// alertes ne s'ajoutent qu'à la fin. Les deux moments sont distincts.
function depistagePneumo(group, dia, results) {
  if (group !== "pneumo") return null;
  const p = parseDiam(dia.OXA);
  if (!p || p.op !== "=") return null;
  const A = { rules: [], alerts: [], sev: null };

  if (p.v >= OXA_PNEUMO) {
    const mis = [];
    BETALACT_PNEUMO.forEach(k => {
      if (results[k] === undefined) { results[k] = "S"; mis.push(nomAbx(k)); }
    });
    A.rules.push({ k: "✚", txt:
      `Dépistage à l'oxacilline 1 µg négatif (${p.v} mm ≥ ${OXA_PNEUMO} mm) : absence de mécanisme de résistance ` +
      `aux β-lactamines. L'EUCAST permet de rendre sensibles, sans autre test, les β-lactamines disposant d'un ` +
      `seuil clinique` + (mis.length ? " — ici " + mis.join(", ") + "." : ".") });
  } else {
    A.sev = "moderate";
    A.alerts.push({ lvl: "warn", txt:
      `Dépistage à l'oxacilline 1 µg positif (${p.v} mm < ${OXA_PNEUMO} mm) : une modification des protéines ` +
      `liant les pénicillines est probable. Les β-lactamines ne peuvent pas être rendues au disque — déterminer ` +
      `la CMI de pénicilline G (et celle de céfotaxime si le site est méningé). Un dépistage positif n'est PAS ` +
      `une résistance : beaucoup de ces souches restent traitables à forte posologie.` });
    A.rules.push({ k: "≈", txt:
      "Pneumocoque, dépistage positif : ne pas rendre « résistant » sur le seul dépistage. Le niveau de résistance, " +
      "et donc le traitement possible, ne se lit que sur la CMI." });
  }
  return A;
}

/* Dépistages au disque qui ne rendent qu'un seul côté de la catégorie.
   Le pneumocoque en a un (oxacilline) ; le CA-SFM en ajoute un pour la
   pénicilline G chez les streptocoques A, C et G. Le principe est le même :
   une grande zone conclut, une petite ne conclut pas et renvoie à la CMI. */
function depistageSeuil(group, k) {
  const t = estCasfm() ? DEPISTAGE_CASFM : DEPISTAGE;
  if (t[group] && t[group][k]) return t[group][k];
  return null;
}

function zitZonePour(dzOverride, group, k, ctx) {
  if (dzOverride && dzOverride[group + ":" + k]) return null;  // seuils saisis : la ZIT publiée ne s'y rapporte plus
  if (ctx && ctx.mening === "Oui") return null;                // lignes LCR : pas de ZIT publiée
  if (estCasfm() && ZIT_ZONE_CASFM[group] && ZIT_ZONE_CASFM[group][k])
    return ZIT_ZONE_CASFM[group][k];
  const z = ZIT_ZONE[group] && ZIT_ZONE[group][k];
  return z || null;
}

function enZitZone(str, dzOverride, group, k, ctx) {
  const z = zitZonePour(dzOverride, group, k, ctx);
  if (!z) return false;
  const p = parseDiam(str);
  if (!p || p.op !== "=") return false;   // une borne ne situe pas dans l'intervalle
  return p.v >= z[0] && p.v <= z[1];
}

/* ---------- Orchestration ---------- */
function runInterpretation(input) {
  const organism = input.organism;
  if (!ORG[organism]) return { error: "unknown_organism" };
  const org = ORG[organism];

  // Référentiel demandé. Inconnu ou absent : EUCAST, qui est le socle commun.
  // hasOwnProperty, et non un simple accès : « toString » ou « constructor »
  // passeraient pour des entrées du registre alors qu'ils viennent du
  // prototype, et le référentiel renvoyé n'aurait plus de sens.
  cadrer(input.ref, organism);
  if (input.lang) fixerLangue(input.lang);

  // _activeId est posé par cadrer(), ci-dessus : AVANT la traduction des
  // mesures, et non seulement avant le calcul — la restriction d'espèce des
  // diamètres CA-SFM en dépend.
  let results = {};
  _zit = [];
  _sansDisque = [];
  _depistage = null;
  _depistageEchoue = [];
  if (input.mode === "mic") {
    const mic = input.mic || {};
    Object.keys(mic).forEach(k => {
      const cat = catFromMic(mic[k], getBP(input.bpOverride || {}, org.bpGroup, k, input.ctx || {}));
      if (cat) results[k] = cat;
      // La ZIT porte sur une valeur mesurée : en mode S/I/R il n'y en a pas,
      // et c'est correct — sans CMI, il n'y a rien à situer.
      if (enZit(mic[k], input.bpOverride || {}, org.bpGroup, k, input.ctx || {})) {
        // La CMI est reprise telle qu'elle a été saisie, parce qu'elle informe.
        // Bornée, pour qu'une saisie aberrante ne gonfle pas chaque alerte ni
        // le compte rendu.
        _zit.push({ abx: k, mic: String(mic[k]).slice(0, 24), cat: cat || null,
                    valeur: zitPour(input.bpOverride || {}, org.bpGroup, k, input.ctx || {}) });
      }
    });
  } else if (input.mode === "diam") {
    const dia = input.diam || {};
    _sansDisque = [];
    Object.keys(dia).forEach(k => {
      if (String(dia[k] === undefined ? "" : dia[k]).trim() === "") return;
      const seuilDep = depistageSeuil(org.bpGroup, k);
      const dz = getDZ(input.bpOverride || {}, org.bpGroup, k, input.ctx || {});
      let cat = catFromDiam(dia[k], dz);
      if (seuilDep) {
        const p = parseDiam(dia[k]);
        // Au-dessus du seuil, le dépistage conclut « sensible ». En dessous,
        // il ne conclut pas : c'est un dépistage, pas une catégorisation.
        cat = (p && p.op === "=" && p.v >= seuilDep) ? "S" : null;
        if (p && p.op === "=" && p.v < seuilDep) _depistageEchoue.push({ abx: k, mm: p.v, seuil: seuilDep });
      }
      if (cat) results[k] = cat;
      // Un diamètre saisi que le moteur ne peut pas traduire ne doit PAS
      // disparaître en silence : le biologiste croirait l'antibiotique non
      // testé, alors qu'il l'a mesuré. On le lui dit, avec la raison.
      else if (seuilDep) { /* expliqué par l'alerte de dépistage */ }
      else if (!(org.bpGroup === "pneumo" && k === "OXA"))   // dépistage, pas un résultat à rendre
        _sansDisque.push({ abx: k, valeur: String(dia[k]).slice(0, 12),
                           raison: raisonSansDisque(org.bpGroup, k, input.ctx || {}) });
      if (enZitZone(dia[k], input.bpOverride || {}, org.bpGroup, k, input.ctx || {})) {
        const z = zitZonePour(input.bpOverride || {}, org.bpGroup, k, input.ctx || {});
        _zit.push({ abx: k, mic: String(dia[k]).slice(0, 24), cat: cat || null,
                    unite: "mm", valeur: z[0] === z[1] ? String(z[0]) : (z[0] + "–" + z[1]) });
      }
    });
    // Avant l'appel au moteur : le dépistage fixe des catégories dont la
    // reconnaissance du phénotype a besoin.
    _depistage = depistagePneumo(org.bpGroup, dia, results);
  } else {
    results = input.results || {};
  }

  _activeOrg = org; _activeId = organism;      // fixés juste avant le calcul (synchrone)
  _mode = input.mode || "sir";
  _ctx = input.ctx || {};
  _renduCibleActif = input.renduCible === true;
  const A = ENGINE[org.engine](results, input.ctx || {}, org.args || {});
  // Lecture interprétative : les catégories rendues peuvent différer des
  // catégories brutes. Le client doit recevoir les deux, jamais l'une à la
  // place de l'autre — sans quoi on masquerait au biologiste ce qu'il a lu.
  const rendues = Object.assign({}, results);
  (A.rendu || []).forEach(x => { rendues[x.abx] = x.rendu; });
  return { interpretation: A, categories: results, rendues: rendues, referentiel: REFERENTIELS[_ref] };
}

/* ======================= Ce que le fichier expose =======================
   Node le voit en module, le navigateur en objet global. Les deux reçoivent
   exactement le même objet : il n'existe pas de « version client » du
   raisonnement. */
const MOTEUR = {
  runInterpretation,
  // traduction d'une mesure en catégorie
  catFromMic, catFromDiam, parseMic, parseDiam,
  getBP, getDZ, disquePour, zitPour, zitZonePour, enZit, enZitZone,
  horsEucast, depistageSeuil, estCasfm, seuilEcoff, ECOFF, cadrer,
  fixerLangue, langueCourante,
  // exporté POUR ÊTRE VÉRIFIÉ : le banc s'en sert pour exiger que chaque
  // phrase de résistance naturelle présente dans ORG sache se traduire.
  naturelleEn, confianceLibelle,
  // § 9 : conditions de réalisation exigées par espèce, et leur contrôle
  CONDITIONS, conditionsTechniques,
  // rendu ciblé (HAS 2023)
  RENDU_CIBLE: RC.RENDU_CIBLE, RENDU_CIBLE_SOURCE: RC.RENDU_CIBLE_SOURCE,
  RENDU_CIBLE_NOTES: RC.RENDU_CIBLE_NOTES, RENDU_CIBLE_LISTES: RC.RENDU_CIBLE_LISTES,
  RENDU_CIBLE_COMMENTAIRES: RC.RENDU_CIBLE_COMMENTAIRES, commentairesCible,
  RENDU_CIBLE_RESTRICTIONS: RC.RENDU_CIBLE_RESTRICTIONS,
  renduCible, rcColonne, rcPremiereIntention, rcCodes, rcCephalosporines,
  RC_GROUPE3_ORG, RC_NOM_CODES,
  // posologies qui fondent les seuils
  POSOLOGIE: POSO.POSOLOGIE, POSOLOGIE_VERSION: POSO.POSOLOGIE_VERSION, posologiePour,
  // § 15 : le commentaire en cinq moments
  COMMENT_MOMENTS, commentaireStructure, commentaireCopiable,
  // tables, pour l'affichage des seuils et des aides de saisie
  REFERENTIELS, ORG, ABXNAME, ABXNAME_EN, nomAbx,
  BP, BP_MENINGE, BP_URIN, BP_CASFM, BP_CASFM_URIN, BP_MENINGE_CASFM,
  DZ, DZ_MENINGE, DZ_URIN, DZ_CASFM, DZ_CASFM_URIN, DZ_CASFM_ESPECE, DZ_TEMOIN,
  DISQUE, DISQUE_CASFM, OXA_PNEUMO, DEPISTAGE, DEPISTAGE_CASFM,
  ZIT, ZIT_CASFM, ZIT_ZONE, ZIT_ZONE_CASFM,
  HORS_EUCAST, CASFM_COUVRE, CASFM_COUVRE_ESPECE,
  // provenance : d'où vient la règle, et dans quelle version de la base
  SOURCES: BASE.SOURCES, BASE_VERSION: BASE.BASE_VERSION, regleDe
};

if (typeof module !== "undefined" && module.exports) module.exports = MOTEUR;
else racine.PhenoBacMoteur = MOTEUR;
})(typeof self !== "undefined" ? self : this);
