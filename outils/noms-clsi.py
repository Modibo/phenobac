# -*- coding: utf-8 -*-
"""
noms-clsi.py — la correspondance entre les codes de PhénoBac et les noms du CLSI.

    python3 outils/noms-clsi.py

Ne modifie RIEN : produit un rapport, et sort en erreur s'il reste un code
dont le sort n'est pas décidé.

POURQUOI CE FICHIER EXISTE SÉPARÉMENT

Transcrire un référentiel commence par un travail qu'on est tenté de bâcler :
savoir de quoi on parle. Le M100 nomme 156 lignes distinctes dans ses seize
tables de seuils, mais ce ne sont pas 156 molécules. Ce sont les mêmes, avec :

    la casse          « Ceftriaxone » et « ceftriaxone », selon que le nom
                      ouvre une liste ou la poursuit ;
    l'astérisque      « Chloramphenicol* », qui marque un agent dont le CLSI
                      ne recommande pas l'usage en routine ;
    « (U)a »          à ne rendre que sur un prélèvement urinaire ;
    « (Inv.) »        investigationnel : pas un seuil de routine ;
    le site           « (meningitis) », « (nonmeningitis) » ;
    la voie           « (oral) », « (parenteral) » ;
    un rôle de test   « (surrogate test for oxacillin) ».

Ces qualificatifs ne sont pas du bruit : ils portent exactement ce que les
colonnes `site`, `conv` et `temoin` de PhénoBac portent déjà. Les écraser au
nettoyage reviendrait à transcrire la céfuroxime orale à la place de la
parentérale, ou un seuil urinaire comme un seuil systémique.

CE QUE CE FICHIER GARANTIT

Que chaque code d'antibiotique de la base ait un sort DÉCIDÉ et écrit :
soit un nom CLSI, soit une raison documentée de n'en pas avoir. Un code
oublié ici deviendrait un couple silencieusement absent du référentiel
CLSI — et l'absence silencieuse est le défaut que ce dépôt passe son temps
à traquer.

LA CORRESPONDANCE N'EST PAS LA TRANSCRIPTION. Savoir que « GEN » se dit
« Gentamicin » ne dit rien des seuils. Ce fichier ne porte aucune valeur.
"""

import os
import re
import sys
import textwrap

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)


# --------------------------------------------------------------------------
# Les qualificatifs, retirés du nom et CONSERVÉS à part.
# --------------------------------------------------------------------------

QUALIFICATIFS = [
    (re.compile(r"\(U\)\s*a?", re.I),              "urinaire"),
    (re.compile(r"\(Inv\.\)", re.I),               "investigationnel"),
    (re.compile(r"\(meningitis\)", re.I),          "méningé"),
    (re.compile(r"\(nonmeningitis\)", re.I),       "non méningé"),
    (re.compile(r"\(oral[^)]*\)", re.I),           "oral"),
    (re.compile(r"\(parenteral\)", re.I),          "parentéral"),
    (re.compile(r"\(surrogate test[^)]*\)", re.I), "test de substitution"),
    (re.compile(r"\(high-level[^)]*\)", re.I),     "haut niveau"),
]


def normaliser(nom):
    """Rend (nom de base en minuscules, liste des qualificatifs)."""
    q = []
    s = nom
    for motif, etiquette in QUALIFICATIFS:
        if motif.search(s):
            q.append(etiquette)
            s = motif.sub(" ", s)
    s = s.replace("*", " ")
    s = re.sub(r"\s+", " ", s).strip(" ,.;").lower()
    return s, q


# --------------------------------------------------------------------------
# Les noms du CLSI, pour les codes que PhénoBac porte.
#
# Noms de molécules : ce sont des faits, pas l'expression propre du CLSI.
# Aucun seuil, aucun commentaire du document n'est reproduit ici.
# --------------------------------------------------------------------------

