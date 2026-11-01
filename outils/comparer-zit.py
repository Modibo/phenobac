# -*- coding: utf-8 -*-
"""
comparer-zit.py — confronte les zones d'incertitude technique de PhénoBac
aux deux sources officielles.

    python3 outils/comparer-zit.py v_16.1_Breakpoint_Tables.xlsx CASFM2026_V1.0.pdf

Ne modifie RIEN : produit un rapport à relire.

La ZIT (« ATU » chez l'EUCAST) n'est pas une catégorie clinique de plus. C'est
un avertissement : à cette valeur de CMI, la catégorisation n'est pas
reproductible. Les deux comités la publient, et pas aux mêmes endroits — d'où
cet outil, qui lit les deux et dit ce que PhénoBac en retient.

Deux précisions qui expliquent le faible nombre de résultats :

  - la plupart des ZIT portent sur les DIAMÈTRES d'inhibition. PhénoBac ne
    travaille pas sur les diamètres : elles ne le concernent pas. Le CA-SFM
    précise d'ailleurs que, dans ce cas, déterminer la CMI lève l'incertitude ;
  - restent une poignée de ZIT en CMI : six chez l'EUCAST v16.1, dix chez le
    CA-SFM 2026, dont une partie seulement porte sur des molécules et des
    espèces présentes dans PhénoBac.

Où trouver les sources :
  EUCAST  https://www.eucast.org/bacteria/clinical-breakpoints-and-interpretation/clinical-breakpoint-tables/
  CA-SFM  page du groupe « Comité de l'Antibiogramme » du site de la SFM,
          fichier wp-content/uploads/<année>/<mois>/CASFM<année>_V1.0-<MOIS>-<année>.pdf

HORS INTÉGRATION CONTINUE : il faut DEUX documents officiels, aucun des deux
n'étant redistribuable dans ce dépôt. La confrontation se fait à la main et se
consigne dans CONFRONTATIONS.md, que verifier-confrontations.py surveille.
"""
import sys, os, re, importlib.util

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)
from classeur import Classeur
import pdfpos


def _module(nom, fichier):
    """Charge un module dont le nom de fichier porte un tiret."""
    spec = importlib.util.spec_from_file_location(nom, os.path.join(ICI, fichier))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# Les correspondances agent -> code et feuille -> groupe sont déjà établies et
# éprouvées dans le comparateur de seuils : on ne les réécrit pas.
CE = _module("comparer_eucast", "comparer-eucast.py")

# Feuille EUCAST -> groupes de seuils PhénoBac concernés.
FEUILLE_GROUPES = {}
for groupe, (_especes, feuilles) in CE.GROUPES.items():
    for f in feuilles:
        FEUILLE_GROUPES.setdefault(f, []).append(groupe)

# Nom français du CA-SFM -> code PhénoBac. Ce qui n'y figure pas n'est pas au
# panel de PhénoBac, et l'outil le DIT au lieu de le taire : une ZIT qu'on ne
# sait pas nommer ressemble, dans un rapport, à une ZIT qui n'existe pas.
AGENTS_FR = [
    (r"^pip[eé]racilline-tazobactam", "TZP"),
    (r"^ciprofloxacine", "CIP"),
    (r"^l[eé]vofloxacine", "LVX"),
    (r"^colistine", "COL"),
    (r"^vancomycine", "VA"),
    (r"^t[eé]icoplanine", "TEC"),
    (r"^daptomycine", "DAP"),
    (r"^amikacine", "AMK"),
    (r"^gentamicine", "GEN"),
    (r"^m[eé]rop[eé]n[eè]me", "MEM"),
    (r"^imip[eé]n[eè]me", "IPM"),
    (r"^ertap[eé]n[eè]me", "ETP"),
    (r"^c[eé]fotaxime", "CTX"),
    (r"^ceftriaxone", "CRO"),
    (r"^ceftazidime", "CAZ"),
    (r"^c[eé]f[eé]pime", "FEP"),
    (r"^clarithromycine", None),      # hors panel, et c'est une réponse
    (r"^ceftaroline", None),
    (r"^ceftobiprole", None),
    (r"^c[eé]furoxime", None),
]

