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
  MIN: "Minocycline"
};

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
      DZ_TEMOIN = {}, DZ_CASFM_ESPECE = {},
      // Le même objet sous un nom exact : la colonne « espece » de la base se
      // remplit quel que soit le référentiel, et l'EUCAST en a désormais
      // besoin (nitrofurantoïne chez E. coli, triméthoprime chez E. coli et
      // Klebsiella). Un second TABLEAU aurait fini par diverger du premier ;
      // un second NOM ne le peut pas.
      ESPECE_LIMITE = DZ_CASFM_ESPECE,
      DISQUE = {}, DISQUE_CASFM = {},
      ZIT = {}, ZIT_CASFM = {}, ZIT_ZONE = {}, ZIT_ZONE_CASFM = {},
      HORS_EUCAST = {}, CASFM_COUVRE = {}, CASFM_COUVRE_ESPECE = {},
      DEPISTAGE_CASFM = {};

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
    if (r.dep !== undefined)    met(DEPISTAGE_CASFM, r.groupe, r.abx, r.dep);
    if (r.espece !== undefined) DZ_CASFM_ESPECE[r.groupe + ":" + r.abx] = r.espece;
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
  cperfringens:{ engine: "anaerobe", args: { species: "Clostridium perfringens", type: "cperfringens" }, bpGroup: "cperfringens", intrinsic: {} },
  cdifficile: { engine: "anaerobe", args: { species: "Clostridioides difficile", type: "cdifficile" }, bpGroup: "cdifficile", intrinsic: {} },
  campylobacter:{ engine: "curved", args: { species: "Campylobacter jejuni", type: "campylobacter" }, bpGroup: "campylo", intrinsic: {} },
  vibrio:     { engine: "curved", args: { species: "Vibrio cholerae", type: "vibrio" }, bpGroup: "vibrio", intrinsic: {} },
  efaecalis:  { engine: "enterococcus", args: { species: "E. faecalis", ampExpectedS: true }, bpGroup: "enteroc", intrinsic: {CAZ: "Résistance naturelle attendue — ceftazidime. EUCAST, phénotypes résistants attendus v1.2, règle 4.7.", CTX: "Résistance naturelle attendue — céphalosporines (hors ceftazidime). EUCAST, phénotypes résistants attendus v1.2, règle 4.7.", FOX: "Résistance naturelle attendue — céphalosporines (hors ceftazidime). EUCAST, phénotypes résistants attendus v1.2, règle 4.7.", FEP: "Résistance naturelle attendue — céphalosporines (hors ceftazidime). EUCAST, phénotypes résistants attendus v1.2, règle 4.7.", GEN: "Résistance naturelle attendue — aminosides (bas niveau). EUCAST, phénotypes résistants attendus v1.2, règle 4.7.", E: "Résistance naturelle attendue — macrolides. EUCAST, phénotypes résistants attendus v1.2, règle 4.7.", AZM: "Résistance naturelle attendue — macrolides. EUCAST, phénotypes résistants attendus v1.2, règle 4.7.", DA: "Résistance naturelle attendue — lincosamides. EUCAST, phénotypes résistants attendus v1.2, règle 4.7."} },
  efaecium:   { engine: "enterococcus", args: { species: "E. faecium", ampExpectedS: false }, bpGroup: "enteroc", intrinsic: {CAZ: "Résistance naturelle attendue — ceftazidime. EUCAST, phénotypes résistants attendus v1.2, règle 4.9.", CTX: "Résistance naturelle attendue — céphalosporines (hors ceftazidime). EUCAST, phénotypes résistants attendus v1.2, règle 4.9.", FOX: "Résistance naturelle attendue — céphalosporines (hors ceftazidime). EUCAST, phénotypes résistants attendus v1.2, règle 4.9.", FEP: "Résistance naturelle attendue — céphalosporines (hors ceftazidime). EUCAST, phénotypes résistants attendus v1.2, règle 4.9.", GEN: "Résistance naturelle attendue — aminosides (bas niveau). EUCAST, phénotypes résistants attendus v1.2, règle 4.9.", E: "Résistance naturelle attendue — macrolides. EUCAST, phénotypes résistants attendus v1.2, règle 4.9.", AZM: "Résistance naturelle attendue — macrolides. EUCAST, phénotypes résistants attendus v1.2, règle 4.9."} },
  paeru:      { engine: "pseudo", bpGroup: "pseudo", intrinsic: {AMX: "Résistance naturelle attendue — aminopénicillines. EUCAST, phénotypes résistants attendus v1.2, règle 2.7.", AMC: "Résistance naturelle attendue — aminopénicilline + inhibiteur. EUCAST, phénotypes résistants attendus v1.2, règle 2.7.", CTX: "Résistance naturelle attendue — céfotaxime / ceftriaxone. EUCAST, phénotypes résistants attendus v1.2, règle 2.7.", ETP: "Résistance naturelle attendue — ertapénème. EUCAST, phénotypes résistants attendus v1.2, règle 2.7.", CAF: "Résistance naturelle attendue — chloramphénicol. EUCAST, phénotypes résistants attendus v1.2, règle 2.7.", DOX: "Résistance naturelle attendue — tétracyclines. EUCAST, phénotypes résistants attendus v1.2, règle 2.7."} },
  acineto:    { engine: "acineto", bpGroup: "acineto", intrinsic: {AMX: "Résistance naturelle attendue — aminopénicillines. EUCAST, phénotypes résistants attendus v1.2, règle 2.1.", AMC: "Résistance naturelle attendue — aminopénicilline + inhibiteur. EUCAST, phénotypes résistants attendus v1.2, règle 2.1.", CTX: "Résistance naturelle attendue — céfotaxime / ceftriaxone. EUCAST, phénotypes résistants attendus v1.2, règle 2.1.", ETP: "Résistance naturelle attendue — ertapénème. EUCAST, phénotypes résistants attendus v1.2, règle 2.1.", FOS: "Résistance naturelle attendue — fosfomycine. EUCAST, phénotypes résistants attendus v1.2, règle 2.1.", DOX: "Résistance naturelle attendue — tétracyclines. EUCAST, phénotypes résistants attendus v1.2, règle 2.1."} },
  proteus:    { engine: "proteus", bpGroup: "morganella", intrinsic: {DOX: "Résistance naturelle attendue — tétracyclines. EUCAST, phénotypes résistants attendus v1.2, règle 1.12.", COL: "Résistance naturelle attendue — polymyxines. EUCAST, phénotypes résistants attendus v1.2, règle 1.12."} },
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
                intrinsic: {AMX: "Résistance naturelle (céphalosporinase chromosomique K1) aux aminopénicillines.", DOX: "Résistance naturelle attendue — tétracyclines. EUCAST, phénotypes résistants attendus v1.2, règle 1.14.", COL: "Résistance naturelle attendue — polymyxines. EUCAST, phénotypes résistants attendus v1.2, règle 1.14."} },
  shigella:   { engine: "entero", args: { amino: "AMX", species: "Shigella spp." }, bpGroup: "entero", intrinsic: {} }
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
      A.rules.push({ k: "⊘", txt: "CA-SFM : règle de masquage — ne pas rendre le méropénème tant qu'une β-lactamine de spectre plus étroit reste active (" + etroites.map(k => ABXNAME[k] || k).join(", ") + ")." });
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
    const nom = ABXNAME[code] || code;
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
      A.contre.push({ abx: code, cat: r[code], txt: (ABXNAME[code] || code) + " " + r[code] + " : " + texte });
  });

  if (g.confirme) {
    A.confirmation = g.confirme;
    A.confiance = "confirmé";
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

function coherence(A, r, org, c) {
  const ajoute = (lvl, txt) => A.alerts.push({ lvl: lvl, txt: txt });

  /* --- 1. L'association moins active que la molécule seule --- */
  const inductible = org && AMPC_INDUCTIBLE.indexOf(org.engine) !== -1;
  COUPLES_INHIBITEUR.forEach(function (x) {
    const seule = x[0], assoc = x[1];
    if (r[seule] !== "S" || !isRI(r[assoc])) return;
    if (inductible) {
      ajoute("info", `${ABXNAME[seule]} sensible et ${ABXNAME[assoc]} non : chez cette espèce, `
        + `l'acide clavulanique INDUIT la céphalosporinase. Le résultat est attendu et n'est pas une erreur.`);
    } else {
      ajoute("warn", `${ABXNAME[seule]} sensible et ${ABXNAME[assoc]} non : ${x[2]}, `
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
      A.nonSecurise = `${contredites.length} résistances naturelles de cette espèce sont contredites (`
        + contredites.map(k => ABXNAME[k] || k).join(", ") + `). Une seule serait une erreur de saisie ; `
        + `plusieurs ensemble évoquent une identification erronée. Reprendre l'identification avant `
        + `d'interpréter cet antibiogramme : le phénotype ci-dessous ne vaut que si l'espèce est la bonne.`;
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
  const vus = (A.pour || []).map(x => (ABXNAME[x.abx] || x.abx) + " " + x.cat);
  if (vus.length) m.push({ moment: "Observation", texte: "Profil observé : " + vus.join(", ") + "." });

  /* 2. INTERPRÉTATION — le texte rédigé pour ce phénotype. */
  if (A.comment) m.push({ moment: "Interprétation", texte: A.comment });

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
    m.push({ moment: "Hypothèse mécanistique",
      texte: A.confirmation
        ? majuscule(mech) + (/[.!?]$/.test(mech) ? "" : ".")
          + " Mécanisme confirmé par " + minuscule(A.confirmation) + "."
        : "Profil compatible avec " + minuscule(mech)
          + (/[.!?]$/.test(mech) ? "" : ".") });
  }

  /* 4. LIMITES — ce qui empêche d'affirmer. Le niveau de confiance, les
     éléments discordants, et les molécules clés non testées. */
  const limites = [];
  if (A.confiance === "possible") limites.push("hypothèse seulement possible en l'état");
  if ((A.contre || []).length)
    limites.push("élément(s) discordant(s) : " + A.contre.map(x => x.txt).join(" ; "));
  if ((A.nonTeste || []).length)
    limites.push("molécule(s) clé(s) non testée(s) : "
      + A.nonTeste.map(x => ABXNAME[x.abx] || x.abx).join(", "));
  if (!A.confirmation && A.aConfirmerPar)
    limites.push("aucun test n'a confirmé le mécanisme");
  if (limites.length) m.push({ moment: "Limites", texte: majuscule(limites.join(" ; ")) + "." });

  /* 5. TEST COMPLÉMENTAIRE — seulement s'il reste quelque chose à trancher. */
  // Le texte du test porte souvent sa propre condition (« …, si le profil
  // surprend », « …, qui change la conduite »). L'enchâsser dans une phrase
  // plus longue en casserait la syntaxe : on le laisse entier, et la réserve
  // du § 15 vient APRÈS, dans une phrase à elle.
  if (!A.confirmation && A.aConfirmerPar) {
    const tst = A.aConfirmerPar.trim().replace(/\.$/, "");
    m.push({ moment: "Test complémentaire",
      texte: "Pour trancher : " + tst
           + ". À apprécier selon le contexte et le référentiel du laboratoire." });
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
      return { voie: e.voie, schema: m, motif: "contexte méningé" };
    }
    if (c.urin === "Oui" && e.urinaire)
      return { voie: e.voie, schema: e.urinaire, motif: "cystite simple" };

    // Catégorie I : c'est la posologie FORTE qui fonde le seuil. Quand
    // l'EUCAST n'en définit pas, on le dit — on n'en invente pas (§ 26).
    if (cat === "I") {
      return e.forte
        ? { voie: e.voie, schema: e.forte, motif: "sensible à forte posologie" }
        : { voie: e.voie, schema: null, motif: "forte",
            note: "l'EUCAST ne définit pas de posologie forte pour cette molécule" };
    }
    return { voie: e.voie, schema: e.standard, motif: "posologie standard" };
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
  "Morganella morganii": null,
  "Providencia spp": null,
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
    oter(c3g, "A", esp3 + " appartient au groupe 3 : la HAS fait préférer le céfépime "
                 + "aux céphalosporines de 3e génération.");
    mettre(["FEP"], "A", "il remplace les céphalosporines de 3e génération.");
  }

  /* --- Note (A) de la cystite — autre texte, autre règle --- */
  if (esp3 && cle === "cystite" && colonne !== "premiereIntentionS") {
    oter(["CFM"], "A", esp3 + " appartient au groupe 3, et la souche résiste aux "
                     + "molécules de première intention.");
  }

  /* --- Note (B) — les carbapénèmes, molécules de dernier recours --- */
  const carba = rcCodes(listes.carbapenemes);
  const etroites = rcCodes(listes.betalactaminesEtroites);
  if (demande) {
    mettre(carba, "B", "demandés par le clinicien.");
  } else if (cle === "cystite") {
    oter(carba, "B", "en cystite, le document ne les rend que sur demande du clinicien.");
  } else {
    const restent = etroites.filter(actif);
    if (restent.length) {
      oter(carba, "B", "une β-lactamine de spectre plus étroit reste active ("
                     + restent.map(function (k) { return ABXNAME[k] || k; }).join(", ") + ").");
    }
  }

  /* --- Note (C) — nouvelles associations et nouvelles céphalosporines --- */
  const nouvelles = rcCodes(listes.nouvelles);
  if (nouvelles.length) {
    if (demande) mettre(nouvelles, "C", "demandées par le clinicien.");
    else oter(nouvelles, "C", "rendues sur demande du clinicien, après avis spécialisé.");
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
      oter(fq, null, "§ 2.1.3 : souche résistante à l'amoxicilline mais sensible à "
                   + "l'association — le document écarte alors les fluoroquinolones.");
    }
    if (fq.some(function (k) { return prevues.indexOf(k) !== -1 && actif(k); }))
      horsPortee.push("§ 2.1.3 écarte aussi les fluoroquinolones « lorsque d'autres "
        + "antibiotiques per os sont actifs ». PhénoBac ne connaît pas la voie "
        + "d'administration de toutes les molécules urinaires — la table de posologies "
        + "de l'EUCAST ne couvre ni le pivmécillinam, ni la nitrofurantoïne, ni le "
        + "triméthoprime, ni le céfixime — et n'applique pas cette moitié de la règle. "
        + "Une fluoroquinolone figure donc ici là où le document pourrait la retirer.");
  }

  return { prevues: prevues, journal: journal, horsPortee: horsPortee };
}

function renduCible(A, r, ctx, org, actif) {
  const c = ctx || {};
  if (!actif) return null;                         // garde-fou 1

  // Garde-fou 2 : le périmètre. Chaque refus est NOMMÉ — « non applicable »
  // sans motif laisserait croire à une panne.
  if (!org || RC_GROUPES.indexOf(org.bpGroup) === -1)
    return { applique: false, motif: "la recommandation ne vaut que pour les entérobactéries" };
  if (c.urin !== "Oui")
    return { applique: false, motif: "la recommandation ne vaut que pour les ECBU ; "
           + "renseignez le prélèvement urinaire" };
  if (c.patiente !== "Oui")
    return { applique: false, motif: "la recommandation n'est validée que chez la femme adulte "
           + "à partir de 12 ans ; hors de ce cadre le rendu reste complet" };

  const cle = c.typeIU === "Cystite" ? "cystite"
            : c.typeIU === "Pyélonéphrite" ? "pyelonephrite"
            : "sansRenseignement";
  const tb = RC.RENDU_CIBLE[cle];
  if (!tb) return { applique: false, motif: "tableau décisionnel absent" };
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
      if (al.txt && ABXNAME[k] && al.txt.indexOf(ABXNAME[k]) !== -1) alertees[k] = true;
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
             + lever.map(function (k) { return ABXNAME[k] || k; }).join(", ")
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
    plancher: plancher, notes: (RC.RENDU_CIBLE_NOTES || {})[cle] || null,
    source: RC.RENDU_CIBLE_SOURCE
  };
}

function finalize(A, r) {
  const org = _activeOrg;
  if (org && org.intrinsic) {
    for (const k in org.intrinsic) {
      if (r[k] === "S") {
        A.alerts.push({ lvl: "warn",
          txt: `Incohérence : ${ABXNAME[k] || k} rendue S alors qu'une résistance naturelle est attendue. ${org.intrinsic[k]} Vérifier la saisie.` });
      }
    }
  }
  if (_depistage) {
    _depistage.rules.forEach(x => A.rules.push(x));
    _depistage.alerts.forEach(x => A.alerts.push(x));
    if (_depistage.sev && A.sev === "wild") A.sev = _depistage.sev;
  }
  coherence(A, r, org, null);
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
    _depistageEchoue.forEach(d => {
      A.alerts.push({ lvl: "warn", txt:
        `${ABXNAME[d.abx] || d.abx} : ${d.mm} mm, en dessous du seuil de dépistage (${d.seuil} mm). ` +
        `Le CA-SFM n'autorise pas à conclure « résistant » au disque pour ce couple — la résistance aux ` +
        `β-lactamines est exceptionnelle dans ce groupe, et un petit diamètre est d'abord un problème ` +
        `technique. Déterminer la CMI avant de priver le malade de son traitement de référence.` });
    });
    A.rules.push({ k: "≈", txt:
      "CA-SFM : le disque de pénicilline G ne sert ici qu'à reconnaître les souches sensibles. " +
      "En dessous du seuil, il faut une CMI — le disque ne tranche pas." });
  }

  /* Diamètres mesurés que le moteur n'a pas traduits. Les taire reviendrait
     à présenter comme « non testé » un antibiotique que le laboratoire a bel
     et bien posé sur la boîte. */
  if (_sansDisque.length) {
    A.sansDisque = _sansDisque.slice();
    _sansDisque.forEach(d => {
      A.alerts.push({ lvl: "info",
        txt: `${ABXNAME[d.abx] || d.abx} : ${d.valeur} mm non catégorisé — ${d.raison}.` });
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
      const nom = ABXNAME[z.abx] || z.abx;
      // L'unité suit la méthode : mg/L pour une CMI, mm pour un diamètre.
      // Sans cela, un diamètre serait annoncé en milligrammes par litre.
      const u = z.unite || "mg/L";
      A.alerts.push({ lvl: "warn",
        txt: `${nom} à ${z.mic} ${u} : valeur en zone d'incertitude technique (ZIT ${z.valeur} ${u}). ` +
             `La catégorie « ${z.cat || "—"} » n'est pas reproductible à cette valeur — la traiter comme incertaine.` });
    });
    A.rules.push({ k: "≈", txt: "Conduite à tenir : répéter le test si une erreur technique est plausible ; recourir à une autre méthode (CMI par microdilution, test génotypique) ; signaler l'incertitude sur le compte rendu." });
    A.rules.push(estCasfm()
      ? { k: "≈", txt: "CA-SFM : ne pas dégrader la catégorie dans celle immédiatement inférieure — la pratique tendrait à devenir systématique et fausserait la surveillance épidémiologique. Signaler l'incertitude plutôt que l'occulter." }
      : { k: "≈", txt: "EUCAST : dégrader la catégorie (S→I, I→R, S→R) est permis s'il reste d'autres options thérapeutiques, à condition de le commenter et de conserver la souche. PhénoBac ne le fait pas de lui-même." });
  }

  if (A.alerts.length === 0) {
    A.alerts.push({ lvl: "info", txt: "Aucune incohérence détectée avec les résistances naturelles attendues." });
  }
  return A;
}

