# -*- coding: utf-8 -*-
"""
extraire-anaerobies.py — les tables d'anaérobies du classeur EUCAST.

POURQUOI UN OUTIL PLUTÔT QU'UNE RECOPIE

Les seuils de Prevotella et de Fusobacterium se lisent dans le classeur
officiel ; les recopier à la main, c'est se donner une chance sur quelques
dizaines de se tromper d'une dilution. Le 24 octobre 2026, quatre seuils de
Bacteroides fragilis se sont révélés faux de la sorte — plus permissifs que
le document, depuis on ne sait quand.

L'outil lit les blocs de la feuille, les traduit en lignes de
base-connaissances.js, et S'ARRÊTE si une section attendue manque. Il
n'écrit rien : il imprime, et c'est un humain qui colle.

    python3 outils/extraire-anaerobies.py <classeur.xlsx> [Prevotella spp.]
"""
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)
from classeur import Classeur                                 # noqa: E402

# Nom EUCAST -> code PhénoBac. Ce qui n'y figure pas n'est pas testé par
# PhénoBac, et c'est une réponse : l'ampicilline-sulbactam, par exemple.
AGENTS = {
    "benzylpenicillin": "PEN", "ampicillin": "AMP", "amoxicillin": "AMX",
    "amoxicillin-clavulanic acid": "AMC", "piperacillin-tazobactam": "TZP",
    "ertapenem": "ETP", "imipenem": "IPM", "meropenem": "MEM",
    "clindamycin": "DA", "metronidazole": "MTZ", "vancomycin": "VA",
    "moxifloxacin": "MXF", "chloramphenicol": "CAF",
}

# Les sections à extraire, et le groupe de seuils PhénoBac correspondant.
# Les sections à extraire, le groupe de seuils PhénoBac, et l'espèce visée
# quand une section en couvre plusieurs.
#
# DEUX GROUPES POUR FUSOBACTERIUM, ET C'EST VOULU. La section couvre
# F. necrophorum ET F. nucleatum, mais le document les SÉPARE sur deux
# molécules : l'amoxicilline-acide clavulanique et la pipéracilline-tazobactam
# sont chiffrées pour le premier et renvoyées à une note pour le second. Un
# seul groupe appliquerait les seuils de l'un à l'autre — « un chiffre juste
# au mauvais endroit », le défaut le plus difficile à repérer.
SECTIONS = [
    ("Anaerobic bacteria_G-negative", "Prevotella spp.", "prevotella", None),
    ("Anaerobic bacteria_G-negative",
     "Fusobacterium necrophorum and Fusobacterium nucleatum",
     "fnecrophorum", "necrophorum"),
    ("Anaerobic bacteria_G-negative",
     "Fusobacterium necrophorum and Fusobacterium nucleatum",
     "fnucleatum", "nucleatum"),
]


def joli(x):
    """20.0 s'écrit 20 : un seuil recopié se relit, et « 20.0 » accroche l'œil
    pour rien."""
    return str(int(x)) if x == int(x) else str(x)


def nombre(v):
    """Le chiffre d'une cellule, ou None — « IE », « Note » et « – » n'en
    sont pas, et les confondre avec zéro serait inventer un seuil."""
    if v is None:
        return None
    t = str(v).strip().replace(",", ".").strip("()")
    if not t or not re.match(r"^\d+(\.\d+)?$", t):
        return None
    return float(t)


def bloc(lignes, titre):
    """Les lignes du tableau qui suit ce titre, et elles seules."""
    seule = lambda c: (c.get('A', '').strip() and len([k for k in c if k != 'A']) == 0)
    debut = None
    for i, cel in enumerate(lignes):
        nom = re.sub(r"\s+", " ", cel.get('A', '')).strip()
        if seule(cel) and nom == titre:
            debut = i
            break
    if debut is None:
        raise SystemExit("EXTRACTION INTERROMPUE — section « %s » introuvable. "
                         "Le classeur a changé de structure ; mieux vaut ne rien "
                         "produire que produire à côté." % titre)
    out = []
    for cel in lignes[debut + 1:]:
        nom = re.sub(r"\s+", " ", cel.get('A', '')).strip()
        if seule(cel) and nom != titre:
            break                                   # section suivante
        if nom and not seule(cel):
            out.append((nom, cel))
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__.strip().splitlines()[-1], file=sys.stderr)
        return 2
    c = Classeur(sys.argv[1])
    vise = sys.argv[2] if len(sys.argv) > 2 else None

    for feuille, titre, groupe, espece_visee in SECTIONS:
        if vise and titre != vise:
            continue
        print("\n// --- %s%s (EUCAST v16.1) ---"
              % (titre, " — F. %s" % espece_visee if espece_visee else ""))
        n = 0
        for nom, cel in bloc(c.lignes(feuille), titre):
            base = re.sub(r"\s*[,(].*$", "", nom).strip().lower()
            code = AGENTS.get(base)
            if not code:
                print("//   %-46s — non testé par PhénoBac" % nom[:46])
                continue
            # Une ligne propre à une espèce du couple ne vaut QUE pour elle.
            m = re.search(r",\s*F\.\s*(\w+)", nom)
            espece = ""
            if m:
                if espece_visee and m.group(1).lower() != espece_visee:
                    continue                      # ligne d'une autre espèce
                espece = "   // propre à F. %s" % m.group(1)
            sM, rM = nombre(cel.get('B')), nombre(cel.get('C'))
            sD, rD = nombre(cel.get('F')), nombre(cel.get('G'))
            charge = (str(cel.get('E')).strip() if cel.get('E') else None)
            if sM is not None:
                print('["eucast","%s","%s","cmi","standard",%s,%s,undefined,undefined,'
                      'undefined,undefined,undefined,undefined,undefined],%s'
                      % (groupe, code, joli(sM), joli(rM) if rM is not None else "undefined", espece))
                n += 1
            if sD is not None and charge:
                print('["eucast","%s","%s","disque","standard",%s,%s,"%s",undefined,'
                      'undefined,undefined,undefined,undefined,undefined],%s'
                      % (groupe, code, joli(sD), joli(rD) if rD is not None else "undefined",
                         charge, espece))
                n += 1
            if sM is None and sD is None:
                print("//   %-46s — le document ne chiffre pas (« %s »)"
                      % (nom[:46], str(cel.get('B') or "–").strip()[:10]))
        print("// %d règle(s) pour le groupe « %s »." % (n, groupe))
    return 0


if __name__ == '__main__':
    sys.exit(main())
