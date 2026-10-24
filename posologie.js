/* posologie.js — engendré par outils/extraire-posologie.py. NE PAS ÉDITER À LA MAIN.
   Source : EUCAST, Clinical Breakpoint Tables v16.1, valides depuis le
   2026-06-24, « Dosages used to define breakpoints », pages 9 à 13.

   « forte: null » signifie que l'EUCAST NE DÉFINIT PAS de posologie forte
   pour cette molécule — ce n'est pas une donnée manquante. Une catégorie I
   n'y a donc pas de traduction posologique, et l'application doit le dire
   plutôt que d'inventer un schéma. */
(function (racine) {
"use strict";
var POSOLOGIE = {
  AMC: [
    { voie: "Amoxicillin-clavulanic acid iv", standard: "(1 g amoxicillin + 0.2 g clavulanic acid) x 3-4 iv", forte: "(2 g amoxicillin + 0.2 g clavulanic acid) x 3 iv", urinaire: null, particulier: null },
    { voie: "Amoxicillin-clavulanic acid oral", standard: "(0.5 g amoxicillin + 0.125 g clavulanic acid) x 3 oral", forte: "(0.875 g amoxicillin + 0.125 g clavulanic acid) x 3 oral", urinaire: "(0.5 g amoxicillin + 0.125 g clavulanic acid) x 3 oral", particulier: "Amoxicillin-clavulanic acid has separate breakpoints for systemic infections and uncomplicated UTI. When amoxicillin-clavulanic acid is reported for uncomplicated UTI, the report must make clear that the susceptibility category is only valid for uncomplicated UTI." },
  ],
  AMK: [
    { voie: "Amikacin", standard: "25-30 mg/kg x 1 iv", forte: null, urinaire: null, particulier: null },
  ],
  AMP: [
    { voie: "Ampicillin iv", standard: "2 g x 3 iv", forte: "2 g x 4 iv", urinaire: null, particulier: "Meningitis: 2 g x 6 iv" },
  ],
  AMX: [
    { voie: "Amoxicillin iv", standard: "1 g x 3-4 iv", forte: "2 g x 6 iv", urinaire: null, particulier: "Meningitis: 2 g x 6 iv" },
    { voie: "Amoxicillin oral", standard: "0.5 g x 3 oral", forte: "0.75-1 g x 3 oral", urinaire: "0.5 g x 3 oral", particulier: null },
  ],
  AZM: [
    { voie: "Azithromycin", standard: "0.5 g x 1 oral or 0.5 g x 1 iv", forte: null, urinaire: null, particulier: "Uncomplicated gonorrhoea: 2 g oral as a single dose" },
  ],
  CAF: [
    { voie: "Chloramphenicol", standard: "1 g x 4 oral or 1 g x 4 iv", forte: "2 g x 4 oral or 2 g x 4 iv", urinaire: null, particulier: "Meningitis : 2 g x 4 iv" },
  ],
  CAZ: [
    { voie: "Ceftazidime", standard: "1 g x 3 iv", forte: "2 g x 3 iv or 1 g x 6 iv", urinaire: null, particulier: null },
  ],
  CIP: [
    { voie: "Ciprofloxacin", standard: "0.5 g x 2 oral or 0.4 g x 2 iv", forte: "0.75 g x 2 oral or 0.4 g x 3 iv", urinaire: null, particulier: "Meningitis: 0.4 g x 3 iv" },
  ],
  COL: [
    { voie: "Colistin", standard: "4.5 MU x 2 iv with a loading dose of 9 MU", forte: null, urinaire: null, particulier: null },
  ],
  CTX: [
    { voie: "Cefotaxime", standard: "1 g x 3 iv", forte: "2 g x 3 iv", urinaire: null, particulier: "Meningitis: 2 g x 4 iv S. aureus: High dose only" },
  ],
  DA: [
    { voie: "Clindamycin", standard: "0.3 g x 2 oral or 0.6 g x 3 iv", forte: "Dosages vary by indication", urinaire: null, particulier: "The high exposure dosing regimen pertains to the severity of the infection or drug exposure at the site of infection." },
  ],
  DOX: [
    { voie: "Doxycycline", standard: "0.1 g x 1 oral", forte: "Dosages vary by indication", urinaire: null, particulier: null },
  ],
  E: [
    { voie: "Erythromycin", standard: "0.5 g x 2-4 oral or 0.5 g x 2-4 iv", forte: "Dosages vary by indication", urinaire: null, particulier: null },
  ],
  ETP: [
    { voie: "Ertapenem", standard: "1 g x 1 iv over 30 minutes", forte: null, urinaire: null, particulier: null },
  ],
  FDC: [
    { voie: "Cefiderocol", standard: "2 g x 3 iv over 3 hours", forte: null, urinaire: null, particulier: null },
  ],
  FEP: [
    { voie: "Cefepime", standard: "1 g x 3 iv or 2 g x 2 iv", forte: "2 g x 3 iv", urinaire: null, particulier: "Severe P. aeruginosa infections: 2 g x 3 with extended 4-hour infusion S. aureus: High dose only" },
  ],
  FOS: [
    { voie: "Fosfomycin iv", standard: "16-18 g/day divided in 3-4 doses", forte: "Dosages vary by indication", urinaire: null, particulier: null },
    { voie: "Fosfomycin oral", standard: null, forte: null, urinaire: "3 g x 1 oral as a single dose", particulier: null },
  ],
  GEN: [
    { voie: "Gentamicin", standard: "6-7 mg/kg x 1 iv", forte: null, urinaire: null, particulier: null },
  ],
  IPM: [
    { voie: "Imipenem", standard: "0.5 g x 4 iv over 30 minutes", forte: "1 g x 4 iv over 30 minutes", urinaire: null, particulier: null },
  ],
  LVX: [
    { voie: "Levofloxacin", standard: "0.5 g x 1 oral or 0.5 g x 1 iv", forte: "0.5 g x 2 oral or 0.5 g x 2 iv", urinaire: null, particulier: null },
  ],
  LZD: [
    { voie: "Linezolid", standard: "0.6 g x 2 oral or 0.6 g x 2 iv", forte: null, urinaire: null, particulier: "Meningitis: 0.6 g x 2 iv" },
  ],
  MEM: [
    { voie: "Meropenem", standard: "1 g x 3 iv over 30 minutes", forte: "2 g x 3 iv over 3 hours", urinaire: null, particulier: "Meningitis: 2 g x 3 iv over 30 minutes (or 3 hours)" },
  ],
  MIN: [
    { voie: "Minocycline", standard: "0.1 g x 2 oral", forte: null, urinaire: null, particulier: null },
  ],
  MTZ: [
    { voie: "Metronidazole", standard: "0.4 g x 3 oral or 0.4 g x 3 iv", forte: "Dosages vary by indication", urinaire: null, particulier: null },
  ],
  MXF: [
    { voie: "Moxifloxacin", standard: "0.4 g x 1 oral or 0.4 g x 1 iv", forte: null, urinaire: null, particulier: "Meningitis: 0.4 g x 1 iv" },
  ],
  PEN: [
    { voie: "Benzylpenicillin", standard: "0.6 g (1 MU) x 4 iv", forte: "1.2 g (2 MU) x 6 iv", urinaire: null, particulier: "Meningitis: 2.4 g (4 MU) x 6 iv" },
  ],
  RD: [
    { voie: "Rifampicin", standard: "0.6 g x 1 oral or 0.6 g x 1 iv", forte: null, urinaire: null, particulier: null },
  ],
  SXT: [
    { voie: "Trimethoprim-sulfamethoxazole", standard: "(0.16 g trimethoprim + 0.8 g sulfamethoxazole) x 2 oral or (0.16 g trimethoprim + 0.8 g sulfamethoxazole) x 2 iv", forte: "(0.24 g trimethoprim + 1.2 g sulfamethoxazole) x 2 oral or (0.24 g trimethoprim + 1.2 g sulfamethoxazole) x 2 iv", urinaire: "(0.16 g trimethoprim + 0.8 g sulfamethoxazole) x 2 oral", particulier: "Meningitis : (5 mg/kg up to 0.48 g trimethoprim + 25 mg/kg up to 2.4 g sulfamethoxazole) x 3 iv" },
  ],
  TEC: [
    { voie: "Teicoplanin", standard: "0.4 g x 1 iv", forte: "Dosages vary by indication", urinaire: null, particulier: null },
  ],
  TEM: [
    { voie: "Temocillin", standard: "2 g x 2 iv", forte: "2 g x 3 iv", urinaire: null, particulier: "The 2 g x 2 iv dose has been used in the treatment of uncomplicated UTI caused by bacteria with beta-lactam resistance mechanisms." },
  ],
  TZP: [
    { voie: "Piperacillin-tazobactam", standard: "(4 g piperacillin + 0.5 g tazobactam) x 4 iv 30-minute infusion or x 3 iv by extended 4-hour infusion", forte: "(4 g piperacillin + 0.5 g tazobactam) x 4 iv by extended 3-hour infusion", urinaire: null, particulier: "A lower dosage of (4 g piperacillin + 0.5 g tazobactam) x 3 iv, 30-minute infusion, is adequate for some infections such as complicated UTI, intraabdominal infections and diabetic foot infections, but not for infections caused by isolates resistant to third- generation cephalosporins." },
  ],
  VA: [
    { voie: "Vancomycin", standard: "0.5 g x 4 iv or 1 g x 2 iv or 2 g x 1 by continuous infusion", forte: null, urinaire: null, particulier: "Based on body weight. Therapeutic drug monitoring should guide dosing." },
  ],
};
var POSOLOGIE_VERSION = "EUCAST 16.1 (2026-06-24)";
var P = { POSOLOGIE: POSOLOGIE, POSOLOGIE_VERSION: POSOLOGIE_VERSION };
if (typeof module !== "undefined" && module.exports) module.exports = P;
else racine.PhenoBacPosologie = P;
})(typeof self !== "undefined" ? self : this);
