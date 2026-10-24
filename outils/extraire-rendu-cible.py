# -*- coding: utf-8 -*-
"""
extraire-rendu-cible.py — les tableaux décisionnels de l'antibiogramme ciblé.

SOURCE
    HAS, « Antibiogrammes ciblés pour les infections urinaires à
    Entérobactéries dans la population féminine adulte (à partir de 12 ans) »,
    recommandation validée par le Collège le 5 octobre 2023. Tableaux
    décisionnels élaborés par la SFM (CA-SFM) et la SPILF, labellisés par la
    HAS à la demande de la DGS.

CE QUI REND CETTE EXTRACTION PARTICULIÈRE

La décision n'est PAS dans le texte. Chaque case du tableau est une
couleur, et la légende du document dit :

    « Cases orange = molécules à rendre sur l'antibiogramme ciblé »
    « Cases gris clair = molécules à ne pas rendre sur l'antibiogramme
      ciblé sauf en cas de résistance »

On décode donc les RECTANGLES REMPLIS du flux PDF, avec leur couleur et
leur position, et on les rattache aux libellés de lignes par l'ordonnée.
Le texte seul ne porte rien : aplati, il donne la liste des molécules et
celle des phénotypes, sans jamais dire quelle molécule va avec quel
phénotype.

PRUDENCE. Masquer un résultat d'antibiogramme est un acte grave : se
tromper de colonne, c'est cacher au clinicien la seule molécule active.
L'outil s'interrompt donc plutôt que de produire un tableau douteux —
toute ligne dont le nombre de cases ne correspond pas au nombre de
colonnes attendu arrête l'extraction.

    python3 outils/extraire-rendu-cible.py <recommandation.pdf> > rendu-cible.js
"""
import importlib.util
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
_s = importlib.util.spec_from_file_location("pdfpos", os.path.join(ICI, "pdfpos.py"))
PDF = importlib.util.module_from_spec(_s)
_s.loader.exec_module(PDF)

ORANGE = (1.0, 0.753, 0.0)          # à rendre
GRIS = (0.933, 0.925, 0.882)        # à ne pas rendre, sauf si résistant

# Les trois tableaux : pages (indices 0), abscisses des colonnes, et le nom
# que PhénoBac donnera à chaque colonne. Les abscisses sont relevées sur le
# document ; un contrôle plus bas vérifie que chaque ligne en trouve bien le
# compte, de sorte qu'une remise en page se signale au lieu de décaler.
TABLEAUX = [
    # Vingt lignes, dont DEUX d'amoxicilline-acide clavulanique : « (cystite) »
    # et « (pyélonéphrite) ». Elles valaient dix-neuf tant qu'une ligne vide
    # tronquait le second libellé et faisait fondre les deux ; depuis que la
    # recollection enjambe le vide, le document est lu tel qu'il est écrit.
    # Les deux portent la même décision, et l'engin ne voit qu'un code AMC.
    {"cle": "sansRenseignement", "attendu": 20, "pages": [10, 11], "x": [236, 299, 363, 477],
     "titre": "ECBU positif, sans renseignement clinique",
     "colonnes": ["amoxS", "amoxR", "amcEtSxtR", "c3gRouBlse"]},
    {"cle": "cystite", "attendu": 19, "pages": [12, 13], "x": [178, 281, 364],
     "titre": "ECBU positif, cystite",
     "colonnes": ["premiereIntentionS", "premiereIntentionR", "premiereEtAmcEtCfmR"]},
    {"cle": "pyelonephrite", "attendu": 15, "pages": [14, 15], "x": [221, 285, 354, 470],
     "titre": "ECBU positif, pyélonéphrite",
     "colonnes": ["amoxS", "amoxR", "amcEtSxtR", "c3gRouBlse"]},
]

