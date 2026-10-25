# -*- coding: utf-8 -*-
"""
verifier-langues.py — PhénoBac dit-elle la même chose dans les deux langues ?

LE DÉFAUT QUE CE CONTRÔLE EXISTE POUR ATTRAPER

Une application bilingue se dégrade de trois façons, toutes silencieuses :

  1. une entrée du catalogue sans sa traduction. L'interface affiche alors le
     français au milieu de l'anglais, et personne ne s'en plaint — on croit à
     un terme technique ;

  2. une entrée IDENTIQUE dans les deux langues, qu'on ne distingue pas d'une
     entrée qu'on a oublié de traduire. « Identification » s'écrit parein en
     français et en anglais ; « Interprétation » non. Le catalogue porte donc
     un drapeau « meme », qui est une DÉCLARATION, et ce contrôle exige qu'il
     soit posé ;

  3. la traduction qui s'arrête. Il reste aujourd'hui des milliers de
     caractères de français dans le moteur et dans la page — c'est assumé, et
     l'interface le dit à l'utilisateur anglophone. Ce qui ne doit pas
     arriver, c'est que ce reliquat REPARTE À LA HAUSSE. Le contrôle compte, et
     refuse l'augmentation.

Le troisième point est le plus important. Un plafond qui descend est une
traduction qui avance ; sans plafond, une livraison ajoute du français sans
que rien ne tombe, et le travail se défait aussi vite qu'il se fait.

    python3 outils/verifier-langues.py
    python3 outils/verifier-langues.py --compter   (pour relever le plafond)
"""
import importlib.util
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)

# PLAFOND DU FRANÇAIS RESTANT, par fichier. Relevé le 25 octobre 2026, à
# l'ouverture du bilinguisme. Il ne doit que DESCENDRE. Pour le mettre à jour
# après avoir traduit, lancer « --compter » et reporter les nombres ici — avec,
# en commentaire, ce qui a été traduit.
PLAFOND = {
    # vague 1 : l'interface de travail. Reste le commentaire clinique du
    # moteur (mécanismes, règles expertes, alertes), la page « À propos » et
    # la banque d'entraînement.
    # SANS MARGE, à dessein : un plafond qui laisse du jeu laisse entrer du
    # français non traduit sans rien faire tomber.
    # Relevés par le balayage d'états, qui est le seul juste : les premiers
    # chiffres — 411, 671, 37 — venaient d'un comptage faux.
    "moteur.js": 501,
    "phenobac.html": 618,
    "rendu-cible.js": 45,
}

ACCENTS = re.compile(r'[àâäéèêëîïôöùûüçœÀÉÈÊÎÔÛÇ]')
MOTS_FR = re.compile(r'\b(le|la|les|des|une|un|aux|est|pas|qui|que|pour|sur|dans|avec)\b')


def chaines(src):
    r"""Les chaînes de caractères du code, commentaires exclus. Un commentaire
    en français n'est pas un défaut : c'est la documentation du projet, et
    elle est écrite pour le biologiste qui la maintient.

    PREMIÈRE VERSION, FAUSSE, ET D'UNE FAÇON QUI NE SE VOYAIT PAS. Elle
    retirait les commentaires par expression régulière — « /\*.*?\*/ ». Or
    « /* » apparaît aussi DANS des chaînes, et il s'y apparie avec un « */ »
    réel situé bien plus loin : un bloc entier du fichier disparaissait, et le
    compte de français restant tombait de son propre chef. Éprouvé en
    ajoutant une phrase française à la page : le compteur ne bougeait pas, et
    le plafond ne tombait donc jamais — un contrôle qui ne peut pas échouer.

    C'est le même défaut que verifier-comptes.py avait eu, à la même cause. On
    emprunte donc le balayage d'états de outils/muter.py plutôt que d'en
    écrire une troisième version."""
    spec = importlib.util.spec_from_file_location("muter", os.path.join(ICI, "muter.py"))
    MU = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(MU)
    code = MU.masque_code(src)
    out, i, n = [], 0, len(src)
    while i < n:
        # Une chaîne commence là où le masque dit « ce n'est pas du code » et
        # où le caractère est un délimiteur.
        if src[i] in "\"'`" and not code[i] and (i == 0 or src[i - 1] != "\\"):
            delim, j = src[i], i + 1
            while j < n and not (src[j] == delim and src[j - 1] != "\\"):
                j += 1
            if j - i - 1 >= 4:
                out.append(src[i + 1:j])
            i = j + 1
            continue
        i += 1
    return out


def francaises(ch):
    return [s for s in ch if ACCENTS.search(s) or MOTS_FR.search(s)]


