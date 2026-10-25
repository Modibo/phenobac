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

ET DEPUIS QUE LES ARGUMENTS SONT BILINGUES, AUX DEUX PHRASES. Le 25 octobre
2026, les grilles sont passées de

    ["FOX", "S", "céfoxitine conservée"]
à
    ["FOX", "S", tr("céfoxitine conservée", "cefoxitin preserved")]

et ce contrôle a cessé de les reconnaître. Il s'est ARRÊTÉ plutôt que de
passer au vert sur six triplets au lieu de quarante — c'est le garde-fou du
bas de ce fichier qui a joué.

La traduction ouvre un défaut que le français seul n'avait pas : rendre
« ampicilline atteinte » par « ampicillin active » retourne l'argument. La
phrase anglaise s'afficherait sous une catégorie R en disant que la molécule
tient, et aucun lecteur francophone ne le verrait jamais. Les deux langues
sont donc confrontées à la même catégorie, avec chacune son vocabulaire.

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

# Le même vocabulaire, côté anglais. Les formes niées d'abord, comme en
# français : « restores nothing » n'est pas une activité, et « no resistance »
# n'est pas une résistance.
NIEES_EN = [
    r"restores? (?:nothing|no)", r"not restored", r"not susceptible",
    r"(?:is|are) not (?:active|preserved|restored)", r"never report (?:them|it) susceptible",
    r"do(?:es)? not (?:rely|suit|reach|inhibit|restore|affect)", r"not rely on",
    r"(?:no|without|neither) resistance",
    r"no (?:ESBL|cephalosporinase|penicillinase|mechanism|gene|enzyme|breakpoint)",
    r"not (?:detected|altered)", r"does not reach", r"unaltered",
]
TIENT_EN = [r"preserved", r"\bactive\b", r"restores?", r"\bsusceptible\b",
            r"remains? active", r"holds?\b", r"retained", r"\bworks?\b"]
TOUCHEE_EN = [r"affected", r"resistant", r"resistance", r"hydrolyses?", r"\blost\b",
              r"falls?\b", r"intermediate", r"reduced", r"diminished"]


def polarite_texte(t, langue="fr"):
    """« tient », « touchée », ou None si la phrase ne tranche pas."""
    niees, tient, touchee = ((NIEES, TIENT, TOUCHEE) if langue == "fr"
                             else (NIEES_EN, TIENT_EN, TOUCHEE_EN))
    nu = t
    for n in niees:
        nu = re.sub(n, " [nié] ", nu, flags=re.I)
    a = any(re.search(m, nu, re.I) for m in tient)
    b = any(re.search(m, nu, re.I) for m in touchee)
    if a and not b:
        return "tient"
    if b and not a:
        return "touchée"
    return None                      # muette, ou les deux : on ne tranche pas


# Le troisième membre est soit une chaîne, soit tr("français", "anglais").
# Le « (?:\s*\n\s*)? » est indispensable : les paires traduites tiennent
# rarement sur une ligne.
CHAINE = r'"((?:[^"\\]|\\.)*)"'
TRIPLET = re.compile(
    r'\[\s*("?\w+"?)\s*,\s*"(S|I|R|RI|SI)"\s*,\s*'
    r'(?:tr\(\s*' + CHAINE + r'\s*,\s*(?:\s*\n\s*)?' + CHAINE + r'\s*\)|' + CHAINE + r')'
    r'\s*\]', re.S)


def triplets(src):
    """[(ligne, code, attendu, texte_fr, texte_en)] — lus dans les grilles
    parce(). texte_en vaut None quand l'argument n'est pas encore traduit."""
    out = []
    for m in TRIPLET.finditer(src):
        ligne = src.count("\n", 0, m.start()) + 1
        fr, en, seule = m.group(3), m.group(4), m.group(5)
        if seule is not None:
            fr, en = seule, None
        out.append((ligne, m.group(1).strip('"'), m.group(2), fr, en))
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

    ecarts, traduits = [], 0
    tranchent = {"fr": 0, "en": 0}
    for ligne, code, attendu, texte, texte_en in lus:
        attendue = "tient" if attendu == "S" else "touchée"
        for langue, phrase in (("fr", texte), ("en", texte_en)):
            if phrase is None:
                continue
            if langue == "en":
                traduits += 1
            dite = polarite_texte(phrase, langue)
            if dite is None:
                continue
            tranchent[langue] += 1
            if dite != attendue:
                ecarts.append(
                    "moteur.js:%d — %s attendu « %s » (la molécule %s), mais la phrase "
                    "%s dit qu'elle %s : « %s »"
                    % (ligne, code, attendu, attendue,
                       "française" if langue == "fr" else "ANGLAISE", dite, phrase[:90]))

    if ecarts:
        print("UN ARGUMENT CONTREDIT LA CATÉGORIE QU'IL EXPLIQUE :")
        for e in ecarts:
            print("  -", e)
        return 1

    # LE VOCABULAIRE ANGLAIS PEUT NE RIEN RECONNAÎTRE, ET ALORS CE CONTRÔLE
    # NE CONTRÔLE PLUS RIEN DE L'ANGLAIS. Une phrase que le vocabulaire ne
    # reconnaît pas reste « neutre » et passe : si AUCUNE phrase anglaise ne
    # tranchait, le contrôle dirait toujours « tout va bien » en n'ayant
    # regardé que le français. On exige donc qu'au moins la moitié des
    # phrases traduites tranchent, comme c'est le cas du côté français.
    if traduits:
        seuil = traduits // 2
        if tranchent["en"] < seuil:
            print("CONTRÔLE AVEUGLE À L'ANGLAIS — %d phrases anglaises lues, seules %d "
                  "tranchent (au moins %d attendues). Le vocabulaire anglais ne "
                  "reconnaît plus ces tournures : le contrôle passerait au vert en "
                  "n'ayant vérifié que le français, et une traduction qui retourne un "
                  "argument ne serait plus vue."
                  % (traduits, tranchent["en"], seuil))
            return 1

    print("Les %d arguments du moteur disent la même chose que leur catégorie, "
          "dans les deux langues." % len(lus))
    print("  · français : %d tranchent explicitement sur %d, %d restent neutres "
          "(ni « conservée » ni « atteinte »)."
          % (tranchent["fr"], len(lus), len(lus) - tranchent["fr"]))
    print("  · anglais  : %d arguments traduits, dont %d tranchent — une traduction "
          "qui retournerait le sens (« atteinte » rendue par « active ») serait vue ici."
          % (traduits, tranchent["en"]))
    return 0


if __name__ == '__main__':
    sys.exit(main())