# Libellé du document → codes PhénoBac. Une ligne peut porter plusieurs
# molécules (« Céfotaxime, ceftriaxone ») : la décision vaut pour toutes.
# « Autres molécules » n'a pas de code : c'est une consigne, pas un couple.
MOLECULES = [
    # L'ORDRE COMPTE, et la troncature aussi. La mise en page coupe les
    # libellés : « Amoxicilline-acide clavula- » doit rester de l'AMC. Il
    # tombait sur « ^Amoxicilline » et recevait AMX — la décision d'une
    # molécule appliquée à une autre, le pire défaut possible pour un
    # rendu sélectif.
    (r"^Amoxicilline\s*-\s*acide clavula.*\(\s*cystite", ["AMC"], "cystite"),
    (r"^Amoxicilline\s*-\s*acide clavula.*\(\s*pyélon", ["AMC"], "pyelonephrite"),
    (r"^Amoxicilline\s*-\s*acide clavula", ["AMC"], None),
    (r"^Amoxicilline(?!\s*-\s*acide)", ["AMX"], None),
    (r"^Pivmécillinam", ["MEC"], None),
    (r"^Fosfomycine", ["FOS"], None),
    (r"^Nitrofuranto", ["NIT"], None),
    (r"^Triméthoprime\s*-\s*sulfam", ["SXT"], None),
    (r"^Triméthoprime", ["TMP"], None),
    (r"^Céfixime", ["CFM"], None),
    (r"^Céfotaxime", ["CTX", "CRO"], None),
    (r"^Fluoroquinolones", ["CIP", "OFX", "LVX"], None),
    (r"^Témocilline", ["TEM"], None),
    (r"^Céfoxitine", ["FOX"], None),
    (r"^Pipéracilline", ["TZP"], None),
    (r"^Ceftazidime", ["CAZ"], None),
    (r"^Céfépime", ["FEP"], None),
    (r"^Aztréonam", ["ATM"], None),
    (r"^Amikacine", ["AMK", "GEN"], None),
    (r"^Carbapénèmes", ["ETP", "IPM", "MEM"], None),
    (r"^Autres molécules", [], None),
]


# ===========================================================================
#   LA SECONDE MOITIÉ DE LA RECOMMANDATION : LES NOTES ET LE § 2.1.3
# ===========================================================================
#
# Les couleurs des cases ne disent pas tout. Sous chaque tableau, trois notes
# (A) (B) (C) retirent des molécules que la case avait rendues, et le § 2.1.3
# pose sept règles de plus. Prendre les couleurs sans les notes, c'est rendre
# un carbapénème là où le document l'interdit.
#
# Ce texte-là se lit à plat, mais le document le CASSE : la justification est
# dessinée lettre par lettre et quelques mots y portent une espace parasite —
# « ca rbapénèmes », « no uvelles ». Les deux décodeurs la voient, donc elle
# est dans le document, pas dans l'extraction.
#
# On la répare par le document lui-même : deux mots se recollent si le mot
# obtenu est PLUS FRÉQUENT dans la recommandation que chacun des deux
# fragments. « carbapénèmes » y est partout, « rbapénèmes » une seule fois.
# Aucun dictionnaire extérieur, aucune correction écrite à la main — et
# chaque recollage est annoncé sur la sortie d'erreur, pour être relu.


def _pypdf():
    try:
        from pypdf import PdfReader
    except ImportError:
        try:
            from PyPDF2 import PdfReader
        except ImportError:
            raise SystemExit(
                "EXTRACTION INTERROMPUE — pypdf est absent. Les notes (A)(B)(C) et le "
                "§ 2.1.3 en dépendent, et sans elles le rendu ciblé laisserait passer "
                "des carbapénèmes que le document écarte. Installez-le : pip3 install pypdf")
    return PdfReader


def _aplatir(page):
    t = page.extract_text() or ""
    for c in ("\u2011", "\u00ad"):
        t = t.replace(c, "-")
    t = t.replace("\u0fd7", " ")                      # espace fine exotique du document
    t = re.sub(r"HAS\s*•\s*Antibiogrammes ciblés.*?tobre 2023\s*\d+", " ", t, flags=re.S)
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"(\w)-\s+(\w)", r"\1\2", t)          # césures de fin de ligne
    return t


def _typo(t):
    t = re.sub(r"(\w)\s*-\s*(\w)", r"\1-\2", t)      # « ceftazidime - avibactam »
    t = re.sub(r"\(\s+", "(", t)
    t = re.sub(r"\s+([.,)])", r"\1", t)
    t = re.sub(r"\s*([;:!?»])", r" \1", t)             # ponctuation double à la française
    t = re.sub(r"«\s*", "« ", t)
    t = re.sub(r"(\d)\s+e\s+(génération|mois)", r"\1e \2", t)
    t = re.sub(r"([A-Za-zÀ-ÿ])\s+’", r"\1’", t)
    return t.strip()


