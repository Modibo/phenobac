# -*- coding: utf-8 -*-
"""
comparer-casfm.py — le DELTA CA-SFM, calculé au lieu d'être recopié.

    python3 outils/comparer-casfm.py CASFM2026_V1.0.pdf

Ne modifie RIEN : produit un rapport à relire.

CE QUE PHÉNOBAC FAIT DU CA-SFM, ET POURQUOI C'EST FRAGILE

Le CA-SFM a adopté l'EUCAST en 2014 et s'en écarte sur un nombre limité de
points. PhénoBac ne porte donc pas un second référentiel entier : elle porte
le DELTA — quarante-cinq règles — et tout couple absent de ces tables garde sa
valeur EUCAST. C'est la bonne façon de faire, et elle a un défaut propre :

    un écart du CA-SFM que PhénoBac ignore ne se voit PAS. Le laboratoire
    choisit « CA-SFM » dans l'application, croit travailler avec, et reçoit
    la valeur EUCAST. L'erreur est silencieuse, et elle porte le nom du
    référentiel français.

Le document des DIFFÉRENCES (18 pages) énumère ces écarts en prose. S'y fier
reviendrait à recopier une liste. Cet outil fait autrement : il lit les TABLES
COMPLÈTES du communiqué (178 pages), les confronte à ce que PhénoBac applique
sous EUCAST, et CALCULE le delta. Là où les deux référentiels disent la même
chose, PhénoBac ne doit rien porter ; là où ils divergent, elle doit porter
l'écart, à la valeur du document.

Les valeurs EUCAST servant de comparaison sont celles de la table BP de
PhénoBac, confrontées au classeur officiel le 25 octobre 2026 — 403 seuils,
403 identiques. S'en servir de référence est donc légitime, et
CONFRONTATIONS.md le rend vérifiable.

TROIS VERDICTS

  · le CA-SFM dit AUTRE CHOSE que l'EUCAST et PhénoBac ne porte rien
    -> ÉCART PERDU : le laboratoire croit être en CA-SFM et ne l'est pas ;
  · PhénoBac porte un écart que le document ne donne plus
    -> ÉCART PÉRIMÉ : une valeur sans source, qui se réclame d'un comité ;
  · PhénoBac porte un écart à une autre valeur que le document
    -> DIVERGENCE.

PREMIÈRE PASSE, À RELIRE. Cet outil est neuf, et il a déjà produit quatre
familles de fausses alertes — toutes corrigées, toutes racontées dans
CONFRONTATIONS.md. Ses écarts sont des CANDIDATS : chacun se relit dans le
document, page indiquée, avant d'être porté.

HORS INTÉGRATION CONTINUE : il faut le communiqué complet du CA-SFM, qui n'est
pas redistribuable dans ce dépôt. La confrontation se fait à la main et se
consigne dans CONFRONTATIONS.md, que verifier-confrontations.py surveille.
"""
import importlib.util
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
sys.path.insert(0, ICI)
import pdfpos                                                 # noqa: E402
import agents_fr as AF                                        # noqa: E402


def _module(nom, fichier):
    spec = importlib.util.spec_from_file_location(nom, os.path.join(ICI, fichier))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# On ne réécrit ni les correspondances de chapitres, ni les noms français des
# antibiotiques, ni la règle des lignes propres à une espèce : tout cela est
# déjà établi et éprouvé par le comparateur des ZIT.
CZ = _module("comparer_zit", "comparer-zit.py")

NOMBRE = re.compile(r'^\(?-?\d+(?:[.,]\d+)?\)?$')


def nb(t):
    """Le chiffre d'une cellule.

    « 0,001 » N'EST PAS UNE VALEUR : le CA-SFM reprend la convention de
    l'EUCAST — un seuil hors échelle qui signifie « ne jamais rendre
    sensible ». PhénoBac l'écrit S = null. Le prendre pour 0,001 faisait
    paraître DIVERGENTS une quarantaine de couples où les deux comités
    disent exactement la même chose : la ciprofloxacine d'Acinetobacter, la
    pénicilline G de Corynebacterium, la témocilline des entérobactéries…
    Quarante faux écarts valent une absence de contrôle."""
    if t is None:
        return None
    t = str(t).strip().strip('()').replace(',', '.')
    if not re.match(r'^\d+(\.\d+)?$', t):
        return None
    v = float(t)
    return None if v == 0.001 else v


