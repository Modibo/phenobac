# -*- coding: utf-8 -*-
"""
verifier-posologie.py — la table des posologies dit-elle ce que dit le document ?

LE DÉFAUT QUE CE CONTRÔLE EXISTE POUR ATTRAPER

PhénoBac affiche, sous chaque molécule catégorisée, LA POSOLOGIE QUI A SERVI À
DÉFINIR LE SEUIL. C'est ce qui donne son sens à la catégorie « I » : « sensible
à forte exposition » ne veut rien dire si l'on ne sait pas quelle exposition.
Un schéma faux ne se verrait pas — il est plausible par construction, et
personne ne le confronte au document en lisant un compte rendu.

ET LE CAHIER DES CHARGES ANNONÇAIT CE CONTRÔLE DEPUIS LE DÉBUT.
CAHIER-RENDU-ET-POSOLOGIE.md, § A.7 : « outils/verifier-posologie.py : la
table bâtie correspond exactement au PDF extrait, molécule par molécule, dans
les deux sens. » Le fichier n'existait pas. Un cahier qui promet une garantie
que personne ne fournit est pire qu'un cahier muet : on la croit acquise.
Écrit le 2026-11-06.

CE QU'IL CONFRONTE

posologie.js est engendré depuis le PDF du classeur (pages 9 à 13). Le même
document existe en xlsx, feuille « Dosages », dont les colonnes correspondent
une à une aux champs de la table :

    A  le libellé de la molécule        -> « voie »
    B  Standard dosage                  -> « standard »
    C  High dosage                      -> « forte »
    D  Uncomplicated UTI                -> « urinaire »
    E  Special situations               -> « particulier »

Confronter les deux rendus du même document attrape ce qu'une relecture ne
voit pas : une ligne sautée, une colonne décalée, un « None » pris pour une
valeur.

LES ÉCARTS DE TYPOGRAPHIE NE SONT PAS DES ÉCARTS DE FOND, ET SE COMPTENT À PART

Lire un PDF laisse des marques que le xlsx n'a pas : une espace avant un
deux-points, une césure de fin de ligne restée au milieu d'un mot
(« third- generation »). Les confondre avec une vraie divergence ferait crier
l'outil sur trois lignes justes, et un outil qui accuse à tort finit désarmé.
Elles sont donc NORMALISÉES pour la comparaison, puis COMPTÉES et AFFICHÉES —
et leur nombre ne doit pas monter.

    python3 outils/verifier-posologie.py [chemin/vers/v_16.1_Breakpoint_Tables.xlsx]

Sans argument, l'outil cherche le classeur aux emplacements habituels et, s'il
ne le trouve pas, le dit et s'arrête sans rien conclure : il n'est pas dans la
chaîne d'intégration continue pour cette raison.

HORS INTÉGRATION CONTINUE : il lui faut le classeur officiel de l'EUCAST, qui
n'est pas dans le dépôt et que le serveur de l'EUCAST ne laisse pas télécharger
automatiquement. Il se lance à la main, le document sous les yeux, et son
résultat se consigne dans CONFRONTATIONS.md — où verifier-confrontations.py
surveille l'empreinte de la table.
"""
import json
import os
import re
import subprocess
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
sys.path.insert(0, ICI)

# Le nombre d'écarts purement typographiques relevé le 2026-11-06. Il ne doit
# que DESCENDRE : un quatrième signalerait soit une nouvelle marque du lecteur
# de PDF, soit une vraie divergence qu'on aurait rangée au mauvais endroit.
PLAFOND_TYPO = 3

CHEMINS = [
    os.path.join(os.path.expanduser("~"), "Library", "CloudStorage",
                 "OneDrive-Personnel", "Bureau", "v_16.1_Breakpoint_Tables.xlsx"),
    os.path.join(RACINE, "v_16.1_Breakpoint_Tables.xlsx"),
]

CHAMPS = (("standard", "B"), ("forte", "C"),
          ("urinaire", "D"), ("particulier", "E"))


def espaces(t):
    """Un texte réduit à ses mots : c'est la comparaison de fond."""
    return re.sub(r"\s+", " ", str(t or "")).strip()


def sans_typographie(t):
    """Le même texte, débarrassé des marques du lecteur de PDF.

    Deux seulement, et elles sont nommées parce qu'une normalisation large
    masquerait des différences réelles :
      « Meningitis : »   -> « Meningitis: »   espace avant un deux-points
      « third- generation » -> « third-generation »   césure restée au milieu
    """
    t = re.sub(r"\s+:", ":", espaces(t))
    t = re.sub(r"(\w)-\s+(\w)", r"\1-\2", t)
    return t