# Les notes de BAS DE PAGE sont intercalées dans le fil du texte : « La liste
# inclut également les ⟨7 Pour rappel : … 8 https://… ⟩ antibiotiques testés ».
# Les laisser, c'est publier au compte rendu une phrase coupée par une URL.
# Leurs formes sont stables ; on les retire par leur début et leur fin, et le
# découpage en phrases qui suit se charge de dire si le recollement a tenu.
APPELS_BAS_DE_PAGE = [
    r"\d{1,2}\s*Pour\s+r\s*appel\s*:.*?«\s*résistante\s*»\s*\.",
    r"\d{1,2}\s*Société de pathologie infectieuse.*?medmal\.2018\.03\.005\.",
    r"Société de pathologie infectieuse de langue française \(SPILF\)\..*?medmal\.2018\.03\.005\.",
    r"\d{1,2}\s*Fiche Mémo HAS.*?\.pdf\.",
    r"\d{1,2}\s*Recommandations du Comité.*?casfm/\s*\.",
    r"\d{1,2}\s*Lettres d’information\s*ANSM\s*:.*?fluoroquinolones\.",
    r"\d{0,2}\s*https?\s*://\S+(?:\s*[;.]\s*https?\s*://\S+)*\s*\.?",
]


def sans_appels(t):
    for motif in APPELS_BAS_DE_PAGE:
        t = re.sub(motif, " ", t, flags=re.S)
    # L'appel collé au mot : « en vigueur 8 », « vigueur10 », « vigueur12, ».
    # Le chiffre suit une LETTRE ; « du 4e mois » suit une espace, et survit.
    t = re.sub(r"(?<=[A-Za-zÀ-ÿ»])\s?\d{1,2}(?=[\s,.;])", "", t)
    return re.sub(r"\s+", " ", t).strip()


_MOT = re.compile(r"(?<![A-Za-zÀ-ÿ])([A-Za-zÀ-ÿ]+) ([A-Za-zÀ-ÿ]+)(?![A-Za-zÀ-ÿ])")


def recoller(txt, freq, journal):
    """Recolle les mots que la mise en page a coupés, et seulement ceux-là."""
    i = 0
    while True:
        m = _MOT.search(txt, i)
        if not m:
            return txt
        a, b = m.group(1), m.group(2)
        j = (a + b).lower()
        if freq[j] > freq[a.lower()] and freq[j] > freq[b.lower()]:
            journal.append("« %s %s » → « %s »" % (a, b, a + b))
            txt = txt[:m.start()] + a + b + txt[m.end():]
            i = m.start()
        else:
            i = m.end(1)


def liste_entre_parentheses(txt, amorce):
    """Les listes du document — espèces du groupe 3, β-lactamines de spectre
    étroit, nouvelles associations — sont lues DANS la note qui les cite, et
    jamais recopiées ici : une liste écrite à la main peut diverger du texte
    qu'elle prétend appliquer."""
    m = re.search(amorce + r"\s*\(([^)]*)\)", txt)
    if not m:
        return []
    out = []
    for e in re.split(r",|\bet\b|\bou\b", m.group(1)):
        e = re.sub(r"^\s*(comme le|ex\.)\s*", "", e.strip(), flags=re.I)
        e = e.strip(" .…")
        if e:
            out.append(e)
    return out


# Où commence et où finit la section de commentaires de chaque tableau. Le
# § 2.1.4 dit QUOI écrire ; les sections 3.x.2 sont l'endroit où le document
# l'écrit, tableau par tableau — et elles DIFFÈRENT : la pyélonéphrite ne
# porte ni « en cas de cystite simple » ni le conseil sur le triméthoprime.
# Les recopier à la main, c'est les uniformiser par mégarde.
COMMENTAIRES = [
    ("sansRenseignement", "3.1.2.", "3.2. Antibiogramme"),
    ("cystite", "3.2.2.", "3.3. Antibiogramme"),
    ("pyelonephrite", "3.3.2.", "Participants"),
]