CORRESPONDANCE = {
    "amoxicillin-clavulanate":      "AMC",
    "amikacin":                     "AMK",
    "ampicillin":                   "AMP",
    "amoxicillin":                  "AMX",
    "aztreonam":                    "ATM",
    "azithromycin":                 "AZM",
    "chloramphenicol":              "CAF",
    "ceftazidime":                  "CAZ",
    "cefixime":                     "CFM",
    "ciprofloxacin":                "CIP",
    "colistin":                     "COL",
    "ceftriaxone":                  "CRO",
    "cefotaxime":                   "CTX",
    "clindamycin":                  "DA",
    "daptomycin":                   "DAP",
    "doxycycline":                  "DOX",
    "erythromycin":                 "E",
    "ertapenem":                    "ETP",
    "cefiderocol":                  "FDC",
    "cefepime":                     "FEP",
    "cefoxitin":                    "FOX",
    "gentamicin":                   "GEN",
    "imipenem":                     "IPM",
    "levofloxacin":                 "LVX",
    "linezolid":                    "LZD",
    "meropenem":                    "MEM",
    "minocycline":                  "MIN",
    "metronidazole":                "MTZ",
    "moxifloxacin":                 "MXF",
    "ofloxacin":                    "OFX",
    "oxacillin":                    "OXA",
    "penicillin":                   "PEN",
    "rifampin":                     "RD",
    "trimethoprim-sulfamethoxazole": "SXT",
    "teicoplanin":                  "TEC",
    "tetracycline":                 "TET",
    "tobramycin":                   "TOB",
    "piperacillin-tazobactam":      "TZP",
    "vancomycin":                   "VA",
    # molécules de l'antibiogramme urinaire, que PhénoBac nomme sans leur
    # donner de seuil : le CLSI les porte, et la correspondance doit tenir
    # le jour où elles en recevront un.
    "mecillinam":                   "MEC",
    "nitrofurantoin":               "NIT",
    "trimethoprim":                 "TMP",
    "kanamycin":                    "KAN",
    "fosfomycin":                   "FOS",
    "pefloxacin":                   "PEF",
}

# --------------------------------------------------------------------------
# Les codes dont le sort est décidé AUTREMENT qu'en nommant une ligne des
# tables de seuils. Chacun porte sa raison : c'est ce qui distingue une
# absence constatée d'une absence oubliée.
# --------------------------------------------------------------------------

HORS_TABLES_DE_SEUILS = {
    "HLG": ("Table 3L", "Le haut niveau d'aminosides chez l'entérocoque n'est "
                        "pas une concentration critique mais un DÉPISTAGE, et "
                        "le CLSI le place dans la série des tables 3. "
                        "Correspond à la convention `dep` de PhénoBac."),
}

SANS_EQUIVALENT = {
    "TEM": ("La témocilline n'apparaît dans aucune table du M100. Elle est "
            "peu employée hors d'Europe du Nord, et le CLSI ne lui donne pas "
            "de seuil. Le couple restera sans valeur sous CLSI."),
}

# --------------------------------------------------------------------------
# Des faits de structure, qui ne sont pas des correspondances de noms mais
# qui commandent la transcription. Écrits ici parce que c'est en établissant
# la correspondance qu'on les découvre.
# --------------------------------------------------------------------------

PARTICULARITES = [
    ("AMX", "L'amoxicilline n'est PAS testée chez les entérobactéries : le "
            "CLSI la fait prédire par l'ampicilline. Elle n'a de ligne propre "
            "que chez le pneumocoque. Sous CLSI, AMX devra se déduire d'AMP "
            "pour les groupes concernés — le mécanisme CAT_DEDUITE existe."),
    ("TEC", "La teicoplanine est marquée « (Inv.) », investigationnelle, dans "
            "les deux tables où elle paraît. À ne pas rendre comme un seuil "
            "de routine."),
    ("PEN", "Le pneumocoque porte QUATRE pénicillines distinctes : parentérale "
            "méningée, parentérale non méningée, et orale (pénicilline V). "
            "Les tables par site de PhénoBac savent le représenter."),
    ("OXA", "Le découpage par espèce du CLSI ne recouvre pas celui de "
            "PhénoBac : S. lugdunensis est traité comme S. aureus, "
            "S. epidermidis a ses propres seuils, et les autres staphylocoques "
            "passent par la céfoxitine. Voir REFERENTIEL-CLSI.md."),
    ("VA", "Deux portées seulement chez le staphylocoque : S. aureus, et "
           "« SOSA » — Staphylococcus species other than S. aureus."),
    ("DA", "La clindamycine inductible (test D) est en Table 3J, hors des "
           "tables de seuils."),
]


