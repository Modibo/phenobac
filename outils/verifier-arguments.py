# -*- coding: utf-8 -*-
"""
verifier-arguments.py — la grille dit-elle la même chose que la catégorie ?

LE DÉFAUT QUE CE CONTRÔLE EXISTE POUR ATTRAPER

Chaque argument du moteur est un triplet :

    ["FOX", "S", "céfoxitine conservée : pas de résistance à la méticilline"]

le code de la molécule, la CATÉGORIE ATTENDUE, et la PHRASE affichée au
biologiste. Rien n'empêchait les deux derniers de se contredire. Écrire

    ["FOX", "R", "céfoxitine conservée : pas de résistance à la méticilline"]

produit un argument qui s'affiche quand la céfoxitine est RÉSISTANTE, en
expliquant qu'elle est conservée. Le raisonnement garde son apparence de
rigueur et dit le contraire de ce qu'il observe.

Le banc de la banque ne pouvait pas l'attraper, et il croyait le faire : il
confrontait la grille à l'antibiogramme, alors que parce() LIT la catégorie
dans cet antibiogramme — elle ne peut donc jamais en citer une autre. Le
contrôle ne pouvait pas échouer.

Ici on lit la SOURCE : pour chaque triplet, la polarité de la catégorie
attendue (sensible / atteinte) est confrontée à celle de la phrase.

    python3 outils/verifier-arguments.py
"""
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
MOTEUR = os.path.join(os.path.dirname(ICI), "moteur.js")

# Les mots par lesquels une phrase dit qu'une molécule TIENT, et ceux par
# lesquels elle dit qu'elle est TOUCHÉE. Les formes niées sont retirées avant,
# sans quoi « le clavulanate ne restaure rien » passerait pour une activité.
NIEES = [
    r"ne restaure (?:rien|pas)", r"n['’]est pas restaur\w*", r"non sensible",
    r"ne (?:la |le |les )?conserve pas", r"n['’](?:est|sont) pas (?:actif|active|conserv\w+)",
    r"ne convien\w+", r"ne pas (?:la |le |les )?rendre sensibles?",
    r"ne s['’]y fier", r"ne vaut pas", r"ne (?:la |le )?restaure",
    # « céfoxitine conservée : PAS DE RÉSISTANCE à la méticilline » portait les
    # deux polarités et restait donc muette — et la mutation qui lui donnait la
    # catégorie « R » passait inaperçue. Une résistance niée n'est pas une
    # résistance.
    r"(?:pas de|sans|aucune|ni) r[ée]sistance", r"pas (?:de|d['’])\s*(?:BLSE|c[ée]phalosporinase|p[ée]nicillinase|m[ée]canisme|gène|enzyme)",
    r"(?:ni|aucun[e]?) (?:BLSE|c[ée]phalosporinase|p[ée]nicillinase|m[ée]canisme|enzyme)",
    r"non (?:décel\w+|modifi\w+)", r"n['’]atteint pas", r"ne (?:la |le |les )?touche pas",
]
TIENT = [r"conserv\w+", r"\bactive?s?\b", r"\bactifs?\b", r"restaure", r"\bsensibles?\b",
         r"reste(?:nt)? (?:actif|active)", r"tient"]
TOUCHEE = [r"attein\w+", r"r[ée]sistan\w+", r"touch\w+", r"hydrolys\w+", r"perdue?",
           r"tombe", r"intermédiaire", r"diminu\w+"]


def polarite_texte(t):
    """« tient », « touchée », ou None si la phrase ne tranche pas."""
    nu = t
    for n in NIEES:
        nu = re.sub(n, " « nié » ", nu, flags=re.I)
    a = any(re.search(m, nu, re.I) for m in TIENT)
    b = any(re.search(m, nu, re.I) for m in TOUCHEE)
    if a and not b:
        return "tient"
    if b and not a:
        return "touchée"
    return None                      # muette, ou les deux : on ne tranche pas


def triplets(src):
    """[(ligne, code, attendu, texte)] — lus dans les grilles parce()."""
    out = []
    for m in re.finditer(r'\[\s*("?\w+"?)\s*,\s*"(S|I|R|RI|SI)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\]', src):
        ligne = src.count("\n", 0, m.start()) + 1
        out.append((ligne, m.group(1).strip('"'), m.group(2), m.group(3)))
    return out


def main():
    with open(MOTEUR, encoding="utf-8") as f:
        src = f.read()
    lus = triplets(src)
    if len(lus) < 40:
        print("CONTRÔLE INAPPLICABLE — %d argument(s) lus dans moteur.js, "
              "au moins 40 attendus. La forme des grilles a changé et ce "
              "contrôle ne les reconnaît plus : il passerait au vert sans "
              "rien vérifier." % len(lus))
        return 1

    ecarts, muets = [], 0
    for ligne, code, attendu, texte in lus:
        attendue = "tient" if attendu == "S" else "touchée"
        dite = polarite_texte(texte)
        if dite is None:
            muets += 1
            continue
        if dite != attendue:
            ecarts.append(
                "moteur.js:%d — %s attendu « %s » (la molécule %s), mais la phrase "
                "dit qu'elle %s : « %s »"
                % (ligne, code, attendu, attendue, dite, texte[:90]))

    if ecarts:
        print("UN ARGUMENT CONTREDIT LA CATÉGORIE QU'IL EXPLIQUE :")
        for e in ecarts:
            print("  -", e)
        return 1

    print("Les %d arguments du moteur disent la même chose que leur catégorie."
          % len(lus))
    print("  · %d tranchent explicitement, %d restent neutres (ni « conservée » "
          "ni « atteinte »)." % (len(lus) - muets, muets))
    return 0


if __name__ == '__main__':
    sys.exit(main())
