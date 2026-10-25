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
    # CE PLAFOND-CI N'EST PAS UNE DETTE, C'EST UN PLANCHER.
    #
    # Les 43 chaînes françaises de rendu-cible.js sont les commentaires et les
    # notes que la HAS impose au compte rendu, recopiés mot pour mot d'une
    # recommandation qui n'existe qu'en français. Les traduire produirait un
    # texte qui ressemble à la recommandation sans en être une, et qu'un
    # laboratoire recopierait en croyant citer la HAS. Elles ne descendront
    # pas, et le rendu porte en anglais la phrase qui dit pourquoi (champ
    # « citation » de renduCible). Ce qui reste utile ici, c'est qu'elles
    # n'AUGMENTENT pas.
    "rendu-cible.js": 43,
}

# Le texte VISIBLE encore en français, morceaux. Mesuré à part des fichiers
# JavaScript, et par une lecture HTML : voir texte_visible().
#
# 124 au relevé du 25 octobre 2026, 0 le même jour. ZÉRO EST LE MOMENT OÙ CE
# PLAFOND SERT LE PLUS : n'importe quelle phrase française ajoutée à la page
# sans son entrée de catalogue le fait échouer. Il ne remonte pas.
PLAFOND_VISIBLE = 0

ACCENTS = re.compile(r'[àâäéèêëîïôöùûüçœÀÉÈÊÎÔÛÇ]')

