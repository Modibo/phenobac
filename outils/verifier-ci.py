# -*- coding: utf-8 -*-
"""
verifier-ci.py — aucun contrôle n'est écrit pour rester inerte.

LE DÉFAUT QUE CE CONTRÔLE EXISTE POUR ATTRAPER

Écrire un banc coûte une heure ; le brancher sur la chaîne coûte deux lignes,
et c'est la partie qu'on oublie. Un banc non branché ne tombe jamais au rouge.
Il dort dans outils/, il donne l'impression que la chose est vérifiée, et le
jour où la règle qu'il protège se casse, personne ne l'apprend.

Ce dépôt en portait trois — comparer-eucast.py, comparer-zit.py et
essai-chargement.js. Les trois pour de bonnes raisons, mais AUCUNE ÉCRITE :
rien ne distinguait un outil volontairement hors chaîne d'un outil oublié.

Chaque outil de contrôle doit donc, désormais, soit être lancé par
.github/workflows/deploy.yml, soit porter dans son propre en-tête la ligne

    HORS INTÉGRATION CONTINUE : <pourquoi, en une phrase>

La raison vit à côté de l'outil, pas dans une liste centrale qu'on oublierait
de tenir. Et ce contrôle vérifie aussi qu'il est lui-même branché : un
vérificateur de branchement non branché serait une plaisanterie.

    python3 outils/verifier-ci.py
"""
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
CHAINE = os.path.join(RACINE, ".github", "workflows", "deploy.yml")

MARQUE = "HORS INTÉGRATION CONTINUE :"
# Les trois familles d'outils de contrôle. Les autres fichiers d'outils/
# (extraire-*, construire-*, lire-*, pdfpos…) produisent ou lisent ; ils ne
# contrôlent rien et n'ont pas à figurer dans la chaîne.
FAMILLES = ("essai-", "verifier-", "comparer-")


def outils_de_controle():
    out = []
    for f in sorted(os.listdir(ICI)):
        if f.endswith((".js", ".py")) and f.startswith(FAMILLES):
            out.append(f)
    return out


def lance_par_la_chaine(chaine):
    """Les chemins que la chaîne exécute réellement, pas ceux qu'elle cite
    dans un commentaire : on ne retient que les lignes « run: »."""
    lances = set()
    for ligne in chaine.splitlines():
        nu = ligne.strip()
        if nu.startswith("#"):
            continue
        for m in re.finditer(r"outils/([a-zA-Z0-9_-]+\.(?:js|py))", nu):
            lances.add(m.group(1))
    return lances


def raison(fichier):
    with open(os.path.join(ICI, fichier), encoding="utf-8") as f:
        tete = f.read(4000)
    # Ancrée en début de ligne, sans retrait : l'exemple du mode d'emploi de
    # ce fichier-ci est indenté et ne se prend pas pour une déclaration.
    # La raison court jusqu'à la ligne vide : une raison d'une seule ligne
    # serait toujours trop courte pour être discutée dans six mois.
    # La raison court jusqu'à la fin de son paragraphe — ligne vide, fin de
    # docstring, fin de commentaire JavaScript ou filet d'en-tête. Une raison
    # d'une seule ligne serait toujours trop courte pour être discutée dans
    # six mois ; une raison qui emporte le « */ » du fichier ne se lit pas.
    m = re.search("^" + re.escape(MARQUE)
                  + r"\s*(.+?)(?:\n\s*\n|\n\s*\"\"\"|\n\s*\*/|\n\s*={6,})",
                  tete, re.M | re.S)
    if not m:
        return None
    return re.sub(r"\s+", " ", m.group(1)).strip(" *\"'")


def main():
    try:
        with open(CHAINE, encoding="utf-8") as f:
            chaine = f.read()
    except OSError as e:
        print("CHAÎNE INTROUVABLE — %s" % e)
        return 1

    lances = lance_par_la_chaine(chaine)
    ecarts, dits, hors = [], [], []

    for f in outils_de_controle():
        if f in lances:
            dits.append(f)
            continue
        r = raison(f)
        if not r:
            ecarts.append(
                "%s n'est lancé par aucune étape de la chaîne et ne dit pas pourquoi. "
                "Un contrôle non branché ne tombe jamais au rouge : il donne "
                "l'impression que la chose est vérifiée. Branchez-le, ou écrivez "
                "dans son en-tête « %s <raison> »." % (f, MARQUE))
        elif len(r) < 40:
            ecarts.append(
                "%s se déclare hors chaîne avec une raison de %d caractères (« %s »). "
                "Une raison trop courte n'est pas une raison : on ne pourra pas la "
                "discuter dans six mois." % (f, len(r), r))
        else:
            hors.append("%s — %s" % (f, r))

    # --- Un contrôle de la chaîne ne peut pas dépendre de macOS ---
    #
    # verifier-comptes.py appelait ce moteur directement. Il passait au vert sur le
    # poste de développement et faisait tomber la chaîne sous Linux, où jsc
    # n'existe pas — le même angle mort que essai-chargement.js surveille pour
    # les bancs JavaScript, rouvert côté Python. moteur_py sait choisir node ou
    # l'autre selon ce qui est présent : c'est le SEUL endroit qui ait le droit
    # de connaître ce chemin.
    # Le motif est ASSEMBLÉ : écrit d'une pièce, ce fichier se dénoncerait
    # lui-même — et une liste d'exemptions se serait allongée toute seule.
    JSC = "JavaScript" + "Core.framework"
    for f in sorted(lances):
        if not f.endswith(".py") or f == "moteur_py.py":
            continue
        p = os.path.join(ICI, f)
        if not os.path.isfile(p):
            continue
        with open(p, encoding="utf-8") as fh:
            if JSC in fh.read():
                ecarts.append(
                    "%s cite le chemin de JavaScriptCore : il ne tournera que sur "
                    "macOS, et la chaîne tourne sous Linux. Passez par moteur_py, "
                    "qui choisit node ou jsc selon ce qui est là." % f)

    # Un chemin cité par la chaîne mais absent du dépôt : l'étape échouerait,
    # mais autant le dire ici, avec le nom du fichier manquant.
    for f in sorted(lances):
        if not os.path.isfile(os.path.join(ICI, f)):
            ecarts.append("la chaîne lance outils/%s, qui n'existe pas." % f)

    # Et ce fichier-ci ?
    moi = os.path.basename(__file__)
    if moi not in lances:
        ecarts.append(
            "%s n'est pas lancé par la chaîne. Un vérificateur de branchement "
            "non branché ne vérifie rien." % moi)

    if ecarts:
        print("DES CONTRÔLES DORMENT :")
        for e in ecarts:
            print("  -", e)
        return 1

    print("Les %d outils de contrôle sont branchés ou se déclarent."
          % (len(dits) + len(hors)))
    print("  · %d lancés par la chaîne : %s" % (len(dits), ", ".join(dits)))
    for h in hors:
        print("  · hors chaîne, et dit : " + h)
    return 0


if __name__ == '__main__':
    sys.exit(main())