def commentaires_des_tableaux(pages, freq, journal):
    t = " ".join(pages[11:17])
    out = {}
    for cle, deb, fin in COMMENTAIRES:
        a = t.find(deb)
        b = t.find(fin, a)
        if a < 0:
            raise SystemExit(
                "EXTRACTION INTERROMPUE — la section « %s » de commentaires est "
                "introuvable. Le § 2.1.4 veut que ces phrases FIGURENT sur le compte "
                "rendu : les perdre, c'est rendre un antibiogramme ciblé muet." % deb)
        sec = _typo(sans_appels(t[a:b if b > 0 else a + 2800]))
        sec = re.sub(r"^3\.\d\.2\.\s*Commentaires associés au rendu de "
                     r"l’antibiogramme ciblé\s*", "", sec)
        phrases = []
        for ph in re.split(r"(?<=\.)\s+(?=[A-ZÀ-Þ(])", sec):
            ph = recoller(ph.strip(), freq, journal)
            if len(ph) < 20:
                continue
            m = re.match(r"^\((\d)\)\s*(.*)$", ph)
            phrases.append({"appel": m.group(1) if m else None,
                            "texte": m.group(2) if m else ph})
        # Une URL ou un appel de note resté dans une phrase signerait un
        # recollement manqué — et cette phrase part au compte rendu.
        for p in phrases:
            if re.search(r"https?\s*:|medmal|\.pdf\b", p["texte"]):
                raise SystemExit(
                    "EXTRACTION INTERROMPUE — tableau « %s » : une note de bas de page "
                    "est restée dans le commentaire « %s… ». Cette phrase figurerait "
                    "telle quelle sur le compte rendu." % (cle, p["texte"][:70]))
        if len(phrases) < 4:
            raise SystemExit(
                "EXTRACTION INTERROMPUE — tableau « %s » : %d commentaire(s) lus, "
                "au moins 4 attendus." % (cle, len(phrases)))
        out[cle] = phrases
    return out


def notes_et_restrictions(chemin):
    from collections import Counter
    PdfReader = _pypdf()
    # Deux lectures de la même page. Les notes et le § 2.1.3 se lisent sur le
    # texte mis en français ; les commentaires des tableaux ont d'abord besoin
    # qu'on leur retire les notes de bas de page, qui y sont INTERCALÉES.
    plates = [_aplatir(p) for p in PdfReader(chemin).pages]
    pages = [_typo(p) for p in plates]
    freq = Counter()
    for t in pages:
        freq.update(w.lower() for w in re.findall(r"[A-Za-zÀ-ÿ]+", t))
    journal = []

    # --- les notes (A) (B) (C), sous chaque tableau ---
    notes = {}
    for tb in TABLEAUX:
        suite = min(tb["pages"][-1] + 1, len(pages) - 1)
        t = " ".join(pages[i] for i in sorted(set(tb["pages"] + [suite])))
        k = t.find("Notes à destination des laboratoires")
        if k < 0:
            raise SystemExit(
                "EXTRACTION INTERROMPUE — tableau « %s » : le bloc de notes est "
                "introuvable. Les notes retirent des molécules que les couleurs "
                "rendaient ; sans elles le tableau est faux." % tb["cle"])
        bloc = re.split(r"3\.\d\.2\.", t[k:])[0]
        notes[tb["cle"]] = {}
        for lettre in "ABC":
            m = re.search(r"\(%s\)\s*(.*?)(?=\s*\([A-C]\)\s|$)" % lettre, bloc)
            if not m:
                raise SystemExit(
                    "EXTRACTION INTERROMPUE — tableau « %s » : note (%s) introuvable."
                    % (tb["cle"], lettre))
            notes[tb["cle"]][lettre] = recoller(m.group(1).strip(), freq, journal)

    # --- le § 2.1.3, sept règles qui ne sont dans aucune case ---
    t = " ".join(pages[7:10])
    a = t.find("2.1.3. Quelles sont les molécules")
    b = t.find("2.1.4. Quels sont les commentaires", a)
    if a < 0 or b < 0:
        raise SystemExit("EXTRACTION INTERROMPUE — le § 2.1.3 est introuvable.")
    sec = re.sub(r"\d+ (Recommandations du Comité|Lettres d’information|"
                 r"Société de pathologie|Fiche Mémo HAS|https)\S*.*?(?=‒ |• |$)",
                 " ", t[a:b])
    sec = sec.replace("Certains antibiotiques sont positionnés comme des molécules "
                      "de dernier recours.", "")
    restrictions = []
    for part in re.split(r"\s*‒\s*", sec)[1:]:
        part = re.sub(r"\s+", " ", part).strip()
        if not part:
            continue
        morceaux = re.split(r"\s*•\s*", part)
        restrictions.append({
            "regle": recoller(morceaux[0].strip(), freq, journal),
            "motif": recoller(" ".join(m.strip() for m in morceaux[1:]).strip(),
                              freq, journal) or None})
    if len(restrictions) != 7:
        raise SystemExit(
            "EXTRACTION INTERROMPUE — § 2.1.3 : %d règles lues, 7 attendues. "
            "Une règle perdue, c'est une molécule rendue que le document écarte."
            % len(restrictions))

    # --- les listes que les notes citent elles-mêmes ---
    noteA = notes["pyelonephrite"]["A"]
    noteB = notes["pyelonephrite"]["B"]
    noteC = notes["pyelonephrite"]["C"]
    listes = {
        "groupe3": liste_entre_parentheses(noteA, "Enterobacterales du groupe 3"),
        "c3g": liste_entre_parentheses(noteA, "céphalosporines de 3e génération"),
        "carbapenemes": liste_entre_parentheses(noteB, "ces molécules"),
        "betalactaminesEtroites": [
            e.strip() for e in re.split(
                r",", re.search(r"posologie\s*»\s*:\s*(.*?),\s*ii\)", noteB).group(1))
            if e.strip()] if re.search(r"posologie\s*»\s*:\s*(.*?),\s*ii\)", noteB) else [],
        "nouvelles": (liste_entre_parentheses(noteC, "associations avec inhibiteurs")
                      + liste_entre_parentheses(noteC, "nouvelles céphalosporines")),
    }
    for cle, v in listes.items():
        if not v:
            raise SystemExit(
                "EXTRACTION INTERROMPUE — la liste « %s » n'a pas été lue dans les "
                "notes. Elle commande un masquage ; l'écrire à la main serait "
                "inventer une règle." % cle)
    commentaires = commentaires_des_tableaux(plates, freq, journal)
    return notes, restrictions, listes, commentaires, journal