# Restrictions qui se lisent DANS le document et non dans l'en-tête du
# chapitre. Sans elles, on appliquerait la ZIT d'une espèce à ses voisines.
#
#   · le tableau des fluoroquinolones du chapitre Enterobacterales est
#     intitulé « à l'exception du genre Salmonella » ;
#   · une ligne qui NOMME une espèce ne vaut que pour elle : « Vancomycine
#     S. aureus » ne concerne pas les staphylocoques à coagulase négative,
#     dont la ligne « Vancomycine, SCN » ne porte aucune ZIT.
# L'ESPÈCE QUE LE LIBELLÉ NOMME -> le groupe de seuils de PhénoBac.
#
# Une entrée à None veut dire : le document nomme une espèce, et PhénoBac ne
# sait pas l'isoler — son groupe en couvre plusieurs. Ce n'est PAS « applique
# à tout le groupe » : appliquer à Enterobacter le seuil que le comité réserve
# à E. coli serait « un chiffre juste au mauvais endroit », le défaut que ce
# dépôt passe son temps à chasser. L'appelant le compte et le NOMME.
ESPECE_GROUPE = [
    (r"\bS\.?\s*aureus\b",                    ["staph"]),
    (r"\bSCN\b|coagulase",                     ["scn"]),
    (r"\bMorganellaceae\b",                    ["morganella"]),
    (r"\bSalmonella\b",                        ["salmonella"]),
    (r"\bSerratia\b",                          ["serratia"]),
    (r"\bS\.?\s*agalactiae\b",                ["strepb"]),
    (r"\bS\.?\s*pyogenes\b|\bS\.?\s*dysgalactiae\b", ["strepacg"]),
    # Nommées, et non isolables : le groupe de PhénoBac couvre plus large.
    (r"\bE\.?\s*coli\b|\bKlebsiella\b",      None),
    (r"\bS\.?\s*lugdunensis\b",               None),   # un SCN parmi quatre
    (r"\bS\.?\s*intermedius\b|\bS\.?\s*pseudintermedius\b", None),
    (r"autres\s+esp[èe]ces",                    None),   # le complément
]


def groupes_vises(chapitre, agent, groupes):
    """Les groupes de PhénoBac que cette LIGNE vise.

    Rendre [] n'est pas un échec : c'est « le document nomme une espèce que je
    ne sais pas isoler », et il vaut mieux ne rien comparer que comparer au
    mauvais endroit. Jusqu'au 2026-10-31 cette fonction ne connaissait que
    S. aureus et les SCN, et tout le reste retombait sur le chapitre entier —
    si bien que « Téicoplanine, S. aureus » et « Téicoplanine, SCN » tombaient
    dans le même seau et revenaient au biologiste comme une « décision de
    modèle », alors que le comité avait tranché en nommant l'espèce."""
    import re as _re
    # LE SUFFIXE D'ABORD, LE LIBELLÉ ENTIER ENSUITE. « Téicoplanine, SCN »
    # porte une virgule, « Vancomycine S. aureus » n'en porte pas : chercher
    # UNIQUEMENT dans le suffixe faisait retomber la seconde sur le chapitre
    # entier, et le seuil de S. aureus s'appliquait aux SCN. L'ancienne
    # version cherchait dans tout le libellé ; ne garder que le suffixe
    # aurait été une régression déguisée en resserrement.
    espece = scinder_espece(agent) or agent
    for motif, cibles in ESPECE_GROUPE:
        if _re.search(motif, espece, _re.I):
            return [] if cibles is None else [g for g in groupes if g in cibles]
    # Cas particulier qui ne tient pas à un suffixe mais à un SOUS-TITRE : la
    # ciprofloxacine des Enterobacterales a sa ligne propre sous le
    # sous-tableau « Salmonella spp. ». Tant que les sous-titres ne sont pas
    # lus, la ligne générale ne vaut pas pour Salmonella.
    if chapitre == "Enterobacterales" and agent.lower().startswith("ciprofloxacine"):
        return [g for g in groupes if g != "salmonella"]
    return groupes


