// netlify/functions/premium-interpret.js
// VERROU DUR — le moteur d'interprétation premium s'exécute ici, côté serveur,
// et ne répond qu'à une licence valide. La logique sensible ne quitte jamais le serveur.
//
// Variables d'environnement : PHENOBAC_SECRET (même secret que verify-license.js)
//
// Appel : POST {
//   license, organism, mode ("sir"|"mic"),
//   results {ABX:"S|I|R"},  // si mode "sir"
//   mic {ABX:"valeur mg/L"}, bpOverride {"group:ABX":{S,R}},  // si mode "mic"
//   ctx {syn|dtest|mening}
// }
// Réponse : { valid, plan, interpretation:{sev,name,mech,alerts,rules,comment}, categories }

const crypto = require("crypto");

// Référentiel des concentrations critiques employées par ce moteur.
// Doit rester identique à la constante REFERENTIEL de phenobac.html.
const REFERENTIEL = { nom: "EUCAST", version: "16.1", publie: "2026-06-24", etat: "partiel" };
const { isRevoked } = require("./lib/revocation");
const { cors } = require("./lib/http");
const SECRET = process.env.PHENOBAC_SECRET || "";
const FREE_SPECIES = ["ecoli", "saureus"]; // interprétés sans licence

/* ---------- Vérification de licence (identique à verify-license) ---------- */
function verify(token) {
  if (!SECRET) return { valid: false, reason: "server_not_configured" };
  if (typeof token !== "string" || !token.includes(".")) return { valid: false, reason: "malformed" };
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return { valid: false, reason: "malformed" };
  const expected = crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { valid: false, reason: "bad_signature" };
  let payload;
  try { payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")); }
  catch (e) { return { valid: false, reason: "bad_payload" }; }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp) return { valid: false, reason: "expired", exp: payload.exp };
  return { valid: true, plan: payload.plan || "premium", sub: payload.sub || null, exp: payload.exp || null };
}

/* ======================= MOTEUR PREMIUM (porté, sans état) ======================= */

const isR = v => v === "R";
const isRI = v => v === "R" || v === "I";
const has = (r, k) => r[k] !== undefined && r[k] !== null && r[k] !== "";

// noms utilisés dans les messages d'incohérence (résistances naturelles)
const ABXNAME = {
  AMX: "Amoxicilline", AMP: "Ampicilline", AMC: "Amoxicilline + ac. clavulanique",
  TZP: "Pipéracilline + tazobactam", FOX: "Céfoxitine", CTX: "Céfotaxime (C3G)",
  CAZ: "Ceftazidime (C3G)", FEP: "Céfépime (C4G)", ETP: "Ertapénème", IPM: "Imipénème",
  MEM: "Méropénème", CIP: "Ciprofloxacine", GEN: "Gentamicine", AMK: "Amikacine",
  SXT: "Cotrimoxazole", FOS: "Fosfomycine", COL: "Colistine", PEN: "Pénicilline G",
  E: "Érythromycine", DA: "Clindamycine", VA: "Vancomycine", TEC: "Teicoplanine",
  RD: "Rifampicine", LZD: "Linézolide", HLG: "Gentamicine haut niveau",
  OXA: "Oxacilline", LVX: "Lévofloxacine", PEF: "Péfloxacine", AZM: "Azithromycine"
};