def catalogue():
    """Le catalogue, relu du FICHIER : on ne demande pas à langue.js de se
    contrôler lui-même."""
    src = open(os.path.join(RACINE, "langue.js"), encoding="utf-8").read()
    i = src.index("const C = {")
    # LA DERNIÈRE ENTRÉE N'A PAS DE VIRGULE, et le motif en exigeait une suivie
    # d'un saut de ligne. Le découpage s'arrêtant juste avant « \n}; », cette
    # entrée-là n'était jamais lue — et c'est exactement la place qu'occuperait
    # un oubli de traduction, puisque c'est là qu'on ajoute. Un contrôle qui
    # saute la dernière ligne est un contrôle qui a un angle mort connu.
    corps = src[i:src.index("\n};", i) + 1]
    out = {}
    for m in re.finditer(r'"([\w.]+)":\s*\{(.*?)\},?\s*(?:\n|$)', corps, re.S):
        cle, champs = m.group(1), m.group(2)
        e = {}
        for nom in ("fr", "en"):
            t = re.search(r'\b%s:\s*"((?:[^"\\]|\\.)*)"' % nom, champs, re.S)
            if t:
                e[nom] = t.group(1)
        e["meme"] = bool(re.search(r'\bmeme:\s*true', champs))
        out[cle] = e
    return out


def main():
    compter = "--compter" in sys.argv
    ecarts, dits = [], []

    C = catalogue()
    if len(C) < 50:
        ecarts.append("le catalogue de langue.js n'a que %d entrées : la lecture a "
                      "échoué, et un contrôle qui ne lit rien ne vérifie rien." % len(C))
    sans_en = sorted(k for k, e in C.items() if not e.get("en"))
    sans_fr = sorted(k for k, e in C.items() if not e.get("fr"))
    if sans_fr:
        ecarts.append("entrées sans français : %s" % ", ".join(sans_fr))
    if sans_en:
        ecarts.append("entrées sans anglais : %s. L'interface afficherait du français "
                      "au milieu de l'anglais, et on le prendrait pour un terme "
                      "technique." % ", ".join(sans_en))
    jumelles = sorted(k for k, e in C.items()
                      if e.get("fr") and e.get("fr") == e.get("en") and not e["meme"])
    if jumelles:
        ecarts.append("entrées IDENTIQUES dans les deux langues sans le drapeau "
                      "« meme: true » : %s. Une traduction oubliée et un terme qui "
                      "s'écrit pareil se ressemblent ; seule une déclaration les "
                      "distingue." % ", ".join(jumelles))
    faux_meme = sorted(k for k, e in C.items()
                       if e["meme"] and e.get("fr") != e.get("en"))
    if faux_meme:
        ecarts.append("entrées portant « meme: true » alors que les deux langues "
                      "DIFFÈRENT : %s." % ", ".join(faux_meme))
    if not (sans_en or sans_fr or jumelles or faux_meme):
        dits.append("les %d entrées du catalogue ont leurs deux langues ; %d termes "
                    "s'écrivent pareil, et le disent."
                    % (len(C), sum(1 for e in C.values() if e["meme"])))

    # --- la page emploie-t-elle le catalogue ? ---
    page = open(os.path.join(RACINE, "phenobac.html"), encoding="utf-8").read()
    marques = set(re.findall(r'data-i18n="([\w.]+)"', page))
    inconnues = sorted(m for m in marques if m not in C)
    if inconnues:
        ecarts.append("la page réclame des clés absentes du catalogue : %s — elles "
                      "s'afficheraient entre crochets." % ", ".join(inconnues))
    for maillon, pourquoi in (
            ('<script src="langue.js">', "le catalogue ne serait pas chargé"),
            ('id="langSwitch"', "il n'y aurait aucun moyen de changer de langue"),
            ("function traduire()", "les éléments marqués ne seraient jamais remplis"),
            ("avertirTraductionPartielle", "l'utilisateur anglophone ne serait pas "
             "averti que le commentaire clinique est encore en français")):
        if maillon not in page:
            ecarts.append("phenobac.html n'a plus « %s » : %s." % (maillon, pourquoi))
    if marques and not inconnues:
        dits.append("%d éléments de la page sont marqués, et toutes leurs clés "
                    "existent." % len(marques))

    # --- LE PLAFOND ---
    restes, monte = {}, []
    for f, limite in sorted(PLAFOND.items()):
        src = open(os.path.join(RACINE, f), encoding="utf-8").read()
        n = len(francaises(chaines(src)))
        restes[f] = n
        if n > limite:
            monte.append("%s : %d chaînes françaises, contre %d au plafond — la "
                         "traduction a RECULÉ de %d." % (f, n, limite, n - limite))
    if monte:
        ecarts.append("le français restant AUGMENTE : %s. Une livraison qui ajoute "
                      "du texte non traduit défait le travail aussi vite qu'il se "
                      "fait." % " ; ".join(monte))
    else:
        gagne = sum(PLAFOND[f] - restes[f] for f in restes)
        dits.append("le français restant ne dépasse aucun plafond (%s)%s."
                    % (", ".join("%s %d/%d" % (f, restes[f], PLAFOND[f])
                                 for f in sorted(restes)),
                       " — %d chaînes de moins qu'au relevé" % gagne if gagne else ""))

    if compter:
        print("Relevé, à reporter dans PLAFOND :")
        for f in sorted(restes):
            print('    "%s": %d,' % (f, restes[f]))
        return 0

    if ecarts:
        print("LE BILINGUISME EST ABÎMÉ :")
        for e in ecarts:
            print("  -", e)
        return 1
    print("PhénoBac dit la même chose en français et en anglais.")
    for d in dits:
        print("  ·", d)
    return 0


if __name__ == '__main__':
    sys.exit(main())