def scinder_espece(agent):
    """Le suffixe d'espèce du libellé, vide s'il n'en porte pas."""
    import importlib.util as _i, os as _o, sys as _s
    if "agents_fr" not in _s.modules:
        _sp = _i.spec_from_file_location(
            "agents_fr", _o.path.join(_o.path.dirname(_o.path.abspath(__file__)),
                                      "agents_fr.py"))
        _m = _i.module_from_spec(_sp); _s.modules["agents_fr"] = _m
        _sp.loader.exec_module(_m)
    return _s.modules["agents_fr"].scinder(agent)[1]


def code_fr(agent):
    """(code, connu). « connu » distingue « hors panel, c'est voulu » de
    « nom que l'outil ne sait pas lire », qui est un défaut de l'outil."""
    a = agent.strip().lower()
    for motif, code in AGENTS_FR:
        if re.match(motif, a):
            return code, True
    return None, False


# Chapitre CA-SFM (page du PDF où il commence) -> groupes PhénoBac.
# Le PDF n'a pas de titre courant portant l'espèce : on repère les chapitres
# par leur intitulé numéroté, « 5. 2. Pseudomonas spp. » et ainsi de suite.
#
# TROIS DÉFAUTS ONT VÉCU ICI, ET ILS ONT ENVOYÉ DE VRAIES VALEURS AU MAUVAIS
# ENDROIT. Trouvés le 2026-10-31, en relisant les pages avant de soumettre
# vingt-sept écarts au biologiste.
#
#  1. LA TABLE ÉTAIT UN DICTIONNAIRE, ET L'ON PRENAIT LA PREMIÈRE CLÉ QUI SOIT
#     UNE SOUS-CHAÎNE DU TITRE. « Streptococcus pneumoniae » contient
#     « Streptococcus » : le chapitre du PNEUMOCOQUE était rattaché à
#     strepacg, strepb et viridans, et « pneumo » n'a jamais reçu une seule
#     ligne. La table est désormais une LISTE ORDONNÉE, du plus précis au plus
#     général, et le premier motif qui s'applique gagne — « Streptococcus
#     pneumoniae » avant « Streptococcus ».
#
#  2. DEUX CHAPITRES N'ÉTAIENT PAS DANS LA TABLE DU TOUT, et personne ne le
#     disait. Les deux vrais chapitres de streptocoques — « Streptocoques des
#     groupes A, B, C ou G » (p89) et « Autres streptocoques » (p94) — n'y
#     figuraient pas. Les outils les rangeaient sous « ? <titre> » et les
#     SAUTAIENT, ce qui est le bon réflexe : aucune valeur fausse n'en est
#     sortie. Mais le résultat net est que strepacg, strepb et viridans
#     n'avaient JAMAIS été confrontés à leur propre chapitre, et que ce qu'on
#     leur attribuait venait entièrement du pneumocoque, par le défaut 1. Un
#     silence vaut mieux qu'une erreur ; un silence qu'on ne compte pas vaut
#     beaucoup moins qu'un silence qu'on affiche. Les appelants annoncent
#     désormais les chapitres qu'ils ont sautés.
#
#  3. « Corynebacterium diphtheriae complex » (p101) était rattaché à
#     « coryne », qui est le Corynebacterium spp. de PhénoBac. Ce sont deux
#     tables différentes, et la page le dit elle-même : « Pour les autres
#     corynébactéries, utiliser les valeurs critiques présentées au chapitre
#     Corynebacterium spp. » Le complexe diphtheriae n'a pas de groupe dans
#     PhénoBac ; il est donc nommé ici et rattaché à RIEN, ce qui n'est pas
#     la même chose que ne pas le nommer.
CHAPITRES = [
    # (motif cherché dans le titre, groupes PhénoBac, CE QUE LE CHAPITRE
    #  COUVRE — ou pourquoi il ne va nulle part). LE PLUS PRÉCIS D'ABORD.
    #
    # LA TROISIÈME COLONNE N'EST PAS UN COMMENTAIRE : c'est la seule chose
    # qui rende le rattachement RELISIBLE. Tant qu'il tenait dans une
    # sous-chaîne, personne ne pouvait voir que « Burkholderia » accrochait
    # le chapitre de la mélioïdose au Burkholderia cepacia de PhénoBac, ni
    # que « Streptococcus » accrochait le pneumocoque aux streptocoques A/C/G.
    # Chaque ligne doit dire quelle espèce du communiqué va sur quelle espèce
    # de PhénoBac, et verifier_chapitres() refuse une ligne muette.
    ('Streptococcus pneumoniae', ['pneumo'],
     "S. pneumoniae -> le pneumocoque de PhénoBac. NE PAS laisser « Streptococcus » "
     "attraper ce titre : c'est le défaut du 2026-10-31."),
    ('Streptocoques des groupes', ['strepacg', 'strepb'],
     "groupes A, B, C, G -> S. pyogenes, S. dysgalactiae et S. agalactiae."),
    ('Autres streptocoques', ['viridans'],
     "le groupe viridans et apparentés -> « viridans »."),
    ('Corynebacterium diphtheriae', [],
     "le complexe diphtheriae (C. diphtheriae, C. ulcerans, C. pseudotuberculosis) "
     "n'a PAS de groupe dans PhénoBac. La page le dit elle-même : « pour les autres "
     "corynébactéries, utiliser le chapitre Corynebacterium spp. »"),
    ('Corynebacterium', ['coryne'],
     "Corynebacterium spp. -> « coryne »."),
    ('Burkholderia pseudomallei', [],
     "la mélioïdose, pathogène du groupe de risque 3. PhénoBac porte "
     "Burkholderia cepacia, que ce communiqué NE TRAITE PAS : ses valeurs "
     "EUCAST restent les bonnes, et quatre faux écarts sortaient d'ici."),
    ('Enterobacterales', ['entero', 'salmonella', 'morganella', 'serratia'],
     "une table pour la famille ; PhénoBac la découpe en quatre groupes."),
    ('Pseudomonas', ['pseudo'],
     "Pseudomonas spp. -> P. aeruginosa."),
    ('Acinetobacter', ['acineto'],
     "Acinetobacter spp. -> A. baumannii."),
    ('Stenotrophomonas', ['steno'],
     "S. maltophilia, de part et d'autre."),
    ('Staphylococcus', ['staph', 'scn'],
     "une table pour le genre ; les lignes qui nomment S. aureus ou les "
     "coagulase-négative sont triées par groupes_vises()."),
    ('Enterococcus', ['enteroc'],
     "E. faecalis et E. faecium."),
    ('Haemophilus', ['haemo'],
     "Haemophilus spp. -> H. influenzae."),
    ('Neisseria gonorrhoeae', ['ngono'], "exact de part et d'autre."),
    ('Neisseria meningitidis', ['nmening'], "exact de part et d'autre."),
    ('Moraxella', ['moraxella'], "M. catarrhalis, exact."),
    ('Listeria', ['listeria'], "L. monocytogenes, exact."),
    ('Campylobacter', ['campylo'], "Campylobacter spp. -> C. jejuni."),
    ('Vibrio', ['vibrio'], "Vibrio spp. -> V. cholerae."),
]