def page(objs, pg, ip):
    brut = PDF.contenu(objs, pg[ip])
    lignes = [(y, " ".join(s for _, s in f).strip())
              for y, f in PDF.lignes(PDF.extraire(brut, PDF.polices(objs, pg[ip]), "latin-1"))]
    flux = brut.decode("latin-1")
    coul, cells = None, []
    for t in re.finditer(r"([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(?:rg|sc|scn)"
                         r"|([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+re\s+f", flux):
        if t.group(1):
            coul = tuple(round(float(t.group(i)), 3) for i in (1, 2, 3))
        else:
            x, y, w, h = (float(t.group(i)) for i in (4, 5, 6, 7))
            if w > 40 and 8 < h < 30 and coul in (ORANGE, GRIS):
                cells.append((x, y + h / 2.0, coul))
    return lignes, cells


def propre(lab):
    # Le titre courant du document se glisse dans les libellés quand la ligne
    # tombe en bas de page. Il ne porte aucune décision ; le garder ne ferait
    # qu'enlaidir le fichier engendré.
    lab = re.sub(r"\s*HAS\s*•\s*Antibiogrammes ciblés.*", "", lab)
    lab = re.sub(r"\s*\(\s*[0-9A-C]\s*\)", "", lab)     # appels de note (1) (A)
    lab = re.sub(r"\s*-\s*", "-", lab)
    return re.sub(r"\s+", " ", lab).strip()


def molecule(lab):
    for motif, codes, variante in MOLECULES:
        if re.match(motif, lab, re.I):
            return codes, variante, motif
    return None, None, None


