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
/* Référentiels servis par le moteur. Le CA-SFM n'est pas un second jeu
   complet de seuils : c'est l'EUCAST assorti des différences françaises que
   son comité publie et justifie (« Différences principales entre le CA-SFM
   et l'EUCAST », version CA-SFM 2026). Voir REFERENTIEL-CASFM.md. */
const REFERENTIELS = {
  eucast: { cle: "eucast", nom: "EUCAST", version: "16.1", publie: "2026-06-24", etat: "aligne" },
  casfm:  { cle: "casfm",  nom: "CA-SFM", version: "2026", publie: "2026-09-01", etat: "delta", base: "eucast" }
};
const REFERENTIEL = REFERENTIELS.eucast;   // défaut, conservé pour compatibilité
const { isRevoked } = require("./lib/revocation");
const { cors } = require("./lib/http");
const SECRET = process.env.PHENOBAC_SECRET || "";
// PhénoBac est GRATUIT : toutes les espèces et le mode CMI sont ouverts.
// La vérification de licence reste dans le code (lib, endpoints, révocation)
// mais ne conditionne plus l'accès — elle resservira si un jour des licences
// d'établissement sont émises pour un usage institutionnel ou de formation.
const FREE_SPECIES = null;   // null = tout est gratuit

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
  CAF: "Chloramphénicol", DOX: "Doxycycline",
  OXA: "Oxacilline", LVX: "Lévofloxacine", PEF: "Péfloxacine", AZM: "Azithromycine",
  TEM: "Témocilline", FDC: "Céfidérocol", DAP: "Daptomycine", MXF: "Moxifloxacine",
  MIN: "Minocycline"
};