// concentrations critiques (valeurs par défaut, surchargées par bpOverride côté client)
const BP = {
  entero: {
    AMX: { S: 8, R: 8 }, AMP: { S: 8, R: 8 }, AMC: { S: 8, R: 8 }, TZP: { S: 8, R: 8 }, FOX: { S: 8, R: 8 },
    CTX: { S: 1, R: 2 }, CAZ: { S: 1, R: 4 }, FEP: { S: 1, R: 4 },
    ETP: { S: 0.5, R: 0.5 }, IPM: { S: 2, R: 4 }, MEM: { S: 2, R: 8 },
    CIP: { S: 0.25, R: 0.5 }, GEN: { S: 2, R: 2 }, AMK: { S: 8, R: 8 },
    SXT: { S: 2, R: 4 }, FOS: { S: 8, R: 8 }, COL: { S: 2, R: 2 }, AZM: { S: 16, R: 16 }
  },
  staph: {
    FOX: { S: 4, R: 4 }, OXA: { S: 0.25, R: 0.25 }, PEN: { S: 0.125, R: 0.125 }, E: { S: 1, R: 1 }, DA: { S: 0.25, R: 0.25 },
    GEN: { S: 2, R: 2 }, SXT: { S: 0.5, R: 0.5 }, RD: { S: 0.06, R: 0.06 },
    VA: { S: 2, R: 2 }, TEC: { S: 2, R: 2 }, LZD: { S: 4, R: 4 }
  },

  /* Staphylocoques à COAGULASE NÉGATIVE.
     Identique à « staph » (S. aureus) SAUF les glycopeptides : EUCAST donne
     4 mg/L aux coagulase-négative et 2 mg/L à S. aureus. Confondre les deux
     rend sensible une souche qui ne l'est pas, ou l'inverse. */
  scn: {
    FOX: { S: 4, R: 4 }, OXA: { S: 0.25, R: 0.25 }, PEN: { S: 0.125, R: 0.125 }, E: { S: 1, R: 1 }, DA: { S: 0.25, R: 0.25 },
    GEN: { S: 2, R: 2 }, SXT: { S: 0.5, R: 0.5 }, RD: { S: 0.06, R: 0.06 },
    VA: { S: 4, R: 4 }, TEC: { S: 4, R: 4 }, LZD: { S: 4, R: 4 }
  },
  enteroc: {
    AMP: { S: 4, R: 4 }, VA: { S: 4, R: 4 }, TEC: { S: 2, R: 2 },
    HLG: { S: 128, R: 128 }, LZD: { S: 4, R: 4 }, CIP: { S: 4, R: 4 }
  },
  pseudo: {
    TZP: { S: null, R: 16 }, CAZ: { S: null, R: 8 }, FEP: { S: null, R: 8 }, IPM: { S: null, R: 4 }, MEM: { S: 2, R: 8 },
    CIP: { S: null, R: 0.5 }, GEN: { S: 4, R: 4 }, AMK: { S: 16, R: 16 }, COL: { S: 4, R: 4 }
  },
  pneumo: {
    PEN: { S: 0.06, R: 1 }, AMX: { S: 0.5, R: 1 }, CTX: { S: 0.5, R: 2 },
    E: { S: 0.25, R: 0.25 }, DA: { S: 0.5, R: 0.5 }, LVX: { S: null, R: 2 },
    VA: { S: 2, R: 2 }, LZD: { S: 2, R: 2 }, SXT: { S: 1, R: 1 }
  },
  acineto: {
    TZP: { S: 16, R: 16 }, CAZ: { S: 8, R: 8 }, FEP: { S: 8, R: 8 }, IPM: { S: 2, R: 4 }, MEM: { S: 2, R: 8 },
    CIP: { S: null, R: 1 }, GEN: { S: 4, R: 4 }, AMK: { S: 8, R: 8 }, SXT: { S: 0.5, R: 0.5 }, COL: { S: 2, R: 2 }
  },


  /* S. pyogenes (groupes A, C, G) */
  strepacg: {
    AMX: { S: 0.5, R: 2 }, CTX: { S: 0.5, R: 2 }, DA: { S: 0.5, R: 0.5 }, E: { S: 0.25, R: 0.25 }, LVX: { S: null, R: 2 }, LZD: { S: 2, R: 2 }, PEN: { S: 0.03, R: 0.03 }, VA: { S: 2, R: 2 }
  },

  /* S. agalactiae (groupe B) */
  strepb: {
    AMX: { S: 0.5, R: 2 }, CTX: { S: 0.5, R: 2 }, DA: { S: 0.5, R: 0.5 }, E: { S: 0.25, R: 0.25 }, LVX: { S: null, R: 2 }, LZD: { S: 2, R: 2 }, PEN: { S: 0.125, R: 0.125 }, VA: { S: 2, R: 2 }
  },

  /* streptocoques du groupe viridans */
  viridans: {
    AMX: { S: 0.5, R: 2 }, CTX: { S: 0.5, R: 0.5 }, DA: { S: 0.5, R: 0.5 }, E: { S: 0.25, R: 0.25 }, LVX: { S: null, R: 2 }, LZD: { S: 2, R: 2 }, PEN: { S: 0.25, R: 2 }, VA: { S: 2, R: 2 }
  },

  /* L. monocytogenes */
  listeria: {
    AMP: { S: 1, R: 1 }, AMX: { S: 2, R: 2 }, CTX: { S: 1, R: 1 }, E: { S: 1, R: 1 }, GEN: { S: 1, R: 1 }, LZD: { S: 2, R: 4 }, MEM: { S: 0.25, R: 0.25 }, PEN: { S: 1, R: 1 }, SXT: { S: 0.06, R: 0.06 }, VA: { S: 2, R: 2 }
  },

  /* Corynebacterium spp. */
  coryne: {
    AMP: { S: 1, R: 1 }, AMX: { S: 2, R: 2 }, CTX: { S: 1, R: 1 }, E: { S: 1, R: 2 }, GEN: { S: 1, R: 1 }, LZD: { S: 2, R: 2 }, MEM: { S: 0.5, R: 0.5 }, PEN: { S: null, R: 1 }, SXT: { S: 0.5, R: 1 }, VA: { S: 2, R: 2 }
  },

  /* H. influenzae */
  haemo: {
    AMC: { S: 2, R: 2 }, AMP: { S: 1, R: 1 }, AMX: { S: 2, R: 2 }, AZM: { S: 0.25, R: 0.5 }, CAF: { S: 2, R: 2 }, CIP: { S: 0.03, R: 0.03 }, CTX: { S: 0.125, R: 0.125 }, PEN: { S: 0.06, R: 0.25 }, RD: { S: 1, R: 1 }, SXT: { S: 0.5, R: 0.5 }
  },

  /* N. meningitidis */
  nmening: {
    AMC: { S: 2, R: 2 }, AMP: { S: 0.125, R: 1 }, AMX: { S: 0.125, R: 1 }, AZM: { S: 0.25, R: 0.5 }, CAF: { S: 2, R: 2 }, CIP: { S: 0.016, R: 0.016 }, CTX: { S: 0.125, R: 0.125 }, PEN: { S: 0.25, R: 0.25 }, RD: { S: 0.25, R: 0.25 }, SXT: { S: 0.5, R: 0.5 }
  },

  /* N. gonorrhoeae */
  ngono: {
    AMC: { S: 2, R: 2 }, AMP: { S: 1, R: 1 }, AMX: { S: 2, R: 2 }, AZM: { S: 0.25, R: 0.5 }, CAF: { S: 2, R: 2 }, CIP: { S: 0.03, R: 0.06 }, CTX: { S: 0.125, R: 0.125 }, PEN: { S: 0.06, R: 1 }, RD: { S: 1, R: 1 }, SXT: { S: 0.5, R: 0.5 }
  },

  /* M. catarrhalis */
  moraxella: {
    AMC: { S: 1, R: 1 }, AMP: { S: 1, R: 1 }, AMX: { S: 2, R: 2 }, AZM: { S: 0.25, R: 0.25 }, CAF: { S: 2, R: 2 }, CIP: { S: 0.125, R: 0.125 }, CTX: { S: 1, R: 2 }, PEN: { S: 0.06, R: 0.25 }, RD: { S: 1, R: 1 }, SXT: { S: 1, R: 1 }
  },

  /* S. maltophilia */
  steno: {
    AMK: { S: 16, R: 16 }, CAZ: { S: 8, R: 8 }, COL: { S: 2, R: 2 }, GEN: { S: 4, R: 4 }, IPM: { S: 2, R: 4 }, LVX: { S: 1, R: 2 }, MEM: { S: 2, R: 8 }, SXT: { S: null, R: 2 }, TZP: { S: 16, R: 16 }
  },

  /* B. cepacia — EUCAST ne fixe AUCUN seuil : conventions de laboratoire */
  burk: {
    AMK: { S: 16, R: 16 }, CAZ: { S: 8, R: 8 }, COL: { S: 2, R: 2 }, GEN: { S: 4, R: 4 }, IPM: { S: 2, R: 4 }, LVX: { S: 1, R: 2 }, MEM: { S: 2, R: 8 }, SXT: { S: null, R: 2 }, TZP: { S: 16, R: 16 }
  },

  /* C. jejuni */
  campylo: {
    AZM: { S: 0.5, R: 0.5 }, CIP: { S: null, R: 0.5 }, DOX: { S: 4, R: 8 }, E: { S: 4, R: 4 }, SXT: { S: 2, R: 4 }
  },

  /* V. cholerae */
  vibrio: {
    AZM: { S: 4, R: 4 }, CIP: { S: 0.25, R: 0.25 }, DOX: { S: 0.5, R: 0.5 }, E: { S: 4, R: 4 }, SXT: { S: 0.25, R: 0.25 }
  },

  /* B. fragilis */
  bfragilis: {
    AMC: { S: 4, R: 8 }, DA: { S: 4, R: 4 }, IPM: { S: 2, R: 8 }, MEM: { S: 2, R: 8 }, MTZ: { S: 4, R: 4 }, PEN: { S: 0.25, R: 0.5 }, TZP: { S: 8, R: 16 }, VA: { S: 2, R: 2 }
  },

  /* C. perfringens */
  cperfringens: {
    AMC: { S: 0.25, R: 0.25 }, DA: { S: 0.25, R: 0.25 }, IPM: { S: 0.5, R: 0.5 }, MEM: { S: 0.125, R: 0.125 }, MTZ: { S: 4, R: 4 }, PEN: { S: 0.5, R: 0.5 }, TZP: { S: 0.5, R: 0.5 }, VA: { S: 2, R: 2 }
  },

  /* C. difficile */
  cdifficile: {
    AMC: { S: 4, R: 8 }, DA: { S: 4, R: 4 }, IPM: { S: 2, R: 8 }, MEM: { S: 2, R: 8 }, MTZ: { S: 2, R: 2 }, PEN: { S: 0.25, R: 0.5 }, TZP: { S: 8, R: 16 }, VA: { S: 2, R: 2 }
  },
};

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
  saureus:    { engine: "staph", bpGroup: "staph", intrinsic: {} },
  sepidermidis:  { engine: "staph", args: { species: "Staphylococcus epidermidis", coNS: true }, bpGroup: "scn", intrinsic: {} },
  ssaprophyticus:{ engine: "staph", args: { species: "Staphylococcus saprophyticus", coNS: true }, bpGroup: "scn", intrinsic: {} },
  slugdunensis:  { engine: "staph", args: { species: "Staphylococcus lugdunensis", coNS: true }, bpGroup: "scn", intrinsic: {} },
  shaemolyticus: { engine: "staph", args: { species: "Staphylococcus haemolyticus", coNS: true }, bpGroup: "scn", intrinsic: {} },
  spyogenes:   { engine: "strep", args: { species: "Streptococcus pyogenes", group: "A" }, bpGroup: "strepacg", intrinsic: {} },
  sagalactiae: { engine: "strep", args: { species: "Streptococcus agalactiae", group: "B" }, bpGroup: "strepb", intrinsic: {} },
  sviridans:   { engine: "strep", args: { species: "Streptocoque du groupe viridans", group: "viridans" }, bpGroup: "viridans", intrinsic: {} },
  steno:      { engine: "stenoburk", args: { species: "Stenotrophomonas maltophilia", type: "steno" }, bpGroup: "steno",
                intrinsic: {
                  IPM: "Résistance naturelle (carbapénémase L1) — carbapénème inactif in vivo.",
                  MEM: "Résistance naturelle (carbapénémase L1) — carbapénème inactif in vivo.",
                  ETP: "Résistance naturelle aux carbapénèmes.",
                  GEN: "Résistance naturelle aux aminosides.",
                  AMK: "Résistance naturelle aux aminosides." } },
  burk:       { engine: "stenoburk", args: { species: "Burkholderia cepacia", type: "burk" }, bpGroup: "burk",
                intrinsic: {
                  COL: "Résistance naturelle aux polymyxines (colistine).",
                  GEN: "Résistance naturelle aux aminosides.",
                  AMK: "Résistance naturelle aux aminosides." } },
  haemophilus:  { engine: "fastid", args: { species: "Haemophilus influenzae", type: "haemophilus" }, bpGroup: "haemo", intrinsic: {} },
  nmeningitidis:{ engine: "fastid", args: { species: "Neisseria meningitidis", type: "meningitidis" }, bpGroup: "nmening", intrinsic: {} },
  ngonorrhoeae: { engine: "fastid", args: { species: "Neisseria gonorrhoeae", type: "gonorrhoeae" }, bpGroup: "ngono", intrinsic: {} },
  moraxella:    { engine: "fastid", args: { species: "Moraxella catarrhalis", type: "moraxella" }, bpGroup: "moraxella", intrinsic: {} },
  listeria:   { engine: "gramposrod", args: { species: "Listeria monocytogenes", type: "listeria" }, bpGroup: "listeria",
                intrinsic: {
                  CTX: "Céphalosporines naturellement inactives (toutes, dont C3G).",
                  FOX: "Céphalosporines / céphamycines naturellement inactives." } },
  coryne:     { engine: "gramposrod", args: { species: "Corynebacterium spp.", type: "coryne" }, bpGroup: "coryne", intrinsic: {} },
  bfragilis:  { engine: "anaerobe", args: { species: "Bacteroides fragilis", type: "bfragilis" }, bpGroup: "bfragilis", intrinsic: {} },
  cperfringens:{ engine: "anaerobe", args: { species: "Clostridium perfringens", type: "cperfringens" }, bpGroup: "cperfringens", intrinsic: {} },
  cdifficile: { engine: "anaerobe", args: { species: "Clostridioides difficile", type: "cdifficile" }, bpGroup: "cdifficile", intrinsic: {} },
  campylobacter:{ engine: "curved", args: { species: "Campylobacter jejuni", type: "campylobacter" }, bpGroup: "campylo", intrinsic: {} },
  vibrio:     { engine: "curved", args: { species: "Vibrio cholerae", type: "vibrio" }, bpGroup: "vibrio", intrinsic: {} },
  efaecalis:  { engine: "enterococcus", args: { species: "E. faecalis", ampExpectedS: true }, bpGroup: "enteroc", intrinsic: {} },
  efaecium:   { engine: "enterococcus", args: { species: "E. faecium", ampExpectedS: false }, bpGroup: "enteroc", intrinsic: {} },
  paeru:      { engine: "pseudo", bpGroup: "pseudo", intrinsic: {} },
  acineto:    { engine: "acineto", bpGroup: "acineto", intrinsic: {} },
  proteus:    { engine: "proteus", bpGroup: "entero", intrinsic: {} },
  salmonella: { engine: "salmonella", bpGroup: "entero", intrinsic: {} },
  pneumocoque:{ engine: "pneumo", bpGroup: "pneumo", intrinsic: {} },

  // --- Extension Entérobactéries (moteurs réutilisés) ---
  koxytoca:   { engine: "entero", args: { amino: "AMX", species: "K. oxytoca", klebsiella: true }, bpGroup: "entero",
                intrinsic: { AMX: "Résistance naturelle (pénicillinase chromosomique K1/OXY) aux aminopénicillines." } },
  kaerogenes: { engine: "enterobacter", args: { species: "Klebsiella aerogenes" }, bpGroup: "entero",
                intrinsic: {
                  AMX: "Résistance naturelle (céphalosporinase AmpC chromosomique inductible).",
                  AMC: "Résistance naturelle (AmpC non inhibée par le clavulanate).",
                  FOX: "Résistance naturelle (AmpC)." } },
  serratia:   { engine: "enterobacter", args: { species: "Serratia marcescens" }, bpGroup: "entero",
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
  pvulgaris:  { engine: "proteus", args: { species: "Proteus vulgaris" }, bpGroup: "entero",
                intrinsic: { AMX: "Résistance naturelle (céphalosporinase chromosomique K1) aux aminopénicillines." } },
  shigella:   { engine: "entero", args: { amino: "AMX", species: "Shigella spp." }, bpGroup: "entero", intrinsic: {} }
};