def extraire(chemin):
    data = open(chemin, "rb").read()
    objs = PDF.deplier_objstm(PDF.objets(data))
    pg = PDF.pages(data, objs)
    out = {}
    for tb in TABLEAUX:
        decision = {}
        for ip in tb["pages"]:
            lignes, cells = page(objs, pg, ip)
            # Regrouper les cases par ordonnée : une ligne du tableau.
            # L'ANCRE EST LE LIBELLÉ, pas l'ordonnée des cases.
            #
            # Deux regroupements ont échoué avant celui-ci, et la raison vaut
            # d'être écrite : quand un libellé passe à la ligne, la case orange
            # d'une colonne et les cases grises des autres sont dessinées à
            # DOUZE POINTS d'écart, alors que deux lignes voisines n'en font
            # que vingt. Aucun seuil vertical ne sépare proprement les deux
            # situations.
            #
            # On rattache donc chaque case au libellé de molécule le plus
            # proche. Les libellés, eux, sont bien un par ligne.
            # Recoller les libellés coupés : « Amoxicilline-acide clavulanique »
            # sur une ligne, « (cystite) » sur la suivante. Sans cela les deux
            # lignes d'AMC du premier tableau portent le même nom, et la
            # seconde écrase la première — une décision perdue en silence.
            ancres, appels = [], {}
            for i, (ly, lab) in enumerate(lignes):
                if not lab or molecule(propre(lab))[0] is None:
                    continue
                # La LIGNE D'EN-TÊTE cite des molécules elle aussi
                # (« Sensible amoxicilline », « Résistant amoxicilline-acide
                # clavulanique ET … ») et se faisait prendre pour une ligne de
                # données. Elle n'a capté aucune case ici, mais une mise en
                # page un peu différente lui en aurait donné.
                if re.search(r"\b(Sensible|Résistant|Résistance)\b", lab, re.I):
                    continue
                entier = lab
                # UNE LIGNE VIDE N'EST PAS UNE FIN DE LIBELLÉ. Le tableau de la
                # cystite en intercale une entre « Triméthoprime-sulfamé- » et
                # « thoxazole ( 1 ) » : on s'arrêtait là, et l'appel de note (1)
                # du cotrimoxazole était perdu — avec lui, le conseil « privilégier
                # le triméthoprime seul » ne serait jamais sorti sur un compte rendu
                # qui rend le cotrimoxazole. On enjambe le vide ; tout le reste
                # arrête toujours la recollection.
                for suite in lignes[i + 1:i + 5]:
                    s = (suite[1] or "").strip()
                    if not s:
                        continue
                    if molecule(propre(s))[0] is not None:
                        break
                    if s.startswith("(") or s.endswith("-") or re.match(r"^[a-zé]", s):
                        entier += " " + s
                    else:
                        break
                # Les appels de note — « Céfépime (A) » — sont DANS la case.
                # propre() les retire du libellé ; on les garde ici, car ils
                # désignent les lignes que les notes viennent restreindre.
                appels[ly] = sorted(set(re.findall(r"\(\s*([0-9A-C])\s*\)", entier)))
                ancres.append((ly, propre(entier)))
            # TROIS INVARIANTS, parce que « autant de cases que de colonnes »
            # ne suffit pas : j'ai éprouvé ce contrôle seul par mutation, et il
            # laissait passer une colonne oubliée dans le cadrage comme des
            # cases rattachées à la mauvaise ligne. Dans les deux cas le COMPTE
            # restait juste et le tableau était faux.
            #   1. chaque case tombe PRÈS de l'abscisse d'une colonne ;
            #   2. chaque case est affectée une fois et une seule ;
            #   3. aucune ancre de la zone du tableau ne reste sans cases.
            par_lab = {}
            affectees = 0
            for x, y, c in cells:
                if not ancres:
                    break
                ly, lab = min(ancres, key=lambda a: abs(a[0] - y))
                if abs(ly - y) > 20:
                    continue                       # trop loin : pas cette ligne
                col = min(range(len(tb["x"])), key=lambda i: abs(x - tb["x"][i]))
                if abs(x - tb["x"][col]) > 30:
                    raise SystemExit(
                        "EXTRACTION INTERROMPUE — tableau « %s » : une case à x=%.0f ne "
                        "tombe sous aucune colonne déclarée (%s). Le cadrage du tableau "
                        "ne correspond plus au document."
                        % (tb["cle"], x, ", ".join(str(v) for v in tb["x"])))
                affectees += 1
                # Clé : l'ORDONNÉE de l'ancre, unique par ligne. Deux lignes
                # peuvent porter le même texte une fois recollées.
                par_lab.setdefault((ly, lab), {})[col] = c   # dédoublonne x et x+5

            # Deux lignes peuvent porter le MÊME libellé une fois la mise en
            # page retirée — l'amoxicilline-acide clavulanique du premier
            # tableau en a deux, « (cystite) » et « (pyélonéphrite) », dont la
            # parenthèse vit sur la ligne suivante. Les fondre est acceptable
            # SI ET SEULEMENT SI elles portent la même décision ; sinon l'une
            # effacerait l'autre sans bruit.
            # Chaque case doit avoir trouvé sa place. Les cases sont dessinées
            # en double (fond et bordure) : on compare donc au nombre de
            # couples (ligne, colonne) attendus, pas au nombre de rectangles.
            attendu = sum(len(c) for c in par_lab.values())
            if affectees < attendu:
                raise SystemExit(
                    "EXTRACTION INTERROMPUE — tableau « %s » : %d cases affectées pour %d "
                    "couples ligne/colonne. Des cases se sont écrasées l'une l'autre."
                    % (tb["cle"], affectees, attendu))
            # Une ancre sans aucune case signale un rattachement parti ailleurs.
            if par_lab:
                basses = min(ly for ly, _ in par_lab)
                hautes = max(ly for ly, _ in par_lab)
                orphelines = [lab for ly, lab in ancres
                              if basses <= ly <= hautes
                              and not any(k[0] == ly for k in par_lab)]
                if orphelines:
                    raise SystemExit(
                        "EXTRACTION INTERROMPUE — tableau « %s » : %d ligne(s) sans aucune "
                        "case (%s). Les cases d'une ligne sont parties sur une autre."
                        % (tb["cle"], len(orphelines), ", ".join(o[:28] for o in orphelines[:3])))

            vu = {}
            for (ly, nom), cols in sorted(par_lab.items()):
                d = (tuple(sorted((i, c) for i, c in cols.items())),
                     tuple(appels.get(ly, [])))
                if nom in vu and vu[nom] != d:
                    raise SystemExit(
                        "EXTRACTION INTERROMPUE — tableau « %s » : deux lignes « %s » "
                        "portent des décisions DIFFÉRENTES, et la mise en page ne permet "
                        "pas de les distinguer. Les fondre en effacerait une."
                        % (tb["cle"], nom[:46]))
                vu[nom] = d

            for (_ly, nom), cols in par_lab.items():
                codes, variante, _ = molecule(nom)
                if len(cols) != len(tb["x"]):
                    raise SystemExit(
                        "EXTRACTION INTERROMPUE — tableau « %s », ligne « %s » : %d cases "
                        "pour %d colonnes. Se tromper de colonne, c'est cacher au clinicien "
                        "la seule molécule active ; mieux vaut ne rien produire."
                        % (tb["cle"], nom[:46], len(cols), len(tb["x"])))
                decision[nom] = {
                    "codes": codes, "variante": variante,
                    "notes": appels.get(_ly, []),
                    "rendre": [tb["colonnes"][i] for i in sorted(cols)
                               if cols[i] == ORANGE]}
        # Le nombre de lignes est RELEVÉ SUR LE DOCUMENT et vérifié ici. Sans
        # cela, oublier une page de continuation ampute le tableau en silence :
        # les lignes restantes sont justes, et les molécules manquantes ne sont
        # simplement jamais rendues. Le premier tableau compte vingt lignes de
        # molécules dont deux d'amoxicilline-acide clavulanique, fondues parce
        # qu'elles portent la même décision — d'où dix-neuf.
        if len(decision) != tb["attendu"]:
            raise SystemExit(
                "EXTRACTION INTERROMPUE — tableau « %s » : %d lignes décodées, %d "
                "attendues. Une page de continuation manque, ou le document a changé."
                % (tb["cle"], len(decision), tb["attendu"]))
        out[tb["cle"]] = {"titre": tb["titre"], "colonnes": tb["colonnes"],
                          "lignes": decision}
    return out