function enteroInterpret(r, c, { amino, species, klebsiella, imipenemIntrinsic }) {
  const A = { sev: "wild", name: "Souche sauvage",
    mech: "Aucun mécanisme de résistance acquis aux β-lactamines détecté.", alerts: [], rules: [], comment: "" };
  const carbaKeys = imipenemIntrinsic ? ["ETP", "MEM"] : ["ETP", "IPM", "MEM"];
  let carba = carbaKeys.some(k => isRI(r[k]));
  if (imipenemIntrinsic && isR(r.IPM)) carba = true;
  const c3g = isRI(r.CTX) || isRI(r.CAZ);
  const aminoR = isR(r[amino]);

  if (carba) {
    A.sev = "crit"; A.name = "Suspicion de carbapénémase";
    A.mech = "Sensibilité diminuée à au moins un carbapénème. À confirmer (carba NP, immuno-chromatographie, biologie moléculaire) avant conclusion.";
    parce(A, r, {
      pour: carbaKeys.map(function (k) {
        return [k, "RI", "sensibilité diminuée à un carbapénème — c'est ce qui fait suspecter l'enzyme"];
      }),
      aConfirmerPar: "carba NP, immuno-chromatographie ou biologie moléculaire"
    });
    A.alerts.push({ lvl: "crit", txt: "Isolat hautement résistant : précautions complémentaires contact et signalement (EOH / hygiène)." });
    A.alerts.push({ lvl: "warn", txt: "Confirmer le mécanisme : discordance imipénème/méropénème/ertapénème possible (imperméabilité vs carbapénémase vraie)." });
    A.rules.push({ k: "→R", txt: "Interpréter l'ensemble des β-lactamines avec prudence tant que le mécanisme n'est pas confirmé." });
    A.comment = `${species} de sensibilité diminuée aux carbapénèmes. Suspicion de carbapénémase à confirmer. Souche à signaler, précautions complémentaires contact.`;

    // CA-SFM 2026, p. 8 : une fois la carbapénémase confirmée, les carbapénèmes
    // sont rendus résistants quelles que soient les CMI et quel que soit le
    // type d'enzyme — leur activité in vivo est incertaine et les alternatives
    // doivent être privilégiées. L'EUCAST, lui, se borne à un commentaire.
    if (estCasfm()) {
      const cb = carbaConfirmee(c);
      if (cb.confirmee) {
        A.name = "Carbapénémase confirmée";
        A.mech = "Carbapénémase confirmée. Le CA-SFM 2026 rend les carbapénèmes résistants quelles que soient les concentrations minimales inhibitrices.";
        // Le mécanisme n'est plus à confirmer : les consignes d'attente
        // n'ont plus lieu d'être et brouilleraient le compte-rendu.
        A.rules = A.rules.filter(x => x.txt.indexOf("tant que le mécanisme") === -1);
        A.alerts = A.alerts.filter(x => x.txt.indexOf("Confirmer le mécanisme") === -1);
        rendreR(A, r, ["ETP", "IPM", "MEM"],
          "Carbapénémase confirmée — CA-SFM 2026, chapitre 5.1 et annexe 5.");
        A.rules.push({ k: "→R", txt: "CA-SFM : ertapénème, imipénème et méropénème rendus résistants, quel que soit le type d'enzyme et quelles que soient les CMI." });
        if (cb.oxa48) {
          rendreR(A, r, ["CTX"], "OXA-48 — CA-SFM : céfotaxime et ceftriaxone rendus résistants.");
          A.rules.push({ k: "→R", txt: "OXA-48 : céfotaxime et ceftriaxone rendus résistants (règle CA-SFM depuis 2023)." });
        }
        A.comment = `${species} productrice de carbapénémase confirmée. Conformément au CA-SFM, les carbapénèmes sont rendus résistants quelles que soient les concentrations minimales inhibitrices ; privilégier les alternatives thérapeutiques. Souche à signaler, précautions complémentaires contact.`;
      } else {
        A.alerts.push({ lvl: "warn", txt: "CA-SFM : confirmez le mécanisme. Une carbapénémase confirmée fait rendre les carbapénèmes résistants quelles que soient les CMI." });
      }
    } else {
      A.rules.push({ k: "=", txt: "EUCAST v16.0 : les carbapénèmes qui apparaissent S ou I sont rendus tels quels, avec la consigne de les employer à forte posologie et en association." });
    }
    return finalize(A, r);
  }

  if (c3g) {
    if (c && c.syn === "Positif") {
      A.sev = "high"; A.name = "BLSE";
      A.mech = "β-lactamase à spectre étendu : synergie C3G + clavulanate positive. La céfoxitine reste habituellement sensible.";
      parce(A, r, {
        pour: [["CTX", "RI", "céphalosporine de 3e génération atteinte"],
               ["CAZ", "RI", "céphalosporine de 3e génération atteinte"],
               ["FOX", "S", "céfoxitine conservée — la BLSE ne l'atteint pas, contrairement à une céphalosporinase"]],
        contre: [["FOX", "RI", "une céfoxitine atteinte oriente vers une céphalosporinase, ou vers une BLSE accompagnée d'une imperméabilité"]],
        confirme: "synergie C3G + acide clavulanique positive"
      });
      A.alerts.push({ lvl: "warn", txt: "Précautions complémentaires contact ; signalement selon la politique locale." });
      A.rules.push({ k: "?", txt: "Céfépime : interpréter selon la CMI (effet inoculum possible)." });
      // Ici les deux référentiels divergent franchement (CA-SFM 2026, p. 8) :
      // l'EUCAST a cessé de réinterpréter les C3G/C4G et l'aztréonam en cas de
      // BLSE ; le CA-SFM est revenu en 2024 à la lecture interprétative.
      if (estCasfm()) {
        A.rules.push({ k: "→R", txt: "CA-SFM : lecture interprétative — pénicillines, C1G, C2G, C3G et aztréonam rendus R quel que soit le résultat in vitro." });
        rendreR(A, r, [amino, "CTX", "CAZ"], "BLSE — lecture interprétative du CA-SFM (retour décidé en 2024).");
        A.comment = `${species} productrice de β-lactamase à spectre étendu (BLSE). Conformément au CA-SFM, l'ensemble des pénicillines et des céphalosporines de 1re à 3e génération ainsi que l'aztréonam sont rendus résistants, indépendamment du résultat in vitro. Souche à signaler, précautions complémentaires contact.`;
      } else {
        A.rules.push({ k: "=", txt: "EUCAST : pas de réinterprétation — céphalosporines et aztréonam rendus tels que testés (tableau v16.1 ; Expert Rules v3.3)." });
        A.alerts.push({ lvl: "info", txt: "L'EUCAST ne réinterprète plus les C3G/C4G ni l'aztréonam en cas de BLSE ; le CA-SFM, si. Changez de référentiel pour comparer les deux rendus." });
        A.comment = `${species} productrice de β-lactamase à spectre étendu (BLSE). Conformément à l'EUCAST, les céphalosporines et l'aztréonam sont rendus tels qu'ils ont été testés. Souche à signaler, précautions complémentaires contact.`;
      }
    } else if (isRI(r.FOX)) {
      A.sev = "high"; A.name = "Céphalosporinase hyperproduite (AmpC)";
      A.mech = "Résistance C3G + céfoxitine sans synergie au clavulanate : profil de céphalosporinase déréprimée / plasmidique.";
      parce(A, r, {
        pour: [["FOX", "RI", "céfoxitine atteinte — la céphalosporinase l'hydrolyse, la BLSE non"],
               ["CTX", "RI", "céphalosporine de 3e génération atteinte"],
               ["CAZ", "RI", "céphalosporine de 3e génération atteinte"]],
        contre: [["FEP", "R", "la céfépime est habituellement conservée face à une céphalosporinase ; atteinte, elle évoque une BLSE surajoutée"]],
        aConfirmerPar: "recherche de BLSE associée (synergie sur gélose au cloxacilline) si la céfépime est atteinte"
      });
      A.rules.push({ k: "?", txt: "Céfépime souvent conservé — vérifier la CMI." });
      if (estCasfm()) {
        A.rules.push({ k: "→R", txt: "CA-SFM : lecture interprétative — C1G à C3G et céfoxitine rendues R ; associations avec inhibiteur peu fiables." });
        rendreR(A, r, [amino, "CTX", "CAZ", "FOX"], "Céphalosporinase hyperproduite — lecture interprétative du CA-SFM.");
      } else {
        A.rules.push({ k: "=", txt: "EUCAST : pas de réinterprétation — céphalosporines rendues telles que testées ; associations avec inhibiteur peu fiables." });
      }
      A.comment = `${species} exprimant une céphalosporinase hyperproduite (AmpC). Céphalosporines de 1re à 3e génération et céfoxitine concernées ; céfépime à interpréter selon la CMI.`;
    } else {
      A.sev = "high"; A.name = "Résistance aux C3G — mécanisme à préciser";
      A.mech = "Résistance aux C3G sans donnée de synergie. Réaliser le test de synergie clavulanate pour trancher BLSE vs AmpC.";
      A.alerts.push({ lvl: "info", txt: "Compléter par le test de synergie C3G + ac. clavulanique." });
      A.comment = `${species} résistante aux C3G, mécanisme à préciser (test de synergie recommandé).`;
    }
    return finalize(A, r);
  }

  if (aminoR && !klebsiella) {
    if (isRI(r.AMC)) {
      A.sev = "mod"; A.name = "Pénicillinase (haut niveau) ou résistance à l'inhibiteur";
      A.mech = "Aminopénicilline R et association clavulanique diminuée, C3G conservées.";
      A.comment = `${species} : pénicillinase de haut niveau (ou faible affinité pour l'inhibiteur). Aminopénicillines résistantes, C3G actives.`;
    } else {
      A.sev = "mod"; A.name = "Pénicillinase de bas niveau";
      A.mech = "Résistance isolée aux aminopénicillines, restaurée par le clavulanate. Profil fréquent.";
      A.comment = `${species} : pénicillinase de bas niveau. Aminopénicillines résistantes, association clavulanique et C3G actives.`;
    }
    return finalize(A, r);
  }

  if (klebsiella) {
    A.name = "Souche sauvage"; A.sev = "wild";
    A.mech = "Pas de mécanisme acquis détecté (la résistance aux aminopénicillines est naturelle chez Klebsiella).";
    A.comment = `${species} de phénotype sauvage. La résistance aux aminopénicillines est naturelle (pénicillinase chromosomique).`;
    return finalize(A, r);
  }

  A.comment = `${species} de phénotype sauvage, sans mécanisme de résistance acquis détecté sur le panel testé.`;
  return finalize(A, r);
}

