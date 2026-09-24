# -*- coding: utf-8 -*-
"""
extraire-diametres.py — produit la table des DIAMÈTRES critiques à partir du
tableau EUCAST officiel.

    python3 outils/extraire-diametres.py v_16.1_Breakpoint_Tables.xlsx

Écrit la table sur la sortie standard ; rien n'est modifié dans le dépôt. Les
valeurs se relisent avant d'être portées dans le code, comme pour les CMI.

Pourquoi les diamètres comptent ici : un laboratoire sans automate lit son
antibiogramme au pied à coulisse, en millimètres. Lui demander une catégorie
S/I/R, c'est lui demander de faire lui-même la conversion — l'étape que
l'outil existe précisément pour lui épargner.

Deux pièges propres aux diamètres :

  1. le sens est INVERSÉ. En CMI, « petit » veut dire sensible ; en diamètre,
     c'est « grand ». Un seuil lu à l'envers transforme chaque sensible en
     résistant, sans qu'aucune erreur ne soit visible ;

  2. la CHARGE DU DISQUE fait partie du seuil. 23 mm ne veut rien dire sans
     savoir si le disque portait 10 ou 30 µg. La charge est donc extraite avec
     la valeur, et affichée à côté d'elle.

La colonne E du classeur porte la charge, F le seuil « S ≥ » et G le « R < ».
Les mêmes précautions que pour les CMI s'appliquent : appels de notes en
exposant collés aux valeurs, lignes multiples par voie et indication, lignes
propres à une espèce au sein d'une feuille partagée.
"""
import sys, os, re, importlib.util

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)
from classeur import Classeur


def _module(nom, fichier):
    spec = importlib.util.spec_from_file_location(nom, os.path.join(ICI, fichier))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# Les correspondances agent -> code et groupe -> feuille sont déjà établies et
# éprouvées par le comparateur des CMI : on ne les réécrit pas.
CE = _module("comparer_eucast", "comparer-eucast.py")

ESPECES = {
    'salmonella': r'Salmonella', 'morganella': r'\bMorganellaceae\b(?!.*except)',
    'serratia': r'Serratia', 'staph': r'S\. aureus',
    'scn': r'[Cc]oagulase-negative', 'strepacg': r'groups A, C and G',
    'strepb': r'S\.\s*agalactiae', 'campylo': r'C\. jejuni',
    # Deux feuilles opposent la ligne de l'espèce à un rattrapage pour le
    # reste du genre (« other enterococci », « Pseudomonas other than
    # aeruginosa »). PhénoBac interprète les espèces nommées : c'est leur
    # ligne qui fait foi, et la valeur du rattrapage n'est pas la même.
    'enteroc': r'E\. faecalis|E\. faecium', 'pseudo': r'P\. aeruginosa',
}
PARTICULIER = r'\bscreen only\b|endocarditis|meningitis'


def nombre(txt):
    """Valeur en mm. Les parenthèses signalent un seuil « entre crochets »
    chez l'EUCAST — la valeur reste la valeur."""
    if txt is None:
        return None
    s = str(txt).strip().replace('(', '').replace(')', '')
    m = re.match(r'^(\d+(?:\.\d+)?)', s)
    return float(m.group(1)) if m else None