# LES SOUS-TITRES, UN CRAN SOUS LES CHAPITRES.
#
# Le communiqué ouvre parfois un sous-tableau au milieu d'un chapitre : page
# 52, « Salmonella spp. » centré, suivi du dépistage à l'acide nalidixique et
# à la péfloxacine, puis d'une ciprofloxacine à 0,06 / 0,06 — la valeur propre
# aux salmonelles, là où la ligne générale dit 0,25 / 0,5.
#
# J'ai d'abord cru pouvoir réemployer CHAPITRES pour les reconnaître. Non :
# « Salmonella » n'y est pas, et ne peut pas y être — c'est un GROUPE de
# PhénoBac, pas un chapitre du document. Réemployer la table d'à côté parce
# qu'elle ressemble était une économie fausse, et elle ne détectait rien.
#
# Une entrée ne vaut que si elle RESTREINT le chapitre en cours : le
# sous-titre nomme une partie de ce que le chapitre couvre, jamais autre
# chose. Sur les pages 47 à 124, il y en a exactement un.
SOUS_CHAPITRES = [
    ('Salmonella', ['salmonella'],
     "p52, au milieu des entérobactéries : dépistage acide nalidixique / "
     "péfloxacine, puis ciprofloxacine 0,06 propre aux salmonelles."),
]