def table_phenobac():
    """POSOLOGIE, lue du fichier tel que l'application l'exécute."""
    import moteur_py as MP
    t = MP.tables(["POSOLOGIE"]).get("POSOLOGIE")
    if t:
        return t
    # moteur_py ne charge que le moteur ; posologie.js est un module à part.
    lecteur = ('var m={exports:{}};(new Function("module","exports",'
               'readFile("posologie.js")))(m,m.exports);'
               'print(JSON.stringify(m.exports.POSOLOGIE));')
    jsc = ("/System/Library/Frameworks/JavaScriptCore.framework/"
           "Versions/A/Helpers/jsc")
    for cmd in (["node", "-e", lecteur.replace("readFile", "require('fs').readFileSync")
                 .replace('"posologie.js"', '"posologie.js","utf8"')],
                [jsc, "-e", lecteur]):
        if not (os.path.exists(cmd[0]) or cmd[0] == "node"):
            continue
        try:
            out = subprocess.run(cmd, cwd=RACINE, capture_output=True,
                                 text=True, timeout=60)
        except (OSError, subprocess.SubprocessError):
            continue
        s = out.stdout.strip()
        if s.startswith("{"):
            return json.loads(s)
    return None


def main():
    chemin = sys.argv[1] if len(sys.argv) > 1 else None
    if not chemin:
        for c in CHEMINS:
            if os.path.exists(c):
                chemin = c
                break
    if not chemin or not os.path.exists(chemin):
        print("Le classeur officiel de l'EUCAST est introuvable. Donnez son chemin :")
        print("    python3 outils/verifier-posologie.py v_16.1_Breakpoint_Tables.xlsx")
        print("L'outil ne conclut RIEN sans le document : c'est le document qui fait foi.")
        return 2

    import classeur
    c = classeur.Classeur(chemin)
    doc = {}
    for lg in c.lignes("Dosages"):
        nom = espaces(lg.get("A"))
        if nom:
            doc[nom] = {k: espaces(lg.get(k)) for k in "BCDE"}
    if len(doc) < 50:
        print("la feuille « Dosages » n'a donné que %d lignes : la lecture a échoué, "
              "et un contrôle qui ne lit rien ne vérifie rien." % len(doc))
        return 2

    P = table_phenobac()
    if not P:
        print("posologie.js n'a pas pu être lu (ni node ni jsc n'ont répondu).")
        return 2

    introuvables, fond, typo, identiques = [], [], [], 0
    for code, entrees in sorted(P.items()):
        for e in entrees:
            voie = espaces(e.get("voie"))
            if voie not in doc:
                introuvables.append("%s — « %s »" % (code, voie))
                continue
            for nom, col in CHAMPS:
                a = espaces(e.get(nom)) if e.get(nom) is not None else ""
                b = doc[voie][col]
                if b.lower() == "none":
                    b = ""
                if a == b:
                    identiques += 1
                elif sans_typographie(a) == sans_typographie(b):
                    typo.append((code, voie, nom))
                    identiques += 1
                else:
                    fond.append((code, voie, nom, a, b))

    # Et dans l'autre sens : une molécule du panel dont la posologie manquerait.
    # C'est essai-posologie.js qui le tient, par le panel ; ici on vérifie que
    # la table ne contient pas de molécule ABSENTE du document.
    if introuvables:
        print("DES LIBELLÉS DE LA TABLE N'EXISTENT PAS DANS LE DOCUMENT :")
        for x in introuvables:
            print("  -", x)
        print("\nUn libellé inventé ne se verrait nulle part ailleurs : c'est par lui "
              "que la table se raccroche au document.")
        return 1

    if fond:
        print("LA TABLE ET LE DOCUMENT DIVERGENT :")
        for code, voie, nom, a, b in fond:
            print("  - %s / %s / %s" % (code, voie, nom))
            print("      table    : %s" % (a or "(vide)"))
            print("      document : %s" % (b or "(vide)"))
        print("\nAucun fichier n'a été modifié. Toute correction doit être "
              "validée par un biologiste avant d'être portée dans le code.")
        return 1

    if len(typo) > PLAFOND_TYPO:
        print("Les écarts de typographie passent de %d à %d. Le plafond ne monte pas : "
              "regardez si le nouveau en est vraiment un." % (PLAFOND_TYPO, len(typo)))
        for code, voie, nom in typo:
            print("  ·", code, "/", voie, "/", nom)
        return 1

    print("%d champs confrontés à la feuille « Dosages », %d identiques."
          % (identiques + len(fond), identiques))
    print("Les %d molécules de la table se retrouvent toutes dans le document, "
          "libellé pour libellé." % len(P))
    if typo:
        print("%d écart(s) de pure typographie, marques du lecteur de PDF :" % len(typo))
        for code, voie, nom in typo:
            print("  ·", code, "/", voie, "/", nom)
    return 0


if __name__ == '__main__':
    sys.exit(main())