def js(v):
    if v is None:
        return "null"
    if isinstance(v, list):
        return "[" + ", ".join(js(x) for x in v) + "]"
    return '"' + str(v).replace("\\", "\\\\").replace('"', '\\"') + '"'


def main():
    if len(sys.argv) < 2:
        print("usage : python3 outils/extraire-rendu-cible.py <recommandation.pdf>",
              file=sys.stderr)
        return 2
    tables = extraire(sys.argv[1])
    notes, restrictions, listes, commentaires, journal = notes_et_restrictions(sys.argv[1])

    print("/* rendu-cible.js — engendré par outils/extraire-rendu-cible.py.")
    print("   NE PAS ÉDITER À LA MAIN.")
    print("")
    print("   Source : HAS, « Antibiogrammes ciblés pour les infections urinaires à")
    print("   Entérobactéries dans la population féminine adulte (à partir de 12 ans) »,")
    print("   validée par le Collège le 5 octobre 2023. Tableaux de la SFM et de la")
    print("   SPILF, labellisés par la HAS.")
    print("")
    print("   « rendre » liste les colonnes où la case est ORANGE, c'est-à-dire où la")
    print("   molécule figure sur l'antibiogramme ciblé. Partout ailleurs elle n'est pas")
    print("   rendue — SAUF si la souche y est résistante, règle que le document pose")
    print("   explicitement et qui ne souffre aucune exception.")
    print("")
    print("   LES COULEURS NE DISENT PAS TOUT. Sous chaque tableau, les notes (A) (B)")
    print("   (C) retirent des molécules que la case avait rendues, et le § 2.1.3 en")
    print("   pose sept règles de plus. « notes » dit quels appels de note portent la")
    print("   ligne ; RENDU_CIBLE_NOTES et RENDU_CIBLE_RESTRICTIONS en donnent le texte.")
    print("")
    print("   PÉRIMÈTRE, et il est étroit : ECBU à entérobactéries, femme adulte à")
    print("   partir de 12 ans. Hors de là, ces tableaux ne sont pas validés. */")
    print("(function (racine) {")
    print('"use strict";')
    print("var RENDU_CIBLE = {")
    for cle, tb in tables.items():
        print("  %s: {" % cle)
        print("    titre: %s," % js(tb["titre"]))
        print("    colonnes: %s," % js(tb["colonnes"]))
        print("    lignes: [")
        for nom, d in tb["lignes"].items():
            print("      { molecule: %s, codes: %s, variante: %s, notes: %s, rendre: %s },"
                  % (js(nom), js(d["codes"]), js(d["variante"]), js(d["notes"]),
                     js(d["rendre"])))
        print("    ]")
        print("  },")
    print("};")

    # Les notes, verbatim. Elles sont AFFICHÉES au biologiste : c'est le
    # document qui justifie le masquage, pas PhénoBac.
    print("/* Les notes sous chaque tableau, mot pour mot. */")
    print("var RENDU_CIBLE_NOTES = {")
    for cle in notes:
        print("  %s: {" % cle)
        for lettre in "ABC":
            print("    %s: %s," % (lettre, js(notes[cle][lettre])))
        print("  },")
    print("};")

    print("/* Le § 2.1.3 — « Quelles sont les molécules qui ne doivent pas figurer de")
    print("   façon systématique sur le rendu de l'antibiogramme ciblé ? » */")
    print("var RENDU_CIBLE_RESTRICTIONS = [")
    for r in restrictions:
        print("  { regle: %s," % js(r["regle"]))
        print("    motif: %s }," % js(r["motif"]))
    print("];")

    # Les commentaires que le § 2.1.4 veut voir FIGURER sur le compte rendu.
    # « appel » renvoie au chiffre que porte la ligne du tableau : un conseil
    # sur le triméthoprime n'a rien à faire sur un compte rendu où il n'est
    # pas rendu.
    print("/* Les commentaires associés au rendu, section 3.x.2 de chaque tableau.")
    print("   Le § 2.1.4 les veut SUR LE COMPTE RENDU. Ils diffèrent d'un tableau à")
    print("   l'autre : la pyélonéphrite ne porte ni « en cas de cystite simple », ni")
    print("   le conseil sur le triméthoprime seul. */")
    print("var RENDU_CIBLE_COMMENTAIRES = {")
    for cle in commentaires:
        print("  %s: [" % cle)
        for c in commentaires[cle]:
            print("    { appel: %s, texte: %s }," % (js(c["appel"]), js(c["texte"])))
        print("  ],")
    print("};")

    print("/* Les listes que les notes citent elles-mêmes. Aucune n'est écrite ici à")
    print("   la main : une liste recopiée peut diverger du texte qu'elle applique. */")
    print("var RENDU_CIBLE_LISTES = {")
    for cle in sorted(listes):
        print("  %s: %s," % (cle, js(listes[cle])))
    print("};")

    print('var RENDU_CIBLE_SOURCE = "HAS 2023-10-05 — antibiogrammes ciblés, ECBU à '
          'entérobactéries, femme adulte ≥ 12 ans";')
    print("var R = { RENDU_CIBLE: RENDU_CIBLE, RENDU_CIBLE_SOURCE: RENDU_CIBLE_SOURCE,")
    print("          RENDU_CIBLE_NOTES: RENDU_CIBLE_NOTES,")
    print("          RENDU_CIBLE_RESTRICTIONS: RENDU_CIBLE_RESTRICTIONS,")
    print("          RENDU_CIBLE_COMMENTAIRES: RENDU_CIBLE_COMMENTAIRES,")
    print("          RENDU_CIBLE_LISTES: RENDU_CIBLE_LISTES };")
    print('if (typeof module !== "undefined" && module.exports) module.exports = R;')
    print("else racine.PhenoBacRenduCible = R;")
    print('})(typeof self !== "undefined" ? self : this);')

    if journal:
        print("\n%d mot(s) recollé(s) — la mise en page du document les avait coupés :"
              % len(set(journal)), file=sys.stderr)
        for j in sorted(set(journal)):
            print("   ", j, file=sys.stderr)
    print("%d commentaires lus : %s."
          % (sum(len(v) for v in commentaires.values()),
             ", ".join("%s (%d)" % (k, len(v)) for k, v in commentaires.items())),
          file=sys.stderr)
    print("\n%d règles lues au § 2.1.3 ; listes citées : %s."
          % (len(restrictions),
             ", ".join("%s (%d)" % (k, len(v)) for k, v in sorted(listes.items()))),
          file=sys.stderr)

    n = sum(len(t["lignes"]) for t in tables.values())
    print("\n%d lignes décodées sur %d tableaux." % (n, len(tables)), file=sys.stderr)
    for cle, tb in tables.items():
        print("  %-20s %d lignes, %d colonnes" % (cle, len(tb["lignes"]), len(tb["colonnes"])),
              file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