function enterobacterInterpret(r, c, a) {
  const sp = (a && a.species) || "Enterobacter cloacae";
  const A = { sev: "wild", name: "AmpC à bas niveau (phénotype de base)",
    mech: `${sp} exprime naturellement une céphalosporinase AmpC inductible.`, alerts: [], rules: [], comment: "" };
  const carba = ["ETP", "IPM", "MEM"].some(k => isRI(r[k]));
  const c3g = isRI(r.CTX) || isRI(r.CAZ);

  if (carba) {
    A.sev = "crit"; A.name = "Suspicion de carbapénémase";
    A.mech = "Sensibilité diminuée aux carbapénèmes chez une souche AmpC : imperméabilité + AmpC vs carbapénémase vraie. À confirmer.";
    A.alerts.push({ lvl: "crit", txt: "Précautions complémentaires contact et signalement." });
    A.rules.push({ k: "→R", txt: "β-lactamines à interpréter avec prudence jusqu'à confirmation." });
    A.comment = `${sp} de sensibilité diminuée aux carbapénèmes. Suspicion de carbapénémase à confirmer. Souche à signaler.`;
    // Même règle que pour les autres entérobactéries (CA-SFM 2026, p. 8).
    if (estCasfm()) {
      const cb = carbaConfirmee(c);
      if (cb.confirmee) {
        A.name = "Carbapénémase confirmée (sur fond d'AmpC)";
        A.mech = "Carbapénémase confirmée chez une souche à AmpC naturelle. Le CA-SFM 2026 rend les carbapénèmes résistants quelles que soient les CMI.";
        A.rules = A.rules.filter(x => x.txt.indexOf("jusqu'à confirmation") === -1);
        rendreR(A, r, ["ETP", "IPM", "MEM"],
          "Carbapénémase confirmée — CA-SFM 2026, chapitre 5.1 et annexe 5.");
        A.rules.push({ k: "→R", txt: "CA-SFM : carbapénèmes rendus résistants quelles que soient les CMI." });
        if (cb.oxa48) {
          rendreR(A, r, ["CTX"], "OXA-48 — CA-SFM : céfotaxime et ceftriaxone rendus résistants.");
          A.rules.push({ k: "→R", txt: "OXA-48 : céfotaxime et ceftriaxone rendus résistants." });
        }
        A.comment = `${sp} producteur d'une carbapénémase confirmée. Conformément au CA-SFM, les carbapénèmes sont rendus résistants quelles que soient les concentrations minimales inhibitrices. Souche à signaler.`;
      } else {
        A.alerts.push({ lvl: "warn", txt: "CA-SFM : confirmez le mécanisme. Une carbapénémase confirmée fait rendre les carbapénèmes résistants quelles que soient les CMI." });
      }
    }
  } else if (c3g) {
    if (c && c.syn === "Positif") {
      A.sev = "crit"; A.name = "AmpC + BLSE surajoutée";
      A.mech = "Résistance C3G avec synergie clavulanate positive : BLSE en plus de la céphalosporinase naturelle.";
      A.rules.push({ k: "?", txt: "Céfépime souvent touché en cas de BLSE + AmpC — vérifier la CMI." });
      if (estCasfm()) {
        A.rules.push({ k: "→R", txt: "CA-SFM : lecture interprétative — pénicillines, C1G à C3G et aztréonam rendus R." });
        rendreR(A, r, ["AMX", "AMP", "CTX", "CAZ"], "BLSE surajoutée — lecture interprétative du CA-SFM.");
        A.comment = `${sp} producteur d'une BLSE surajoutée à sa céphalosporinase naturelle. Conformément au CA-SFM, pénicillines, C1G à C3G et aztréonam sont rendus résistants. Souche à signaler.`;
      } else {
        A.rules.push({ k: "=", txt: "EUCAST : pas de réinterprétation — céphalosporines et aztréonam rendus tels que testés." });
        A.comment = `${sp} producteur d'une BLSE surajoutée à sa céphalosporinase naturelle. Conformément à l'EUCAST, les céphalosporines et l'aztréonam sont rendus tels qu'ils ont été testés. Souche à signaler.`;
      }
    } else {
      A.sev = "high"; A.name = "Céphalosporinase déréprimée (AmpC hyperproduite)";
      A.mech = "Résistance C3G sans synergie clavulanate : dérepression de l'AmpC chromosomique.";
      A.rules.push({ k: "?", txt: "Céfépime habituellement conservé (stable vis-à-vis de l'AmpC) — vérifier la CMI." });
      if (estCasfm()) {
        A.rules.push({ k: "→R", txt: "CA-SFM : lecture interprétative — C1G à C3G rendues R ; associations avec inhibiteur inefficaces." });
        rendreR(A, r, ["AMX", "AMP", "AMC", "CTX", "CAZ"], "Céphalosporinase déréprimée — lecture interprétative du CA-SFM.");
      } else {
        A.rules.push({ k: "=", txt: "EUCAST : pas de réinterprétation — céphalosporines rendues telles que testées ; associations avec inhibiteur inefficaces." });
      }
      A.comment = `${sp} exprimant une céphalosporinase déréprimée (AmpC hyperproduite). C3G résistantes, céfépime à interpréter selon la CMI. Attention au risque de sélection de mutants sous C3G.`;
    }
  } else {
    A.mech = "Phénotype AmpC inductible de base : C3G actives in vitro mais risque de dérepression sous traitement.";
    A.alerts.push({ lvl: "info", txt: "Sous C3G, risque de sélection de mutants déréprimés : surveillance recommandée." });
    A.comment = `${sp} de phénotype AmpC inductible sans dérepression détectée. Prudence avec les C3G (risque d'échappement par dérepression).`;
  }
  return finalize(A, r);
}