// concentrations critiques (valeurs par défaut, surchargées par bpOverride côté client)
const BP = {
  entero: {
    AMX: { S: 8, R: 8 }, AMP: { S: 8, R: 8 }, AMC: { S: 8, R: 8 }, TZP: { S: 8, R: 8 }, FOX: { S: 8, R: 8 },
    CTX: { S: 1, R: 2 }, CAZ: { S: 1, R: 4 }, FEP: { S: 1, R: 4 },
    ETP: { S: 0.5, R: 0.5 }, IPM: { S: 2, R: 4 }, MEM: { S: 2, R: 8 },
    CIP: { S: 0.25, R: 0.5 }, GEN: { S: 2, R: 2 }, AMK: { S: 8, R: 8 },
    SXT: { S: 0.5, R: 0.5 }, FOS: { S: 8, R: 8 }, COL: { S: 2, R: 2 }, AZM: { S: 16, R: 16 },
    // Témocilline : les deux référentiels restreignent la ligne à E. coli,
    // Klebsiella spp. (sauf K. aerogenes) et P. mirabilis — seules ces
    // espèces la portent à leur panel.
    TEM:{S:null,R:16}, FDC:{S:2,R:2}
  },
  staph: {
    FOX: { S: 4, R: 4 }, OXA: { S: 0.25, R: 0.25 }, PEN: { S: 0.125, R: 0.125 }, E: { S: 1, R: 1 }, DA: { S: 0.25, R: 0.25 },
    GEN: { S: 2, R: 2 }, SXT: { S: 0.5, R: 0.5 }, RD: { S: 0.06, R: 0.06 },
    VA: { S: 2, R: 2 }, TEC: { S: 2, R: 2 }, LZD: { S: 4, R: 4 },
    DAP:{S:1,R:1}, MIN:{S:0.5,R:0.5}, MXF:{S:0.25,R:0.25}
  },

  /* Staphylocoques à COAGULASE NÉGATIVE.
     Identique à « staph » (S. aureus) SAUF les glycopeptides : EUCAST donne
     4 mg/L aux coagulase-négative et 2 mg/L à S. aureus. Confondre les deux
     rend sensible une souche qui ne l'est pas, ou l'inverse. */
  scn: {
    FOX: { S: 4, R: 4 }, OXA: { S: 0.25, R: 0.25 }, PEN: { S: 0.125, R: 0.125 }, E: { S: 1, R: 1 }, DA: { S: 0.25, R: 0.25 },
    GEN: { S: 2, R: 2 }, SXT: { S: 0.5, R: 0.5 }, RD: { S: 0.06, R: 0.06 },
    VA: { S: 4, R: 4 }, TEC: { S: 4, R: 4 }, LZD: { S: 4, R: 4 },
    MIN:{S:0.5,R:0.5}, MXF:{S:0.25,R:0.25}
  },
  enteroc: {
    AMP: { S: 4, R: 4 }, VA: { S: 4, R: 4 }, TEC: { S: 2, R: 2 },
    HLG: { S: 128, R: 128 }, LZD: { S: 4, R: 4 }, CIP: { S: 4, R: 4 },
    DAP:{S:2,R:2}
  },
  pseudo: {
    TZP: { S: null, R: 16 }, CAZ: { S: null, R: 8 }, FEP: { S: null, R: 8 }, IPM: { S: null, R: 4 }, MEM: { S: 2, R: 8 },
    CIP: { S: null, R: 0.5 }, GEN: { S: 4, R: 4 }, AMK: { S: 16, R: 16 }, COL: { S: 4, R: 4 },
    FDC:{S:2,R:2}
  },
  pneumo: {
    PEN: { S: 0.06, R: 1 }, AMX: { S: 0.5, R: 1 }, CTX: { S: 0.5, R: 2 },
    E: { S: 0.25, R: 0.25 }, DA: { S: 0.5, R: 0.5 }, LVX: { S: null, R: 2 },
    VA: { S: 2, R: 2 }, LZD: { S: 2, R: 2 }, SXT: { S: 1, R: 1 },
    MXF:{S:0.5,R:0.5}
  },
  acineto: {
    TZP: { S: 16, R: 16 }, CAZ: { S: 8, R: 8 }, FEP: { S: 8, R: 8 }, IPM: { S: 2, R: 4 }, MEM: { S: 2, R: 8 },
    CIP: { S: null, R: 1 }, GEN: { S: 4, R: 4 }, AMK: { S: 8, R: 8 }, SXT: { S: 0.5, R: 0.5 }, COL: { S: 2, R: 2 },
    FDC:{S:2,R:2}, MIN:{S:null,R:2}
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
    AMX: { S: 0.5, R: 2 }, CTX: { S: 0.5, R: 0.5 }, DA: { S: 0.5, R: 0.5 }, E: { S: 0.25, R: 0.25 }, LVX: { S: null, R: 2 }, LZD: { S: 2, R: 2 }, PEN: { S: 0.25, R: 1 }, VA: { S: 2, R: 2 }
  },

  /* L. monocytogenes */
  listeria: {
    AMP: { S: 1, R: 1 }, AMX: { S: 2, R: 2 }, CTX: { S: 1, R: 1 }, E: { S: 1, R: 1 }, GEN: { S: 1, R: 1 }, LZD: { S: 2, R: 4 }, MEM: { S: 0.25, R: 0.25 }, PEN: { S: 1, R: 1 }, SXT: { S: 0.06, R: 0.06 }, VA: { S: 2, R: 2 }
  },

  /* Corynebacterium spp. */
  coryne: {
    AMP: { S: 1, R: 1 }, AMX: { S: 2, R: 2 }, CTX: { S: 1, R: 1 }, E: { S: 1, R: 2 }, GEN: { S: 1, R: 1 }, LZD: { S: 2, R: 2 }, MEM: { S: 0.5, R: 0.5 }, PEN: { S: null, R: 1 }, SXT: { S: 0.5, R: 1 }, VA: { S: 2, R: 2 },
    MXF:{S:0.5,R:0.5}
  },

  /* H. influenzae */
  haemo: {
    AMC: { S: 2, R: 2 }, AMP: { S: 1, R: 1 }, AMX: { S: 2, R: 2 }, AZM: { S: 0.25, R: 0.5 }, CAF: { S: 2, R: 2 }, CIP: { S: 0.03, R: 0.03 }, CTX: { S: 0.125, R: 0.125 }, PEN: { S: 0.06, R: 0.25 }, RD: { S: 1, R: 1 }, SXT: { S: 0.5, R: 0.5 },
    MXF:{S:0.125,R:0.125}
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
    AMC: { S: 1, R: 1 }, AMP: { S: 1, R: 1 }, AMX: { S: 2, R: 2 }, AZM: { S: 0.25, R: 0.25 }, CAF: { S: 2, R: 2 }, CIP: { S: 0.125, R: 0.125 }, CTX: { S: 1, R: 2 }, PEN: { S: 0.06, R: 0.25 }, RD: { S: 1, R: 1 }, SXT: { S: 1, R: 1 },
    MXF:{S:0.25,R:0.25}
  },

  /* S. maltophilia */
  steno: {
    AMK: { S: 16, R: 16 }, CAZ: { S: 8, R: 8 }, COL: { S: 2, R: 2 }, GEN: { S: 4, R: 4 }, IPM: { S: 2, R: 4 }, LVX: { S: 1, R: 2 }, MEM: { S: 2, R: 8 }, SXT: { S: null, R: 2 }, TZP: { S: 16, R: 16 },
    FDC:{S:2,R:2}, MIN:{S:null,R:2}
  },

  /* B. cepacia — EUCAST ne fixe AUCUN seuil : conventions de laboratoire */
  burk: {
    AMK: { S: 16, R: 16 }, CAZ: { S: 8, R: 8 }, COL: { S: 2, R: 2 }, GEN: { S: 4, R: 4 }, IPM: { S: 2, R: 4 }, LVX: { S: 1, R: 2 }, MEM: { S: 2, R: 8 }, SXT: { S: null, R: 2 }, TZP: { S: 16, R: 16 },
    MIN:{S:null,R:2}
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
    AMC: { S: 4, R: 8 }, DA: { S: 4, R: 4 }, IPM: { S: 2, R: 8 }, MEM: { S: 2, R: 8 }, MTZ: { S: 4, R: 4 }, PEN: { S: 0.25, R: 0.5 }, TZP: { S: 8, R: 16 }, VA: { S: 2, R: 2 },
    MXF:{S:2,R:2}
  },

  /* C. perfringens */
  cperfringens: {
    AMC: { S: 0.25, R: 0.25 }, DA: { S: 0.25, R: 0.25 }, IPM: { S: 0.5, R: 0.5 }, MEM: { S: 0.125, R: 0.125 }, MTZ: { S: 4, R: 4 }, PEN: { S: 0.5, R: 0.5 }, TZP: { S: 0.5, R: 0.5 }, VA: { S: 2, R: 2 },
    MXF:{S:2,R:2}
  },

  /* C. difficile */
  cdifficile: {
    AMC: { S: 4, R: 8 }, DA: { S: 4, R: 4 }, IPM: { S: 2, R: 8 }, MEM: { S: 2, R: 8 }, MTZ: { S: 2, R: 2 }, PEN: { S: 0.25, R: 0.5 }, TZP: { S: 8, R: 16 }, VA: { S: 2, R: 2 }
  },

  /* Salmonella spp. — ciprofloxacine plus stricte (0,06). Identique aux entérobactéries pour le reste. */
  salmonella: {
    AMX: { S: 8, R: 8 }, AMP: { S: 8, R: 8 }, AMC: { S: 8, R: 8 }, TZP: { S: 8, R: 8 }, FOX: { S: 8, R: 8 },
    CTX: { S: 1, R: 2 }, CAZ: { S: 1, R: 4 }, FEP: { S: 1, R: 4 },
    ETP: { S: 0.5, R: 0.5 }, IPM: { S: 2, R: 4 }, MEM: { S: 2, R: 8 },
    CIP: { S: 0.06, R: 0.06 }, GEN: { S: 2, R: 2 }, AMK: { S: 8, R: 8 },
    SXT: { S: 0.5, R: 0.5 }, FOS: { S: 8, R: 8 }, COL: { S: 2, R: 2 }, AZM: { S: 16, R: 16 }
  },

  /* Morganellaceae (Proteus) — imipénème sans catégorie S. Identique aux entérobactéries pour le reste. */
  morganella: {
    AMX: { S: 8, R: 8 }, AMP: { S: 8, R: 8 }, AMC: { S: 8, R: 8 }, TZP: { S: 8, R: 8 }, FOX: { S: 8, R: 8 },
    CTX: { S: 1, R: 2 }, CAZ: { S: 1, R: 4 }, FEP: { S: 1, R: 4 },
    ETP: { S: 0.5, R: 0.5 }, IPM: { S: null, R: 4 }, MEM: { S: 2, R: 8 },
    CIP: { S: 0.25, R: 0.5 }, GEN: { S: 2, R: 2 }, AMK: { S: 8, R: 8 },
    SXT: { S: 0.5, R: 0.5 }, FOS: { S: 8, R: 8 }, COL: { S: 2, R: 2 }, AZM: { S: 16, R: 16 },
    // Témocilline : les deux référentiels restreignent la ligne à E. coli,
    // Klebsiella spp. (sauf K. aerogenes) et P. mirabilis — seules ces
    // espèces la portent à leur panel.
    TEM:{S:null,R:16}, FDC:{S:2,R:2}
  },

  /* Serratia spp. — triméthoprime-sulfaméthoxazole sans catégorie S. Identique aux entérobactéries pour le reste. */
  serratia: {
    AMX: { S: 8, R: 8 }, AMP: { S: 8, R: 8 }, AMC: { S: 8, R: 8 }, TZP: { S: 8, R: 8 }, FOX: { S: 8, R: 8 },
    CTX: { S: 1, R: 2 }, CAZ: { S: 1, R: 4 }, FEP: { S: 1, R: 4 },
    ETP: { S: 0.5, R: 0.5 }, IPM: { S: 2, R: 4 }, MEM: { S: 2, R: 8 },
    CIP: { S: 0.25, R: 0.5 }, GEN: { S: 2, R: 2 }, AMK: { S: 8, R: 8 },
    SXT: { S: null, R: 2 }, FOS: { S: 8, R: 8 }, COL: { S: 2, R: 2 }, AZM: { S: 16, R: 16 },
    FDC:{S:2,R:2}
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
let _activeOrg = null;
let _activeId = null;
// Couples tombant dans la zone d'incertitude technique pour la requête en cours.
let _zit = [];
let _sansDisque = [];
let _depistage = null;

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
  reglesCasfm(A, r);

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
const HORS_EUCAST = {
  acineto: ["CAZ", "FDC", "FEP", "MIN", "TZP"],
  bfragilis: ["AMC", "DA", "IPM", "MEM", "MTZ", "MXF", "PEN", "TZP", "VA"],
  burk: ["AMK", "CAZ", "COL", "GEN", "IPM", "LVX", "MEM", "MIN", "SXT", "TZP"],
  campylo: ["AZM", "DOX", "SXT"],
  cdifficile: ["AMC", "DA", "IPM", "MEM", "PEN", "TZP"],
  cperfringens: ["MXF"],
  coryne: ["AMP", "AMX", "CTX", "E", "GEN", "MEM", "SXT"],
  entero: ["AZM", "FOX"],
  enteroc: ["DAP", "HLG"],
  haemo: ["AZM", "PEN"],
  listeria: ["AMX", "CTX", "GEN", "LZD", "VA"],
  moraxella: ["AMP", "AMX", "CAF", "PEN", "RD"],
  morganella: ["AZM", "FOX"],
  ngono: ["AMC", "AMP", "AMX", "AZM", "CAF", "RD", "SXT"],
  nmening: ["AMC", "AZM", "CAF", "SXT"],
  pseudo: ["GEN"],
  salmonella: ["AZM", "FOX"],
  scn: ["FOX", "OXA"],
  serratia: ["AZM", "FOX"],
  staph: ["FOX", "OXA"],
  steno: ["AMK", "CAZ", "COL", "FDC", "GEN", "IPM", "LVX", "MEM", "MIN", "TZP"],
  strepacg: ["AMX", "CTX"],
  strepb: ["AMX", "CTX"],
  vibrio: ["E"],
  viridans: ["E", "LVX", "LZD"]
};

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
const BP_MENINGE = {
  acineto: { MEM: { S: 2, R: 2 } },
  entero: { CIP: { S: 0.125, R: 0.125 }, CTX: { S: 1, R: 1 }, MEM: { S: 2, R: 2 } },
  pneumo: { AMX: { S: 0.06, R: 0.06 }, CTX: { S: 0.5, R: 0.5 }, PEN: { S: 0.06, R: 0.06 } },
  pseudo: { MEM: { S: 2, R: 2 } },
  salmonella: { CIP: { S: 0.125, R: 0.125 }, CTX: { S: 1, R: 1 }, MEM: { S: 2, R: 2 } },
  morganella: { CIP: { S: 0.125, R: 0.125 }, CTX: { S: 1, R: 1 }, MEM: { S: 2, R: 2 } },
  serratia: { CIP: { S: 0.125, R: 0.125 }, CTX: { S: 1, R: 1 }, MEM: { S: 2, R: 2 } },
};

/* ============================================================
   CA-SFM — DIFFÉRENCES AVEC L'EUCAST (copie conforme du client).
   Source : « Différences principales entre le CA-SFM et l'EUCAST »,
   version CA-SFM 2026. Chaque entrée porte sa page.
   Tout couple absent de ces tables garde sa valeur EUCAST.
   outils/verifier-tables.py échoue si ces tables divergent du client.
   ============================================================ */
const BP_CASFM = {
  staph:    { VA: { S: 1, R: 1 } },            // p. 11 — EUCAST 2 mg/L
  strepacg: { PEN: { S: 0.06, R: 0.06 } },     // p. 12 — EUCAST 0,03 mg/L
  acineto:  { SXT: { S: 0.5, R: 2 } },         // p. 6  — SFP conservée jusqu'à 2
  coryne:   { SXT: { S: 2, R: 2 } },           // p. 18 — CLSI M45
  ngono:    { GEN: { S: 16, R: 16 } }          // p. 14 — ECOFF ; EUCAST écarte
};
// p. 6 — infection urinaire sans signe de gravité : le CA-SFM refuse
// l'abaissement du cotrimoxazole à 0,5 mg/L dans l'urine.
const BP_CASFM_URIN = {
  // Témocilline (p. 7) : le CA-SFM autorise la posologie standard dans les
  // infections urinaires sans signe de gravité, là où l'EUCAST n'affiche
  // qu'un seuil « sensible à forte posologie ».
  entero:     { SXT: { S: 2, R: 2 }, TEM: { S: 8, R: 16 } },
  salmonella: { SXT: { S: 2, R: 2 } },
  morganella: { SXT: { S: 2, R: 2 }, TEM: { S: 8, R: 16 } },
  serratia:   { SXT: { S: 2, R: 2 } },
  staph:      { SXT: { S: 2, R: 2 } },
  scn:        { SXT: { S: 2, R: 2 } },
  acineto:    { SXT: { S: 2, R: 2 } }
};
// p. 14 — méningite à méningocoque : seuil unique sur l'amoxicilline.
const BP_MENINGE_CASFM = {
  nmening: { AMX: { S: 0.125, R: 0.125 } }
};
// p. 18 et p. 7 — couples sans seuil EUCAST que le CA-SFM couvre.
const CASFM_COUVRE = {
  // Minocycline : « R » à la valeur d'ECOFF (2 mg/L). Céfidérocol : rendu à
  // deux niveaux sur la valeur PK/PD de 2 mg/L. Daptomycine : « IE » chez
  // l'EUCAST, 2 mg/L au CA-SFM. Moxifloxacine : rien chez l'EUCAST pour les
  // anaérobies, 2 mg/L au CA-SFM.
  acineto: ["TZP", "CAZ", "FEP", "MIN", "FDC"], steno: ["LVX", "MIN", "FDC"],
  coryne: ["SXT"], ngono: ["GEN"], entero: ["FOX"],
  enteroc: ["DAP"], bfragilis: ["MXF"], cperfringens: ["MXF"]
};
const CASFM_COUVRE_ESPECE = { "entero:FOX": ["ecoli"] };

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
const ZIT = {
  entero:     { TZP: 16, CIP: 0.5 },
  morganella: { TZP: 16, CIP: 0.5 },
  serratia:   { TZP: 16, CIP: 0.5 },
  salmonella: { TZP: 16 }            // pas de ZIT ciprofloxacine chez Salmonella
};
const ZIT_CASFM = {
  pseudo: { COL: 4 },                // CA-SFM 2026, chapitre 5.2
  staph:  { VA: 2 },                 // accompagne l'abaissement du seuil à 1 mg/L
  enteroc: { DAP: 4 }                // le seuil de 2 mg/L coupe la population sauvage
};

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
const DZ = {
  acineto:{ AMK:{S:19,R:19}, CIP:{S:null,R:21}, GEN:{S:17,R:17}, IPM:{S:24,R:21}, LVX:{S:23,R:20}, MEM:{S:21,R:15}, SXT:{S:16,R:16} },
  campylo:{ CIP:{S:null,R:26}, E:{S:20,R:20} },
  coryne:{ CIP:{S:null,R:25}, DA:{S:20,R:20}, LZD:{S:25,R:25}, MXF:{S:25,R:25}, PEN:{S:null,R:12}, RD:{S:30,R:30}, VA:{S:17,R:17} },
  cperfringens:{ AMC:{S:23,R:23}, AMP:{S:23,R:23}, DA:{S:19,R:19}, ETP:{S:24,R:24}, IPM:{S:25,R:25}, MEM:{S:25,R:25}, MTZ:{S:16,R:16}, PEN:{S:15,R:15}, TZP:{S:24,R:24}, VA:{S:12,R:12} },
  entero:{ AMC:{S:19,R:19}, AMK:{S:18,R:18}, AMP:{S:14,R:14}, CAZ:{S:22,R:19}, CIP:{S:25,R:22}, CTX:{S:20,R:17}, ETP:{S:23,R:23}, FDC:{S:23,R:23}, FEP:{S:27,R:24}, GEN:{S:17,R:17}, LVX:{S:23,R:19}, MEM:{S:22,R:16}, TEM:{S:null,R:17}, TZP:{S:20,R:20} },
  enteroc:{ AMP:{S:10,R:10}, CIP:{S:15,R:15}, IPM:{S:null,R:21}, LVX:{S:15,R:15}, LZD:{S:20,R:20}, TEC:{S:16,R:16}, TZP:{S:null,R:18}, VA:{S:12,R:12} },
  haemo:{ AMC:{S:15,R:15}, AMP:{S:18,R:18}, CAF:{S:28,R:28}, CIP:{S:32,R:32}, CTX:{S:27,R:27}, ETP:{S:23,R:23}, FEP:{S:28,R:28}, IPM:{S:20,R:20}, LVX:{S:30,R:30}, MEM:{S:20,R:20}, MIN:{S:24,R:24}, MXF:{S:28,R:28}, RD:{S:18,R:18}, SXT:{S:23,R:23}, TZP:{S:27,R:27} },
  listeria:{ AMP:{S:16,R:16}, E:{S:25,R:25}, MEM:{S:26,R:26}, PEN:{S:13,R:13}, SXT:{S:29,R:29} },
  moraxella:{ AMC:{S:19,R:19}, CIP:{S:31,R:31}, CTX:{S:20,R:17}, E:{S:23,R:23}, ETP:{S:29,R:29}, FEP:{S:20,R:20}, IPM:{S:29,R:29}, LVX:{S:29,R:29}, MEM:{S:33,R:33}, MIN:{S:25,R:25}, MXF:{S:26,R:26}, SXT:{S:15,R:15} },
  morganella:{ AMC:{S:19,R:19}, AMK:{S:18,R:18}, AMP:{S:14,R:14}, CAZ:{S:22,R:19}, CIP:{S:25,R:22}, CTX:{S:20,R:17}, ETP:{S:23,R:23}, FDC:{S:23,R:23}, FEP:{S:27,R:24}, GEN:{S:17,R:17}, IPM:{S:null,R:19}, LVX:{S:23,R:19}, MEM:{S:22,R:16}, TEM:{S:null,R:17}, TZP:{S:20,R:20} },
  pneumo:{ AMP:{S:22,R:19}, DA:{S:19,R:19}, E:{S:22,R:22}, LVX:{S:null,R:16}, LZD:{S:22,R:22}, MIN:{S:24,R:24}, MXF:{S:22,R:22}, RD:{S:22,R:22}, SXT:{S:15,R:15}, TEC:{S:17,R:17}, VA:{S:16,R:16} },
  pseudo:{ AMK:{S:15,R:15}, CAZ:{S:null,R:17}, CIP:{S:null,R:26}, FDC:{S:22,R:22}, FEP:{S:null,R:21}, IPM:{S:null,R:20}, LVX:{S:null,R:18}, MEM:{S:20,R:14}, TZP:{S:null,R:18} },
  salmonella:{ AMC:{S:19,R:19}, AMK:{S:18,R:18}, AMP:{S:14,R:14}, CAZ:{S:22,R:19}, CTX:{S:20,R:17}, ETP:{S:23,R:23}, FDC:{S:23,R:23}, FEP:{S:27,R:24}, GEN:{S:17,R:17}, LVX:{S:23,R:19}, MEM:{S:22,R:16}, TEM:{S:null,R:17}, TZP:{S:20,R:20} },
  scn:{ AMK:{S:15,R:15}, AMP:{S:18,R:18}, CIP:{S:null,R:22}, DA:{S:22,R:22}, E:{S:21,R:21}, GEN:{S:22,R:22}, LVX:{S:null,R:24}, LZD:{S:21,R:21}, MIN:{S:23,R:23}, MXF:{S:28,R:28}, PEN:{S:26,R:26}, RD:{S:30,R:30}, SXT:{S:24,R:24} },
  serratia:{ AMC:{S:19,R:19}, AMK:{S:18,R:18}, AMP:{S:14,R:14}, CAZ:{S:22,R:19}, CIP:{S:25,R:22}, CTX:{S:20,R:17}, ETP:{S:23,R:23}, FDC:{S:23,R:23}, FEP:{S:27,R:24}, GEN:{S:17,R:17}, LVX:{S:23,R:19}, MEM:{S:22,R:16}, MXF:{S:22,R:22}, SXT:{S:null,R:15}, TEM:{S:null,R:17}, TZP:{S:20,R:20} },
  staph:{ AMK:{S:15,R:15}, AMP:{S:18,R:18}, CIP:{S:null,R:17}, DA:{S:22,R:22}, E:{S:21,R:21}, GEN:{S:18,R:18}, LVX:{S:null,R:22}, LZD:{S:21,R:21}, MIN:{S:23,R:23}, MXF:{S:25,R:25}, PEN:{S:26,R:26}, RD:{S:26,R:26}, SXT:{S:24,R:24} },
  steno:{ SXT:{S:null,R:16} },
  strepacg:{ DA:{S:17,R:17}, E:{S:21,R:21}, LVX:{S:null,R:17}, LZD:{S:19,R:19}, MIN:{S:23,R:23}, MXF:{S:19,R:19}, PEN:{S:23,R:23}, RD:{S:21,R:21}, SXT:{S:16,R:16}, TEC:{S:15,R:15}, VA:{S:13,R:13} },
  strepb:{ DA:{S:17,R:17}, E:{S:21,R:21}, LVX:{S:null,R:17}, LZD:{S:19,R:19}, MIN:{S:23,R:23}, MXF:{S:19,R:19}, PEN:{S:18,R:18}, RD:{S:21,R:21}, SXT:{S:16,R:16}, TEC:{S:15,R:15}, VA:{S:13,R:13} },
  vibrio:{ AZM:{S:16,R:16}, CAZ:{S:22,R:22}, CIP:{S:23,R:23}, CTX:{S:21,R:21}, LVX:{S:23,R:23}, MEM:{S:24,R:24}, SXT:{S:21,R:21}, TZP:{S:26,R:26} },
  viridans:{ AMP:{S:21,R:15}, CTX:{S:23,R:23}, DA:{S:19,R:19}, FEP:{S:25,R:25}, PEN:{S:21,R:12}, TEC:{S:16,R:16}, VA:{S:15,R:15} },
};

/* Charge du disque, en µg (« 1 unit » pour la pénicilline G). */
const DISQUE = {
  acineto:{ AMK:"30", CIP:"5", GEN:"10", IPM:"10", LVX:"5", MEM:"10", SXT:"1.25-23.75" },
  campylo:{ CIP:"5", E:"15" },
  coryne:{ CIP:"5", DA:"2", LZD:"10", MXF:"5", PEN:"1 unit", RD:"5", VA:"5" },
  cperfringens:{ AMC:"2-1", AMP:"2", DA:"2", ETP:"10", IPM:"10", MEM:"10", MTZ:"5", PEN:"1 unit", TZP:"30-6", VA:"5" },
  entero:{ AMC:"20-10", AMK:"30", AMP:"10", CAZ:"10", CIP:"5", CTX:"5", ETP:"10", FDC:"30", FEP:"30", GEN:"10", LVX:"5", MEM:"10", TEM:"30", TZP:"30-6" },
  enteroc:{ AMP:"2", CIP:"5", IPM:"10", LVX:"5", LZD:"10", TEC:"30", TZP:"30-6", VA:"5" },
  haemo:{ AMC:"2-1", AMP:"2", CAF:"30", CIP:"5", CTX:"5", ETP:"10", FEP:"30", IPM:"10", LVX:"5", MEM:"10", MIN:"30", MXF:"5", RD:"5", SXT:"1.25-23.75", TZP:"30-6" },
  listeria:{ AMP:"2", E:"15", MEM:"10", PEN:"1 unit", SXT:"1.25-23.75" },
  moraxella:{ AMC:"2-1", CIP:"5", CTX:"5", E:"15", ETP:"10", FEP:"30", IPM:"10", LVX:"5", MEM:"10", MIN:"30", MXF:"5", SXT:"1.25-23.75" },
  morganella:{ AMC:"20-10", AMK:"30", AMP:"10", CAZ:"10", CIP:"5", CTX:"5", ETP:"10", FDC:"30", FEP:"30", GEN:"10", IPM:"10", LVX:"5", MEM:"10", TEM:"30", TZP:"30-6" },
  pneumo:{ AMP:"2", DA:"2", E:"15", LVX:"5", LZD:"10", MIN:"30", MXF:"5", RD:"5", SXT:"1.25-23.75", TEC:"30", VA:"5" },
  pseudo:{ AMK:"30", CAZ:"10", CIP:"5", FDC:"30", FEP:"30", IPM:"10", LVX:"5", MEM:"10", TZP:"30-6" },
  salmonella:{ AMC:"20-10", AMK:"30", AMP:"10", CAZ:"10", CTX:"5", ETP:"10", FDC:"30", FEP:"30", GEN:"10", LVX:"5", MEM:"10", TEM:"30", TZP:"30-6" },
  scn:{ AMK:"30", AMP:"2", CIP:"5", DA:"2", E:"15", GEN:"10", LVX:"5", LZD:"10", MIN:"30", MXF:"5", PEN:"1 unit", RD:"5", SXT:"1.25-23.75" },
  serratia:{ AMC:"20-10", AMK:"30", AMP:"10", CAZ:"10", CIP:"5", CTX:"5", ETP:"10", FDC:"30", FEP:"30", GEN:"10", LVX:"5", MEM:"10", MXF:"5", SXT:"1.25-23.75", TEM:"30", TZP:"30-6" },
  staph:{ AMK:"30", AMP:"2", CIP:"5", DA:"2", E:"15", GEN:"10", LVX:"5", LZD:"10", MIN:"30", MXF:"5", PEN:"1 unit", RD:"5", SXT:"1.25-23.75" },
  steno:{ SXT:"1.25-23.75" },
  strepacg:{ DA:"2", E:"15", LVX:"5", LZD:"10", MIN:"30", MXF:"5", PEN:"1 unit", RD:"5", SXT:"1.25-23.75", TEC:"30", VA:"5" },
  strepb:{ DA:"2", E:"15", LVX:"5", LZD:"10", MIN:"30", MXF:"5", PEN:"1 unit", RD:"5", SXT:"1.25-23.75", TEC:"30", VA:"5" },
  vibrio:{ AZM:"15", CAZ:"10", CIP:"5", CTX:"5", LVX:"5", MEM:"10", SXT:"1.25-23.75", TZP:"30-6" },
  viridans:{ AMP:"2", CTX:"5", DA:"2", FEP:"30", PEN:"1 unit", TEC:"30", VA:"5" },
};

/* LCR. L'EUCAST ne chiffre au disque qu'une poignée de couples ; pour le
   pneumocoque et pour Haemophilus il renvoie à la CMI. Le moteur doit
   alors REFUSER de catégoriser plutôt qu'appliquer le seuil ordinaire,
   qui serait trop permissif pour une méningite. */
const DZ_MENINGE = {
  acineto:{ MEM:{S:21,R:21} },
  entero:{ CTX:{S:20,R:20}, MEM:{S:22,R:22} },
  morganella:{ CTX:{S:20,R:20}, MEM:{S:22,R:22} },
  pseudo:{ MEM:{S:20,R:20} },
  salmonella:{ CTX:{S:20,R:20}, MEM:{S:22,R:22} },
  serratia:{ CTX:{S:20,R:20}, MEM:{S:22,R:22} },
};

/* Zone d'incertitude technique, au disque. Contrairement à la CMI, c'est
   un INTERVALLE de millimètres : entre ces deux bornes la lecture n'est
   pas reproductible. Noter que l'amoxicilline-acide clavulanique y figure
   alors qu'elle n'a pas de ZIT en CMI — l'incertitude est propre à la
   méthode, pas à la molécule. */
const ZIT_ZONE = {
  entero:{ AMC:[19,20], CIP:[22,24], FDC:[21,23], TZP:[19,19] },
  haemo:{ CTX:[25,27], FEP:[28,33], IPM:[6,19], TZP:[26,28] },
  morganella:{ AMC:[19,20], CIP:[22,24], FDC:[21,23], TZP:[19,19] },
  pseudo:{ FDC:[20,21], FEP:[19,23], TZP:[18,19] },
  salmonella:{ AMC:[19,20], FDC:[21,23], TZP:[19,19] },
  serratia:{ AMC:[19,20], CIP:[22,24], FDC:[21,23], TZP:[19,19] },
};

/* Le CA-SFM publie ses propres diamètres, que PhénoBac ne reprend pas :
   seules ses différences de CMI sont documentées dans ce dépôt. Là où il
   s'écarte de l'EUCAST sur un couple, appliquer quand même le diamètre
   EUCAST rendrait une catégorie qui n'est celle d'aucun des deux
   référentiels. Le moteur préfère ne rien rendre et le dire. */
function dzCasfmDivergent(group, k, ctx) {
  const c = ctx || {};
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
const DZ_TEMOIN = {
  entero:     { AMX: "AMP" }, salmonella: { AMX: "AMP" },
  morganella: { AMX: "AMP" }, serratia:   { AMX: "AMP" }
};

function getDZ(dzOverride, group, k, ctx) {
  const o = dzOverride && dzOverride[group + ":" + k];
  if (o && o.S !== undefined && o.R !== undefined) return o;   // saisie de l'utilisateur : prioritaire
  const c = ctx || {};
  const temoin = DZ_TEMOIN[group] && DZ_TEMOIN[group][k];
  if (temoin) return getDZ(dzOverride, group, temoin, c);
  if (estCasfm() && dzCasfmDivergent(group, k, c)) return null;
  if (c.mening === "Oui") {
    // Si le couple a un seuil méningé en CMI mais aucun au disque, c'est
    // que l'EUCAST l'interdit : ne pas retomber sur le seuil ordinaire.
    if (DZ_MENINGE[group] && DZ_MENINGE[group][k]) return DZ_MENINGE[group][k];
    if (BP_MENINGE[group] && BP_MENINGE[group][k]) return null;
  }
  return (DZ[group] && DZ[group][k]) || null;
}

/* ---------- Diamètre -> S/I/R ---------- */
// La charge du disque, en tenant compte du témoin (l'amoxicilline se lit
// sur le disque d'ampicilline).
function disquePour(group, k) {
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

function zitZonePour(dzOverride, group, k, ctx) {
  if (dzOverride && dzOverride[group + ":" + k]) return null;  // seuils saisis : la ZIT publiée ne s'y rapporte plus
  if (ctx && ctx.mening === "Oui") return null;                // lignes LCR : pas de ZIT publiée
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

  let results = {};
  _zit = [];
  _sansDisque = [];
  _depistage = null;
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
      const dz = getDZ(input.bpOverride || {}, org.bpGroup, k, input.ctx || {});
      const cat = catFromDiam(dia[k], dz);
      if (cat) results[k] = cat;
      // Un diamètre saisi que le moteur ne peut pas traduire ne doit PAS
      // disparaître en silence : le biologiste croirait l'antibiotique non
      // testé, alors qu'il l'a mesuré. On le lui dit, avec la raison.
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
  const A = ENGINE[org.engine](results, input.ctx || {}, org.args || {});
  // Lecture interprétative : les catégories rendues peuvent différer des
  // catégories brutes. Le client doit recevoir les deux, jamais l'une à la
  // place de l'autre — sans quoi on masquerait au biologiste ce qu'il a lu.
  const rendues = Object.assign({}, results);
  (A.rendu || []).forEach(x => { rendues[x.abx] = x.rendu; });
  return { interpretation: A, categories: results, rendues: rendues, referentiel: REFERENTIELS[_ref] };
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
  const isFree = (FREE_SPECIES === null)
    || (FREE_SPECIES.includes(body.organism) && String(body.mode || "sir") !== "mic");
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
    body: JSON.stringify({ valid: true, plan: (lic.valid && !revoked) ? lic.plan : "free", interpretation: out.interpretation, categories: out.categories, rendues: out.rendues, referentiel: out.referentiel || REFERENTIEL })
  };
};

// Exposé pour les tests hors-Netlify
if (typeof module !== "undefined") module.exports._engine = { runInterpretation, catFromMic, catFromDiam, parseDiam, getDZ, DZ, DISQUE, DZ_MENINGE, ZIT_ZONE, verify };
