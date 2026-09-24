# -*- coding: utf-8 -*-
"""
verifier-cq.py — la table de contrôle de qualité dit-elle encore ce que dit
le communiqué ?

    python3 outils/verifier-cq.py casfm_complet.txt

Deux contrôles, dont le second ne dépend pas du PDF :

  1. la table CQ de phenobac.html est identique à ce que outils/extraire-cq.py
     relit du communiqué (si le fichier texte est fourni) ;

  2. chaque CHARGE DE DISQUE annoncée au contrôle de qualité est celle des
     tables de seuils, extraites d'une tout autre source — le classeur de
     l'EUCAST. Deux documents indépendants qui s'accordent sur soixante-six
     charges, c'est la meilleure preuve de lecture correcte dont on dispose
     ici ; et un contrôle de qualité mené avec un disque d'une autre charge
     ne prouverait rien du tout.

Sans argument, seul le second contrôle est exécuté — il tourne donc en
intégration continue, où le PDF n'est pas déposé.
"""
import importlib.util
import os
import re
import subprocess
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)


def _module(nom, fichier):
    spec = importlib.util.spec_from_file_location(nom, os.path.join(ICI, fichier))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


VT = _module("verifier_tables", "verifier-tables.py")


def cibles(source):
    """{souche: (groupe, {code: (charge, cible, min, max)})}"""
    out = {}
    for m in re.finditer(r'(\w+)\s*:\s*\{\s*espece:"([^"]*)",\s*souche:"([^"]*)",\s*groupe:"(\w+)",'
                         r'\s*abx:\s*\{(.*?)\}\s*\}', source, re.S):
        abx = {}
        # L'accolade fermante de la DERNIÈRE entrée est mangée par la capture
        # du bloc : ne pas l'exiger ici, sinon une cible par souche échappe
        # au contrôle — sept sur quatre-vingt-neuf, en silence.
        for e in re.finditer(r'(\w+)\s*:\s*\{c:"([^"]*)",v:([\d.]+),min:(\d+),max:(\d+)', m.group(5)):
            abx[e.group(1)] = (e.group(2), float(e.group(3)), int(e.group(4)), int(e.group(5)))
        out[m.group(1)] = (m.group(4), abx)
    return out


def main():
    cli = os.path.join(RACINE, 'phenobac.html')
    bloc = VT.bloc_bp(cli, 'const CQ =')
    if bloc is None:
        print("Table CQ absente de phenobac.html.")
        return 1
    table = cibles(bloc)
    if not table:
        print("Table CQ illisible : le contrôle ne garantirait rien.")
        return 1
    # Un parseur qui en laisse passer une poignée ne le dit pas de lui-même.
    vues = sum(len(a) for _, a in table.values())
    ecrites = len(re.findall(r'\w+\s*:\s*\{c:"', bloc))
    if vues != ecrites:
        print("Le contrôle ne lit que %d des %d cibles écrites : il ne garantit pas le reste."
              % (vues, ecrites))
        return 1

    ecarts = []

    # ---- 1. concordance avec le communiqué, si on nous l'a donné ----
    if len(sys.argv) > 1:
        brut = subprocess.run([sys.executable, os.path.join(ICI, 'extraire-cq.py'), sys.argv[1]],
                              capture_output=True, text=True).stdout
        doc = cibles(brut)
        for s in sorted(set(table) | set(doc)):
            a = table.get(s, (None, {}))[1]
            b = doc.get(s, (None, {}))[1]
            for code in sorted(set(a) | set(b)):
                if a.get(code) != b.get(code):
                    ecarts.append("%s/%s : code %s, communiqué %s" % (s, code, a.get(code), b.get(code)))

    # ---- 2. les charges, confrontées aux tables de seuils ----
    srv = os.path.join(RACINE, 'netlify', 'functions', 'premium-interpret.js')
    DISQUE = VT.valeurs_texte(VT.bloc_bp(srv, 'const DISQUE ='))
    accord, hors = 0, 0
    for souche, (groupe, abx) in sorted(table.items()):
        for code, (charge, v, lo, hi) in sorted(abx.items()):
            ref = DISQUE.get(groupe, {}).get(code)
            if ref is None:
                hors += 1                      # couple sans seuil clinique au disque
            elif ref != charge:
                ecarts.append("%s/%s : charge %s au contrôle de qualité, %s dans la table des seuils"
                              % (souche, code, charge, ref))
            else:
                accord += 1
            # Une cible doit tomber au centre de ses limites, et l'intervalle
            # rester de l'ordre de ± 3 mm. Hors de là, c'est une colonne mal lue.
            if not (lo <= v <= hi):
                ecarts.append("%s/%s : cible %g hors de ses propres limites %d-%d" % (souche, code, v, lo, hi))
            elif abs(v - (lo + hi) / 2) > 1:
                ecarts.append("%s/%s : cible %g décentrée dans %d-%d" % (souche, code, v, lo, hi))
            elif not (4 <= hi - lo <= 9):
                ecarts.append("%s/%s : amplitude de %d mm, inhabituelle" % (souche, code, hi - lo))

    # ---- 3. couverture : ce qu'on sait rendre, sait-on le contrôler ? ----
    # Une molécule catégorisable au disque sans cible de contrôle est un trou :
    # le laboratoire pourrait rendre un résultat qu'il n'a aucun moyen de
    # valider. C'est ainsi que la gentamicine et le méropénème avaient disparu
    # de la table sans que rien ne le signale.
    DZ = VT.seuils(VT.bloc_bp(srv, 'const DZ ='))
    trous = []
    for souche, (groupe, abx) in sorted(table.items()):
        for code in sorted(DZ.get(groupe, {})):
            if code not in abx:
                trous.append("%s (%s) / %s" % (souche, groupe, code))

    if ecarts:
        print("Le contrôle de qualité DIVERGE :")
        for e in ecarts:
            print("  -", e)
        return 1

    total = sum(len(a) for _, a in table.values())
    print("%d cibles sur %d souches de référence." % (total, len(table)))
    print("%d charges de disque concordent avec les tables de seuils, issues du" % accord)
    print("classeur EUCAST — deux documents indépendants qui s'accordent.")
    if hors:
        print("%d couples n'ont pas de seuil clinique au disque : le contrôle de" % hors)
        print("qualité les couvre quand même, et c'est normal.")
    if len(sys.argv) > 1:
        print("Table identique à ce que le communiqué CA-SFM porte.")
    else:
        print("Communiqué non fourni : concordance avec le PDF non vérifiée cette fois.")
    if trous:
        print()
        print("%d couples sont catégorisables au disque sans cible de contrôle :" % len(trous))
        for x in trous:
            print("  ·", x)
        print("Ce n'est pas forcément une faute — le CA-SFM ne contrôle pas tout —")
        print("mais chacun mérite d'être confronté au chapitre 1.4 avant d'être admis.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