function staphInterpret(r, c, a) {
  const sp = (a && a.species) || "Staphylococcus aureus";
  const coNS = !!(a && a.coNS);
  const metiS = coNS ? "méticillino-sensible" : "sensible à la méticilline (SASM)";
  const metiR = coNS ? "SCN méticillino-résistant" : "SARM";
  const A = { sev: "wild", name: coNS ? `${sp} — méticillino-sensible` : "Staphylococcus aureus sensible (SASM)",
    mech: "Céfoxitine sensible : pas de résistance à la méticilline (mecA/mecC).", alerts: [], rules: [], comment: "" };

  const mrsa = isRI(r.FOX) || isRI(r.OXA);
  if (mrsa) {
    A.sev = "crit"; A.name = metiR;
    A.mech = "Résistance à la méticilline (mecA/mecC) : toutes les β-lactamines usuelles sont inactives.";
    parce(A, r, {
      pour: [["FOX", "RI", "céfoxitine atteinte — c'est elle qui dépiste la résistance à la méticilline, mieux que l'oxacilline"],
             ["OXA", "RI", "oxacilline atteinte"]],
      contre: [["PEN", "S", "une pénicilline G conservée est inattendue chez une souche résistante à la méticilline : vérifier l'identification et la pureté"]],
      aConfirmerPar: "détection de la PLP2a, ou recherche de mecA/mecC, si le profil surprend"
    });
    A.alerts.push({ lvl: "crit", txt: coNS
      ? "Résistance à la méticilline : β-lactamines inactives. Impact majeur sur les infections de matériel étranger / prothèse."
      : "Précautions complémentaires contact et signalement (portage, épidémiologie)." });
    A.rules.push({ k: "→R", txt: "Toutes les β-lactamines rendues R (hors céphalosporines anti-SARM)." });
    A.comment = `${sp} résistant à la méticilline (${metiR}). Par harmonisation, l'ensemble des β-lactamines (hors céphalosporines anti-SARM) sont rendues résistantes.` + (coNS ? "" : " Souche à signaler, précautions complémentaires contact.");
  } else if (isR(r.PEN)) {
    A.sev = "mod"; A.name = coNS ? `${sp} — pénicillinase` : "SASM producteur de pénicillinase";
    A.mech = "Pénicilline G résistante par pénicillinase (blaZ) ; méticilline / oxacilline actives.";
    parce(A, r, {
      pour: [["PEN", "R", "pénicilline G atteinte — l'enzyme l'hydrolyse"],
             ["FOX", "S", "céfoxitine conservée : la méticilline reste active, ce qui sépare la pénicillinase de la méticillino-résistance"]],
      aConfirmerPar: "test à la nitrocéfine, si le rendu de la pénicilline G doit être affirmé"
    });
    A.rules.push({ k: "→R", txt: "Pénicilline G et aminopénicillines sans inhibiteur rendues R." });
    A.comment = `${sp} ${metiS}, producteur de pénicillinase. Pénicilline G résistante ; pénicillines M et associations avec inhibiteur actives.`;
  } else {
    A.comment = `${sp} ${metiS} sans mécanisme de résistance acquis détecté sur le panel testé.`;
  }

  if (isR(r.E) && r.DA === "S") {
    if (c && c.dtest === "Positif") {
      A.alerts.push({ lvl: "warn", txt: "MLSb inductible (D-test positif) : la clindamycine est rendue R malgré une sensibilité apparente in vitro." });
      A.rules.push({ k: "→R", txt: "Clindamycine rendue R (résistance inductible démontrée)." });
      A.comment += " Résistance inductible à la clindamycine (MLSb, D-test positif) : clindamycine rendue résistante.";
    } else if (!c || c.dtest === "Non fait") {
      A.alerts.push({ lvl: "info", txt: "Érythromycine R et clindamycine S : réaliser un D-test avant de rendre la clindamycine." });
    }
  }

  if (isRI(r.VA)) {
    A.sev = "crit";
    A.alerts.unshift({ lvl: "crit", txt: "Sensibilité diminuée à la vancomycine (VISA/VRSA) : événement rare et grave — vérifier la CMI et confirmer d'urgence." });
    if (A.comment) A.comment += " Sensibilité diminuée aux glycopeptides à confirmer d'urgence.";
  } else if (coNS && isRI(r.TEC)) {
    if (A.sev === "wild" || A.sev === "mod") A.sev = "high";
    A.alerts.push({ lvl: "warn", txt: "Sensibilité diminuée à la téicoplanine : fréquente chez certains SCN (notamment S. haemolyticus). Vérifier la CMI ; la vancomycine reste souvent active." });
    A.comment += " Sensibilité diminuée à la téicoplanine.";
  }
  return finalize(A, r);
}

