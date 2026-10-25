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
def groupes_vises(chapitre, agent, groupes):
    a = agent.lower()
    if chapitre == "Enterobacterales" and a.startswith("ciprofloxacine"):
        return [g for g in groupes if g != "salmonella"]
    if "s. aureus" in a or "s.aureus" in a:
        return [g for g in groupes if g == "staph"]
    if "scn" in a or "coagulase" in a:
        return [g for g in groupes if g == "scn"]
    return groupes


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
CHAPITRE_GROUPES = {
    'Enterobacterales': ['entero', 'salmonella', 'morganella', 'serratia'],
    'Pseudomonas': ['pseudo'], 'Acinetobacter': ['acineto'],
    'Stenotrophomonas': ['steno'], 'Burkholderia': ['burk'],
    'Staphylococcus': ['staph', 'scn'], 'Enterococcus': ['enteroc'],
    'Streptococcus': ['strepacg', 'strepb', 'viridans'],
    'pneumoniae': ['pneumo'], 'Haemophilus': ['haemo'],
    'Neisseria gonorrhoeae': ['ngono'], 'Neisseria meningitidis': ['nmening'],
    'Moraxella': ['moraxella'], 'Listeria': ['listeria'],
    'Corynebacterium': ['coryne'], 'Campylobacter': ['campylo'],
    'Vibrio': ['vibrio'],
}

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
    out, chapitre = [], '?'
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
            if len(ligne) > 60:
                continue
            m = re.match(r'^\d+\s*\.\s*\d+\s*\.\s+(\S.*)$', ligne)
            if not m:
                continue
            titre = m.group(1).strip()
            connu = [n for n in CHAPITRE_GROUPES if n.lower() in titre.lower()]
            chapitre = connu[0] if connu else ('? ' + titre[:30])
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