def sous_chapitre_de(titre):
    """Les groupes qu'un sous-titre vise, ou None si la ligne n'en est pas un."""
    t = (titre or '').strip()
    for motif, groupes, _quoi in SOUS_CHAPITRES:
        # Le sous-titre est le titre ENTIER de sa ligne, « Salmonella spp. » —
        # pas un mot au milieu d'une phrase, sinon chaque note qui cite le
        # genre ouvrirait un sous-tableau.
        if t == motif or t.startswith(motif + ' '):
            reste = t[len(motif):].strip().rstrip('.')
            if reste in ('', 'spp', 'spp.', 'complex'):
                return groupes
    return None


def verifier_chapitres():
    """Une ligne muette est une ligne qu'on ne peut pas relire. Lève."""
    for ligne in CHAPITRES:
        if len(ligne) != 3 or not str(ligne[2]).strip():
            raise SystemExit(
                "CHAPITRES : la ligne %r ne dit pas ce qu'elle couvre. "
                "C'est précisément ce silence qui a envoyé le pneumocoque chez "
                "les streptocoques A/C/G et la mélioïdose chez B. cepacia."
                % (ligne[0] if ligne else ligne,))
    for ligne in SOUS_CHAPITRES:
        if len(ligne) != 3 or not str(ligne[2]).strip():
            raise SystemExit("SOUS_CHAPITRES : la ligne %r ne dit pas ce qu'elle "
                             "couvre." % (ligne[0] if ligne else ligne,))
    return len(CHAPITRES)


verifier_chapitres()


def chapitre_de(titre):
    """Le nom de chapitre retenu pour ce titre, ou None s'il n'est pas connu.

    RENDRE None N'EST PAS UN ÉCHEC : la plupart des chapitres du communiqué
    n'ont pas de groupe dans PhénoBac — mycobactéries, Bacillus, Aerococcus,
    Helicobacter… Ce qui serait un échec, c'est que l'appelant garde le
    chapitre précédent en recevant None."""
    t = (titre or '').lower()
    for motif, _g, _quoi in CHAPITRES:
        if motif.lower() in t:
            return motif
    return None


# L'ancien nom, conservé parce que trois outils l'appellent — mais construit à
# partir de la liste ordonnée, pour qu'il n'existe qu'UNE table.
CHAPITRE_GROUPES = {m: g for m, g, _quoi in CHAPITRES}

NOMBRE = re.compile(r'^\d+(?:[,.]\d+)?$')


def nombre(txt):
    try:
        return float(str(txt).replace(',', '.'))
    except (TypeError, ValueError):
        return None


# --------------------------------------------------------------------------
# EUCAST : colonne « ATU » des concentrations critiques (colonne D).
# --------------------------------------------------------------------------

# Une même feuille sert plusieurs groupes : Salmonella, les Morganellaceae et
# Serratia partagent celle des Enterobacterales, S. aureus et les
# coagulase-négative celle des staphylocoques. Une ligne qui nomme un genre ne
# vaut QUE pour lui, et la ligne générique ne vaut PAS pour ce genre-là.
# Sans cela, l'ATU de la ciprofloxacine serait appliquée à Salmonella, alors
# que l'EUCAST lui donne sa propre ligne, sans ATU.
ESPECES = {
    'salmonella': r'Salmonella', 'morganella': r'\bMorganellaceae\b(?!.*except)',
    'serratia': r'Serratia', 'staph': r'S\. aureus',
    'scn': r'[Cc]oagulase-negative', 'strepacg': r'groups A, C and G',
    'strepb': r'S\.\s*agalactiae', 'campylo': r'C\. jejuni',
}
# Le rendu courant se fait hors méningite et hors endocardite ; « screen only »
# n'est pas un seuil de catégorisation.
PARTICULIER = r'\bscreen only\b|endocarditis|meningitis'