function enteroCoccusInterpret(r, c, { species, ampExpectedS }) {
  const A = { sev: "wild", name: "Entérocoque de phénotype sauvage",
    mech: "Rappel : résistance naturelle aux céphalosporines, au cotrimoxazole in vivo et aux aminosides à bas niveau.", alerts: [], rules: [], comment: "" };

  if (isRI(r.VA)) {
    A.sev = "crit"; A.name = "ERV — Entérocoque résistant aux glycopeptides";
    A.mech = "Résistance à la vancomycine (gènes vanA/vanB le plus souvent). Confirmer le génotype.";
    parce(A, r, {
      pour: [["VA", "RI", "vancomycine atteinte — c'est la définition du phénotype"],
             ["TEC", "RI", "téicoplanine également atteinte : oriente vers vanA plutôt que vanB"]],
      aConfirmerPar: "génotypage van (vanA / vanB), qui distingue les deux et change la conduite"
    });
    A.alerts.push({ lvl: "crit", txt: "Précautions complémentaires contact renforcées et signalement immédiat (EOH). Risque épidémique." });
    A.rules.push({ k: "✚", txt: "Options à discuter selon l'antibiogramme : linézolide (souvent actif)." });
    A.comment = `${species} résistant aux glycopeptides (ERV). Souche à signaler d'urgence, précautions complémentaires contact renforcées. Génotype van à confirmer.`;
  } else {
    A.comment = `${species} sans résistance acquise majeure détectée sur le panel testé.`;
  }

  if (isR(r.AMP)) {
    if (ampExpectedS) {
      A.alerts.push({ lvl: "warn", txt: "Ampicilline R chez E. faecalis : inhabituel — vérifier l'identification et le résultat." });
    }
    A.rules.push({ k: "→R", txt: "Ampicilline R : impact sur les associations synergiques (β-lactamine + aminoside)." });
    if (A.sev === "wild") A.sev = "mod";
  }

  if (isRI(r.HLG)) {
    A.alerts.push({ lvl: "warn", txt: "Haut niveau de résistance à la gentamicine (HLAR) : perte de la synergie β-lactamine + aminoside." });
    A.rules.push({ k: "✕", txt: "Ne pas compter sur l'association aminoside pour un effet bactéricide synergique." });
    if (A.sev === "wild") A.sev = "mod";
    A.comment += " Haut niveau de résistance aux aminosides (perte de synergie).";
  }
  return finalize(A, r);
}

function pseudoInterpret(r, c) {
  const A = { sev: "wild", name: "Pseudomonas aeruginosa sauvage",
    mech: "Rappel : résistances naturelles nombreuses (aminopénicillines, C1G–C2G, céfotaxime, ertapénème, cotrimoxazole…).", alerts: [], rules: [], comment: "" };

  const classes = [
    isRI(r.TZP) || isRI(r.CAZ) || isRI(r.FEP),
    isRI(r.IPM) || isRI(r.MEM),
    isRI(r.CIP),
    isRI(r.GEN) || isRI(r.AMK)
  ].filter(Boolean).length;

  // Les familles comptées ci-dessus, dites en clair pour la grille.
  const FAMILLES = [["TZP", "RI", "β-lactamine anti-pyocyanique atteinte"],
                    ["CAZ", "RI", "β-lactamine anti-pyocyanique atteinte"],
                    ["FEP", "RI", "β-lactamine anti-pyocyanique atteinte"],
                    ["IPM", "RI", "carbapénème atteint"],
                    ["MEM", "RI", "carbapénème atteint"],
                    ["CIP", "RI", "fluoroquinolone atteinte"],
                    ["GEN", "RI", "aminoside atteint"],
                    ["AMK", "RI", "aminoside atteint"]];

  const carba = isRI(r.IPM) || isRI(r.MEM);
  const onlyColistin = has(r, "COL") && r.COL === "S" &&
    ["TZP", "CAZ", "FEP", "IPM", "MEM", "CIP", "GEN", "AMK"].every(k => !has(r, k) || isRI(r[k]));

  if (onlyColistin && classes >= 3) {
    A.sev = "crit"; A.name = "Pseudomonas toto-résistant (XDR)";
    A.mech = "Résistance à quasiment toutes les familles anti-pyocyaniques, colistine encore active.";
    parce(A, r, {
      pour: FAMILLES.concat([["COL", "S", "colistine encore active — c'est ce qui sépare le toto-résistant du multirésistant"]]),
      aConfirmerPar: "CMI de colistine par microdilution en milieu liquide : la méthode des disques ne vaut pas pour elle"
    });
    A.alerts.push({ lvl: "crit", txt: "Précautions complémentaires contact et signalement. Avis référent en antibiothérapie." });
    A.comment = "Pseudomonas aeruginosa toto-résistant (XDR) : seule la colistine reste active sur le panel. Souche à signaler ; avis spécialisé indispensable.";
  } else if (classes >= 3) {
    A.sev = "high"; A.name = "Pseudomonas multirésistant (MDR)";
    A.mech = "Résistance acquise à au moins trois familles anti-pyocyaniques.";
    parce(A, r, { pour: FAMILLES });
    A.alerts.push({ lvl: "warn", txt: "Précautions complémentaires contact ; options thérapeutiques limitées." });
    A.comment = "Pseudomonas aeruginosa multirésistant (MDR). Options thérapeutiques restreintes — voir antibiogramme détaillé.";
  } else if (carba) {
    A.sev = "high"; A.name = "Résistance aux carbapénèmes";
    A.mech = "Sensibilité diminuée aux carbapénèmes : imperméabilité (perte OprD) et/ou carbapénémase.";
    parce(A, r, {
      pour: [["IPM", "RI", "imipénème atteint — la perte de la porine OprD l'atteint en premier"],
             ["MEM", "RI", "méropénème atteint"]],
      contre: [["CAZ", "S", "une ceftazidime conservée oriente vers une imperméabilité plutôt que vers une carbapénémase"]],
      aConfirmerPar: "recherche de carbapénémase, qui change la conduite d'hygiène"
    });
    A.alerts.push({ lvl: "warn", txt: "Discordance imipénème/méropénème possible ; envisager confirmation de carbapénémase." });
    A.comment = "Pseudomonas aeruginosa de sensibilité diminuée aux carbapénèmes (imperméabilité et/ou carbapénémase à préciser).";
  } else if (classes > 0) {
    A.sev = "mod"; A.name = "Résistance acquise partielle";
    A.mech = "Résistance acquise à une ou deux familles ; reste des anti-pyocyaniques conservé.";
    A.comment = "Pseudomonas aeruginosa avec résistance acquise partielle — se référer à l'antibiogramme.";
  } else {
    A.comment = "Pseudomonas aeruginosa de phénotype sauvage sur le panel testé.";
  }
  return finalize(A, r);
}

function acinetoInterpret(r, c) {
  const A = { sev: "wild", name: "Acinetobacter baumannii sauvage",
    mech: "Rappel : résistances naturelles nombreuses (aminopénicillines, C1G–C2G, ertapénème, aztréonam, fosfomycine).", alerts: [], rules: [], comment: "" };
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
    A.sev = "crit"; A.name = "Acinetobacter toto-résistant (XDR)";
    A.mech = "Résistance à quasiment toutes les familles disponibles, colistine encore active.";
    A.alerts.push({ lvl: "crit", txt: "Précautions complémentaires contact renforcées et signalement (potentiel épidémique en réanimation). Avis référent indispensable." });
    A.comment = "Acinetobacter baumannii toto-résistant (XDR) : seule la colistine reste active sur le panel. Souche à signaler ; avis spécialisé indispensable.";
  } else if (carba) {
    A.sev = "crit"; A.name = "Suspicion de carbapénémase (OXA / métallo-)";
    A.mech = "Sensibilité diminuée aux carbapénèmes : oxacillinases (OXA-23/24/58) le plus souvent, parfois métallo-β-lactamase.";
    A.alerts.push({ lvl: "crit", txt: "Précautions complémentaires contact et signalement. Options thérapeutiques très limitées." });
    A.rules.push({ k: "→R", txt: "β-lactamines à interpréter avec prudence ; confirmer le mécanisme." });
    A.comment = "Acinetobacter baumannii de sensibilité diminuée aux carbapénèmes (carbapénémase probable). Souche à signaler, précautions complémentaires contact.";
  } else if (classes >= 3) {
    A.sev = "high"; A.name = "Acinetobacter multirésistant (MDR)";
    A.mech = "Résistance acquise à au moins trois familles.";
    A.alerts.push({ lvl: "warn", txt: "Précautions complémentaires contact ; options limitées." });
    A.comment = "Acinetobacter baumannii multirésistant (MDR). Options thérapeutiques restreintes — voir antibiogramme détaillé.";
  } else if (classes > 0) {
    A.sev = "mod"; A.name = "Résistance acquise partielle";
    A.mech = "Résistance acquise à une ou deux familles.";
    A.comment = "Acinetobacter baumannii avec résistance acquise partielle — se référer à l'antibiogramme.";
  } else {
    A.comment = "Acinetobacter baumannii de phénotype sauvage sur le panel testé.";
  }
  return finalize(A, r);
}

function proteusInterpret(r, c, a) {
  const sp = (a && a.species) || "Proteus mirabilis";
  const A = enteroInterpret(r, c, { amino: "AMX", species: sp, imipenemIntrinsic: true });
  A.alerts.push({ lvl: "info", txt: `Rappel : ${sp} est naturellement résistant à la colistine, aux tétracyclines, à la tigécycline et à la nitrofurantoïne (à ne pas rendre sensibles).` });
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
    if (A.sev === "wild" || A.sev === "mod") { A.sev = "high"; A.name = "Résistance aux fluoroquinolones"; }
    A.alerts.push({ lvl: "warn", txt: "Ciprofloxacine R : ne pas utiliser les fluoroquinolones en cas de fièvre typhoïde / infection invasive." });
    A.rules.push({ k: "✕", txt: "Fluoroquinolones à proscrire (échec clinique documenté sur les infections invasives à Salmonella)." });
    A.comment += " Résistance aux fluoroquinolones : privilégier C3G ou azithromycine selon le site.";
  } else if (fqLow) {
    if (A.sev === "wild") { A.sev = "mod"; A.name = "Résistance de bas niveau aux fluoroquinolones"; }
    A.alerts.push({ lvl: "warn", txt: "Péfloxacine R (ou ciprofloxacine « I ») : résistance de bas niveau aux FQ (qnr / mutation gyrA). La ciprofloxacine peut apparaître sensible in vitro mais exposer à un échec clinique en typhoïde." });
    A.rules.push({ k: "→R", txt: "Rendre les fluoroquinolones résistantes malgré une CMI de ciprofloxacine apparemment basse." });
    A.comment += " Résistance de bas niveau aux fluoroquinolones détectée (dépistage péfloxacine) : fluoroquinolones déconseillées, préférer C3G ou azithromycine.";
  }

  A.alerts.push({ lvl: "info", txt: "Rappel Salmonella : aminosides et C1G/C2G actifs in vitro mais inefficaces in vivo — ne pas les proposer pour une infection systémique." });
  return A;
}