# NOMS PROPRES ACCENTUÉS, QUI NE SONT PAS DU FRANÇAIS.
#
# « PhénoBac » porte un accent, et une phrase anglaise qui le contient était
# comptée comme française : le compteur s'alarmait sur le nom du produit, et
# douze mille caractères de traduction anglaise faisaient MONTER le reliquat.
# Un compteur qui se trompe dans ce sens-là est pire qu'absent : il décourage
# précisément le travail qu'il est censé encourager.
# « Phéno » seul, parce que le logo coupe le nom en deux : « Phéno<b>Bac</b> ».
# Le morceau de gauche arrivait au compteur comme un mot français accentué.
PROPRES = re.compile(r'Phéno\s*Bac|^Phéno$|Sominé\s*DOLO|Mopti|Modibo|Coulibaly|'
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


def _fermant(html, depart, balise):
    """L'indice du fermant qui referme VRAIMENT la balise ouverte, niveaux
    comptés. -1 si le document s'achève avant."""
    niveau, j = 1, depart
    jeton = re.compile(r'<(/?)%s\b[^>]*>' % re.escape(balise))
    while niveau:
        t = jeton.search(html, j)
        if not t:
            return -1
        niveau += -1 if t.group(1) else (0 if t.group(0).endswith("/>") else 1)
        j = t.end()
    return j - len(balise) - 3


def _oter_marques(html):
    """Le contenu des éléments marqués, retiré EN COMPTANT LES NIVEAUX.

    « <(\\w+)[^>]*data-i18n=…>.*?</\\1> » s'arrêtait au PREMIER fermant du même
    nom. Or le gabarit de l'application est

        <span class="eyebrow" data-i18n="cr.regles"><span class="num">R</span>Règles appliquées</span>

    et le « </span> » du numéro refermait le motif : « Règles appliquées »
    ressortait, compté comme français non traduit alors qu'il l'était depuis
    le début. Quatorze libellés étaient dans ce cas, et le plafond portait
    donc quatorze dettes imaginaires — on aurait traduit sans voir le nombre
    bouger, ce qui est la façon la plus sûre de faire abandonner un travail.

    On compte les ouvrants et les fermants de même nom."""
    out, i = [], 0
    marque = re.compile(r'<(\w+)(?=[^>]*\sdata-i18n(?:-html)?=")[^>]*>')
    while True:
        m = marque.search(html, i)
        if not m:
            out.append(html[i:])
            break
        out.append(html[i:m.start()])
        out.append(" ")
        nom = m.group(1)
        if m.group(0).endswith("/>"):
            i = m.end()
            continue
        niveau, j = 1, m.end()
        jeton = re.compile(r'<(/?)%s\b[^>]*>' % re.escape(nom))
        while niveau and j < len(html):
            t = jeton.search(html, j)
            if not t:
                j = len(html)
                break
            niveau += -1 if t.group(1) else (0 if t.group(0).endswith("/>") else 1)
            j = t.end()
        i = j
    return "".join(out)


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
    # Le <title> est remplacé par traduire(), qui fait
    # « document.title = L("page.titre") » : il est traduit, mais aucun
    # data-i18n ne peut le marquer puisqu'on ne traduit pas son contenu mais
    # la propriété du document. Le maillon ci-dessous vérifie que cette ligne
    # existe toujours ; sans elle, ce retrait masquerait un vrai oubli.
    sans = re.sub(r"<title\b.*?</title>", " ", sans, flags=re.S | re.I)
    # Retirer le CONTENU des éléments déjà marqués : ils sont traduits au
    # chargement, et les compter ferait stagner le nombre quoi qu'on traduise.
    #
    # data-i18n-html AUSSI, et son oubli faisait exactement cela : onze blocs
    # traduits — toute la présentation et la page « À propos » — restaient
    # comptés comme français, parce que leur texte DOIT figurer dans la page
    # pour s'afficher avant que langue.js ait tourné. Le nombre ne bougeait
    # presque pas alors que le travail avançait, et un nombre qui ne suit pas
    # le travail ne mesure pas le travail.
    sans = _oter_marques(sans)
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
                # DÉFAIRE LES ÉCHAPPEMENTS. Le motif les traverse correctement
                # mais les RESTITUE tels quels : « class=\\"ck\\" » arrivait avec
                # ses barres, là où la page porte « class="ck" ». La
                # confrontation page/catalogue criait à la divergence sur le
                # premier bloc riche contenant un attribut HTML — c'est-à-dire
                # sur tous ceux qui comptent.
                e[nom] = (t.group(1).replace('\\"', '"').replace("\\n", "\n")
                                    .replace("\\t", "\t").replace("\\\\", "\\"))
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

    # --- LES BLOCS RICHES : LE MÊME FRANÇAIS À DEUX ENDROITS ---
    #
    # data-i18n-html remplace un bloc ENTIER, balisage compris : c'est ce qui
    # permet de traduire un paragraphe où le gras porte une partie du sens,
    # au lieu d'en découper douze fragments sans phrase.
    #
    # Mais la page doit s'afficher AVANT que langue.js ait tourné. Le
    # français vit donc aux deux endroits — dans phenobac.html et dans le
    # catalogue — et deux copies d'une même donnée divergent : on corrige une
    # tournure dans la page, le catalogue garde l'ancienne, et au premier
    # changement de langue le texte REVIENT EN ARRIÈRE sous les yeux du
    # lecteur. C'est exactement la panne qui avait fait rendre « S » à l'écran
    # pour un seuil que le rapport jugeait autrement.
    #
    # On confronte donc, bloc par bloc.
    riches = re.findall(r'data-i18n-html="([\w.]+)"', page)
    manquantes = sorted(set(k for k in riches if k not in C))
    if manquantes:
        ecarts.append("la page réclame des blocs riches absents du catalogue : %s — "
                      "ils s'afficheraient entre crochets dès le premier changement "
                      "de langue." % ", ".join(manquantes))

    def _norm(t):
        return re.sub(r"\s+", " ", t).strip()

    divergent, relus = [], 0
    for cle in riches:
        if cle in manquantes:
            continue
        # « [a-zA-Z]+ » attrapait « h » dans « h1 » et cherchait « </h> » :
        # le contrôle annonçait un bloc non refermé là où tout allait bien.
        m = re.search(r'<([a-zA-Z][a-zA-Z0-9]*)([^>]*?)data-i18n-html="%s"([^>]*)>'
                      % re.escape(cle), page)
        if not m:
            continue
        balise, j = m.group(1), m.end()
        # EN COMPTANT LES NIVEAUX. « page.find("</span>") » s'arrêtait au
        # fermant du span IMBRIQUÉ — celui du compteur d'espèces, celui des
        # zones remplies par le script — et le contrôle criait à la
        # divergence sur deux blocs parfaitement identiques. Un contrôle qui
        # crie à tort finit par être ignoré, ce qui revient à ne plus l'avoir.
        fin = _fermant(page, j, balise)
        if fin < 0:
            ecarts.append("le bloc riche « %s » n'est pas refermé dans la page." % cle)
            continue
        relus += 1
        if _norm(page[j:fin]) != _norm(C[cle].get("fr", "")):
            divergent.append(cle)
    if divergent:
        ecarts.append("le HTML de la page et le français du catalogue ont divergé pour "
                      "%s. Le lecteur verrait le texte CHANGER au premier basculement "
                      "de langue, et revenir à une version qu'on croyait corrigée."
                      % ", ".join(sorted(divergent)))

    # Une entrée du catalogue est injectée par innerHTML. Elle vient d'un
    # fichier de l'application, jamais d'une saisie — mais une règle qu'on ne
    # vérifie pas n'est qu'une intention.
    dangereuses = sorted(k for k in riches if k in C and any(
        re.search(r"<\s*script|\son\w+\s*=", (C[k].get(l) or ""), re.I)
        for l in ("fr", "en")))
    if dangereuses:
        ecarts.append("un bloc riche porte du script ou un gestionnaire d'événement : "
                      "%s. Ces entrées sont injectées par innerHTML ; elles ne "
                      "contiennent que de la mise en forme." % ", ".join(dangereuses))

    if riches and not manquantes and not divergent and not dangereuses:
        # Le compte est dit : un contrôle qui ne confronterait plus rien
        # passerait au vert en silence.
        dits.append("les %d blocs riches de la page disent le même français que le "
                    "catalogue, et aucun ne porte de script." % relus)
    elif not riches and "data-i18n-html" in page:
        ecarts.append("phenobac.html contient « data-i18n-html » mais ce contrôle n'en "
                      "relève aucun : l'écriture de l'attribut a changé et la "
                      "confrontation page/catalogue ne se fait plus.")

    for maillon, pourquoi in (
            ('<script src="langue.js">', "le catalogue ne serait pas chargé"),
            ('id="langSwitch"', "il n'y aurait aucun moyen de changer de langue"),
            ("function traduire()", "les éléments marqués ne seraient jamais remplis"),
            ('document.title = L("page.titre")',
             "l'onglet du navigateur garderait son titre français, et le compteur de "
             "texte visible — qui retire le <title> en comptant sur cette ligne — "
             "cesserait de voir l'oubli"),
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

    # --- LE NIVEAU DE CONFIANCE : UNE CLÉ, QU'IL NE FAUT PAS AFFICHER ---
    #
    # « confirmé », « probable », « possible » servent de valeurs
    # d'aiguillage : moteur.js et la page les comparent à ces mots-là. On ne
    # peut donc pas les traduire. Mais la page les AFFICHAIT tels quels, et
    # un rapport anglais portait « confirmé ».
    #
    # Le moteur expose confianceLibelle() ; la page doit s'en servir. Le banc
    # essai-langue.js exempte la clé du recensement en se fiant à ce
    # contrôle-ci : si la page se remettait à afficher la clé, l'exemption
    # deviendrait un trou, et personne ne le verrait. C'est ici qu'on regarde.
    if "confianceLibelle" not in moteur:
        ecarts.append("moteur.js n'expose plus confianceLibelle() : la page ne pourrait "
                      "plus traduire le niveau de confiance, et le recensement de "
                      "essai-langue.js exempte cette clé en comptant sur ce contrôle.")
    else:
        brut = re.findall(r"esc\(\s*A\.confiance\b[^)]*\)", page)
        if brut:
            ecarts.append("la page affiche la CLÉ du niveau de confiance au lieu de son "
                          "libellé (%d fois : %s). En anglais, le rapport porterait "
                          "« confirmé ». Passez par nivLibelle(), qui appelle "
                          "confianceLibelle() du moteur."
                          % (len(brut), ", ".join(brut[:3])))
        elif "nivLibelle" not in page:
            ecarts.append("la page n'appelle plus nivLibelle() : ou le niveau de confiance "
                          "n'est plus affiché, ou il l'est par un autre chemin que ce "
                          "contrôle ne surveille pas. Vérifiez, puis mettez ce contrôle à "
                          "jour — tel quel, il ne garantit plus rien.")
        else:
            dits.append("le niveau de confiance est affiché par son libellé, jamais par sa "
                        "clé : « confirmed » en anglais, « confirmé » en français.")

    # --- LA TYPOGRAPHIE FRANÇAISE DANS UNE PHRASE ANGLAISE ---
    #
    # Le français met une espace devant « : », « ; », « ! », « ? », et des
    # guillemets « ainsi ». L'anglais ne fait ni l'un ni l'autre, et une
    # phrase anglaise qui garde ces usages se lit comme une traduction faite
    # à la hâte — « EUCAST : Gentamicin » au lieu de « EUCAST: Gentamicin ».
    #
    # LE RECENSEMENT DE essai-langue.js NE PEUT PAS LE VOIR : il cherche des
    # MOTS français, et il n'y a pas de mot ici. C'est un défaut qui ne se
    # trouve qu'en le cherchant exprès.
    typo = re.compile(r" [:;!?»]|« ")
    fautives = []
    for cle, e in sorted(C.items()):
        if e.get("en") and typo.search(e["en"]):
            fautives.append("catalogue:" + cle)
    for m in re.finditer(r'tr\(\s*"(?:[^"\\]|\\.)*"\s*,\s*(?:\n\s*)?"((?:[^"\\]|\\.)*)"',
                         moteur, re.S):
        if typo.search(m.group(1)):
            fautives.append("moteur.js:" + str(moteur.count("\n", 0, m.start()) + 1))
    if fautives:
        ecarts.append("%d phrase(s) anglaise(s) gardent la typographie française "
                      "(espace avant « : », guillemets français) : %s. L'anglais n'en "
                      "met pas, et le recensement par mots français ne peut pas le "
                      "voir." % (len(fautives), ", ".join(fautives[:8])))
    else:
        dits.append("aucune phrase anglaise ne garde l'espace française devant les "
                    "deux-points ni les guillemets français.")

    # --- LES ÉTIQUETTES QUE LE SCRIPT DE LA PAGE FABRIQUE ---
    #
    # texte_visible() écarte les <script>, à bon droit : trois tentatives de
    # balayage s'y sont cassées, et le compte a valu 618, 617, 758 puis 821
    # sans qu'une ligne change. Mais le script ÉCRIT du texte visible — le
    # verdict phénotypique, les degrés de gravité, les quatre niveaux
    # d'alerte, « Pourquoi ce phénotype », « non testé ». Au navigateur, le
    # 25 octobre 2026, le moteur rendait un MRSA entièrement en anglais dans
    # un panneau dont toutes les étiquettes étaient restées françaises.
    #
    # ON NE POSE PAS DE PLAFOND SUR UN NOMBRE QUI NE SUIT PAS LE TRAVAIL :
    # mesuré par chaines(), le script donne 529, dont des commentaires avalés
    # et la table française des noms de molécules, qui a son pendant anglais
    # dans le moteur. Un tel plafond ne retiendrait rien et se ferait lever.
    #
    # On garde donc une LISTE DE NON-RETOUR : les littéraux précis qui ont été
    # traduits ici, et qui ne doivent pas revenir nus. C'est étroit, et cela
    # ne prétend pas mesurer le reste — la mesure complète du texte engendré
    # est un recensement au navigateur, qui n'est pas dans la chaîne.
    # Chaque entrée est la forme NUE, celle d'avant la traduction. Elle doit
    # être assez précise pour ne pas s'apparier avec le premier membre d'un
    # T() — « "Alerte majeure" » existe toujours, à l'intérieur de T(), et
    # l'y chercher ferait un contrôle qui crie toujours.
    NON_RETOUR = [
        '>Verdict phénotypique · $',
        '>Pourquoi&nbsp;? — dérouler le raisonnement<',
        '<div class="sect-t">Pourquoi ce phénotype',
        '<div class="sect-t">Alertes &amp; cohérence<',
        'crit:["!!","Alerte majeure"]',
        'warn:["!","À vérifier"]',
        'stop:["⊘","Interprétation impossible"]',
        '${esc(x.txt)} — non testé</span>',
        '} · base de connaissances $',
        '<span>Pour trancher : $',
        '<span>Confirmé par : $',
        '<div class="ns-t">⊘ Interprétation automatique non sécurisée</div>',
        'const sevLbl = SEV_LBL[A.sev];',
        '<div class="sect-t">Lecture interprétative — résultat rendu<',
        '"possible": ["poss", "Un élément discorde',
        '<div class="sect-t">Résistances naturelles de cette espèce<',
        '<div class="sect-t">Posologies qui fondent ces seuils<',
        '>↥ Verser cet isolat à la surveillance<',
        '⎙</span> Exporter le compte-rendu (PDF)<',
        '<div class="poso-dit">Schémas employés',
        '<div class="nat-dit">Attendues,',
        '<div class="sect-t">Commentaire du compte-rendu<',
        'id="copyBtn">Copier<',
        '<span class="cr-m-x">Validation biologique requise.</span>',
        '+ "pas un dispositif médical de diagnostic in vitro. Validation biologique requise.");',
    ]
    revenus = [t for t in NON_RETOUR if t in page]
    if revenus:
        ecarts.append("%d étiquette(s) du panneau d'interprétation sont redevenues "
                      "françaises nues, sans passer par T() : %s. Le moteur rendrait "
                      "son commentaire en anglais dans un cadre français."
                      % (len(revenus), ", ".join(repr(t) for t in revenus[:5])))
    else:
        dits.append("les %d étiquettes du panneau d'interprétation passent toutes par "
                    "T() — le cadre suit la langue du commentaire qu'il entoure."
                    % len(NON_RETOUR))

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