def codes_de_la_base():
    """Les codes d'antibiotiques que la base porte réellement."""
    import moteur_py as MP                                    # noqa: E402
    t = MP.tables(["BP", "DZ", "ABXNAME"])
    codes = set()
    for nom in ("BP", "DZ"):
        for groupe, molecules in t[nom].items():
            codes |= set(molecules)
    return codes, set(t["ABXNAME"])


def main():
    avec_seuil, nommes = codes_de_la_base()
    tous = avec_seuil | nommes
    decides = set(CORRESPONDANCE.values()) | set(HORS_TABLES_DE_SEUILS) \
        | set(SANS_EQUIVALENT)

    print("CORRESPONDANCE DES NOMS — PhénoBac ↔ CLSI M100 Ed36:2026")
    print()
    print("  codes portant un seuil dans la base : %d" % len(avec_seuil))
    print("  codes nommés par le moteur          : %d" % len(nommes))
    print("  codes dont le sort est décidé ici   : %d" % len(decides))
    print()

    orphelins = sorted(tous - decides)
    if orphelins:
        print("  CODES SANS SORT DÉCIDÉ : %s" % ", ".join(orphelins))
        print()
        print("  Chacun doit recevoir soit un nom dans CORRESPONDANCE, soit")
        print("  une entrée dans HORS_TABLES_DE_SEUILS ou SANS_EQUIVALENT,")
        print("  avec sa raison. Sans quoi il deviendra, le jour de la")
        print("  transcription, une absence silencieuse.")
    else:
        print("  Tous les codes ont un sort décidé.")

    fantomes = sorted(set(CORRESPONDANCE.values()) - tous)
    if fantomes:
        print()
        print("  NOMMÉS ICI MAIS INCONNUS DE LA BASE : %s" % ", ".join(fantomes))

    # Abréger « à la première ponctuation » coupait au milieu de « (Inv. »
    # et de « S. aureus » : on replie la phrase entière.
    def bloc(code, texte, marge="         "):
        lignes = textwrap.wrap(texte, 68)
        print("    %-5s%s" % (code, lignes[0] if lignes else ""))
        for l in lignes[1:]:
            print(marge + l)

    print()
    print("  Hors des tables de seuils :")
    for code, (ou, pourquoi) in sorted(HORS_TABLES_DE_SEUILS.items()):
        bloc(code, ou + " — " + pourquoi)
    print()
    print("  Sans équivalent CLSI :")
    for code, pourquoi in sorted(SANS_EQUIVALENT.items()):
        bloc(code, pourquoi)
    print()
    print("  Particularités à porter dans la transcription : %d"
          % len(PARTICULARITES))
    for code, texte in PARTICULARITES:
        bloc(code, texte)
    print()
    print("  CE CONTRÔLE NE REGARDE QUE DANS UN SENS : de PhénoBac vers le")
    print("  CLSI. L'autre sens — une molécule du M100 que PhénoBac ignore —")
    print("  demande le JSON extrait, et appartient à comparer-clsi.py.")

    print()
    print("  Aucun fichier n'a été modifié. Toute correction doit être validée")
    print("  par un biologiste avant d'être portée dans le code.")
    return 1 if orphelins or fantomes else 0


if __name__ == "__main__":
    sys.exit(main())