function pneumoInterpret(r, c) {
  const A = { sev: "wild", name: "Pneumocoque sensible à la pénicilline",
    mech: "Dépistage oxacilline en faveur d'une sensibilité conservée aux β-lactamines.", alerts: [], rules: [], comment: "" };
  const mening = c && c.mening === "Oui";

  const oxaR = isRI(r.OXA);
  const betaR = isRI(r.PEN) || isRI(r.AMX) || isRI(r.CTX);
  if (betaR) {
    A.sev = "high"; A.name = "PSDP — sensibilité diminuée aux β-lactamines";
    A.mech = "Pneumocoque de sensibilité diminuée à la pénicilline et/ou aux céphalosporines (modification des PLP).";
    parce(A, r, {
      pour: [["PEN", "RI", "pénicilline G atteinte"],
             ["AMX", "RI", "amoxicilline atteinte"],
             ["CTX", "RI", "céfotaxime atteint — l'atteinte des céphalosporines est plus tardive que celle de la pénicilline"]],
      aConfirmerPar: "CMI de pénicilline G, d'amoxicilline et de céfotaxime, qui ne se recouvrent pas"
    });
    A.rules.push({ k: "CMI", txt: "Rendre pénicilline, amoxicilline et céfotaxime selon leur CMI (les catégories diffèrent par molécule)." });
    if (mening) A.alerts.push({ lvl: "crit", txt: "Contexte méningé : appliquer les seuils méningés (stricts). Céfotaxime/ceftriaxone à forte dose ; avis spécialisé." });
    A.comment = `Streptococcus pneumoniae de sensibilité diminuée aux β-lactamines (PSDP). Rendre pénicilline G, amoxicilline et céfotaxime selon leurs CMI respectives${mening ? ", avec les seuils méningés" : ""}.`;
  } else if (oxaR) {
    A.sev = "mod"; A.name = "Dépistage oxacilline positif — CMI requises";
    A.mech = "Diamètre oxacilline diminué : sensibilité aux β-lactamines à confirmer par les CMI de pénicilline, amoxicilline et céfotaxime.";
    parce(A, r, {
      pour: [["OXA", "RI", "dépistage à l'oxacilline positif — il signale une modification des protéines liant les pénicillines, PAS une résistance clinique"]],
      aConfirmerPar: "CMI de pénicilline G, d'amoxicilline et de céfotaxime : le dépistage ne tranche pas, il alerte"
    });
    A.alerts.push({ lvl: "warn", txt: "Déterminer les CMI de pénicilline G, amoxicilline et céfotaxime avant de conclure." });
    A.comment = "Streptococcus pneumoniae : dépistage oxacilline positif. Déterminer les CMI de pénicilline, amoxicilline et céfotaxime pour catégorisation.";
  } else {
    A.comment = "Streptococcus pneumoniae sensible à la pénicilline (dépistage oxacilline négatif).";
  }

  if (isR(r.E) && r.DA === "S") {
    A.alerts.push({ lvl: "info", txt: "Érythromycine R et clindamycine S : rechercher une résistance inductible (D-test) avant de rendre la clindamycine." });
  } else if (isR(r.E) && isR(r.DA)) {
    A.rules.push({ k: "MLS", txt: "Résistance constitutive MLSb (macrolides + lincosamides)." });
  }

  if (isRI(r.VA)) {
    A.sev = "crit";
    A.alerts.unshift({ lvl: "crit", txt: "Vancomycine non sensible chez un pneumocoque : exceptionnel — vérifier l'identification et la CMI d'urgence." });
  }
  return finalize(A, r);
}

function strepInterpret(r, c, a) {
  const sp = (a && a.species) || "Streptococcus";
  const grp = (a && a.group) || "viridans";
  const betaHem = grp === "A" || grp === "B";
  const A = { sev: "wild", name: "", mech: "", alerts: [], rules: [], comment: "" };
  const penRI = isRI(r.PEN) || isRI(r.AMX) || isRI(r.CTX);

  if (betaHem) {
    A.name = `${sp} — sensible à la pénicilline`;
    A.mech = "Streptocoque β-hémolytique : la pénicilline G reste l'antibiotique de référence (aucune résistance acquise décrite).";
    A.comment = `${sp}. Pénicilline G / amoxicilline : traitement de référence, sensibilité conservée.`;
    if (penRI) {
      A.sev = "high"; A.name = "Sensibilité β-lactamine inhabituelle";
      A.mech = "Résistance/sensibilité diminuée aux β-lactamines chez un streptocoque β-hémolytique.";
      A.alerts.push({ lvl: "warn", txt: "Résistance aux β-lactamines chez un streptocoque β-hémolytique : exceptionnel — vérifier l'identification et la CMI." });
      A.comment = `${sp} : profil β-lactamine inhabituel, à confirmer.`;
    }
  } else {
    if (penRI) {
      A.sev = "high"; A.name = "Sensibilité diminuée aux β-lactamines (PLP)";
      A.mech = "Streptocoque du groupe viridans avec sensibilité diminuée à la pénicilline (modification des PLP).";
      A.rules.push({ k: "CMI", txt: "Rendre pénicilline, amoxicilline et ceftriaxone selon leurs CMI respectives." });
      A.alerts.push({ lvl: "warn", txt: "Contexte endocardite : une sensibilité diminuée à la pénicilline modifie le schéma (association à un aminoside à discuter)." });
      A.comment = `${sp} de sensibilité diminuée aux β-lactamines. Interpréter pénicilline / amoxicilline / ceftriaxone selon la CMI.`;
    } else {
      A.name = `${sp} — sensible à la pénicilline`;
      A.mech = "Streptocoque du groupe viridans sensible aux β-lactamines.";
      A.comment = `${sp} sensible à la pénicilline.`;
    }
  }

  if (isR(r.E) && r.DA === "S") {
    if (c && c.dtest === "Positif") {
      A.alerts.push({ lvl: "warn", txt: "MLSb inductible (D-test positif) : clindamycine rendue R malgré une sensibilité apparente in vitro." });
      A.rules.push({ k: "→R", txt: "Clindamycine rendue R (résistance inductible démontrée)." });
      A.comment += " Résistance inductible à la clindamycine (MLSb, D-test positif).";
    } else if (!c || c.dtest === "Non fait") {
      A.alerts.push({ lvl: "info", txt: "Érythromycine R et clindamycine S : réaliser un D-test avant de rendre la clindamycine." });
    }
  } else if (isR(r.E) && isR(r.DA)) {
    A.rules.push({ k: "MLS", txt: "Résistance constitutive MLSb (macrolides + lincosamides)." });
    if (A.sev === "wild") A.sev = "mod";
  }

  if (isRI(r.VA)) {
    A.sev = "crit";
    A.alerts.unshift({ lvl: "crit", txt: "Vancomycine non sensible chez un streptocoque : exceptionnel — vérifier l'identification et la CMI d'urgence." });
  }
  return finalize(A, r);
}

function stenoburkInterpret(r, c, a) {
  const sp = (a && a.species) || "Bacille non fermentant";
  const type = (a && a.type) || "steno";
  const A = { sev: "high", name: `${sp} — multirésistance naturelle`, mech: "", alerts: [], rules: [], comment: "" };

  if (type === "steno") {
    A.mech = "Stenotrophomonas maltophilia : deux β-lactamases chromosomiques (L1 métallo-carbapénémase + L2 céphalosporinase) et résistance naturelle aux aminosides.";
    A.rules.push({ k: "✕", txt: "Carbapénèmes intrinsèquement inactifs (L1) — ne pas utiliser même si « S » in vitro." });
    A.rules.push({ k: "✕", txt: "Aminosides naturellement inactifs." });
    A.rules.push({ k: "✚", txt: "Cotrimoxazole = référence ; alternatives : lévofloxacine, minocycline, ceftazidime (selon CMI)." });
    A.comment = "Stenotrophomonas maltophilia : multirésistance naturelle. Les carbapénèmes et les aminosides sont naturellement inactifs (à ne pas rendre sensibles). Le cotrimoxazole est le traitement de référence.";
    if (isR(r.SXT)) {
      A.sev = "crit";
      A.alerts.push({ lvl: "crit", txt: "Cotrimoxazole résistant : perte du traitement de référence — avis référent en antibiothérapie indispensable." });
      A.comment += " Cotrimoxazole résistant : options très limitées, avis spécialisé.";
    }
    A.alerts.push({ lvl: "info", txt: "Colistine : activité inconstante sur S. maltophilia — ne pas s'y fier." });
  } else {
    A.mech = "Burkholderia cepacia : résistance naturelle aux aminosides et aux polymyxines (colistine), et à de nombreux β-lactames.";
    A.rules.push({ k: "✕", txt: "Colistine / polymyxines intrinsèquement inactives — ne jamais rendre sensibles." });
    A.rules.push({ k: "✕", txt: "Aminosides naturellement inactifs." });
    A.rules.push({ k: "✚", txt: "Options : cotrimoxazole, ceftazidime, méropénème, minocycline (selon CMI)." });
    A.comment = "Burkholderia cepacia : multirésistance naturelle. Colistine et aminosides naturellement inactifs (à ne pas rendre sensibles). Options : cotrimoxazole, ceftazidime, méropénème, minocycline selon la CMI.";
    if (isR(r.SXT) && isRI(r.CAZ) && isRI(r.MEM)) {
      A.sev = "crit";
      A.alerts.push({ lvl: "crit", txt: "Cotrimoxazole, ceftazidime et méropénème inactifs : impasse thérapeutique — avis référent indispensable." });
    }
  }
  A.alerts.push({ lvl: "warn", txt: "Précautions complémentaires contact ; germe d'intérêt en réanimation et mucoviscidose." });
  return finalize(A, r);
}