def extraire(chemin, meningite=False, atu=False):
    cl = Classeur(chemin)
    table, charges, ecartes = {}, {}, []

    for groupe, (_especes, feuilles) in sorted(CE.GROUPES.items()):
        if len(feuilles) != 1:
            ecartes.append("%s : couvre %d feuilles, non comparable" % (groupe, len(feuilles)))
            continue
        lignes = [dict(c) for c in cl.lignes(feuilles[0])]

        # Les feuilles d'anaérobies empilent plusieurs genres, séparés par une
        # ligne ne portant QUE le nom du genre. Sans cette découpe, on ramasse
        # la feuille entière et l'on croit voir neuf valeurs possibles là où il
        # n'y en a qu'une.
        section = CE.SECTIONS.get(groupe)
        if section:
            garde, dedans = [], False
            for cel in lignes:
                nom = (cel.get('A') or '').replace("\n", " ").strip()
                seul = nom and len([k for k in cel if k != 'A']) == 0
                if seul:
                    dedans = (nom == section); continue
                if dedans:
                    garde.append(cel)
            lignes = garde

        for c in lignes:
            c['_nom'] = re.sub(r'\s+', ' ', c.get('A', '')).strip()

        for code, motif in sorted(CE.AGENTS.items()):
            if meningite:
                # Le LCR a ses propres lignes. Là où l'EUCAST écrit « Note »
                # ou « IE » au lieu d'un nombre — pneumocoque, Haemophilus —
                # c'est que la diffusion ne se juge pas au disque : ces
                # couples ressortent absents, et c'est le résultat attendu.
                cands = [c for c in lignes
                         if c['_nom'] and re.search(motif, c['_nom'], re.I)
                         and re.search(r'meningitis', c['_nom'], re.I)
                         and not re.search(r'other than', c['_nom'], re.I)]
            else:
                cands = [c for c in lignes
                         if c['_nom'] and re.search(motif, c['_nom'], re.I)
                         and not (re.search(PARTICULIER, c['_nom'], re.I)
                                  and not re.search(r'other than|all indications|including', c['_nom'], re.I))]
            if not cands:
                continue
            motif_esp = ESPECES.get(groupe)
            propres = [c for c in cands if motif_esp and re.search(motif_esp, c['_nom'])]
            if propres:
                retenues = propres
            else:
                autres = [m for g, m in ESPECES.items() if g != groupe and g in CE.GROUPES]

                # « Enterobacterales except Serratia spp. » NOMME Serratia pour
                # l'exclure : la ligne parle donc bien de mon groupe. Sans ce
                # garde, elle était écartée, et le cotrimoxazole disparaissait
                # de la table des entérobactéries sans que rien ne le signale.
                def cite_une_autre(nom):
                    for m in autres:
                        for occ in re.finditer(m, nom):
                            avant = nom[max(0, occ.start() - 12):occ.start()]
                            if not re.search(r'except\s*$', avant, re.I):
                                return True
                    return False

                retenues = [c for c in cands if not cite_une_autre(c['_nom'])]

            # Conventions déjà retenues pour les CMI : la voie intraveineuse et
            # l'infection systémique font référence, un antibiogramme étant
            # rendu sans connaître la voie ni le site.
            # « Pseudomonas other than P. aeruginosa » nomme mon espèce pour
            # l'exclure : la chercher ne suffit donc pas, il faut écarter les
            # lignes de rattrapage avant de comparer les valeurs.
            rattrapage = [r',\s*other\b']
            if motif_esp:
                rattrapage.append(r'other than\s+' + motif_esp)

            for ecarte in rattrapage + [r'urinary|uncomplicated UTI', r'\boral\b']:
                reste = [c for c in retenues if not re.search(ecarte, c['_nom'], re.I)]
                if reste:
                    retenues = reste

            # Chez les entérobactéries, la ligne de mon genre l'emporte et
            # celles des autres genres sont écartées.
            GENRES = {'salmonella': 'Salmonella', 'morganella': 'Morganellaceae', 'serratia': 'Serratia'}
            if groupe in ('entero',) + tuple(GENRES):
                mien = GENRES.get(groupe)
                autres = [v for k, v in GENRES.items() if k != groupe]
                def garder(nom):
                    if mien and re.search(mien, nom, re.I) and not re.search(r'except', nom, re.I):
                        return True
                    for a2 in autres:
                        if re.search(a2, nom, re.I) and not re.search(r'except\s+' + a2, nom, re.I):
                            return False
                    if mien and re.search(r'except\s+' + mien, nom, re.I):
                        return False
                    return True
                reste = [c for c in retenues if garder(c['_nom'])]
                if reste:
                    retenues = reste

            valeurs = set()
            for c in retenues:
                if atu:
                    # La zone d'incertitude au disque est un INTERVALLE
                    # (« 22-24 »), là où la CMI n'a qu'une valeur. Un seul
                    # nombre vaut intervalle d'un millimètre.
                    h = str(c.get('H') or '').strip()
                    m = re.match(r'^(\d+)\s*[-–]\s*(\d+)$', h) or re.match(r'^(\d+)$', h)
                    if not m:
                        continue
                    lo = float(m.group(1)); hi = float(m.group(2) if m.lastindex > 1 else m.group(1))
                    valeurs.add((lo, hi, str(c.get('E') or '').strip()))
                    continue
                s, r = nombre(c.get('F')), nombre(c.get('G'))
                if s is None or r is None:
                    continue
                # 50 mm est la convention EUCAST pour « aucune catégorie
                # sensible » : un tel diamètre ne s'obtient pas. On le note
                # None, comme le 0,001 des CMI, pour que le moteur le
                # reconnaisse plutôt que de le comparer bêtement.
                valeurs.add((None if s >= 50 else s, r, str(c.get('E') or '').strip()))
            # Plusieurs lignes portant la même valeur ne font pas une ambiguïté.
            distinctes = {(s, r) for s, r, _ in valeurs}
            if len(distinctes) == 1:
                s, r = distinctes.pop()
                disque = sorted({d for _, _, d in valeurs if d})
                disque = disque[0] if disque else ""
                table.setdefault(groupe, {})[code] = (None if s is None else int(s), int(r))
                if disque:
                    charges.setdefault(groupe, {})[code] = disque
            elif len(distinctes) > 1:
                ecartes.append("%s/%s : %d valeurs possibles (%s) — à arbitrer"
                               % (groupe, code, len(distinctes),
                                  " ; ".join("%s/%d" % ("—" if s is None else int(s), int(r))
                                             for s, r in sorted(distinctes, key=lambda v: (v[0] is None, v[0] or 0)))))
    return table, charges, ecartes


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    table, charges, ecartes = extraire(sys.argv[1])
    mening, _chm, _ecm = extraire(sys.argv[1], meningite=True)
    atu, _cha, _eca = extraire(sys.argv[1], atu=True)

    n = sum(len(v) for v in table.values())
    print("/* Diamètres critiques, en millimètres — EUCAST v16.1.")
    print("   ATTENTION au sens : S si diamètre ≥ S, R si diamètre < R.")
    print("   C'est l'inverse des CMI, et une lecture à l'envers rendrait")
    print("   résistante toute souche sensible sans rien signaler.")
    print("   Produit par outils/extraire-diametres.py — %d seuils. */" % n)
    print("const DZ = {")
    for g in sorted(table):
        paires = ", ".join("%s:{S:%s,R:%d}" % (c, "null" if s is None else s, r)
                           for c, (s, r) in sorted(table[g].items()))
        print("  %s:{ %s }," % (g, paires))
    print("};")
    print()
    print("/* Charge du disque. Un diamètre ne veut rien dire sans elle. */")
    print("const DISQUE = {")
    for g in sorted(charges):
        paires = ", ".join('%s:"%s"' % (c, d) for c, d in sorted(charges[g].items()))
        print("  %s:{ %s }," % (g, paires))
    print("};")

    print()
    print("/* LCR. L'EUCAST ne chiffre au disque qu'une poignée de couples ;")
    print("   pour le pneumocoque et Haemophilus il renvoie à la CMI, et le")
    print("   moteur doit alors refuser de catégoriser plutôt que d'appliquer")
    print("   le seuil ordinaire, trop permissif pour une méningite. */")
    print("const DZ_MENINGE = {")
    for g in sorted(mening):
        paires = ", ".join("%s:{S:%s,R:%d}" % (c, "null" if s is None else s, r)
                           for c, (s, r) in sorted(mening[g].items()))
        print("  %s:{ %s }," % (g, paires))
    print("};")

    print()
    print("/* Zone d'incertitude technique, au disque. Contrairement à la CMI,")
    print("   c'est un INTERVALLE de millimètres : entre ces deux bornes la")
    print("   lecture n'est pas reproductible, et la catégorie rendue doit être")
    print("   accompagnée de l'avertissement, jamais rendue seule. */")
    print("const ZIT_ZONE = {")
    for g in sorted(atu):
        paires = ", ".join("%s:[%d,%d]" % (c, lo, hi) for c, (lo, hi) in sorted(atu[g].items()))
        print("  %s:{ %s }," % (g, paires))
    print("};")

    if ecartes:
        print("\n/* À ARBITRER — non repris dans la table :", file=sys.stderr)
        for e in ecartes:
            print("     " + e, file=sys.stderr)
        print("*/", file=sys.stderr)
    print("\n// %d seuils sur %d groupes." % (n, len(table)), file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