def atu_eucast(chemin):
    """[(groupe, code, valeur, libellé)] pour les ATU exprimées en CMI."""
    cl = Classeur(chemin)
    out = []
    for feuille, groupes in sorted(FEUILLE_GROUPES.items()):
        lignes = [dict(c) for c in cl.lignes(feuille)]
        for c in lignes:
            c['_nom'] = re.sub(r'\s+', ' ', c.get('A', '')).strip()
        for code, motif in sorted(CE.AGENTS.items()):
            candidates = [c for c in lignes if c['_nom'] and re.search(motif, c['_nom'], re.I)
                          and not (re.search(PARTICULIER, c['_nom'], re.I)
                                   and not re.search(r'other than|all indications|including', c['_nom'], re.I))]
            if not candidates:
                continue
            for g in groupes:
                motif_esp = ESPECES.get(g)
                propre = [c for c in candidates if motif_esp and re.search(motif_esp, c['_nom'])]
                if propre:
                    retenues = propre                       # ligne propre au genre
                else:
                    # Ligne générique : écarter celles qui nomment un AUTRE genre.
                    autres = [m for gg, m in ESPECES.items() if gg != g and gg in groupes]
                    retenues = [c for c in candidates
                                if not any(re.search(m, c['_nom']) for m in autres)]
                for c in retenues:
                    atu = nombre(c.get('D'))
                    if atu is not None:
                        out.append((g, code, atu, '%s / %s' % (feuille, c['_nom'])))
    return out


# --------------------------------------------------------------------------
# CA-SFM : colonne « ZIT » des tableaux, repérée à la position.
#
# Les colonnes se déplacent de quelques points d'une page à l'autre : on
# recalibre sur l'en-tête « S ≤ | R > | ZIT » de CHAQUE tableau. Sans cela, la
# colonne « charge du disque » est lue comme une ZIT — une charge de 30 µg
# devient une ZIT à 30 mg/L.
# --------------------------------------------------------------------------

def zit_casfm(chemin):
    """[(chapitre, agent, S, R, ZIT, page)] pour les ZIT exprimées en CMI."""
    data = open(chemin, 'rb').read()
    objs = pdfpos.objets(data)
    pages = pdfpos.pages(data, objs)
    out, chapitre, sautes = [], '?', set()
    for num, p in enumerate(pages, 1):
        lg = pdfpos.lignes(pdfpos.extraire(pdfpos.contenu(objs, p),
                                           pdfpos.polices(objs, p), 'latin-1'))
        # Un chapitre s'ouvre sur une LIGNE de titre : « 5. 2. Pseudomonas
        # spp. ». La contrainte de ligne courte et de début de ligne écarte les
        # renvois en corps de texte (« voir chapitre 5.1 »), qui sinon font
        # basculer le chapitre au milieu d'un tableau.
        # On met aussi à jour quand le chapitre est inconnu de la table : sans
        # cela le précédent traînerait, et les ZIT des mycobactéries seraient
        # attribuées au genre lu juste avant.
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
            c = chapitre_de(titre)
            chapitre = c if c else ('? ' + titre[:30])
            if not c:
                sautes.add(titre[:46])
        entetes = []
        for y, fr in lg:
            z = [x for x, s in fr if s.strip() == 'ZIT']
            se = [x for x, s in fr if s.strip() in ('S ≤', 'S≤')]
            r = [x for x, s in fr if s.strip() in ('R >', 'R>')]
            if z and se and r:
                entetes.append((y, se[0], r[0], z[0]))
        if not entetes:
            continue
        for y, fr in lg:
            amont = [e for e in entetes if e[0] > y]
            if not amont:
                continue
            _, xs, xr, xz = amont[-1]
            def fenetre(lo, hi):
                return [s.strip() for x, s in fr if lo <= x < hi and s.strip()]
            agent = ' '.join(fenetre(0, xs - 14)).strip()
            if not agent or agent == 'ZIT':
                continue
            val = [v for v in fenetre(xz - 12, xz + 30) if NOMBRE.match(v)]
            s_ = [v for v in fenetre(xs - 9, xr - 12) if NOMBRE.match(v)]
            r_ = [v for v in fenetre(xr - 9, xz - 12) if NOMBRE.match(v)]
            if val and (s_ or r_):
                out.append((chapitre, agent, s_[0] if s_ else '', r_[0] if r_ else '',
                            nombre(val[0]), num))
    return out


# --------------------------------------------------------------------------
# Tables de l'application.
# --------------------------------------------------------------------------