function fastidInterpret(r, c, a) {
  const sp = (a && a.species) || "Bactérie exigeante";
  const type = (a && a.type) || "haemophilus";
  const A = { sev: "wild", name: "", mech: "", alerts: [], rules: [], comment: "" };
  const blac = c && c.blac;

  if (type === "haemophilus") {
    const ampR = isRI(r.AMP) || isRI(r.AMX);
    const amcR = isRI(r.AMC);
    if (blac === "Positif") {
      if (amcR) {
        A.sev = "high"; A.name = "BLPACR (β-lactamase + PLP3)";
        A.mech = "Double mécanisme : β-lactamase ET modification de PLP3 (ftsI).";
        parce(A, r, {
          pour: [["AMP", "RI", "ampicilline atteinte"],
                 ["AMC", "RI", "l'association avec le clavulanate reste atteinte : l'inhibiteur ne restaure pas tout, donc une PLP3 modifiée s'ajoute à l'enzyme"]],
          confirme: "test à la β-lactamase (nitrocéfine) positif"
        });
        A.rules.push({ k: "→R", txt: "Aminopénicillines et associations avec inhibiteur R ; sensibilité aux C3G diminuée — vérifier la CMI de céfotaxime." });
        A.comment = `${sp} BLPACR (β-lactamase + PLP3 modifiée). Aminopénicillines et amoxicilline-clavulanate résistantes ; C3G à interpréter selon la CMI.`;
      } else {
        A.sev = "mod"; A.name = "BLPAR (β-lactamase +)";
        A.mech = "β-lactamase (TEM-1 le plus souvent) : aminopénicillines hydrolysées, restaurées par le clavulanate.";
        parce(A, r, {
          pour: [["AMP", "RI", "ampicilline atteinte — l'enzyme l'hydrolyse"],
                 ["AMC", "S", "le clavulanate restaure l'activité : c'est la signature d'une β-lactamase seule"]],
          confirme: "test à la β-lactamase (nitrocéfine) positif"
        });
        A.rules.push({ k: "→R", txt: "Ampicilline / amoxicilline R ; amoxicilline-clavulanate et C3G actives." });
        A.comment = `${sp} producteur de β-lactamase (BLPAR). Ampicilline/amoxicilline résistantes ; amoxicilline-clavulanate et céphalosporines de 3e génération actives.`;
      }
    } else if (ampR) {
      if (amcR || blac === "Négatif") {
        A.sev = "high"; A.name = "BLNAR (PLP3 modifiée)";
        A.mech = "Résistance à l'ampicilline sans β-lactamase : modification de PLP3 (ftsI). Le clavulanate ne restaure pas l'activité.";
        parce(A, r, {
          pour: [["AMP", "RI", "ampicilline atteinte"],
                 ["AMC", "RI", "le clavulanate ne restaure rien : la cible est modifiée, il n'y a pas d'enzyme à inhiber"]],
          confirme: blac === "Négatif" ? "test à la β-lactamase (nitrocéfine) négatif" : null,
          aConfirmerPar: blac === "Négatif" ? null : "test à la β-lactamase (nitrocéfine), qui sépare ce phénotype d'une β-lactamase"
        });
        A.rules.push({ k: "→R", txt: "Aminopénicillines R ; associations avec inhibiteur peu fiables ; sensibilité aux C3G diminuée — vérifier la CMI." });
        A.alerts.push({ lvl: "warn", txt: "BLNAR : privilégier une C3G (céfotaxime/ceftriaxone) pour les formes invasives, après vérification de la CMI." });
        A.comment = `${sp} BLNAR (PLP3 modifiée, β-lactamase négative). Aminopénicillines résistantes non restaurées par le clavulanate ; C3G selon la CMI.`;
      } else {
        A.sev = "mod"; A.name = "Ampicilline R — mécanisme à préciser";
        A.alerts.push({ lvl: "info", txt: "Réaliser le test à la β-lactamase (nitrocéfine) pour distinguer BLPAR de BLNAR." });
        A.comment = `${sp} : ampicilline résistante, mécanisme à préciser (test β-lactamase recommandé).`;
      }
    } else {
      A.name = `${sp} — sensible à l'ampicilline`;
      A.mech = "Pas de β-lactamase ni de modification de PLP détectée.";
      A.comment = `${sp} sensible à l'ampicilline (souche sauvage).`;
    }
    if (isRI(r.CTX)) A.alerts.push({ lvl: "warn", txt: "Sensibilité diminuée au céfotaxime : inhabituel — vérifier la CMI (BLNAR/BLPACR de haut niveau)." });
    A.alerts.push({ lvl: "info", txt: "Formes invasives / méningite : C3G (céfotaxime, ceftriaxone) = référence." });
  }

  else if (type === "meningitidis") {
    const penRI = isRI(r.PEN) || isRI(r.AMX);
    if (penRI) {
      A.sev = "mod"; A.name = "Sensibilité diminuée à la pénicilline (penA/PLP2)";
      A.mech = "Modification de PLP2 : sensibilité diminuée à la pénicilline G et à l'amoxicilline.";
      parce(A, r, {
        pour: [["PEN", "RI", "pénicilline G atteinte sans β-lactamase décelée — la cible est modifiée"]],
        aConfirmerPar: "CMI de ceftriaxone, qui conditionne le traitement"
      });
      A.rules.push({ k: "CMI", txt: "Rendre la pénicilline selon la CMI ; la C3G reste active." });
      A.comment = `${sp} de sensibilité diminuée à la pénicilline. La céfotaxime/ceftriaxone reste le traitement de référence des formes invasives.`;
    } else {
      A.name = `${sp} — sensible à la pénicilline`;
      A.comment = `${sp} sensible à la pénicilline. Céfotaxime/ceftriaxone = référence des formes invasives.`;
    }
    if (isRI(r.CTX)) { A.sev = "crit"; A.alerts.unshift({ lvl: "crit", txt: "Sensibilité diminuée à la C3G chez un méningocoque : exceptionnel — vérifier d'urgence." }); }
    A.alerts.push({ lvl: "info", txt: "Prophylaxie des sujets contacts : rifampicine ou ciprofloxacine (vérifier leur sensibilité)." });
  }

  else if (type === "gonorrhoeae") {
    const ppng = blac === "Positif" || isRI(r.PEN);
    if (isRI(r.CTX)) {
      A.sev = "crit"; A.name = "Sensibilité diminuée à la ceftriaxone";
      A.mech = "Sensibilité diminuée aux C3G : menace majeure (échecs thérapeutiques).";
      A.alerts.push({ lvl: "crit", txt: "Sensibilité diminuée à la ceftriaxone/céfotaxime : signalement et avis référent — enjeu de santé publique." });
      A.comment = `${sp} de sensibilité diminuée à la ceftriaxone. Souche à signaler ; avis spécialisé indispensable.`;
    } else if (ppng) {
      A.sev = "high"; A.name = "PPNG (β-lactamase +)";
      A.mech = "Pénicillinase plasmidique : pénicilline inactive.";
      A.rules.push({ k: "→R", txt: "Pénicilline / amoxicilline R. Ceftriaxone = traitement de référence." });
      A.comment = `${sp} producteur de pénicillinase (PPNG). Pénicilline résistante ; ceftriaxone = référence.`;
    } else {
      A.name = `${sp} — sensible à la pénicilline`;
      A.comment = `${sp} sans mécanisme de résistance majeur détecté. Ceftriaxone = traitement de référence.`;
    }
    if (isR(r.AZM)) A.alerts.push({ lvl: "warn", txt: "Azithromycine résistante : à prendre en compte dans le schéma." });
    if (isR(r.CIP)) A.alerts.push({ lvl: "info", txt: "Ciprofloxacine résistante : fréquent chez le gonocoque, fluoroquinolones à éviter en probabiliste." });
  }

  else {
    const blR = blac === "Positif" || isRI(r.PEN) || isRI(r.AMX);
    if (blR) {
      A.sev = "mod"; A.name = "β-lactamase (BRO) +";
      A.mech = "β-lactamase BRO (quasi constante chez M. catarrhalis) : aminopénicillines hydrolysées.";
      A.rules.push({ k: "→R", txt: "Ampicilline/amoxicilline R ; amoxicilline-clavulanate, céphalosporines et macrolides actifs." });
      A.comment = `${sp} producteur de β-lactamase BRO. Aminopénicillines résistantes ; amoxicilline-clavulanate, C2G/C3G et macrolides actifs.`;
    } else {
      A.name = `${sp} — β-lactamase négative`;
      A.comment = `${sp} β-lactamase négative (rare). Aminopénicillines actives.`;
    }
  }

  return finalize(A, r);
}

function gramposrodInterpret(r, c, a) {
  const sp = (a && a.species) || "Bacille à Gram positif";
  const type = (a && a.type) || "listeria";
  const A = { sev: "wild", name: "", mech: "", alerts: [], rules: [], comment: "" };

  if (type === "listeria") {
    A.sev = "mod";
    A.name = "Listeria monocytogenes — céphalosporines naturellement inactives";
    A.mech = "Résistance naturelle à TOUTES les céphalosporines (C1G–C4G, C3G comprises) et à la fosfomycine.";
    A.rules.push({ k: "✕", txt: "Céphalosporines naturellement inactives — ne jamais utiliser ni rendre S (piège classique en méningite)." });
    A.rules.push({ k: "✚", txt: "Ampicilline / amoxicilline = référence ; associer la gentamicine (synergie) dans les formes neuroméningées ou sévères." });
    A.rules.push({ k: "✚", txt: "Cotrimoxazole = alternative (allergie aux β-lactamines)." });
    A.comment = "Listeria monocytogenes. Rappel majeur : les céphalosporines (dont les C3G) sont naturellement inactives — ampicilline/amoxicilline = traitement de référence, associées à la gentamicine dans les formes sévères.";
    if (isRI(r.AMP) || isRI(r.AMX)) {
      A.sev = "high";
      A.alerts.push({ lvl: "warn", txt: "Ampicilline non sensible chez Listeria : exceptionnel — vérifier l'identification et la CMI." });
      A.comment += " Ampicilline non sensible : à confirmer d'urgence.";
    }
  } else {
    if (isR(r.PEN)) {
      A.sev = "high"; A.name = "Corynebacterium multirésistant probable (groupe JK)";
      A.mech = "Les Corynebacterium du groupe JK (C. jeikeium) sont souvent multirésistants.";
      A.rules.push({ k: "✚", txt: "Vancomycine = référence (constamment active). Pénicilline résistante." });
      A.comment = `${sp} (groupe JK probable) : profil multirésistant — vancomycine constamment active, traitement de référence.`;
    } else {
      A.name = `${sp} — sensible à la pénicilline`;
      A.rules.push({ k: "✚", txt: "Vancomycine constamment active (recours)." });
      A.comment = `${sp} sensible à la pénicilline. La vancomycine reste constamment active.`;
    }
  }
  return finalize(A, r);
}

