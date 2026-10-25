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
    # LE MOTEUR N'EST PLUS MESURÉ ICI, ET C'EST UN AVEU.
    #
    # On a essayé trois fois de compter le français de moteur.js par le texte.
    # Le balayage d'états se désynchronise sur les apostrophes, puis sur les
    # littéraux d'expression régulière : le nombre a valu 501, 415 puis 413
    # sans suivre le travail — dix-huit phrases traduites n'en faisaient
    # baisser que deux, et les « chaînes » comptées étaient des blocs de code
    # entiers. Un plafond posé sur un nombre pareil ne retient rien.
    #
    # Le moteur est désormais mesuré par son COMPORTEMENT, dans
    # outils/essai-langue.js : on le fait tourner en anglais sur chacune des
    # soixante espèces et on compte celles dont le rendu contient encore du
    # français. C'est exact, c'est ce que l'utilisateur voit, et cela ne peut
    # descendre qu'en traduisant.
    "rendu-cible.js": 43,
}

# Le texte VISIBLE encore en français, morceaux. Mesuré à part des fichiers
# JavaScript, et par une lecture HTML : voir texte_visible().
PLAFOND_VISIBLE = 124

ACCENTS = re.compile(r'[àâäéèêëîïôöùûüçœÀÉÈÊÎÔÛÇ]')

# NOMS PROPRES ACCENTUÉS, QUI NE SONT PAS DU FRANÇAIS.
#
# « PhénoBac » porte un accent, et une phrase anglaise qui le contient était
# comptée comme française : le compteur s'alarmait sur le nom du produit, et
# douze mille caractères de traduction anglaise faisaient MONTER le reliquat.
# Un compteur qui se trompe dans ce sens-là est pire qu'absent : il décourage
# précisément le travail qu'il est censé encourager.
PROPRES = re.compile(r'Phéno\s*Bac|Sominé\s*DOLO|Mopti|Modibo|Coulibaly|'
                     r'Céfidérocol|Témocilline', re.I)
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
    # UN SCANNER JAVASCRIPT SUR UN FICHIER HTML NE VEUT RIEN DIRE.
    #
    # Troisième incarnation du même défaut dans ce fichier, et la plus grave.
    # Le balayage d'états de muter.py lit du JavaScript : il prend les
    # guillemets des attributs HTML pour des chaînes, et surtout les
    # APOSTROPHES FRANÇAISES du texte visible — « l'antibiogramme » — pour des
    # ouvertures de chaîne qui ne se referment jamais. Trente-sept mille
    # caractères de page se retrouvaient comptés comme UNE chaîne, et le
    # plafond de phenobac.html — 618, puis 617 — ne voulait rien dire : il
    # bougeait de cent quarante au moindre remaniement.
    #
    # Dans un fichier HTML, on ne balaye donc que le contenu des <script>,
    # c'est-à-dire là où vivent les chaînes traduisibles : PRESENTATIONS, la
    # banque d'entraînement, les messages. Le texte visible, lui, est couvert
    # par le marquage « data-i18n », que ce même contrôle vérifie par ailleurs.
    spec = importlib.util.spec_from_file_location("muter", os.path.join(ICI, "muter.py"))
    MU = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(MU)
    src = sans_regex(src)
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
    nettes = [PROPRES.sub(" ", s) for s in ch]
    return [s for s, n in zip(ch, nettes) if ACCENTS.search(n) or MOTS_FR.search(n)]