def lignes_casfm(chemin):
    """Toutes les lignes de concentrations critiques du communiqué.

    Reprise de la lecture par POSITION de comparer-zit.py, dont on retire la
    seule condition qui la restreignait aux ZIT. Le reste — repérage des
    chapitres, fenêtres de colonnes — a déjà servi et déjà été éprouvé.
    """
    data = open(chemin, 'rb').read()
    objs = pdfpos.objets(data)
    pages = pdfpos.pages(data, objs)
    out, chapitre, sautes, sous = [], '?', set(), None
    for num, p in enumerate(pages, 1):
        lg = pdfpos.lignes(pdfpos.extraire(pdfpos.contenu(objs, p),
                                           pdfpos.polices(objs, p), 'latin-1'))
        for _y, fr in lg:
            ligne = re.sub(r'\s+', ' ', ' '.join(s for _, s in fr)).strip()
            # LE GARDE-FOU DE 60 CARACTÈRES ÉCARTAIT UN VRAI CHAPITRE.
            # « 5. 13. Corynebacterium spp. (à l'exception de C. diphtheriae
            # complex) » fait 66 caractères : le titre était rejeté, les
            # pages qui suivaient gardaient l'étiquette « Listeria » du
            # chapitre précédent, et deux couples de Corynebacterium ont été
            # confrontés aux seuils de Listeria. L'un d'eux — le linézolide —
            # est parti en production le 2026-10-31 avant d'être repris.
            # Le motif numéroté « 5. 13. » suffit à distinguer un titre d'une
            # phrase ; la longueur ne protégeait de rien qu'il n'écartait
            # déjà, et elle coûtait un chapitre.
            if len(ligne) > 120:
                continue
            m = re.match(r'^\d+\s*\.\s*\d+\s*\.\s+(\S.*)$', ligne)
            if not m:
                continue
            titre = m.group(1).strip()
            # chapitre_de() prend le motif LE PLUS PRÉCIS, et non la première
            # clé venue : « Streptococcus pneumoniae » n'est pas « Streptococcus ».
            c = CZ.chapitre_de(titre)
            chapitre = c if c else ('? ' + titre[:30])
            sous = None                       # un nouveau chapitre efface le sous-tableau
            if not c:
                sautes.add(titre[:46])
        # UN SOUS-TABLEAU NE DÉBORDE PAS SUR LA PAGE SUIVANTE.
        #
        # Ma première version ne remettait « sous » à zéro qu'au chapitre
        # suivant : « Salmonella spp. », ouvert au bas de la page 52, scopait
        # encore les pages 53 à 57 — neuf couples perdus d'un coup, et la
        # nitrofurantoïne de Proteus avec. Le bilan passait de 271 à 262 sans
        # que rien ne crie.
        #
        # Le document répète ses en-têtes de colonnes à chaque page ; un
        # sous-tableau qui continuerait répéterait son titre, comme les
        # chapitres le font. Et s'il ne le faisait pas, le couple
        # reviendrait dans « plusieurs lignes » — visible, pas silencieux.
        # Une erreur qui se voit vaut mieux qu'une portée qui s'étend.
        sous = None
        entetes = []
        for y, fr in lg:
            z = [x for x, s in fr if s.strip() == 'ZIT']
            se = [x for x, s in fr if s.strip() in ('S ≤', 'S≤')]
            r = [x for x, s in fr if s.strip() in ('R >', 'R>')]
            if z and se and r:
                entetes.append((y, se[0], r[0], z[0]))
        if not entetes:
            continue
        # LES NOMS SONT COUPÉS EN FIN DE LIGNE, et leur fin est sur la ligne
        # SUIVANTE, sans valeurs. « Pénicilline G (méningites et » +
        # « endocardites) ». Sans recollation, l'indication disparaît et le
        # seuil méningé se compare au seuil ordinaire ; pire,
        # « Triméthoprime- » se lit « triméthoprime » au lieu de
        # « triméthoprime-sulfaméthoxazole ».
        # UN FRAGMENT PUREMENT CHIFFRÉ N'EST PAS UN MORCEAU DE NOM.
        #
        # Les colonnes voisines débordent dans la fenêtre du nom, et y
        # laissent des miettes : « Amoxicilline-acide ,2 clavulanique* »,
        # « Imipénème-relebactam 4 », « sulfaméthoxazole (autres 55 ». Le nom
        # recollé devenait alors introuvable dans le vocabulaire, et l'outil
        # le déclarait illisible — alors qu'il l'avait lu, à une miette près.
        #
        # On ne retire que ce qui ne peut PAS appartenir à un nom de molécule :
        # chiffres, virgules, points, astérisques et parenthèses d'appel de
        # note, seuls. Aucune lettre n'est touchée, donc aucun nom n'est
        # deviné — la règle du § 26 tient.
        # UNE PARENTHÈSE SEULE N'EST PAS UNE MIETTE : elle FERME une indication.
        #
        # La première version de ce filtre rangeait « ) » parmi les miettes,
        # et mangeait donc la parenthèse fermante de :
        #
        #   i=25  Amoxicilline iv (méningites  et   S≤ 0,5  R> 0,5
        #   i=26  endocardites                 )
        #
        # Le nom restait « … (méningites et endocardites » — tronqué pour
        # toujours, et déclaré illisible. Un filtre à bruit qui emporte de la
        # ponctuation structurante fabrique le défaut qu'il devait réduire.
        #
        # La règle : est une miette ce qui ne porte AUCUNE lettre, sauf une
        # parenthèse nue. « (4) » part — c'est un appel de note ; « ) » reste.
        MIETTE = re.compile(r'^[\d.,;*†‡()\s-]+$')

        # UNE VIRGULE SEULE NON PLUS : elle annonce l'espèce qui suit.
        # « Imipénème » et « , » sont deux fragments distincts, à x=46 et
        # x=102 ; en jetant le second, le filtre effaçait le signe même qui
        # disait « Morganellaceae arrive à la ligne suivante ». Le libellé
        # paraissait complet, la recollation ne se déclenchait pas, et deux
        # lignes du document devenaient deux valeurs du même couple. C'est le
        # défaut de la parenthèse fermante, une seconde fois et au même
        # endroit : un filtre à bruit qui emporte de la ponctuation
        # structurante fabrique le défaut qu'il devait réduire.
        def miette(t):
            return t not in ("(", ")", ",") and bool(MIETTE.match(t))

        def nom_colonne(fr, xs):
            return ' '.join(s.strip() for x, s in fr
                            if 0 <= x < xs - 14 and s.strip()
                            and not miette(s.strip())).strip()

        for i, (y, fr) in enumerate(lg):
            # UN SOUS-TABLEAU À L'INTÉRIEUR D'UN CHAPITRE.
            #
            # Page 52, au milieu des entérobactéries, un titre centré
            # « Salmonella spp. » ouvre un bloc : acide nalidixique et
            # péfloxacine en dépistage, puis ciprofloxacine 0,06 / 0,06 — la
            # valeur propre aux salmonelles. Sans le voir, l'outil rangeait
            # cette ligne avec la ciprofloxacine générale (0,25 / 0,5) et
            # déclarait le couple « à plusieurs lignes, décision de modèle »,
            # alors que le document les sépare par un titre.
            #
            # LA DÉTECTION EST ICI, dans la boucle des lignes, et non dans une
            # passe sur la page : un sous-titre ne vaut que pour ce qui le
            # SUIT. Posée au-dessus, ma première version appliquait
            # « Salmonella » à toute la page 52, la ligne générale comprise —
            # les deux lignes devenaient salmonelles et le couple restait
            # indécidable. Un titre est une frontière, pas une étiquette de
            # page.
            #
            # LE VOCABULAIRE EST DÉCLARÉ, dans CZ.SOUS_CHAPITRES, et chaque
            # entrée dit ce qu'elle couvre. J'ai d'abord cru pouvoir réemployer
            # CHAPITRES : « Salmonella » n'y est pas et ne peut pas y être —
            # c'est un GROUPE de PhénoBac, pas un chapitre du document.
            # Réemployer la table d'à côté parce qu'elle ressemble était une
            # économie fausse, et elle ne détectait rien.
            t_ = re.sub(r'\s+', ' ', ' '.join(x for _, x in fr)).strip()
            xs_ = [x for x, v in fr if v.strip()]
            if t_ and len(t_) <= 34 and not re.search(r'\d', t_) and xs_ and min(xs_) >= 150:
                vise = CZ.sous_chapitre_de(t_)
                if vise:
                    dedans = [g for g in vise
                              if g in (CZ.CHAPITRE_GROUPES.get(chapitre) or [])]
                    if dedans:
                        sous = dedans
                        continue
            amont = [e for e in entetes if e[0] > y]
            if not amont:
                continue
            _, xs, xr, xz = amont[-1]

            def fenetre(lo, hi, f=fr):
                return [s.strip() for x, s in f if lo <= x < hi and s.strip()]
            agent = nom_colonne(fr, xs)
            if not agent or agent == 'ZIT':
                continue
            s_ = [v for v in fenetre(xs - 9, xr - 12) if NOMBRE.match(v)]
            r_ = [v for v in fenetre(xr - 9, xz - 12) if NOMBRE.match(v)]
            if not (s_ or r_):
                continue
            # « il n'y a pas de colonne S » et « la colonne S dit 0,001 » ne
            # sont pas la même chose : la seconde est une DÉCISION du comité.
            hors_echelle = bool(s_) and nb(s_[0]) is None and s_[0].strip('()') in ('0.001', '0,001')
            # La suite du nom, s'il est coupé : la ligne d'après, pourvu
            # qu'elle ne porte elle-même aucune valeur.
            # LE BUDGET DE RECOLLATION SE COMPTE EN LIGNES UTILES.
            #
            # Il était plafonné à trois lignes BRUTES après le nom. Les notes
            # de marge et les numéros de page les mangeaient :
            #
            #   i=26  sulfaméthoxazole  (infections
            #   i=27                         « (bandelettes à gradient… » (marge)
            #   i=28  urinaires sans signes de
            #   i=29  …  gravité)
            #
            # La parenthèse ne se fermait jamais, « tronque » restait vrai, et
            # la ligne passait pour illisible — alors qu'il ne manquait qu'un
            # mot. Une indication de site s'étale jusqu'à trois lignes de
            # texte ; on compte donc ce qu'on AJOUTE, et le survol des marges
            # ne coûte rien. Ce qui arrête toujours : une ligne qui porte des
            # valeurs S ou R.
            k, recolles = i + 1, 0
            while (AF.tronque(agent) or not AF.code(agent)[1]) and k < len(lg) \
                    and recolles < 4 and k <= i + 10:
                suite_fr = lg[k][1]
                # « LA LIGNE SUIVANTE PORTE DES VALEURS » SE JUGE SUR LES
                # COLONNES S ET R, PAS SUR TOUTE LA LARGEUR.
                #
                # La fenêtre allait de la colonne S jusqu'à ZIT+30, soit de
                # x≈200 à x≈490. Elle attrapait donc la CHARGE DU DISQUE, qui
                # vit à x≈330 et qui appartient à la même ligne continuée :
                #
                #   y=366  Triméthoprime-            S≤ 2  R> 2   1,25-
                #   y=354  sulfaméthoxazole (infections       23,75
                #
                # « 23,75 » est la fin de « 1,25-23,75 µg ». L'outil y voyait
                # une nouvelle ligne de seuils, refusait de recoller, et
                # rendait « Triméthoprime- » illisible — pour cinq espèces,
                # dont Listeria, Acinetobacter et Stenotrophomonas. Le
                # cotrimoxazole du CA-SFM n'était donc confronté à rien.
                a_des_valeurs = [v for v in fenetre(xs - 9, xr + 12, suite_fr)
                                 if NOMBRE.match(v)]
                suite = nom_colonne(suite_fr, xs)
                # UNE LIGNE VIDE DANS LA COLONNE DU NOM N'EST PAS UN MUR.
                #
                # Le communiqué intercale ses NOTES DE BAS DE PAGE dans la
                # marge droite, à x≈491, entre un nom coupé et sa fin :
                #
                #   i=24  Triméthoprime-                S≤2  R>2  1,25-
                #   i=25                                     « liquide uniquement). Les autres… »
                #   i=26  sulfaméthoxazole (infections              23,75
                #
                # La ligne 25 ne porte rien dans la colonne du nom, et rien
                # dans les colonnes S et R : ce n'est ni une suite ni une
                # nouvelle ligne de seuils, c'est du texte de marge. L'outil
                # s'y arrêtait, et « Triméthoprime- » restait illisible pour
                # cinq espèces — Listeria, Enterobacterales, Acinetobacter,
                # Stenotrophomonas, Staphylococcus. Le cotrimoxazole du
                # CA-SFM n'était donc confronté à rien, sans que le silence
                # se distingue d'un accord.
                #
                # On l'enjambe. Ce qui arrête toujours la recollation, c'est
                # une ligne qui porte des VALEURS : celle-là est une autre
                # ligne de seuils, et recoller par-dessus mélangerait deux
                # molécules.
                if a_des_valeurs:
                    break
                if not suite:
                    k += 1
                    continue
                agent = (agent + " " + suite).strip()
                recolles += 1
                k += 1
            out.append((chapitre, agent, nb(s_[0]) if s_ else None,
                        nb(r_[0]) if r_ else None, num, hors_echelle, sous))
    # UN SILENCE QU'ON N'AFFICHE PAS SE CONFOND AVEC UNE CONCORDANCE. Les
    # chapitres sautés sont ceux dont AUCUNE ligne n'a été confrontée : tant
    # que « Streptocoques des groupes A, B, C ou G » y figurait, le bilan
    # annonçait 279 couples confrontés sans dire qu'il n'avait jamais ouvert
    # le chapitre des streptocoques.
    lignes_casfm.sautes = sorted(sautes)
    return out