function anaerobeInterpret(r, c, a) {
  const sp = (a && a.species) || "Anaérobie";
  const type = (a && a.type) || "bfragilis";
  const A = { sev: "wild", name: "", mech: "", alerts: [], rules: [], comment: "" };

  if (type === "bfragilis") {
    A.sev = "mod"; A.name = "Bacteroides fragilis";
    A.mech = "β-lactamase (cepA) fréquente ; résistance naturelle aux aminosides ; sensibilité à la clindamycine devenue variable.";
    A.rules.push({ k: "✕", txt: "Aminosides naturellement inactifs (anaérobie)." });
    A.rules.push({ k: "✚", txt: "Métronidazole = référence ; alternatives : amoxicilline-clavulanate, pipéracilline-tazobactam, carbapénèmes." });
    A.rules.push({ k: "→R", txt: "Pénicilline / ampicilline R (β-lactamase) ; restaurées par clavulanate / tazobactam." });
    A.comment = "Bacteroides fragilis : β-lactamase fréquente (pénicillines R, restaurées par les inhibiteurs). Métronidazole = traitement de référence ; aminosides naturellement inactifs.";
    if (isRI(r.MTZ)) { A.sev = "crit"; A.alerts.push({ lvl: "crit", txt: "Résistance au métronidazole : rare et grave — confirmer et avis référent." }); A.comment += " Métronidazole non sensible : à confirmer d'urgence."; }
    if (isRI(r.IPM) || isRI(r.MEM)) A.alerts.push({ lvl: "warn", txt: "Sensibilité diminuée aux carbapénèmes : carbapénémase (cfiA) possible — confirmer." });
    if (isR(r.DA)) A.alerts.push({ lvl: "info", txt: "Clindamycine résistante : fréquent chez B. fragilis, ne pas utiliser en probabiliste." });
  }
  else if (type === "cperfringens") {
    A.name = "Clostridium perfringens — sensible à la pénicilline";
    A.mech = "Anaérobie à Gram positif sensible aux β-lactamines.";
    A.rules.push({ k: "✚", txt: "Pénicilline G = référence ; associer la clindamycine (effet antitoxine) dans la gangrène gazeuse." });
    A.comment = "Clostridium perfringens : pénicilline G = traitement de référence, associée à la clindamycine (effet antitoxine) dans les formes graves.";
    if (isRI(r.PEN)) { A.sev = "high"; A.alerts.push({ lvl: "warn", txt: "Pénicilline non sensible : inhabituel — vérifier l'identification et la CMI." }); }
  }
  else {
    A.sev = "mod"; A.name = "Clostridioides difficile — pas d'antibiogramme de routine";
    A.mech = "Diagnostic par toxines / GDH / PCR ; l'antibiogramme n'est pas réalisé en routine.";
    A.rules.push({ k: "✚", txt: "Traitement : vancomycine orale ou fidaxomicine (référence) ; métronidazole oral en alternative (formes non sévères)." });
    A.rules.push({ k: "!", txt: "Arrêter si possible l'antibiotique inducteur ; précautions contact (spores)." });
    A.comment = "Clostridioides difficile : colite post-antibiotique. Pas d'antibiogramme de routine — traitement par vancomycine orale ou fidaxomicine, métronidazole oral en alternative.";
    A.alerts.push({ lvl: "info", txt: "Hygiène : spores résistantes aux hydro-alcooliques — lavage des mains et désinfection sporicide." });
  }
  return finalize(A, r);
}

function curvedInterpret(r, c, a) {
  const sp = (a && a.species) || "Bacille courbe";
  const type = (a && a.type) || "campylobacter";
  const A = { sev: "wild", name: "", mech: "", alerts: [], rules: [], comment: "" };

  if (type === "campylobacter") {
    A.name = "Campylobacter jejuni";
    A.mech = "Macrolides = référence ; fluoroquinolones souvent résistantes (mutation gyrA).";
    A.rules.push({ k: "✚", txt: "Azithromycine / érythromycine = traitement de référence." });
    A.comment = "Campylobacter jejuni : macrolides (azithromycine) = traitement de référence.";
    if (isRI(r.CIP)) A.alerts.push({ lvl: "info", txt: "Ciprofloxacine résistante : fréquent — fluoroquinolones à éviter en probabiliste." });
    if (isR(r.AZM) || isR(r.E)) { A.sev = "high"; A.alerts.push({ lvl: "warn", txt: "Macrolide résistant : perte du traitement de référence — avis spécialisé." }); A.comment += " Macrolide résistant : options limitées."; }
  } else {
    A.name = "Vibrio cholerae";
    A.mech = "Traitement adjuvant à la réhydratation ; doxycycline = référence, azithromycine en alternative.";
    A.rules.push({ k: "✚", txt: "Doxycycline = référence ; azithromycine / fluoroquinolone selon la sensibilité. La réhydratation reste le pilier du traitement." });
    A.comment = "Vibrio cholerae : la réhydratation est prioritaire ; l'antibiotique (doxycycline de référence, azithromycine en alternative) raccourcit la maladie.";
    if (isR(r.DOX) && isR(r.SXT)) { A.sev = "high"; A.alerts.push({ lvl: "warn", txt: "Souche multirésistante (doxycycline + cotrimoxazole R) : fréquent en contexte épidémique — s'appuyer sur l'antibiogramme." }); }
  }
  return finalize(A, r);
}

const ENGINE = {
  entero: enteroInterpret, enterobacter: enterobacterInterpret, staph: staphInterpret,
  enterococcus: enteroCoccusInterpret, pseudo: pseudoInterpret, acineto: acinetoInterpret,
  proteus: proteusInterpret, salmonella: salmonellaInterpret, pneumo: pneumoInterpret,
  strep: strepInterpret, stenoburk: stenoburkInterpret, fastid: fastidInterpret,
  gramposrod: gramposrodInterpret, anaerobe: anaerobeInterpret, curved: curvedInterpret
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
  // S null : le référentiel ne prévoit AUCUNE catégorie « sensible » à posologie
  // standard pour ce couple germe/antibiotique. La souche est au mieux
  // « sensible à forte posologie » — donc I jusqu'à R, jamais S.
  if (S === null || S === undefined) {
    if ((op === ">" || op === ">=") && v >= R) return "R";
    return v > R ? "R" : "I";
  }
  if ((op === "<=" || op === "<") && v <= S) return "S";
  if ((op === ">" || op === ">=") && v >= R) return "R";
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
let _ref = "eucast";
const estCasfm = () => _ref === "casfm";

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
  // Hors cystite, une molécule qui n'a QUE des seuils urinaires n'en a pas.
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
function raisonSansDisque(group, k, ctx) {
  const c = ctx || {};
  if (estCasfm() && dzCasfmDivergent(group, k, c))
    return "le CA-SFM retient un seuil différent de l'EUCAST pour ce couple, et PhénoBac ne reprend que ses seuils de CMI — saisir une CMI, ou repasser en EUCAST";
  if (c.mening === "Oui" && !(DZ_MENINGE[group] && DZ_MENINGE[group][k])
      && BP_MENINGE[group] && BP_MENINGE[group][k])
    return "l'EUCAST ne chiffre pas ce couple au disque dans le LCR et renvoie à la CMI — le seuil ordinaire serait trop permissif pour une méningite";
  if (!(DZ[group] && DZ[group][k]))
    return horsEucast(group, k)
      ? "l'EUCAST ne chiffre ce couple ni en CMI ni au disque ; PhénoBac ne dispose que d'une convention de laboratoire, applicable à une CMI — saisir une CMI"
      : "l'EUCAST ne reconnaît pas la méthode des disques pour ce couple — une CMI est nécessaire";
  return "valeur illisible : un diamètre s'écrit en millimètres, entre 6 (pas de zone) et 60";
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
      if (results[k] === undefined) { results[k] = "S"; mis.push(ABXNAME[k] || k); }
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
  if (estCasfm() && DEPISTAGE_CASFM[group] && DEPISTAGE_CASFM[group][k])
    return DEPISTAGE_CASFM[group][k];
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
  const refDemande = String(input.ref || "eucast");
  _ref = Object.prototype.hasOwnProperty.call(REFERENTIELS, refDemande) ? refDemande : "eucast";

  // Fixé avant la traduction des mesures, et non plus seulement avant le
  // calcul : la restriction d'espèce des diamètres CA-SFM en dépend.
  _activeId = organism;
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
  horsEucast, depistageSeuil, estCasfm,
  // § 9 : conditions de réalisation exigées par espèce, et leur contrôle
  CONDITIONS, conditionsTechniques,
  // rendu ciblé (HAS 2023)
  RENDU_CIBLE: RC.RENDU_CIBLE, RENDU_CIBLE_SOURCE: RC.RENDU_CIBLE_SOURCE,
  RENDU_CIBLE_NOTES: RC.RENDU_CIBLE_NOTES, RENDU_CIBLE_LISTES: RC.RENDU_CIBLE_LISTES,
  RENDU_CIBLE_RESTRICTIONS: RC.RENDU_CIBLE_RESTRICTIONS,
  renduCible, rcColonne, rcPremiereIntention, rcCodes, rcCephalosporines,
  RC_GROUPE3_ORG, RC_NOM_CODES,
  // posologies qui fondent les seuils
  POSOLOGIE: POSO.POSOLOGIE, POSOLOGIE_VERSION: POSO.POSOLOGIE_VERSION, posologiePour,
  // § 15 : le commentaire en cinq moments
  COMMENT_MOMENTS, commentaireStructure, commentaireCopiable,
  // tables, pour l'affichage des seuils et des aides de saisie
  REFERENTIELS, ORG, ABXNAME,
  BP, BP_MENINGE, BP_URIN, BP_CASFM, BP_CASFM_URIN, BP_MENINGE_CASFM,
  DZ, DZ_MENINGE, DZ_URIN, DZ_CASFM, DZ_CASFM_URIN, DZ_CASFM_ESPECE, DZ_TEMOIN,
  DISQUE, DISQUE_CASFM, OXA_PNEUMO, DEPISTAGE_CASFM,
  ZIT, ZIT_CASFM, ZIT_ZONE, ZIT_ZONE_CASFM,
  HORS_EUCAST, CASFM_COUVRE, CASFM_COUVRE_ESPECE,
  // provenance : d'où vient la règle, et dans quelle version de la base
  SOURCES: BASE.SOURCES, BASE_VERSION: BASE.BASE_VERSION, regleDe
};

if (typeof module !== "undefined" && module.exports) module.exports = MOTEUR;
else racine.PhenoBacMoteur = MOTEUR;
})(typeof self !== "undefined" ? self : this);
