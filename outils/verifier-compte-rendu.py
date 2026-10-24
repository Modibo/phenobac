# -*- coding: utf-8 -*-
"""
verifier-compte-rendu.py — le compte rendu porte-t-il ce qu'il doit porter ?

LE DÉFAUT QUE CE CONTRÔLE EXISTE POUR ATTRAPER

Le compte rendu est ce que le clinicien reçoit. L'écran, lui, n'est vu que
du biologiste. Tout ce que PhénoBac calcule et n'imprime pas n'existe pas
pour celui qui prescrit.

C'est arrivé : la POSOLOGIE qui fonde le seuil était calculée, affichée à
l'écran, et absente du compte rendu — alors que le cahier l'exige depuis le
premier jour, « pour une molécule rendue I, la mention est obligatoire et
visible ». Or « I » signifie « marche à condition d'augmenter l'exposition » :
sans la dose, le clinicien prescrit la dose habituelle, celle dont le seuil
dit justement qu'elle ne suffira pas. Personne ne l'a vu pendant des
semaines, parce qu'aucun banc ne lit le compte rendu.

CE QUE CE CONTRÔLE PROUVE, ET CE QU'IL NE PROUVE PAS. Il lit le GABARIT du
compte rendu et vérifie que chaque mention exigée y figure. Il ne prouve pas
qu'elle s'affiche au bon moment — cela se voit au navigateur. Il attrape la
suppression, pas la subtilité ; c'est déjà ce qui est arrivé.

    python3 outils/verifier-compte-rendu.py
"""
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
PAGE = os.path.join(os.path.dirname(ICI), "phenobac.html")

# Chaque exigence : ce qu'on cherche, et CE QU'ON PERD si elle disparaît.
EXIGENCES = [
    # CHERCHER L'USAGE, PAS LA DÉFINITION. « rp-poso » figurait encore dans la
    # variable posoLigne et dans la feuille de style après que sa pose dans la
    # ligne eut été retirée : le contrôle passait au vert sur un compte rendu
    # sans posologies.
    ("la posologie posée dans la ligne du tableau", r"\$\{catFull\}\$\{posoLigne\}",
     "une molécule rendue « I » partirait sans sa dose, et « I » sans dose se "
     "lit comme un demi-sensible"),
    ("la mise en évidence pour une catégorie I", r'cle==="I"\?" rp-poso-i"',
     "la forte posologie se confondrait avec un schéma ordinaire"),
    ("§ 13 — l'adaptation relève du prescripteur", r"adaptation au malade",
     "le compte rendu se lirait comme une prescription"),
    ("§ 13 — PhénoBac ne choisit pas la molécule", r"ne choisit pas entre deux molécules",
     "la limite entre aide et prescription cesserait d'être écrite"),
    ("le rendu ciblé et sa mention", r"Antibiogramme ciblé",
     "une feuille amputée paraîtrait complète"),
    ("l'antibiogramme complet reste disponible", r"complet reste disponible",
     "le clinicien ne saurait pas qu'il peut demander le reste"),
    # « rp-com » est un PRÉFIXE de « rp-comment », la classe du commentaire
    # d'interprétation : le motif restait vrai après que la liste des
    # commentaires de la HAS eut disparu. Un motif trop court ne vérifie pas
    # ce qu'il croit vérifier.
    ("les commentaires du § 2.1.4", r'class="rp-com"',
     "« une colonisation ne se traite pas » ne serait plus écrit"),
    ("la légende de provenance", r"Provenance des données",
     "on ne distinguerait plus une mesure d'une déduction"),
    ("l'avertissement d'usage", r"outil d'aide et de formation",
     "le document passerait pour un rendu de dispositif médical"),
    ("de quoi reproduire le rendu", r"Pour reproduire ce rendu",
     "un compte rendu ancien ne serait plus rattachable à ses règles"),
    ("la ligne de signature", r"Date / signature",
     "le compte rendu ne serait plus validable"),
]


def gabarit(page):
    """Le corps de buildReport, et lui seul : ce qui part à l'impression."""
    i = page.find("function buildReport(")
    if i < 0:
        raise SystemExit("CONTRÔLE IMPOSSIBLE — buildReport est introuvable : "
                         "le compte rendu n'est plus construit là où ce contrôle "
                         "le cherche, et il passerait au vert sans rien lire.")
    # S'arrêter à la FONCTION SUIVANTE. Couper au premier « } » en début de
    # ligne après l'affectation tronquait le gabarit au milieu du grand
    # littéral : la moitié des mentions exigées tombaient hors de la lecture,
    # et leur suppression passait inaperçue.
    j = page.find("\nfunction ", i + 10)
    return page[i:j if j > 0 else len(page)]


def main():
    with open(PAGE, encoding="utf-8") as f:
        page = f.read()
    corps = gabarit(page)
    if len(corps) < 3000:
        print("CONTRÔLE IMPOSSIBLE — le gabarit lu ne fait que %d caractères : "
              "le découpage ne reconnaît plus le compte rendu." % len(corps))
        return 1

    manquants = []
    for nom, motif, perte in EXIGENCES:
        if not re.search(motif, corps):
            manquants.append("%s — sans elle, %s." % (nom, perte))

    if manquants:
        print("LE COMPTE RENDU NE PORTE PLUS :")
        for m in manquants:
            print("  -", m)
        return 1
    print("Le compte rendu porte les %d mentions exigées." % len(EXIGENCES))
    print("  · ce contrôle lit le gabarit : il attrape une mention supprimée, "
          "pas une mention affichée au mauvais moment.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