def _cle(t):
    """Trier des lignes où « None » est une valeur légitime (« aucune
    catégorie sensible ») et non une absence."""
    return tuple("" if x is None else x if isinstance(x, str) else float(x) for x in t[:2]) \
         + tuple(-1.0 if x is None else float(x) for x in t[2:] if not isinstance(x, str))


def main():
    if len(sys.argv) < 2 or not sys.argv[1].lower().endswith('.pdf'):
        print(__doc__)
        return 2
    app = CZ.tables_app(RACINE)
    s = importlib.util.spec_from_file_location("moteur_py", os.path.join(ICI, "moteur_py.py"))
    MP = importlib.util.module_from_spec(s)
    s.loader.exec_module(MP)
    T = MP.tables(["BP", "BP_CASFM", "BP_URIN", "BP_CASFM_URIN",
                   "BP_MENINGE", "BP_MENINGE_CASFM"])
    EUCAST, CASFM = T["BP"] or {}, T.get("BP_CASFM") or {}
    URIN, URIN_C = T.get("BP_URIN") or {}, T.get("BP_CASFM_URIN") or {}
    MENIN, MENIN_C = T.get("BP_MENINGE") or {}, T.get("BP_MENINGE_CASFM") or {}

    def _cell(t, g, k):
        return (t.get(g) or {}).get(k)

    def applique(site, g, k, ref):
        """Le seuil que le moteur emploierait à ce site, sous ce référentiel.

        Copie conforme de l'ordre de getBP() : le méningé l'emporte sur tout,
        puis le CA-SFM (urinaire, ordinaire), puis l'EUCAST urinaire, puis
        l'EUCAST ordinaire. Reproduire cet ordre est la seule façon de
        comparer ce que le laboratoire REÇOIT, et non ce que la table
        contient."""
        chaine = []
        if site == "meninge":
            if ref == "casfm":
                chaine.append(_cell(MENIN_C, g, k))
            chaine.append(_cell(MENIN, g, k))
        if ref == "casfm":
            if site == "urinaire":
                chaine.append(_cell(URIN_C, g, k))
            chaine.append(_cell(CASFM, g, k))
        if site == "urinaire":
            chaine.append(_cell(URIN, g, k))
        chaine.append(_cell(EUCAST, g, k))
        for c in chaine:
            if c is not None:
                return c
        return None

    def delta_du_site(site, g, k):
        """La ligne CA-SFM propre à ce site, si elle existe."""
        if site == "meninge":
            return _cell(MENIN_C, g, k)
        if site == "urinaire":
            return _cell(URIN_C, g, k) or _cell(CASFM, g, k)
        return _cell(CASFM, g, k)

    lues = lignes_casfm(sys.argv[1])
    print("Communiqué lu : %s" % sys.argv[1])
    print("%d lignes de concentrations critiques relevées.\n" % len(lues))
    if getattr(lignes_casfm, "sautes", None):
        print("Chapitres du communiqué SANS groupe PhénoBac, donc non confrontés "
              "(%d) :" % len(lignes_casfm.sautes))
        for t in lignes_casfm.sautes:
            print("    %s" % t)
        print("")

    # DES LIGNES QUI RESSEMBLENT À UN SEUIL CLINIQUE ET N'EN SONT PAS.
    #
    # Le tableau du communiqué met dans la même colonne « S ≤ » ce qui sert à
    # catégoriser et ce qui ne sert qu'à DÉPISTER. Rien dans la ligne ne les
    # distingue ; c'est le document « Différences principales entre le CA-SFM
    # et l'EUCAST » qui le dit, et cet outil ne le lit pas.
    #
    # Le 2026-10-31, « viridans / pénicilline G 0,25-0,25 » (p95) a été porté
    # comme seuil clinique, puis retiré : la page 13 du document des
    # différences précise que le CA-SFM « ne conserve que le seuil à
    # 0,25 mg/L À SEULE VISÉE DE DÉPISTAGE ». Porté, il rendait « R » un
    # viridans à 0,5 mg/L que l'EUCAST catégorise « I ».
    #
    # Chaque entrée porte sa source. Ce n'est pas une liste pour faire taire
    # l'outil : c'est la part du CA-SFM qui vit dans l'autre document.
    # DES COUPLES QUE PHÉNOBAC N'A PAS, ET C'EST UNE DÉCISION.
    #
    # Le communiqué chiffre la molécule pour tout un chapitre ; la portée,
    # elle, peut rester celle de l'EUCAST. « Adopter les breakpoints » parle
    # des VALEURS ; une restriction d'espèce est une PORTÉE, et les deux ne
    # se déduisent pas l'une de l'autre.
    #
    # Sans cette liste, ces couples reviendraient à chaque passage comme une
    # question déjà tranchée — et une question qui revient finit par ne plus
    # être lue.
    # UNE COLONNE « S ≤ » QUI PORTE UN MOT, ET CE MOT A UN SENS.
    #
    # L'outil signalait depuis trois jours « la colonne S n'a pas été lue
    # (elle porte un mot, non un nombre) » et le comptait comme une LACUNE DE
    # L'OUTIL. Ce n'en est pas une : le mot est « Note », et la page 11 du
    # document des différences dit ce qu'il veut dire. Une ignorance qu'on
    # sait nommer n'est plus une ignorance.
    MOT_EN_COLONNE_S = {
        ("Staphylococcus", "Pénicilline G"):
            "la colonne S porte « Note ». Différences CA-SFM/EUCAST 2026 p11 : "
            "« une CMI de pénicilline G > 0,125 mg/L permet de confirmer la "
            "présence de pénicillinase et une CMI ≤ 0,125 mg/L NE PERMET PAS "
            "D'EXCLURE la présence d'une pénicillinase ». Le comité refuse donc "
            "de conclure « sensible » sur la seule CMI. PhénoBac rend « S » : "
            "écart ouvert, il demande une décision de modèle (voir "
            "CONFRONTATIONS.md).",
    }

    PORTEE_EUCAST = {
        ("morganella", "TMP"): "différences CA-SFM/EUCAST 2026 p6 : « pour le "
            "triméthoprime (Enterobacterales et staphylocoques) le CA-SFM a adopté "
            "les modifications de breakpoints proposées par l'EUCAST » — qui ne le "
            "chiffre que pour E. coli, K. pneumoniae et K. oxytoca. Décision du "
            "biologiste du 2026-11-01 : garder la restriction.",
        ("salmonella", "TMP"): "idem morganella TMP (p6).",
        ("serratia", "TMP"): "idem morganella TMP (p6).",
        ("morganella", "NIT"): "Proteus, P. vulgaris, M. morganii et Providencia "
            "portent la résistance naturelle à la nitrofurantoïne (EUCAST, "
            "phénotypes résistants attendus v1.2, règles 1.10/1.12/1.14). Décision "
            "du biologiste du 2026-10-31 : ne pas porter.",
    }

    DEPISTAGE_SEULEMENT = {
        ("viridans", "PEN"):
            "document des différences CA-SFM/EUCAST 2026, p13 : « le CA-SFM ne "
            "conserve que le seuil à 0,25 mg/L à seule visée de dépistage »",
    }

    perdus, perimes, divergents, muets, identiques = [], [], [], [], 0
    aveugles, multiples, voies = [], {}, {}
    depistage_seul = set()

    # UNE LIGNE QUI NOMME UNE ESPÈCE LA RETIRE À LA LIGNE GÉNÉRALE.
    #
    #   p51   Imipénème                    S ≤ 2      R > 4
    #   p51   Imipénème, Morganellaceae    pas de S   R > 4
    #
    # La seconde vise « morganella » ; la première vise le chapitre entier,
    # Morganellaceae compris. Les deux retombaient donc ensemble sur
    # « morganella », et le couple était déclaré « à plusieurs lignes,
    # décision de modèle » — alors que le document dit exactement l'inverse :
    # il a tranché, en faisant une exception nommée.
    #
    # On recense d'abord les groupes RÉCLAMÉS par une ligne nommée, puis on
    # les retire des lignes générales du même couple. C'est la lecture
    # ordinaire d'un tableau : la ligne précise prime sur la ligne générale.
    reclames = {}
    for chapitre, agent, sC, rC, page, hors, sous in lues:
        g0 = CZ.CHAPITRE_GROUPES.get(chapitre)
        if not g0:
            continue
        code, lu = AF.code(agent)
        if not lu or code is None:
            continue
        v = CZ.groupes_vises(chapitre, agent, g0)
        if v and len(v) < len(g0):
            reclames.setdefault((chapitre, code), set()).update(v)

    def vises(chapitre, agent, code, groupes, sous=None):
        if sous:
            groupes = [g for g in groupes if g in sous]
        v = CZ.groupes_vises(chapitre, agent, groupes)
        if v and len(v) == len(groupes):          # ligne générale
            pris = reclames.get((chapitre, code), set())
            return [g for g in v if g not in pris]
        return v
    # UN COUPLE PEUT AVOIR PLUSIEURS LIGNES AU MÊME SITE, et l'outil n'en
    # gardait qu'une — celle que l'ordre de lecture lui donnait en dernier.
    # On les recense d'abord, pour ne comparer que les couples à ligne unique.
    par_couple = {}
    for chapitre, agent, sC, rC, page, hors, sous in lues:
        groupes0 = CZ.CHAPITRE_GROUPES.get(chapitre)
        if not groupes0:
            continue
        code, lu = AF.code(agent)
        if not lu or code is None or AF.site(agent) != "standard":
            continue
        # LE RECENSEMENT DOIT SE FAIRE PAR GROUPE, ET NON PAR CHAPITRE.
        #
        # Clé (chapitre, molécule), « Téicoplanine, S. aureus » 2/2 et
        # « Téicoplanine, SCN » 4/4 tombaient dans le MÊME seau et le couple
        # était déclaré « à plusieurs lignes, décision de modèle » — alors
        # que groupes_vises() sait depuis toujours envoyer l'une à « staph »
        # et l'autre à « scn ». Le document avait tranché ; l'outil demandait
        # au biologiste de trancher une seconde fois.
        #
        # Ce qui reste après ce changement est ce qui MÉRITE une décision :
        # deux lignes qui visent le MÊME groupe de PhénoBac.
        for g in vises(chapitre, agent, code, groupes0, sous):
            par_couple.setdefault((g, code), set()).add((sC, rC))
    plusieurs = {k for k, v in par_couple.items() if len(v) > 1}
    autres_sites = 0
    sites_ecarts, sites_sans, sites_ok = [], [], {}
    dep_ecarts, dep_sans, dep_ok = [], [], 0
    portee_dite, mots_dits = set(), []
    vus = set()

    for chapitre, agent, sC, rC, page, hors, sous in lues:
        groupes = CZ.CHAPITRE_GROUPES.get(chapitre, [])
        if not groupes:
            continue
        code, connu = AF.code(agent)
        if not connu:
            # L'IGNORANCE DE L'OUTIL N'EST PAS UN VERDICT. Un nom qu'il ne sait
            # pas lire est un défaut de l'outil, pas une absence dans la base.
            muets.append("p%d %s / « %s » : nom que l'outil ne sait pas lire — "
                         "à ajouter à la TABLE de outils/agents_fr.py, avec son code "
                         "ou avec None s'il est hors du panel" % (page, chapitre, agent[:48]))
            continue
        if code is None:
            continue
        # TROIS ÉTATS, ET NON DEUX. « sC is None » recouvrait :
        #
        #   1. la cellule porte « 0,001 » — le comité REFUSE la catégorie S.
        #      C'est une décision, et « hors » la marque ;
        #   2. la cellule porte un mot — « Note », « NA » — et l'outil n'y a
        #      trouvé aucun nombre. Ce n'est PAS une décision du comité :
        #      c'est une lacune de lecture ;
        #   3. il n'y a pas de cellule du tout.
        #
        # Les trois s'affichaient « aucune », et le deuxième se comparait donc
        # comme si le CA-SFM avait refusé la catégorie. Page 72,
        # « Pénicilline G, | Note | 0,125 » : la colonne S porte un appel de
        # note, la valeur est à la ligne suivante (S ≤ 0,125, comme
        # l'EUCAST), et l'outil annonçait un écart. Faire dire à un comité
        # qu'il refuse une catégorie qu'il accorde pousserait PhénoBac à
        # rendre « R » là où le document rend « S » : la pire direction
        # possible.
        #
        # L'ignorance de l'outil se dit, elle ne se compare pas (§ 26).
        if sC is None and not hors:
            if rC is None:
                continue              # pas de cellule : rien à apprendre
            dit_mot = None
            for (ch_, ag_), pourquoi in MOT_EN_COLONNE_S.items():
                if chapitre == ch_ and agent.strip().startswith(ag_):
                    dit_mot = pourquoi
                    break
            if dit_mot:
                mots_dits.append("p%d %s / « %s » : %s" % (page, chapitre, agent[:34], dit_mot))
            else:
                aveugles.append("p%d %s / « %s » : la colonne S n'a pas été lue "
                                "(elle porte un mot, non un nombre) — R > %s a bien "
                                "été lu. À relire sur la page avant toute conclusion."
                                % (page, chapitre, agent[:44], rC))
            continue
        # Un seuil de cystite, de méningite ou de dépistage ne se compare pas
        # au seuil ordinaire : PhénoBac les range par SITE, et les confondre
        # fabriquerait des écarts qui n'existent pas. Cette passe ne traite
        # que le site ordinaire ; les autres attendent leur propre passe, et
        # le bilan le dit.
        site_ligne = AF.site(agent)
        if site_ligne in ("urinaire", "meninge"):
            # LA PASSE DES AUTRES SITES, qui n'avait jamais été faite. Un
            # seuil de cystite ou de LCR ne se compare pas au seuil
            # ordinaire — PhénoBac les range par site — mais il se compare
            # TRÈS BIEN au seuil du même site, et personne ne le faisait :
            # quarante-neuf lignes du communiqué étaient simplement comptées.
            for g in vises(chapitre, agent, code, groupes, sous):
                a_c = applique(site_ligne, g, code, "casfm")
                if a_c is None:
                    if (g, code) in PORTEE_EUCAST:
                        portee_dite.add((g, code))
                    else:
                        sites_sans.append((site_ligne, g, code, page, sC, rC))
                    continue
                if a_c.get("S") == sC and a_c.get("R") == rC:
                    sites_ok[site_ligne] = sites_ok.get(site_ligne, 0) + 1
                    continue
                sites_ecarts.append((site_ligne, g, code, page, sC, rC,
                                     a_c.get("S"), a_c.get("R"),
                                     delta_du_site(site_ligne, g, code) is not None))
            continue
        if site_ligne == "depistage":
            # LA PASSE DU DÉPISTAGE, la dernière jamais faite.
            #
            # Ces lignes portent « (dépistage) » et le communiqué les met dans
            # la même colonne « S ≤ » que les autres. Elles ne disent pourtant
            # pas la même chose : un seuil de dépistage dit « cette souche
            # mérite une CMI » ou « on peut en déduire telle autre molécule »,
            # pas « ce traitement marchera ».
            #
            # PhénoBac n'a pas de mécanique de dépistage en CMI — la colonne
            # « dep » ne sert qu'au disque, et deux lignes seulement s'en
            # servent. Elle porte en revanche des seuils CLINIQUES de l'EUCAST
            # pour les mêmes couples. On les confronte donc, en disant ce
            # qu'on compare : un chiffre de dépistage français contre un seuil
            # clinique européen. Qu'ils coïncident est une bonne nouvelle, pas
            # une équivalence.
            # UN DÉPISTAGE A LUI AUSSI SON SITE. Le pneumocoque en porte deux
            # page 85 : « Ampicilline (dépistage) » 0,5 / 1 et « Ampicilline
            # (dépistage - méningites et endocardites) » 0,5 / 0,5. Les
            # comparer tous deux au seuil ORDINAIRE annonçait un écart sur le
            # second — alors qu'il faut le confronter au seuil du LCR. Le
            # dépistage prime pour dire CE QUE LA LIGNE EST ; il n'efface pas
            # le site où elle s'applique.
            n_ = AF.norme(agent)
            site_dep = ("meninge" if "meningite" in n_
                        else "urinaire" if ("cystite" in n_ or "urinaire" in n_)
                        else "standard")
            for g in vises(chapitre, agent, code, groupes, sous):
                a_c = applique(site_dep, g, code, "casfm")
                if a_c is None:
                    dep_sans.append((g, code, page, sC, rC))
                elif a_c.get("S") == sC and a_c.get("R") == rC:
                    dep_ok += 1
                else:
                    dep_ecarts.append((g, code, page, sC, rC,
                                       a_c.get("S"), a_c.get("R")))
            continue
        if site_ligne != "standard":
            autres_sites += 1
            continue
        # LA VOIE D'ADMINISTRATION EST DANS LE SEUIL, ET PHÉNOBAC NE LA PORTE PAS.
        #
        # Page 54, entérobactéries :
        #
        #   Fosfomycine iv                  S ≤ 32
        #   Fosfomycine per os (cystites)   S ≤  8
        #
        # Un facteur quatre. La table BP de PhénoBac n'a qu'un seuil par
        # couple, plus un seuil urinaire et un seuil méningé : elle ne connaît
        # pas la voie. Comparer la ligne « iv » à ce seuil unique revient donc
        # à comparer deux choses différentes.
        #
        # ET LE PIÈGE EST QUE CELA NE SE VOIT PAS. La ligne « per os
        # (cystites) » porte un SITE : elle part dans la passe des autres
        # sites. La ligne « iv » reste seule au site ordinaire, paraît unique,
        # se compare — et l'écart annoncé n'est qu'une différence de voie.
        # C'est ainsi que la fosfomycine est passée pour le plus urgent des
        # écarts du CA-SFM alors que PhénoBac appliquait déjà la bonne valeur,
        # celle de la voie orale.
        v = AF.voie(agent)
        if v != "standard":
            voies.setdefault((chapitre, code), []).append(
                (agent[:46], v, sC, rC, page))
            continue

        # PLUSIEURS LIGNES POUR LE MÊME COUPLE : NE PAS CHOISIR.
        #
        # Le communiqué donne parfois deux lignes au même site pour une même
        # molécule, et ce qui les sépare est écrit dans le libellé :
        #
        #   « Amoxicilline iv »              S ≤ 2      (Haemophilus, p105)
        #   « Amoxicilline per os »          S = 0,001
        #   « Pénicilline G S. agalactiae »  S ≤ 0,125  (streptocoques, p90)
        #   « Pénicilline G S. pyogenes »    S ≤ 0,06
        #
        # L'outil n'en gardait qu'une, au hasard de l'ordre de lecture, et
        # construisait l'écart dessus. Pour Haemophilus il annonçait « pas de
        # catégorie S » à l'amoxicilline — ce qui n'est vrai que PER OS.
        #
        # Choisir serait inventer. On les signale, et on ne les compare pas :
        # distinguer la voie d'administration, ou une espèce à l'intérieur
        # d'un chapitre, est une décision de modèle qui appartient au
        # biologiste, pas à l'extracteur.
        if any((g, code) in plusieurs for g in vises(chapitre, agent, code, groupes, sous)):
            multiples.setdefault((chapitre, code), []).append(
                (agent[:46], sC, rC, page))
            continue
        for g in vises(chapitre, agent, code, groupes, sous):
            vus.add((g, code))
            if (g, code) in DEPISTAGE_SEULEMENT:
                depistage_seul.add((g, code))
                continue
            e = (EUCAST.get(g) or {}).get(code)
            porte = (CASFM.get(g) or {}).get(code)
            if e is None:
                continue              # PhénoBac n'a pas ce couple sous EUCAST non plus
            memes = (e.get("S") == sC and e.get("R") == rC)
            if memes:
                if porte is not None:
                    perimes.append((g, code, page, sC, rC))
                else:
                    identiques += 1
            else:
                if porte is None:
                    perdus.append((g, code, page, sC, rC, e.get("S"), e.get("R")))
                elif porte.get("S") != sC or porte.get("R") != rC:
                    divergents.append((g, code, page, sC, rC,
                                       porte.get("S"), porte.get("R")))

    if perdus:
        print("=== LE CA-SFM DIT AUTRE CHOSE, ET PHÉNOBAC NE LE PORTE PAS (%d) ==="
              % len(perdus))
        print("Le laboratoire choisit « CA-SFM », croit travailler avec, et reçoit")
        print("la valeur EUCAST. L'erreur est silencieuse et porte le nom du comité.")
        for g, k, page, sC, rC, sE, rE in sorted(set(perdus), key=_cle):
            print("  %-12s %-5s  CA-SFM p%-4d S<=%-7s R>%-7s   EUCAST appliqué : S<=%-7s R>%s"
                  % (g, k, page, "aucune" if sC is None else sC, rC,
                     "aucune" if sE is None else sE, rE))
    if voies:
        print("\n=== LE SEUIL DÉPEND DE LA VOIE D'ADMINISTRATION (%d) ===" % len(voies))
        print("La table BP de PhénoBac n'a qu'un seuil par couple, plus un seuil")
        print("urinaire et un seuil méningé : elle ne connaît pas la voie. Ces")
        print("lignes ne sont donc PAS comparées — ce serait comparer deux choses")
        print("différentes. Pour chacune, la question est : PhénoBac doit-elle")
        print("porter le seuil par voie, ou s'en tenir à une seule ?")
        for (ch, code) in sorted(voies):
            print("  %-20s %s" % (ch[:20], code))
            for agent, v, sC, rC, page in voies[(ch, code)]:
                print("      p%-4d %-7s S<=%-9s R>%-9s « %s »"
                      % (page, v, "aucune" if sC is None else sC,
                         "aucune" if rC is None else rC, agent))

    NOM_SITE = {"urinaire": "INFECTION URINAIRE", "meninge": "MÉNINGITE"}
    if sites_ecarts:
        print("\n=== AUTRES SITES : LE CA-SFM DIT AUTRE CHOSE (%d) ===" % len(sites_ecarts))
        print("Comparé au seuil DU MÊME SITE, et non au seuil ordinaire. La")
        print("dernière colonne dit si PhénoBac porte déjà une ligne CA-SFM pour")
        print("ce site : « non » veut dire que la valeur EUCAST s'applique sous")
        print("le nom du comité français.")
        for site, g, k, page, sC, rC, sA, rA, a_delta in sorted(set(sites_ecarts), key=str):
            print("  %-10s %-10s %-5s p%-4d CA-SFM S<=%-7s R>%-7s   appliqué : S<=%-7s R>%-7s  delta : %s"
                  % (NOM_SITE.get(site, site), g, k, page,
                     "aucune" if sC is None else sC, rC,
                     "aucune" if sA is None else sA, rA, "oui" if a_delta else "NON"))
    if sites_sans:
        print("\n=== AUTRES SITES : PHÉNOBAC N'A PAS CE COUPLE DU TOUT (%d) ===" % len(sites_sans))
        print("Le communiqué chiffre la molécule à ce site ; PhénoBac n'a aucun")
        print("seuil pour elle, ni au site ni ailleurs. Ce n'est pas un écart de")
        print("valeur : c'est une molécule absente du panel, ou un couple à créer.")
        for site, g, k, page, sC, rC in sorted(set(sites_sans), key=str):
            print("  %-10s %-10s %-5s p%-4d CA-SFM S<=%-7s R>%s"
                  % (NOM_SITE.get(site, site), g, k, page,
                     "aucune" if sC is None else sC, rC))

    if multiples:
        print("\n=== PLUSIEURS LIGNES POUR LE MÊME COUPLE, AU MÊME SITE (%d) ==="
              % len(multiples))
        print("Ce qui les sépare est dans le libellé : la VOIE (iv / per os) ou")
        print("une ESPÈCE à l'intérieur du chapitre. L'outil n'en choisit aucune")
        print("— choisir serait inventer. Ces couples ne sont PAS comptés parmi")
        print("les écarts : distinguer la voie ou l'espèce est une décision de")
        print("modèle, et elle appartient au biologiste.")
        for (ch, code) in sorted(multiples):
            print("  %-20s %s" % (ch[:20], code))
            for agent, sC, rC, page in multiples[(ch, code)]:
                print("      p%-4d S<=%-9s R>%-9s « %s »"
                      % (page, "aucune" if sC is None else sC,
                         "aucune" if rC is None else rC, agent))

    if aveugles:
        print("\n=== LA COLONNE S N'A PAS ÉTÉ LUE (%d) ===" % len(set(aveugles)))
        print("Ce n'est pas un refus du comité : c'est une lacune de l'outil.")
        print("Ces lignes ne sont PAS comptées parmi les écarts.")
        for a in sorted(set(aveugles)):
            print("  " + a)

    if divergents:
        print("\n=== PHÉNOBAC PORTE UN ÉCART À UNE AUTRE VALEUR (%d) ===" % len(divergents))
        for g, k, page, sC, rC, sP, rP in sorted(set(divergents), key=_cle):
            print("  %-12s %-5s  CA-SFM p%-4d S<=%-7s R>%-7s   PhénoBac : S<=%-7s R>%s"
                  % (g, k, page, sC, rC, sP, rP))
    if perimes:
        print("\n=== PHÉNOBAC PORTE UN ÉCART QUE LE DOCUMENT NE DONNE PLUS (%d) ==="
              % len(perimes))
        print("Le CA-SFM dit maintenant la même chose que l'EUCAST : la règle est")
        print("une valeur sans source, qui se réclame pourtant d'un comité.")
        for g, k, page, sC, rC in sorted(set(perimes), key=_cle):
            print("  %-12s %-5s  CA-SFM p%-4d S<=%-7s R>%s" % (g, k, page, sC, rC))
    if muets:
        print("\n=== CE QUE L'OUTIL N'A PAS SU LIRE (%d) ===" % len(muets))
        for m in sorted(set(muets)):
            print("  %s" % m)


    # ==================================================================
    # LE SENS INVERSE : le delta porte-t-il ce que le document ne dit pas ?
    #
    # Tout ce qui précède regarde dans UN sens — le document dit quelque
    # chose, PhénoBac ne le porte pas. L'autre sens n'était pas regardé, et
    # il est tout aussi grave : une valeur portée que le document ne dit
    # NULLE PART est une valeur inventée ou mal rangée, et elle s'applique
    # avec l'autorité du comité.
    #
    # Trouvé le 2026-10-31, et il a attrapé une faute commise le matin même :
    # « listeria LZD 2 / 2 », lu page 100 — qui est le chapitre
    # Corynebacterium spp., non celui de Listeria. La page de Listeria ne
    # porte aucune ligne de linézolide.
    #
    # Les lignes qui ne portent QUE une ZIT (S et R absents) ne sont pas
    # concernées : elles n'affirment aucun seuil.
    orphelines = []
    par_doc = {}
    for chapitre, agent, sC, rC, page, hors, sous in lues:
        g0 = CZ.CHAPITRE_GROUPES.get(chapitre)
        if not g0:
            continue
        code, lu = AF.code(agent)
        if not lu or code is None:
            continue
        for g in vises(chapitre, agent, code, g0):
            par_doc.setdefault((g, code, AF.site(agent)), set()).add((sC, rC, page))

    def dit(v):
        return "aucune" if v is None else ("—" if v == "?" else str(v))

    for groupe in sorted(CASFM):
        for code in sorted(CASFM[groupe]):
            bp = CASFM[groupe][code] or {}
            S, R = bp.get("S", "?"), bp.get("R", "?")
            if S == "?" and R == "?":
                continue          # ligne de ZIT seule : elle n'affirme aucun seuil
            vals = par_doc.get((groupe, code, "standard"))
            if not vals:
                orphelines.append("%-9s %-5s : S<=%s R>%s — LE DOCUMENT NE DIT RIEN "
                                  "pour ce couple" % (groupe, code, dit(S), dit(R)))
            elif not any(v[0] == S and v[1] == R for v in vals):
                orphelines.append("%-9s %-5s : la base dit S<=%s R>%s, le document dit %s"
                                  % (groupe, code, dit(S), dit(R),
                                     " ou ".join("S<=%s R>%s (p%d)" % (dit(a), dit(b), p)
                                                 for a, b, p in sorted(vals, key=str))))
    if orphelines:
        print("\n=== LE DELTA PORTE CE QUE CE DOCUMENT NE DIT PAS (%d) ===" % len(orphelines))
        print("Une valeur portée que le communiqué ne dit nulle part s'applique")
        print("pourtant avec l'autorité du comité. C'est le sens que personne")
        print("ne regardait, et il a attrapé une faute commise le jour même.")
        print("")
        print("MAIS CE N'EST PAS LE SEUL DOCUMENT DU CA-SFM. « Différences")
        print("principales entre le CA-SFM et l'EUCAST » est un second texte,")
        print("que cet outil ne lit pas. Une ligne signalée ici peut y avoir sa")
        print("source : c'est arrivé le 2026-10-31 à « ngono GEN 16-16 », retirée")
        print("puis remise quand essai-referentiel.js est tombé en citant sa")
        print("page. Vérifier les deux documents avant de retirer quoi que ce soit.")
        for o in orphelines:
            print("  " + o)
    if dep_ecarts:
        print("\n=== DÉPISTAGE : LE CHIFFRE DU CA-SFM ET LE SEUIL APPLIQUÉ DIFFÈRENT (%d) ==="
              % len(set(dep_ecarts)))
        print("Attention à ce qu'on compare : à gauche un seuil de DÉPISTAGE —")
        print("« cette souche mérite une CMI » — à droite le seuil CLINIQUE que")
        print("PhénoBac applique, venu de l'EUCAST. Un écart ici n'est pas")
        print("forcément une correction à porter : c'est deux choses différentes")
        print("qui se trouvaient jusqu'ici dans la même colonne.")
        for g, k, page, sC, rC, sA, rA in sorted(set(dep_ecarts), key=str):
            print("  %-10s %-5s p%-4d dépistage S<=%-7s R>%-7s   appliqué : S<=%-7s R>%s"
                  % (g, k, page, "aucune" if sC is None else sC, rC,
                     "aucune" if sA is None else sA, rA))
    if dep_sans:
        print("\n=== DÉPISTAGE : PHÉNOBAC N'A PAS CE COUPLE (%d) ===" % len(set(dep_sans)))
        for g, k, page, sC, rC in sorted(set(dep_sans), key=str):
            print("  %-10s %-5s p%-4d dépistage S<=%-7s R>%s"
                  % (g, k, page, "aucune" if sC is None else sC, rC))

    if mots_dits:
        print("\n=== LA COLONNE S PORTE UN MOT, ET ON SAIT LEQUEL (%d) ===" % len(mots_dits))
        for m in mots_dits:
            print("  " + m)

    if portee_dite:
        print("\n=== COUPLES ABSENTS PAR DÉCISION, PAS PAR OUBLI (%d) ===" % len(portee_dite))
        print("Le communiqué les chiffre ; PhénoBac ne les porte pas, et la raison")
        print("est écrite. Ils ne sont pas comptés parmi les couples absents.")
        for g, k in sorted(portee_dite):
            print("  %-10s %-5s : %s" % (g, k, PORTEE_EUCAST[(g, k)]))

    if depistage_seul:
        print("\n=== LIGNES DU TABLEAU QUI NE SONT QUE DU DÉPISTAGE (%d) ===" % len(depistage_seul))
        print("Elles ressemblent à un seuil clinique et n'en sont pas. Le tableau")
        print("ne les distingue pas ; le document des différences, si.")
        for g, k in sorted(depistage_seul):
            print("  %-10s %-5s : %s" % (g, k, DEPISTAGE_SEULEMENT[(g, k)]))
    print("\n=== bilan ===")
    print("  couples confrontés          : %d" % len(vus))
    print("  CA-SFM et EUCAST d'accord   : %d" % identiques)
    print("  ÉCART PERDU                 : %d" % len(perdus))
    print("  écart à une autre valeur    : %d" % len(divergents))
    print("  écart périmé                : %d" % len(perimes))
    print("  non lus par l'outil         : %d" % len(set(muets)))
    print("  colonne S non lue           : %d" % len(set(aveugles)))
    print("  colonne S portant un mot expliqué : %d" % len(mots_dits))
    print("  couples à plusieurs lignes  : %d (non comparés)" % len(multiples))
    print("  seuil dépendant de la voie  : %d (non comparés)" % len(voies))
    print("  site urinaire et méningé : %d d'accord, %d écarts, %d couples absents"
          % (sum(sites_ok.values()), len(set(sites_ecarts)), len(set(sites_sans))))
    print("  absents par décision, avec leur raison : %d" % len(portee_dite))
    print("  dépistage : %d chiffres identiques au seuil appliqué, %d différents, "
          "%d couples absents" % (dep_ok, len(set(dep_ecarts)), len(set(dep_sans))))
    print("  endocardite et autres, non traités ici : %d" % autres_sites)
    print("  lignes qui ne sont que du dépistage : %d (déclarées, avec leur source)"
          % len(depistage_seul))
    print("\nAucun fichier n'a été modifié. Toute correction doit être validée")
    print("par un biologiste avant d'être portée dans le code.")
    return 1 if (perdus or divergents or perimes or muets) else 0


if __name__ == '__main__':
    sys.exit(main())