// organisme actif pour finalize (défini juste avant l'appel, calcul synchrone)
let _activeOrg = null;

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
    A.alerts.push({ lvl: "crit", txt: "Isolat hautement résistant : précautions complémentaires contact et signalement (EOH / hygiène)." });
    A.alerts.push({ lvl: "warn", txt: "Confirmer le mécanisme : discordance imipénème/méropénème/ertapénème possible (imperméabilité vs carbapénémase vraie)." });
    A.rules.push({ k: "→R", txt: "Interpréter l'ensemble des β-lactamines avec prudence tant que le mécanisme n'est pas confirmé." });
    A.comment = `${species} de sensibilité diminuée aux carbapénèmes. Suspicion de carbapénémase à confirmer. Souche à signaler, précautions complémentaires contact.`;
    return finalize(A, r);
  }

  if (c3g) {
    if (c && c.syn === "Positif") {
      A.sev = "high"; A.name = "BLSE";
      A.mech = "β-lactamase à spectre étendu : synergie C3G + clavulanate positive. La céfoxitine reste habituellement sensible.";
      A.alerts.push({ lvl: "warn", txt: "Précautions complémentaires contact ; signalement selon la politique locale." });
      A.rules.push({ k: "→R", txt: "Harmonisation : pénicillines, C1G, C2G, C3G et aztréonam rendus R quel que soit le résultat in vitro." });
      A.rules.push({ k: "?", txt: "Céfépime : interpréter selon la CMI (effet inoculum possible)." });
      A.comment = `${species} productrice de β-lactamase à spectre étendu (BLSE). Par harmonisation, l'ensemble des pénicillines et des céphalosporines de 1re à 3e génération ainsi que l'aztréonam sont rendus résistants, indépendamment du résultat in vitro. Souche à signaler, précautions complémentaires contact.`;
    } else if (isRI(r.FOX)) {
      A.sev = "high"; A.name = "Céphalosporinase hyperproduite (AmpC)";
      A.mech = "Résistance C3G + céfoxitine sans synergie au clavulanate : profil de céphalosporinase déréprimée / plasmidique.";
      A.rules.push({ k: "→R", txt: "C1G à C3G et céfoxitine résistantes ; associations avec inhibiteur peu fiables." });
      A.rules.push({ k: "?", txt: "Céfépime souvent conservé — vérifier la CMI." });
      A.comment = `${species} exprimant une céphalosporinase hyperproduite (AmpC). Céphalosporines de 1re à 3e génération et céfoxitine résistantes. Céfépime à interpréter selon la CMI.`;
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
  } else if (c3g) {
    if (c && c.syn === "Positif") {
      A.sev = "crit"; A.name = "AmpC + BLSE surajoutée";
      A.mech = "Résistance C3G avec synergie clavulanate positive : BLSE en plus de la céphalosporinase naturelle.";
      A.rules.push({ k: "→R", txt: "Pénicillines, C1G–C3G et aztréonam rendus R (harmonisation BLSE)." });
      A.rules.push({ k: "?", txt: "Céfépime souvent touché en cas de BLSE + AmpC — vérifier la CMI." });
      A.comment = `${sp} producteur d'une BLSE surajoutée à sa céphalosporinase naturelle. Pénicillines, C1G à C3G et aztréonam rendus résistants. Souche à signaler.`;
    } else {
      A.sev = "high"; A.name = "Céphalosporinase déréprimée (AmpC hyperproduite)";
      A.mech = "Résistance C3G sans synergie clavulanate : dérepression de l'AmpC chromosomique.";
      A.rules.push({ k: "→R", txt: "C1G à C3G résistantes ; associations avec inhibiteur inefficaces." });
      A.rules.push({ k: "?", txt: "Céfépime habituellement conservé (stable vis-à-vis de l'AmpC) — vérifier la CMI." });
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
    A.alerts.push({ lvl: "crit", txt: coNS
      ? "Résistance à la méticilline : β-lactamines inactives. Impact majeur sur les infections de matériel étranger / prothèse."
      : "Précautions complémentaires contact et signalement (portage, épidémiologie)." });
    A.rules.push({ k: "→R", txt: "Toutes les β-lactamines rendues R (hors céphalosporines anti-SARM)." });
    A.comment = `${sp} résistant à la méticilline (${metiR}). Par harmonisation, l'ensemble des β-lactamines (hors céphalosporines anti-SARM) sont rendues résistantes.` + (coNS ? "" : " Souche à signaler, précautions complémentaires contact.");
  } else if (isR(r.PEN)) {
    A.sev = "mod"; A.name = coNS ? `${sp} — pénicillinase` : "SASM producteur de pénicillinase";
    A.mech = "Pénicilline G résistante par pénicillinase (blaZ) ; méticilline / oxacilline actives.";
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

  const carba = isRI(r.IPM) || isRI(r.MEM);
  const onlyColistin = has(r, "COL") && r.COL === "S" &&
    ["TZP", "CAZ", "FEP", "IPM", "MEM", "CIP", "GEN", "AMK"].every(k => !has(r, k) || isRI(r[k]));

  if (onlyColistin && classes >= 3) {
    A.sev = "crit"; A.name = "Pseudomonas toto-résistant (XDR)";
    A.mech = "Résistance à quasiment toutes les familles anti-pyocyaniques, colistine encore active.";
    A.alerts.push({ lvl: "crit", txt: "Précautions complémentaires contact et signalement. Avis référent en antibiothérapie." });
    A.comment = "Pseudomonas aeruginosa toto-résistant (XDR) : seule la colistine reste active sur le panel. Souche à signaler ; avis spécialisé indispensable.";
  } else if (classes >= 3) {
    A.sev = "high"; A.name = "Pseudomonas multirésistant (MDR)";
    A.mech = "Résistance acquise à au moins trois familles anti-pyocyaniques.";
    A.alerts.push({ lvl: "warn", txt: "Précautions complémentaires contact ; options thérapeutiques limitées." });
    A.comment = "Pseudomonas aeruginosa multirésistant (MDR). Options thérapeutiques restreintes — voir antibiogramme détaillé.";
  } else if (carba) {
    A.sev = "high"; A.name = "Résistance aux carbapénèmes";
    A.mech = "Sensibilité diminuée aux carbapénèmes : imperméabilité (perte OprD) et/ou carbapénémase.";
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
    A.rules.push({ k: "CMI", txt: "Rendre pénicilline, amoxicilline et céfotaxime selon leur CMI (les catégories diffèrent par molécule)." });
    if (mening) A.alerts.push({ lvl: "crit", txt: "Contexte méningé : appliquer les seuils méningés (stricts). Céfotaxime/ceftriaxone à forte dose ; avis spécialisé." });
    A.comment = `Streptococcus pneumoniae de sensibilité diminuée aux β-lactamines (PSDP). Rendre pénicilline G, amoxicilline et céfotaxime selon leurs CMI respectives${mening ? ", avec les seuils méningés" : ""}.`;
  } else if (oxaR) {
    A.sev = "mod"; A.name = "Dépistage oxacilline positif — CMI requises";
    A.mech = "Diamètre oxacilline diminué : sensibilité aux β-lactamines à confirmer par les CMI de pénicilline, amoxicilline et céfotaxime.";
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
        A.rules.push({ k: "→R", txt: "Aminopénicillines et associations avec inhibiteur R ; sensibilité aux C3G diminuée — vérifier la CMI de céfotaxime." });
        A.comment = `${sp} BLPACR (β-lactamase + PLP3 modifiée). Aminopénicillines et amoxicilline-clavulanate résistantes ; C3G à interpréter selon la CMI.`;
      } else {
        A.sev = "mod"; A.name = "BLPAR (β-lactamase +)";
        A.mech = "β-lactamase (TEM-1 le plus souvent) : aminopénicillines hydrolysées, restaurées par le clavulanate.";
        A.rules.push({ k: "→R", txt: "Ampicilline / amoxicilline R ; amoxicilline-clavulanate et C3G actives." });
        A.comment = `${sp} producteur de β-lactamase (BLPAR). Ampicilline/amoxicilline résistantes ; amoxicilline-clavulanate et céphalosporines de 3e génération actives.`;
      }
    } else if (ampR) {
      if (amcR || blac === "Négatif") {
        A.sev = "high"; A.name = "BLNAR (PLP3 modifiée)";
        A.mech = "Résistance à l'ampicilline sans β-lactamase : modification de PLP3 (ftsI). Le clavulanate ne restaure pas l'activité.";
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
const BP_MENINGE = {
  acineto: { MEM: { S: 2, R: 2 } },
  entero: { CIP: { S: 0.125, R: 0.125 }, CTX: { S: 1, R: 1 }, MEM: { S: 2, R: 2 } },
  pneumo: { AMX: { S: 0.06, R: 0.06 }, CTX: { S: 0.5, R: 0.5 }, PEN: { S: 0.06, R: 0.06 } },
  pseudo: { MEM: { S: 2, R: 2 } }
};

function getBP(bpOverride, group, k, ctx) {
  const o = bpOverride && bpOverride[group + ":" + k];
  if (o && o.S !== undefined && o.R !== undefined) return o;   // saisie de l'utilisateur : prioritaire
  if (ctx && ctx.mening === "Oui" && BP_MENINGE[group] && BP_MENINGE[group][k]) {
    return BP_MENINGE[group][k];
  }
  return (BP[group] && BP[group][k]) || null;
}

/* ---------- Orchestration ---------- */
function runInterpretation(input) {
  const organism = input.organism;
  if (!ORG[organism]) return { error: "unknown_organism" };
  const org = ORG[organism];

  let results = {};
  if (input.mode === "mic") {
    const mic = input.mic || {};
    Object.keys(mic).forEach(k => {
      const cat = catFromMic(mic[k], getBP(input.bpOverride || {}, org.bpGroup, k, input.ctx || {}));
      if (cat) results[k] = cat;
    });
  } else {
    results = input.results || {};
  }

  _activeOrg = org;                            // fixé juste avant le calcul (synchrone)
  const A = ENGINE[org.engine](results, input.ctx || {}, org.args || {});
  return { interpretation: A, categories: results };
}

/* ======================= Handler ======================= */
// Origines autorisées : SITE_URL / ALLOWED_ORIGINS (voir lib/http.js).

exports.handler = async (event) => {
  const CORS = cors(event);
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "method" }) };

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch (e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "bad_json" }) };
  }

  // 1. porte : licence obligatoire SAUF pour les germes gratuits EN MODE S/I/R.
  // La saisie par CMI est vendue comme fonction Premium : elle est donc payante
  // pour toutes les espèces, y compris les gratuites.
  const isFree = FREE_SPECIES.includes(body.organism) && String(body.mode || "sir") !== "mic";
  const token = String(body.license || "").trim();
  const lic = verify(token);
  const revoked = lic.valid ? await isRevoked(token) : false;
  if (!isFree && (!lic.valid || revoked)) {
    return { statusCode: 402, headers: CORS, body: JSON.stringify({ valid: false, reason: revoked ? "revoked" : lic.reason }) };
  }

  // 2. calcul (gratuit : ouvert ; premium : compte payant non révoqué)
  const out = runInterpretation(body);
  if (out.error) return { statusCode: 400, headers: CORS, body: JSON.stringify({ valid: true, error: out.error }) };

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({ valid: true, plan: (lic.valid && !revoked) ? lic.plan : "free", interpretation: out.interpretation, categories: out.categories, referentiel: REFERENTIEL })
  };
};

// Exposé pour les tests hors-Netlify
if (typeof module !== "undefined") module.exports._engine = { runInterpretation, catFromMic, verify };