def tables_app(racine):
    """Les zones d'incertitude de PhénoBac, lues dans la base.

    LE MÊME DÉFAUT QUE CELUI DE comparer-eucast.py, ET À LA MÊME CAUSE. Cet
    outil cherchait « const ZIT = » dans netlify/functions/premium-interpret.js.
    Le 3 octobre 2026, les règles sont devenues des données
    (base-connaissances.js) et cette constante a disparu du fichier — qui
    existe toujours, ce qui est pire : la lecture ne levait aucune erreur, elle
    rendait une table VIDE. L'outil annonçait donc « ABSENTE de PhénoBac » pour
    les sept zones d'incertitude de l'EUCAST, alors que PhénoBac les porte
    toutes les sept, aux bonnes valeurs.

    Un vérificateur qui lit le mauvais fichier ne se tait pas : il accuse.
    """
    s = importlib.util.spec_from_file_location(
        "moteur_py", os.path.join(racine, "outils", "moteur_py.py"))
    MP = importlib.util.module_from_spec(s)
    s.loader.exec_module(MP)
    brut = MP.tables(["ZIT", "ZIT_CASFM"])
    out = {}
    for nom in ("ZIT", "ZIT_CASFM"):
        plat = {}
        for groupe, entrees in (brut.get(nom) or {}).items():
            for code, val in entrees.items():
                plat[(groupe, code)] = val
        out[nom] = plat
    return out