def compte_items(corps, nom):
    """Le nombre d'éléments d'une liste, en comptant les VIRGULES de premier
    niveau et non les délimiteurs de chaînes.

    Première version : compter les guillemets et diviser par deux. Les étapes
    sont écrites en gabarits (`…`) et contiennent du HTML avec ses propres
    guillemets — « <span class="ge-ref"> » —, si bien que le compte explosait
    et que les deux langues ne pouvaient JAMAIS concorder. Le contrôle criait
    donc en permanence, ce qui revient à ne rien contrôler : on apprend à
    ignorer un voyant toujours rouge."""
    i = corps.find(nom + ": [")
    if i < 0:
        return 0
    i += len(nom) + 3
    n, prof, items, delim, vide = len(corps), 0, 1, "", True
    while i < n:
        c = corps[i]
        if delim:
            if c == "\\":
                i += 2
                continue
            if c == delim:
                delim = ""
        elif c in "\"'`":
            delim, vide = c, False
        elif c in "[({":
            prof += 1
        elif c in "])}":
            if c == "]" and prof == 0:
                return 0 if vide else items
            prof -= 1
        elif c == "," and prof == 0:
            items += 1
        i += 1
    return items


def texte_visible(page):
    """Le texte FRANÇAIS encore visible à l'écran, morceau par morceau.

    ON NE MESURE PAS LA PAGE AVEC UN SCANNER JAVASCRIPT. Deux tentatives s'y
    sont cassées : les guillemets des attributs HTML, puis les apostrophes
    françaises du texte — « l'antibiogramme » ouvre une chaîne qui ne se
    referme jamais —, puis les littéraux d'expression régulière du script. Le
    compte de phenobac.html a valu successivement 618, 617, 758 et 821 sans
    qu'une ligne de français change : un nombre qui bouge tout seul ne mesure
    rien, et un plafond posé dessus ne retient rien.

    On mesure donc ce qui est EXACT et ce qui compte vraiment : les morceaux de
    texte français que l'utilisateur rencontre à l'écran, hors script, hors
    style, et hors des éléments déjà marqués « data-i18n » — ceux-là sont
    traduits. C'est un nombre qui ne peut descendre qu'en traduisant."""
    sans = re.sub(r"<script\b.*?</script>", " ", page, flags=re.S | re.I)
    sans = re.sub(r"<style\b.*?</style>", " ", sans, flags=re.S | re.I)
    sans = re.sub(r"<!--.*?-->", " ", sans, flags=re.S)
    # Retirer le CONTENU des éléments déjà marqués : ils sont traduits au
    # chargement, et les compter ferait stagner le nombre quoi qu'on traduise.
    sans = re.sub(r"<(\w+)[^>]*data-i18n=\"[^\"]+\"[^>]*>.*?</\1>", " ", sans, flags=re.S)
    sans = re.sub(r"<[^>]+>", "\n", sans)
    sans = sans.replace("&nbsp;", " ").replace("&amp;", "&").replace("&times;", " ")
    morceaux = [" ".join(l.split()) for l in sans.splitlines()]
    return [m for m in morceaux if len(m) > 3]


def sans_regex(src):
    r"""Les littéraux d'expression régulière, neutralisés.

    Le balayage d'états lit du JavaScript mais ne connaît pas les expressions
    régulières : dans « /['\"]/ » ou « /\bqu'/ », l'apostrophe ouvre une
    chaîne qui ne se referme jamais, et tout ce qui suit bascule. C'est ce qui
    faisait que le compte du moteur — 415 — ne concordait pas avec la somme
    de ses fonctions : dix-huit chaînes traduites n'en faisaient baisser que
    deux. Un nombre qui ne suit pas le travail ne mesure pas le travail.

    On repère un « / » qui OUVRE une expression : il suit un opérateur, une
    parenthèse, une virgule ou un début d'instruction — jamais une valeur, où
    il serait une division. Heuristique, mais celle des coloriseurs, et elle
    suffit ici puisqu'on ne cherche qu'à ne pas se désynchroniser."""
    out, i, n = [], 0, len(src)
    while i < n:
        c = src[i]
        if c in "\"'`":                       # chaîne : on la recopie entière
            j = i + 1
            while j < n and not (src[j] == c and src[j - 1] != "\\"):
                j += 1
            out.append(src[i:j + 1]); i = j + 1; continue
        if c == "/" and i + 1 < n and src[i + 1] == "/":
            j = src.find("\n", i)
            j = n if j < 0 else j
            out.append(src[i:j]); i = j; continue
        if c == "/" and i + 1 < n and src[i + 1] == "*":
            j = src.find("*/", i)
            j = n if j < 0 else j + 2
            out.append(src[i:j]); i = j; continue
        if c == "/":
            k = len(out) - 1
            prec = ""
            while k >= 0 and not prec:
                prec = out[k].strip()[-1:] if out[k].strip() else ""
                k -= 1
            if prec in ("", "(", ",", "=", "!", "&", "|", ":", ";", "{", "}", "?", "+", "["):
                j, classe = i + 1, False
                while j < n:
                    d = src[j]
                    if d == "\\":
                        j += 2; continue
                    if d == "[":
                        classe = True
                    elif d == "]":
                        classe = False
                    elif d == "/" and not classe:
                        break
                    elif d == "\n":
                        break
                    j += 1
                out.append(" " * (j - i + 1)); i = j + 1; continue
        out.append(c); i += 1
    return "".join(out)


