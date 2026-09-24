# -*- coding: utf-8 -*-
"""
lire-casfm.py — retrouver une ligne du communiqué CA-SFM, chapitre par chapitre.

    python3 outils/lire-casfm.py casfm_complet.txt staphylocoque vancomycine

Le communiqué n'est pas un classeur : c'est un PDF dont le texte, une fois
extrait, arrive à plat, ligne par ligne, avec les appels de notes mêlés aux
valeurs. Rien ne peut donc être ramassé automatiquement sans relecture — cet
outil AFFICHE, il ne conclut pas. La table du code se tape à la main, chaque
entrée portant sa page, et outils/verifier-casfm-diametres.py revient ensuite
confronter le chiffre au document.

L'ordre des colonnes, tel que l'en-tête des tableaux l'annonce :

    CMI (mg/L)          Charge du      Diamètres critiques (mm)
    S ≤    R >    ZIT   disque (µg)    S ≥    R <    ZIT
"""
import re
import sys

# Chapitre -> pages du PDF. Une table lue dans le mauvais chapitre donnerait
# un chiffre juste pour la mauvaise espèce, et rien ne le signalerait.
#
# ATTENTION : le sommaire donne les pages IMPRIMÉES, qui valent ici l'index
# du PDF PLUS UN. Les valeurs ci-dessous sont des index de PDF, vérifiés en
# retrouvant chaque titre de chapitre dans le texte extrait. Reprendre les
# numéros du sommaire tels quels décalerait chaque lecture d'une page — assez
# pour lire les corynébactéries dans le chapitre de C. diphtheriae.
CHAPITRES = {
    'enterobacterales': (47, 57), 'pseudomonas': (58, 61),
    'acinetobacter': (62, 64), 'stenotrophomonas': (65, 66),
    'staphylocoque': (71, 78), 'enterocoque': (79, 83),
    'pneumocoque': (84, 88), 'streptoacg': (89, 93),
    'streptoautres': (94, 98), 'listeria': (99, 99),
    'corynebacterium': (100, 100), 'cdiphtheriae': (101, 101),
    'haemophilus': (104, 107), 'gonocoque': (108, 108),
    'meningocoque': (109, 109), 'moraxella': (110, 112),
    'campylobacter': (116, 117), 'vibrio': (122, 122),
    'anaerobies': (123, 126),
}


def pages(texte):
    """{numéro de page: [lignes]}"""
    out, courante = {}, None
    for ligne in texte.splitlines():
        m = re.match(r'^===== PAGE (\d+) ', ligne)
        if m:
            courante = int(m.group(1)); out[courante] = []
        elif courante is not None:
            out[courante].append(ligne)
    return out


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        print("Chapitres : " + ", ".join(sorted(CHAPITRES)))
        return 2
    texte = open(sys.argv[1], encoding='utf-8').read()
    chap, motif = sys.argv[2].lower(), sys.argv[3]
    if chap not in CHAPITRES:
        print("Chapitre inconnu. Au choix : " + ", ".join(sorted(CHAPITRES)))
        return 2
    debut, fin = CHAPITRES[chap]
    pg = pages(texte)

    for n in range(debut, fin + 1):
        for i, ligne in enumerate(pg.get(n, [])):
            corps = ligne.split('|', 1)[-1]
            if not re.search(motif, corps, re.I):
                continue
            # La ligne précédente et la suivante portent souvent la suite du
            # nom de la molécule, ou l'appel de note qui explique la valeur.
            print("--- page %d du PDF (page imprimée %d)" % (n, n + 1))
            marge = int(sys.argv[4]) if len(sys.argv) > 4 else 1
            for j in range(max(0, i - marge), min(len(pg[n]), i + marge + 1)):
                print("   " + pg[n][j].split('|', 1)[-1].strip())
    return 0


if __name__ == '__main__':
    sys.exit(main())