RESULTAT = []


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    racine = os.path.dirname(ICI)
    app = tables_app(racine)
    communes, casfm_seules = app['ZIT'], app['ZIT_CASFM']

    print("=== EUCAST — ATU exprimées en CMI ===")
    trouve_eucast = {}
    if sys.argv[1].lower().endswith('.xlsx'):
        for g, code, val, libelle in atu_eucast(sys.argv[1]):
            trouve_eucast[(g, code)] = val
            etat = 'retenue' if communes.get((g, code)) == val else 'ABSENTE de PhénoBac'
            if communes.get((g, code)) not in (None, val):
                etat = 'DIVERGENTE : PhénoBac %s' % communes[(g, code)]
            print("  %-12s %-5s ATU %-6s  %-46s %s" % (g, code, val, libelle[:46], etat))
        if not trouve_eucast:
            print("  aucune ATU en CMI sur les couples que porte PhénoBac")
    else:
        print("  (classeur .xlsx non fourni)")

    print("\n=== CA-SFM — ZIT exprimées en CMI ===")
    if len(sys.argv) > 2 and sys.argv[2].lower().endswith('.pdf'):
        lues = list(zit_casfm(sys.argv[2]))
        if not lues:
            # UNE SECTION VIDE NE DOIT PAS PASSER POUR UN RÉSULTAT. C'est la
            # confusion qui a laissé dormir quatre seuils de Bacteroides
            # fragilis dans l'outil voisin : « rien à signaler » et « je n'ai
            # rien lu » s'écrivaient pareil.
            print("\n  AUCUNE ZIT LUE DANS CE PDF — et ce n'est pas « aucune ZIT ».")
            print("  Ce document est celui des DIFFÉRENCES CA-SFM / EUCAST (18 pages) :")
            print("  ses zones d'incertitude y sont citées en prose, pas dans des")
            print("  colonnes « S ≤ | R > | ZIT ». La lecture par position, qui fait la")
            print("  sûreté de cet outil, n'a rien sur quoi s'appuyer.")
            print("  Pour cette moitié-là, il faut les TABLES complètes du CA-SFM.")
        for chapitre, agent, s_, r_, val, page in lues:
            groupes = CHAPITRE_GROUPES.get(chapitre, [])
            cible = ' / '.join(groupes) if groupes else 'chapitre hors PhénoBac'
            print("  p%-4d %-22s %-30s S≤%-7s R>%-7s ZIT %-6s  chapitre : %s"
                  % (page, chapitre, agent[:30], s_, r_, val, cible))
        print("\n  La colonne « chapitre » donne les groupes que couvre le CHAPITRE, pas")
        print("  ceux auxquels la ZIT s'applique : deux restrictions se lisent dans le")
        print("  document lui-même, et la confrontation ci-dessous les applique.")

        # ---- LA CONFRONTATION, QUI MANQUAIT ----
        #
        # Jusqu'au 25 octobre 2026, cette moitié se contentait d'IMPRIMER ce
        # qu'elle lisait, puis d'imprimer à part ce que PhénoBac applique.
        # Rapprocher les deux listes restait à l'œil du lecteur — c'est-à-dire
        # que personne ne le faisait, et qu'une ZIT divergente ou manquante
        # n'aurait rien fait tomber.
        print("\n=== CA-SFM — confrontation ===")
        ecarts, muets = [], []
        for chapitre, agent, _s, _r, val, page in lues:
            groupes = CHAPITRE_GROUPES.get(chapitre, [])
            if not groupes:
                muets.append("p%d %s / %s : chapitre absent de PhénoBac"
                             % (page, chapitre, agent[:34]))
                continue
            code, connu = code_fr(agent)
            if not connu:
                # L'IGNORANCE D'UN VÉRIFICATEUR NE DOIT PAS PASSER POUR UN
                # VERDICT. Un nom non reconnu est un défaut de l'outil, pas
                # une absence dans l'application.
                ecarts.append("p%d %s / « %s » : nom d'antibiotique que l'outil ne sait "
                              "pas lire. Ajoutez-le à AGENTS_FR — ou à sa liste des "
                              "molécules hors panel, en le disant."
                              % (page, chapitre, agent[:40]))
                continue
            if code is None:
                muets.append("p%d %s / %s : molécule hors du panel de PhénoBac"
                             % (page, chapitre, agent[:34]))
                continue
            for g in groupes_vises(chapitre, agent, groupes):
                porte = casfm_seules.get((g, code), communes.get((g, code)))
                if porte is None:
                    ecarts.append("p%d %s / %s : le CA-SFM donne ZIT %s pour « %s », "
                                  "PhénoBac n'en porte aucune."
                                  % (page, chapitre, agent[:30], val, g))
                elif float(porte) != float(val):
                    ecarts.append("p%d %s / %s : CA-SFM ZIT %s, PhénoBac ZIT %s (« %s »)."
                                  % (page, chapitre, agent[:30], val, porte, g))
                else:
                    print("  ok   %-12s %-5s ZIT %-5s  CA-SFM p%d — identique"
                          % (g, code, val, page))
        for m in muets:
            print("  —    %s" % m)

        # ---- ET LE SENS INVERSE ----
        #
        # Comparer ce que le document donne à ce que l'application porte ne dit
        # rien de ce que l'application porte EN TROP. Éprouvé en ajoutant à la
        # base une ZIT de vancomycine sur les staphylocoques à coagulase
        # négative — que le CA-SFM ne donne pas, sa ligne « Vancomycine, SCN »
        # étant vide : le contrôle restait vert. Une ZIT inventée n'est pas
        # anodine, elle fait douter d'une mesure que le comité tient pour
        # fiable, et elle envoie faire une CMI pour rien.
        attendues = set()
        for chapitre, agent, _s, _r, val, _page in lues:
            code, connu = code_fr(agent)
            if not connu or code is None:
                continue
            for g in groupes_vises(chapitre, agent, CHAPITRE_GROUPES.get(chapitre, [])):
                attendues.add((g, code))
        for (g, code), val in sorted(casfm_seules.items()):
            if (g, code) not in attendues:
                ecarts.append("PhénoBac porte une ZIT CA-SFM de %s sur « %s » (%s) que le "
                              "document ne donne PAS sur ce groupe. Une ZIT inventée fait "
                              "douter d'une mesure que le comité tient pour fiable."
                              % (code, g, val))
        if ecarts:
            print("\n  ÉCARTS :")
            for e in ecarts:
                print("    - %s" % e)
            RESULTAT.append(1)
        else:
            print("\n  Aucun écart : chaque ZIT en CMI du document que PhénoBac peut")
            print("  porter est portée, à la bonne valeur et sur les bons groupes.")
    else:
        print("  (document .pdf non fourni)")

    print("\n=== Ce que PhénoBac applique ===")
    for (g, code), val in sorted(communes.items()):
        print("  commune aux deux référentiels : %-12s %-5s ZIT %s" % (g, code, val))
    for (g, code), val in sorted(casfm_seules.items()):
        print("  CA-SFM seulement             : %-12s %-5s ZIT %s" % (g, code, val))

    print("\nAucun fichier n'a été modifié. Toute correction doit être validée")
    print("par un biologiste avant d'être portée dans le code.")
    return 1 if RESULTAT else 0


if __name__ == '__main__':
    sys.exit(main())