def sans_tr(src):
    """Le code, les appels tr(français, anglais) retirés.

    Le moteur écrit les deux langues CÔTE À CÔTE : tr("…", "…"). Le français
    y est donc toujours présent dans le fichier — et un compteur naïf le
    compterait comme non traduit, si bien que traduire ne ferait jamais
    baisser le nombre. On retire donc chaque appel tr(…) complet avant de
    compter : ce qui reste est le français qui n'a PAS encore son anglais.

    On apparie les parenthèses en respectant les chaînes : une parenthèse
    dans « (dépistage) » ne ferme rien."""
    out, i, n = [], 0, len(src)
    while i < n:
        j = src.find("tr(", i)
        # « tr( » doit être un appel, pas la fin d'un autre mot (« montr(… »).
        while j != -1 and j > 0 and (src[j - 1].isalnum() or src[j - 1] in "_$."):
            j = src.find("tr(", j + 1)
        if j == -1:
            out.append(src[i:])
            break
        out.append(src[i:j])
        k, prof, delim = j + 3, 1, ""
        while k < n and prof:
            c = src[k]
            if delim:
                if c == "\\":
                    k += 2
                    continue
                if c == delim:
                    delim = ""
            elif c in "\"'`":
                delim = c
            elif c == "(":
                prof += 1
            elif c == ")":
                prof -= 1
            k += 1
        i = k
    return "".join(out)


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
    # UN ATTRIBUT POSÉ SUR UNE BALISE FERMANTE NE FAIT RIEN, ET NE DIT RIEN.
    #
    # Le marquage initial a été fait par un script qui reculait jusqu'au « < »
    # précédant le texte. Quand ce texte suit une balise fermée —
    # « <span class="num">01</span>Contexte » — il tombait sur « </span> », et
    # l'attribut s'y collait. Le navigateur ignore les attributs des balises
    # fermantes : le HTML s'affiche normalement, et l'élément n'est simplement
    # JAMAIS traduit. Quatre libellés étaient dans ce cas, dont deux titres
    # d'encadré et le mot « Avertissement ».
    fermantes = re.findall(r'</[a-zA-Z]+[^>]*data-i18n="([\w.]+)"[^>]*>', page)
    if fermantes:
        ecarts.append("data-i18n posé sur une balise FERMANTE : %s. Le navigateur "
                      "l'ignore, l'élément n'est jamais traduit, et rien ne le "
                      "signale." % ", ".join(sorted(set(fermantes))))

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

    # --- LA PRÉSENTATION, VUE PAR VUE ---
    #
    # C'est le PREMIER écran. Une vue qui manquerait en anglais afficherait du
    # français sans prévenir ; une étape qui manquerait ferait un guide en
    # trois points là où il en faut quatre, et personne ne saurait qu'il en
    # manque un. On compare donc les deux jeux CLÉ PAR CLÉ, et jusqu'à la
    # longueur des listes.
    def jeu(nom):
        m = re.search(r"var %s = \{(.*?)\n\};" % nom, page, re.S)
        if not m:
            return None
        corps = m.group(1)
        # LA DERNIÈRE VUE N'ÉTAIT PAS LUE — pour la DEUXIÈME fois dans ce
        # fichier. Le motif exigeait « } » suivi d'une virgule optionnelle PUIS
        # d'un saut de ligne ; la dernière vue, elle, est suivie de « \n}; ».
        # Les deux jeux manquaient donc la même vue, concordaient, et le
        # contrôle passait au vert sur une présentation incomplète. Un angle
        # mort en bout de liste est le plus coûteux : c'est là qu'on ajoute.
        # On repère les ouvertures et on referme par comptage d'accolades.
        vues = {}
        for m in re.finditer(r"\n  (\w+): \{", corps):
            debut = m.end()
            prof, i, n = 1, debut, len(corps)
            delim = ""
            while i < n and prof:
                c = corps[i]
                if delim:
                    if c == "\\":
                        i += 2
                        continue
                    if c == delim:
                        delim = ""
                elif c in "\"'`":
                    delim = c
                elif c == "{":
                    prof += 1
                elif c == "}":
                    prof -= 1
                i += 1
            bloc = corps[debut:i - 1]
            champs = {}
            for c in ("eyebrow", "titre", "lead", "cta", "cible", "guideTitre", "astuce"):
                champs[c] = bool(re.search(r"\b%s:" % c, bloc))
            for liste in ("reperes", "etapes"):
                champs[liste] = compte_items(bloc, liste)
            vues[m.group(1)] = champs
        return vues

    FR, EN = jeu("PRESENTATIONS"), jeu("PRESENTATIONS_EN")
    if not FR or not EN:
        ecarts.append("impossible de lire PRESENTATIONS%s dans la page — la "
                      "présentation ne serait plus contrôlée du tout."
                      % ("" if FR else " et PRESENTATIONS_EN"))
    else:
        manque = sorted(set(FR) - set(EN))
        trop = sorted(set(EN) - set(FR))
        if manque:
            ecarts.append("la présentation anglaise n'a pas les vues %s : elles "
                          "s'afficheraient en français, et c'est le PREMIER écran."
                          % ", ".join(manque))
        if trop:
            ecarts.append("la présentation anglaise a des vues que le français n'a "
                          "pas : %s." % ", ".join(trop))
        boiteux = []
        for v in sorted(set(FR) & set(EN)):
            for c, a in FR[v].items():
                b = EN[v][c]
                if a != b:
                    boiteux.append("%s/%s (fr %s, en %s)" % (v, c, a, b))
        if boiteux:
            ecarts.append("la présentation anglaise ne suit pas la française : %s. "
                          "Un guide en trois points là où il en faut quatre ne dit "
                          "pas qu'il lui en manque un." % " ; ".join(boiteux))
        if not (manque or trop or boiteux):
            dits.append("la présentation a ses %d vues dans les deux langues, avec "
                        "le même nombre de repères et d'étapes." % len(FR))

    # LE NOM D'UNE MOLÉCULE EST TENU PAR LE MOTEUR, PAS PAR LA PAGE.
    #
    # La page gardait sa propre table de noms : l'interface disait
    # « Ciprofloxacine » dans le panneau de saisie pendant que l'alerte, juste
    # en dessous, disait « Ciprofloxacin ». Deux noms pour la même molécule
    # sur le même écran. ABX ne garde donc plus que ce qui lui est propre —
    # le code imprimé sur le disque — et le nom passe par nomAbx().
    restes = re.findall(r"ABX\[[^\]]+\]\.n\b", page)
    if len(restes) > 1:     # la définition de nomAbx() s'en sert, et elle seule
        ecarts.append("phenobac.html lit encore %d fois le nom d'une molécule dans sa "
                      "propre table au lieu de le demander au moteur : l'interface "
                      "afficherait le nom français au milieu d'un commentaire anglais."
                      % len(restes))
    if "function nomAbx(k)" not in page:
        ecarts.append("phenobac.html n'a plus de nomAbx() : les noms de molécules "
                      "cesseraient de suivre la langue.")

    # --- LES APPELS tr(), UN PAR UN ---
    moteur = open(os.path.join(RACINE, "moteur.js"), encoding="utf-8").read()
    vides, calques = [], []
    for m in re.finditer(r'(?<![\w.$])tr\(', moteur):
        j, prof, delim, k = m.end(), 1, "", m.end()
        while k < len(moteur) and prof:
            c = moteur[k]
            if delim:
                if c == "\\":
                    k += 2
                    continue
                if c == delim:
                    delim = ""
            elif c in "\"'`":
                delim = c
            elif c == "(":
                prof += 1
            elif c == ")":
                prof -= 1
            k += 1
        corps = moteur[j:k - 1]
        # Les deux arguments, séparés par la virgule de premier niveau.
        prof, delim, coupe = 0, "", -1
        for p, c in enumerate(corps):
            if delim:
                if c == "\\":
                    continue
                if c == delim:
                    delim = ""
            elif c in "\"'`":
                delim = c
            elif c in "([{":
                prof += 1
            elif c in ")]}":
                prof -= 1
            elif c == "," and prof == 0:
                coupe = p
                break
        # LA DÉFINITION N'EST PAS UN APPEL. « function tr(fr, en) » et la
        # phrase « tr(français, anglais) » d'un commentaire tombaient dans le
        # filet, et le contrôle criait sur lui-même — un voyant toujours rouge
        # n'apprend rien. On ne retient que les appels dont le premier
        # argument est une CHAÎNE.
        if not re.match(r"\s*[\"'`]", corps):
            continue
        if coupe < 0:
            vides.append(corps[:40])
            continue
        fr_, en_ = corps[:coupe], corps[coupe + 1:]
        if not re.search(r"[\"'`]\s*\S", en_):
            vides.append(fr_.strip()[:50])
        elif francaises(chaines(en_)):
            calques.append(en_.strip()[:60])
    if vides:
        ecarts.append("appels tr() sans anglais : %s. La phrase resterait française "
                      "en mode anglais, sans que rien ne le dise."
                      % " ; ".join(vides[:4]))
    if calques:
        ecarts.append("appels tr() dont le second argument est encore du FRANÇAIS : %s. "
                      "Un copier-coller laissé en place est pire qu'une absence : il "
                      "passe pour une traduction." % " ; ".join(calques[:4]))
    if not (vides or calques):
        n = len(re.findall(r"(?<![\w.$])tr\(", moteur))
        dits.append("les %d phrases bilingues du moteur ont leurs deux langues." % n)

    # --- LE PLAFOND ---
    restes, monte, limites = {}, [], dict(PLAFOND)
    limites["phenobac.html (texte visible)"] = PLAFOND_VISIBLE
    for f, limite in sorted(limites.items()):
        if f.startswith("phenobac.html"):
            n = len(francaises(texte_visible(page)))
        else:
            src = open(os.path.join(RACINE, f), encoding="utf-8").read()
            n = len(francaises(chaines(sans_tr(src))))
        restes[f] = n
        if n > limite:
            monte.append("%s : %d chaînes françaises, contre %d au plafond — la "
                         "traduction a RECULÉ de %d." % (f, n, limite, n - limite))
    if monte:
        ecarts.append("le français restant AUGMENTE : %s. Une livraison qui ajoute "
                      "du texte non traduit défait le travail aussi vite qu'il se "
                      "fait." % " ; ".join(monte))
    else:
        gagne = sum(limites[f] - restes[f] for f in restes)
        dits.append("le français restant ne dépasse aucun plafond (%s)%s."
                    % (", ".join("%s %d/%d" % (f, restes[f], limites[f])
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
