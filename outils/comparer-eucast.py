# -*- coding: utf-8 -*-
"""
comparer-eucast.py — confronte les seuils de PhénoBac au tableau EUCAST officiel.

    python3 outils/comparer-eucast.py chemin/vers/v_16.1_Breakpoint_Tables.xlsx
    python3 outils/comparer-eucast.py …xlsx --meninge   (seuils de méningite)

Ne modifie RIEN. Produit un rapport à valider par un biologiste : pour chaque
seuil de l'application, la ou les lignes EUCAST correspondantes et leurs valeurs.

Le classeur officiel se télécharge sur
https://www.eucast.org/bacteria/clinical-breakpoints-and-interpretation/clinical-breakpoint-tables/

HORS INTÉGRATION CONTINUE : le classeur de l'EUCAST n'est pas dans le dépôt et
n'y sera pas — il est publié sous la licence de l'EUCAST, et le serveur refuse
les téléchargements automatiques (403). Cette confrontation se fait à la main,
le document sous les yeux, et son résultat est consigné dans CONFRONTATIONS.md ;
verifier-confrontations.py arrête la livraison si un seuil a bougé depuis.

Deux pièges traités ici, et c'est la raison d'être de cet outil :

  1. Les renvois de notes sont des exposants COLLÉS à la valeur. Lus naïvement,
     « 8 note 4 » devient 84 : un seuil faux d'un facteur dix. Le lecteur
     écarte les passages en exposant.

  2. Un même antibiotique a plusieurs lignes selon la voie et l'indication
     (« Amoxicillin iv », « oral, uncomplicated UTI », « oral, other
     indications »…). Le choix relève du biologiste, pas du programme : quand
     plusieurs lignes correspondent, l'outil les affiche toutes et demande un
     arbitrage au lieu de trancher tout seul.
"""
import importlib.util
import sys, os, re, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from classeur import Classeur


# Groupe de seuils PhénoBac -> germes couverts, et feuille(s) EUCAST correspondantes.
#
# Un groupe n'est comparable que s'il correspond à UNE seule feuille. Quand il
# en couvre plusieurs, comparer reviendrait à appliquer les seuils d'une espèce
# à une autre : l'outil refuse, et le dit. C'est arrivé pour « grampos »
# (Listeria et Corynebacterium) comparé à tort à la feuille des streptocoques
# A/B/C/G, ce qui a produit trois seuils faux avant qu'on s'en aperçoive.
GROUPES = {
    'entero':   (["E. coli, Klebsiella, Enterobacter, Citrobacter, Shigella"],
                                                             ['Enterobacterales']),
    'salmonella':(["Salmonella spp."],                        ['Enterobacterales']),
    'morganella':(["Proteus spp. (Morganellaceae)"],          ['Enterobacterales']),
    'serratia': (["Serratia spp."],                           ['Enterobacterales']),
    'staph':    (["S. aureus"],                              ['Staphylococcus']),
    'scn':      (["S. epidermidis", "S. saprophyticus", "S. lugdunensis", "S. haemolyticus"],
                                                             ['Staphylococcus']),
    'enteroc':  (["E. faecalis", "E. faecium"],              ['Enterococcus']),
    'pseudo':   (["P. aeruginosa"],                          ['Pseudomonas']),
    'acineto':  (["A. baumannii"],                           ['Acinetobacter']),
    'pneumo':   (["S. pneumoniae"],                          ['S.pneumoniae']),
    'strepacg': (["S. pyogenes"],                            ['Streptococcus A,B,C,G']),
    'strepb':   (["S. agalactiae"],                          ['Streptococcus A,B,C,G']),
    'viridans': (["streptocoques viridans"],                 ['Viridans group streptococci']),
    'listeria': (["L. monocytogenes"],                       ['L.monocytogenes']),
    'coryne':   (["Corynebacterium spp."],                   ['Corynebacterium']),
    'haemo':    (["H. influenzae"],                          ['H.influenzae']),
    'nmening':  (["N. meningitidis"],                        ['N.meningitidis']),
    'ngono':    (["N. gonorrhoeae"],                         ['N.gonorrhoeae']),
    'moraxella':(["M. catarrhalis"],                         ['M.catarrhalis']),
    'steno':    (["S. maltophilia"],                         ['S.maltophilia']),
    'burk':     (["B. cepacia"],                             ['B.cepacia']),
    'campylo':  (["C. jejuni"],                              ['C.jejuni_C.coli']),
    'vibrio':   (["V. cholerae"],                            ['Vibrio']),
    'bfragilis':(["B. fragilis"],                            ['Anaerobic bacteria_G-negative']),
    'prevotella':(["Prevotella spp."],                       ['Anaerobic bacteria_G-negative']),
    'fnecrophorum':(["F. necrophorum"],                      ['Anaerobic bacteria_G-negative']),
    'fnucleatum':(["F. nucleatum"],                          ['Anaerobic bacteria_G-negative']),
    'cperfringens':(["C. perfringens"],                      ['Anaerobic bacteria_G-positive']),
    'cdifficile':(["C. difficile"],                          ['Anaerobic bacteria_G-positive']),
    # Anaérobies à Gram positif, ajoutés le 25 octobre 2026. Dix espèces, dix
    # tables : le document les sépare, et les seuils de l'une ne valent pas
    # pour l'autre.
    'cinnocuum':(["C. innocuum"],                            ['Anaerobic bacteria_G-positive']),
    'cramosum':(["C. ramosum"],                              ['Anaerobic bacteria_G-positive']),
    'csepticum':(["C. septicum"],                            ['Anaerobic bacteria_G-positive']),
    'ctertium':(["C. tertium"],                              ['Anaerobic bacteria_G-positive']),
    'cacnes':(["C. acnes"],                                  ['Anaerobic bacteria_G-positive']),
    'cavidum':(["C. avidum"],                                ['Anaerobic bacteria_G-positive']),
    'finegoldia':(["Finegoldia magna"],                      ['Anaerobic bacteria_G-positive']),
    'parvimonas':(["Parvimonas micra"],                      ['Anaerobic bacteria_G-positive']),
    'peptostrepto':(["Peptostreptococcus anaerobius"],       ['Anaerobic bacteria_G-positive']),
    'peptoniphilus':(["Peptoniphilus spp."],                 ['Anaerobic bacteria_G-positive']),
    # Espèces aérobies ajoutées le 25 octobre 2026. Une feuille chacune, sauf
    # les corynébactéries toxinogènes, qui en partagent une et se séparent sur
    # la clindamycine.
    'pasteurella':(["Pasteurella multocida"],                ['Pasteurella']),
    'aeromonas':(["Aeromonas spp."],                         ['Aeromonas']),
    'achromobacter':(["A. xylosoxidans"],                    ['A.xylosoxidans']),
    'kingella':(["K. kingae"],                               ['K.kingae']),
    'aerococcus':(["A. urinae", "A. sanguinicola"],          ['A.sanguinicola_A.urinae']),
    'cdiphtheriae':(["C. diphtheriae"],                      ['C.diphtheriae_C.ulcerans']),
    'culcerans':(["C. ulcerans"],                            ['C.diphtheriae_C.ulcerans']),
}

# Les feuilles d'anaérobies sont découpées en blocs par genre, et le genre ne
# figure QUE dans l'intertitre — pas dans la ligne de l'antibiotique. Sans cette
# correspondance, on compare un Clostridium aux seuils d'un Bacteroides.
SECTIONS = {
    'bfragilis':    'Bacteroides spp.',
    'prevotella':   'Prevotella spp.',
    'fnecrophorum': 'Fusobacterium necrophorum and Fusobacterium nucleatum',
    'fnucleatum':   'Fusobacterium necrophorum and Fusobacterium nucleatum',
    'cperfringens': 'Clostridium perfringens',
    'cdifficile':   'Clostridioides difficile',
    'cinnocuum':    'Clostridium innocuum',
    'cramosum':     'Clostridium ramosum',
    'csepticum':    'Clostridium septicum',
    'ctertium':     'Clostridium tertium',
    'cacnes':       'Cutibacterium acnes',
    'cavidum':      'Cutibacterium avidum',
    'finegoldia':   'Finegoldia spp.',
    'parvimonas':   'Parvimonas micra',
    'peptostrepto': 'Peptostreptococcus anaerobius',
    'peptoniphilus':'Peptoniphilus spp.',
}

# Compatibilité : les groupes à feuille unique restent comparables.
FEUILLES = {g: f[0] for g, (_, f) in GROUPES.items() if len(f) == 1}

# Code PhénoBac -> motif de recherche dans la colonne « agent » d'EUCAST.
# Motifs volontairement larges : mieux vaut plusieurs candidats affichés
# qu'un mauvais choix opéré en silence.
AGENTS = {
    'AMX': r'^amoxicillin\b(?!-)', 'AMP': r'^ampicillin\b(?!-)',
    'AMC': r'^amoxicillin-clavulanic', 'TZP': r'^piperacillin-tazobactam',
    'FOX': r'^cefoxitin', 'CTX': r'^cefotaxime', 'CAZ': r'^ceftazidime\b(?!-)',
    'FEP': r'^cefepime\b(?!-)',   # exclut le céfépime-enmétazobactam
    'ETP': r'^ertapenem', 'IPM': r'^imipenem\b(?!-)',
    'MEM': r'^meropenem\b(?!-)', 'CIP': r'^ciprofloxacin', 'LVX': r'^levofloxacin',
    'GEN': r'^gentamicin\b(?!.*high)', 'HLG': r'gentamicin.*high|high.*gentamicin',
    'AMK': r'^amikacin', 'SXT': r'^trimethoprim-sulfamethoxazole',
    'FOS': r'^fosfomycin', 'COL': r'^colistin', 'AZM': r'^azithromycin',
    'OXA': r'^oxacillin', 'PEN': r'^benzylpenicillin', 'E': r'^erythromycin',
    'DA': r'^clindamycin', 'RD': r'^rifampicin', 'VA': r'^vancomycin',
    'TEC': r'^teicoplanin', 'LZD': r'^linezolid', 'DOX': r'^doxycycline',
    'MTZ': r'^metronidazole', 'CAF': r'^chloramphenicol',
    'TEM': r'^temocillin', 'FDC': r'^cefiderocol', 'DAP': r'^daptomycin',
    # « Minocycline (prophylaxis only) » chez le méningocoque n'est pas un
    # seuil de catégorisation : le motif s'arrête au nom seul.
    'MIN': r'^minocycline\b(?!\s*\()', 'MXF': r'^moxifloxacin',
    # TÉTRACYCLINE. Son absence d'ici n'était pas neutre : faute de motif, le
    # couple passait pour « non chiffré par le document », et le drapeau
    # « convention de laboratoire » était réclamé sur trois seuils que
    # l'EUCAST donne bel et bien. Un outil qui ne connaît pas une molécule ne
    # se tait pas : il accuse.
    'TET': r'^tetracycline',
    # Molécules de l'antibiogramme ciblé urinaire, ajoutées le 2026-10-24.
    # Les quatre premières ne sont chiffrées QUE pour la cystite simple :
    # leur ligne EUCAST porte « (uncomplicated UTI only) », et le motif doit
    # donc l'accepter — s'arrêter au nom seul les laisserait non comparées,
    # c'est-à-dire non vérifiées, ce qui est le pire des deux mondes.
    'MEC': r'^mecillinam', 'NIT': r'^nitrofurantoin', 'TMP': r'^trimethoprim\b(?!-)',
    'CFM': r'^cefixime', 'ATM': r'^aztreonam\b(?!-)', 'OFX': r'^ofloxacin',
    # La ceftriaxone a deux lignes ; celle du contexte ordinaire fait foi ici,
    # la méningée étant comparée par sa propre table.
    # Le motif portait l'indication — « ceftriaxone (indications other than » —
    # et ne pouvait donc JAMAIS trouver la ligne de méningite. Un motif nomme
    # l'antibiotique ; c'est le filtre d'indication qui choisit la ligne, et il
    # garde déjà « other than » en mode ordinaire.
    'CRO': r'^ceftriaxone\b(?!-)',
}


def seuils_phenobac(racine):
    """Les seuils de CMI EUCAST, lus dans la base de connaissances.

    CET OUTIL A ÉTÉ MUET TROIS SEMAINES. Il lisait « const BP = » dans le
    moteur serveur ; le 3 octobre 2026 les seuils sont devenus des données
    (base-connaissances.js) et cette constante a disparu. L'outil levait donc
    une exception à chaque lancement — et comme rien ne le lançait, personne
    ne l'a su. Un vérificateur qui ne tourne pas ne vérifie rien, et il est
    pire qu'absent : on croit le contrôle fait.

    Il lit désormais la base, par le même chemin que verifier-tables.py.
    """
    s = importlib.util.spec_from_file_location(
        "moteur_py", os.path.join(racine, "outils", "moteur_py.py"))
    MP = importlib.util.module_from_spec(s)
    s.loader.exec_module(MP)
    tables = MP.tables(["BP", "BP_URIN", "BP_MENINGE", "HORS_EUCAST", "ECOFF",
                        "DZ", "DZ_URIN", "DZ_TEMOIN", "DEPISTAGE"])
    globals()["DZ_TEMOIN"] = tables.get("DZ_TEMOIN") or {}
    globals()["DEPISTAGE"] = tables.get("DEPISTAGE") or {}
    globals()["ECOFF"] = tables.get("ECOFF") or {}
    globals()["HORS_EUCAST"] = tables.get("HORS_EUCAST") or {}
    if MENINGE:
        # LES SEUILS MÉNINGÉS N'ÉTAIENT CONFRONTÉS PAR RIEN. L'outil écarte
        # volontairement les lignes « (meningitis) » du document, puisque le
        # rendu courant se fait hors méningite — et personne ne regardait
        # l'autre moitié. Or c'est celle qui fait passer une pénicilline de
        # « I » à « R » sur un liquide céphalo-rachidien.
        BP, URIN = tables.get("BP_MENINGE") or {}, {}
        globals()["BP_ORDINAIRE"] = tables.get("BP") or {}
    elif DIAMETRE:
        BP, URIN = tables.get("DZ") or {}, tables.get("DZ_URIN") or {}
    else:
        BP, URIN = tables["BP"], tables.get("BP_URIN") or {}
    # Les seuils de cystite simple vivent dans leur propre table : ne lire que
    # BP laisserait le pivmécillinam, le céfixime, la nitrofurantoïne et le
    # triméthoprime HORS de la comparaison — non comparés, donc non vérifiés,
    # alors même qu'ils viennent d'être ajoutés. On les joint ici ; aucune
    # molécule n'est dans les deux tables, la fusion ne masque donc rien.
    fusion = {}
    for source in (BP, URIN):
        for g, e in source.items():
            fusion.setdefault(g, {}).update(e)
    table = {}
    for groupe, entrees in fusion.items():
        garde = {}
        for abx, v in entrees.items():
            if not isinstance(v, dict) or "S" not in v or "R" not in v:
                continue
            nb = lambda x: None if x is None else float(x)
            garde[abx] = (nb(v.get("S")), nb(v.get("R")))
        if garde:
            table[groupe] = garde
    return table


def nombre(txt):
    """« 0.001 » dans le classeur EUCAST signifie « pas de catégorie S » ; on le
    laisse tel quel ici, la comparaison le traduit en None côté application.

    AU DISQUE, LA MÊME CHOSE S'ÉCRIT « 50 » (note 13 : « an MIC breakpoint of
    S ≤ 0.001 mg/L … corresponding to a zone diameter breakpoint of S ≥ 50 mm »).
    Le mode diamètres doit donc traduire 50 exactement comme le mode CMI
    traduit 0,001 : sans cela, les trente-deux couples concernés — pénicilline
    G de Corynebacterium, ciprofloxacine d'Acinetobacter, lévofloxacine du
    staphylocoque… — ressortent tous « DIFFÉRENTS », et trente-deux fausses
    alertes valent une absence de contrôle."""
    if txt is None: return None
    t = str(txt).strip().strip('()')
    if t in ('-', '', 'IE', 'NA'): return None
    m = re.match(r'^([\d.]+)$', t)
    return float(m.group(1)) if m else None


MENINGE = False

# LES DIAMÈTRES N'ÉTAIENT CONFRONTÉS À RIEN.
#
# Cet outil lisait les colonnes B et C du classeur — les CMI — et comparait à
# BP. La moitié DIAMÈTRE du référentiel, celle que lit un laboratoire qui
# travaille au pied à coulisse, n'était relue par personne depuis que
# outils/extraire-diametres.py l'avait produite. Le 25 octobre 2026 on a
# découvert ainsi que les sept diamètres de Bacteroides fragilis manquaient
# tous, et rien ne le disait.
#
# Le mode « --diametres » ne réécrit RIEN de la sélection des lignes : les
# indications, les voies, les restrictions d'espèce, les genres qui partagent
# une feuille — tout ce savoir accumulé vaut pour les deux moitiés. Il change
# seulement les DEUX COLONNES qu'on lit, et la table à laquelle on compare.
# Le sens est inversé (S ≥, R <), mais une égalité se compare dans les deux
# sens de la même façon.
DIAMETRE = False


# ESPÈCES QUE CHAQUE GROUPE DE SEUILS COUVRE, telles que le document les
# nomme. Une ligne qui NOMME une espèce ne vaut que pour elle : « Clindamycin,
# C. diphtheriae » ne concerne pas C. ulcerans, « Daptomycin, S. aureus » ne
# concerne pas les staphylocoques à coagulase négative, et « Nitrofurantoin
# (uncomplicated UTI only), S. saprophyticus » ne concerne ni S. aureus ni les
# autres SCN. Sans cette liste, le balayage inverse réclamait des seuils que
# le document ne donne PAS pour l'espèce visée — l'outil qui accuse, encore.
ESPECES_GROUPE = {
    'entero':       r'E\. coli|Klebsiella|Enterobacter|Citrobacter|Shigella|Enterobacterales',
    'salmonella':   r'Salmonella|Enterobacterales',
    'morganella':   r'Morganell|Proteus|Providencia|Enterobacterales',
    'serratia':     r'Serratia|Enterobacterales',
    'staph':        r'S\. aureus|Staphylococcus',
    'scn':          r'[Cc]oagulase-negative|S\. saprophyticus|S\. epidermidis|Staphylococcus',
    'enteroc':      r'E\. faecalis|E\. faecium|enterococci|Enterococcus',
    'strepacg':     r'groups? A|S\. pyogenes|S\. dysgalactiae|Streptococcus',
    'strepb':       r'group B|S\. agalactiae|Streptococcus',
    'cdiphtheriae': r'C\. diphtheriae',
    'culcerans':    r'C\. ulcerans',
    'fnecrophorum': r'F\. necrophorum',
    'fnucleatum':   r'F\. nucleatum',
    'campylo':      r'C\. jejuni|Campylobacter',
}

# Ce qui ressemble à une restriction d'espèce dans un intitulé de ligne.
ESPECE_CITEE = re.compile(
    r'\b[A-Z]\.\s*[a-z]+|Enterobacterales|Morganellaceae|Serratia|Salmonella|'
    r'Klebsiella|Proteus|Providencia|Citrobacter|Enterobacter|Shigella|'
    r'[Cc]oagulase-negative staphylococci|enterococci|groups? [ABCG]|group [ABCG]')


def panels_par_groupe(racine):
    """Molécules OFFERTES par l'application, groupe de seuils par groupe de
    seuils, lues dans PRESENTATION de la page.

    POURQUOI C'EST LA BONNE QUESTION. Un couple que le document chiffre et que
    PhénoBac ne porte pas n'est pas forcément un défaut : l'application offre
    un PANEL choisi — celui d'un laboratoire de district, et non la liste
    entière de l'EUCAST. La tétracycline du pneumocoque n'y est pas, et c'est
    une décision.

    Mais une molécule OFFERTE AU PANEL sans seuil, c'en est un : le
    biologiste la voit, la saisit, et rien ne sort. Ce sont ces deux cas qu'il
    faut séparer, sinon le rapport noie l'un dans l'autre."""
    page = open(os.path.join(racine, "phenobac.html"), encoding="utf-8").read()
    i = page.index("const PRESENTATION")
    bloc = page[i:page.index("\n};", i)]
    par_espece = {}
    for m in re.finditer(r"\n  (\w+):\{(.*?)\n  \},", bloc, re.S):
        par_espece[m.group(1)] = set(re.findall(r'"([A-Z][A-Z0-9]*)"', m.group(2)))
    # espèce -> groupe de seuils, lu dans le moteur
    mot = open(os.path.join(racine, "moteur.js"), encoding="utf-8").read()
    k = mot.index("const ORG = {")
    org = mot[k:mot.index("\n};", k)]
    par_groupe = {}
    for m in re.finditer(r"^\s{2}(\w+):\s*\{.*?bpGroup:\s*\"(\w+)\"", org, re.M | re.S):
        espece, groupe = m.group(1), m.group(2)
        par_groupe.setdefault(groupe, set()).update(par_espece.get(espece, set()))
    if not par_groupe:
        raise SystemExit("CONFRONTATION INTERROMPUE — aucun panel lu dans la page. "
                         "Sans eux, le rapport ne saurait plus distinguer un seuil "
                         "manquant d'un choix de couverture, et dirait les deux de la "
                         "même façon.")
    return par_groupe


def vise_mon_groupe(groupe, nom):
    """La ligne concerne-t-elle l'espèce du groupe ? « Oui » quand elle ne
    nomme aucune espèce. Quand elle en nomme, il faut que l'une soit la mienne
    — sauf si elle les EXCLUT (« except Morganella morganii »), auquel cas
    c'est l'inverse."""
    citees = ESPECE_CITEE.findall(nom)
    if not citees:
        return True
    mien = ESPECES_GROUPE.get(groupe)
    if not mien:
        return True                     # groupe à feuille propre : rien à filtrer
    apres_except = nom.split("except", 1)[1] if re.search(r'\bexcept\b', nom) else ""
    if apres_except and re.search(mien, apres_except):
        return False                    # nommément exclu
    avant = nom.split("except", 1)[0]
    return bool(re.search(mien, avant))


def excuse_absence(groupe, code):
    """Pourquoi PhénoBac peut légitimement ne pas porter un seuil que le
    document donne. Chaque excuse est un MÉCANISME de l'application, pas une
    tolérance : si aucune ne s'applique, c'est un manque."""
    if DIAMETRE:
        t = (DZ_TEMOIN.get(groupe) or {}).get(code)
        if t:
            return "lu sur le disque de %s (témoin déclaré par le document)" % t
        if groupe == "pneumo" and code in ("PEN", "AMX", "CTX"):
            return "se déduit du dépistage à l'oxacilline 1 µg"
    if (DEPISTAGE.get(groupe) or {}).get(code):
        return "porté comme seuil de DÉPISTAGE, pas comme seuil clinique"
    return None


def hors_echelle():
    """La valeur par laquelle l'EUCAST écrit « aucune catégorie sensible » :
    0,001 mg/L en CMI, 50 mm au disque. Note 13 du classeur."""
    return 50.0 if DIAMETRE else 0.001


def main():
    global MENINGE, DIAMETRE
    MENINGE = "--meninge" in sys.argv
    DIAMETRE = "--diametres" in sys.argv
    if MENINGE and DIAMETRE:
        sys.exit("« --meninge » et « --diametres » ne se combinent pas : "
                 "les diamètres méningés n'ont pas de table à part dans PhénoBac.")
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    racine = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    c = Classeur(sys.argv[1])
    bp = seuils_phenobac(racine)

    total = {'identique': 0, 'different': 0, 'arbitrer': 0, 'absent': 0}
    non_comparables = []
    drapeaux = []
    entre_parentheses = set()
    vus = set()
    manque_couverture, excuses, hors_panel = [], [], []
    PANELS = panels_par_groupe(racine)

    def convention(groupe, code):
        v = HORS_EUCAST.get(groupe)
        if v is True:
            return True
        if isinstance(v, (list, tuple)):
            return code in v
        if isinstance(v, dict):
            return bool(v.get(code))
        return False

    for groupe in sorted(bp):
        germes, feuilles = GROUPES.get(groupe, ([], []))
        if len(feuilles) > 1:
            non_comparables.append((groupe, germes, feuilles))
            continue
        feuille = FEUILLES.get(groupe)
        print("\n=== groupe %s  ->  feuille EUCAST %s ===" % (groupe, feuille or "(non associée)"))
        if not feuille or feuille not in c.feuilles:
            print("   feuille introuvable — association à compléter dans GROUPES")
            continue
        lignes = c.lignes(feuille)
        section = SECTIONS.get(groupe)
        if section:
            """UN TITRE DE SECTION EST LA PREMIÈRE LIGNE D'UN BLOC.

            Les feuilles d'anaérobies empilent plusieurs tableaux — Bacteroides,
            Prevotella, Fusobacterium — chacun précédé d'un titre, parfois suivi
            d'une phrase d'explication : « Breakpoints for Bacteroides spp. are
            also valid for Parabacteroides spp. … ».

            Le découpage prenait TOUTE ligne où seule la colonne A est remplie
            pour un titre. Cette phrase refermait donc la section aussitôt
            ouverte, et le groupe se comparait à RIEN — sans rien dire, puisque
            « aucune ligne correspondante » est aussi ce que l'on voit quand le
            document ne porte pas l'antibiotique.

            On repère donc les en-têtes de tableau (la ligne « S ≤ »), on
            remonte la suite de lignes seules qui les précède, et l'on ne retient
            que la PREMIÈRE : les autres sont de la prose."""
            entetes = [i for i, cel in enumerate(lignes)
                       if any("S ≤" in str(v) for v in cel.values())]
            seule = lambda cel: (cel.get('A', '').strip()
                                 and len([k for k in cel if k != 'A']) == 0)
            titres = {}
            for h in entetes:
                # Entre le titre et la ligne « S ≤ » s'intercale la ligne
                # « Antimicrobial agent », qui n'est PAS une ligne seule : la
                # remontée s'y arrêtait net et ne trouvait aucun titre.
                i = h - 1
                while i >= 0 and "Antimicrobial agent" in lignes[i].get('A', ''):
                    i -= 1
                fin = i
                while i >= 0 and seule(lignes[i]):
                    i -= 1
                if i + 1 <= fin and seule(lignes[i + 1]):
                    titres[i + 1] = lignes[i + 1]['A'].replace("\n", " ").strip()

            garde, dedans = [], False
            for i, cel in enumerate(lignes):
                if i in titres:
                    dedans = (titres[i] == section); continue
                if seule(cel):
                    continue                     # prose : n'ouvre ni ne ferme
                if dedans:
                    garde.append(cel)
            if not garde:
                print("   section « %s » introuvable ou vide sur cette feuille — "
                      "titres repérés : %s" % (section, ", ".join(sorted(titres.values()))))
            lignes = garde
        # L'AUTRE MOITIÉ DE LA QUESTION, POUR TOUTES LES FEUILLES.
        #
        # La boucle ne parcourait que les codes que PhénoBac PORTE. Ce que le
        # document chiffre et que l'application n'a pas lui était invisible —
        # et c'est ainsi que les sept diamètres de Bacteroides fragilis ont
        # dormi : outils/verifier-couverture-eucast.py les a trouvés, mais il
        # ne couvre que 22 tables sur 39, faute de savoir lire les indications
        # et les voies des grandes feuilles. Ce savoir est ICI.
        #
        # On parcourt donc aussi les 40 codes que PhénoBac sait tester. Pour
        # ceux qu'elle ne porte pas, la MÊME sélection de lignes s'applique :
        # si le document donne un chiffre, c'est un manque, et il se compte à
        # part pour ne pas brouiller le bilan des seuils confrontés.
        for code in sorted(set(bp.get(groupe, {})) | set(AGENTS)):
            porte = code in bp.get(groupe, {})
            sA, rA = bp[groupe][code] if porte else (None, None)
            motif = AGENTS.get(code)
            cands = []
            # POURQUOI un couple n'est pas comparé. « Aucune ligne
            # correspondante » recouvrait cinq situations très différentes —
            # de « le document ne le porte pas » à « il le porte, et nous ne
            # l'avons pas vu ». Les confondre a laissé dormir quatre seuils
            # divergents de Bacteroides fragilis. On note donc chaque mise à
            # l'écart, et le rapport la restitue.
            ecartes = []
            espece_propre = False
            if motif:
                # Deux groupes partagent la feuille des staphylocoques : on ne
                # retient que les lignes de l'espèce concernée, sinon celles de
                # S. aureus et des coagulase-négative se mélangent.
                ESPECES = {'cdiphtheriae': r'C\. diphtheriae',
                           'salmonella': r'Salmonella',
                           'morganella': r'\bMorganellaceae\b(?!.*except)',
                           'serratia':   r'Serratia',
                           'staph':    r'S\. aureus',
                           'scn':      r'[Cc]oagulase-negative',
                           'strepacg': r'groups A, C and G',
                           'strepb':   r'S\.\s*agalactiae',
                           'campylo':  r'C\. jejuni',
                           # Les deux Fusobacterium partagent une section et
                           # se séparent sur deux molécules : sans ce filtre,
                           # les seuils de F. necrophorum s'appliqueraient à
                           # F. nucleatum, que le document renvoie à une note.
                           'fnecrophorum': r'F\. necrophorum',
                           'fnucleatum':   r'F\. nucleatum'}
                espece = ESPECES.get(groupe)
                # Indications particulières : le rendu courant se fait hors
                # méningite, hors endocardite, et un « screen only » n'est pas
                # un seuil de catégorisation.
                # Indications particulières : le rendu courant se fait hors
                # méningite, hors endocardite ; un « screen only » n'est pas un
                # seuil de catégorisation. Les seuils méningés vivent dans la
                # table BP_MENINGE et sont contrôlés à part.
                PARTICULIER = r'\bscreen only\b|endocarditis|meningitis'
                for cel in lignes:
                    if MENINGE:
                        # En mode méningé, on ne retient QUE les lignes de
                        # méningite — et jamais celles qui s'en excluent
                        # (« indications other than … meningitis »).
                        brut = re.sub(r'\s+', ' ', cel.get('A', '')).strip()
                        if (not re.search(r'mening', brut, re.I)
                                or re.search(r'other than', brut, re.I)):
                            continue
                    # Un retour à la ligne dans le libellé faisait passer
                    # « Cefepime-\nenmetazobactam » pour du céfépime : le motif
                    # voyait une fin de mot là où il y avait un trait d'union.
                    nom = re.sub(r'\s+', ' ', cel.get('A', '')).strip()
                    if (not MENINGE
                            and re.search(PARTICULIER, nom, re.I)
                            and not re.search(r'other than|all indications|including', nom, re.I)):
                        if re.search(motif, nom, re.I):
                            ecartes.append(("dépistage" if re.search(r'screen only', nom, re.I)
                                            else "indication particulière", nom))
                        continue
                    if re.search(motif, nom, re.I):
                        # UNE LIGNE QUI NOMME MON ESPÈCE GOUVERNE, MÊME SANS
                        # CHIFFRE. Le document donne à Salmonella sa propre
                        # ligne de ciprofloxacine, dont le DIAMÈTRE est
                        # « Note » : il n'y a pas de disque pour ce genre, et
                        # l'EUCAST fait écran à la péfloxacine. Retomber sur la
                        # ligne générale des entérobactéries (25/22) faisait
                        # réclamer un seuil que le référentiel refuse de
                        # donner. « Note » n'est pas une absence de ligne :
                        # c'est un refus de trancher, et il vaut pour moi.
                        if espece and re.search(espece, nom):
                            espece_propre = True
                        # Les seules deux lignes qui changent entre les deux
                        # moitiés du référentiel.
                        bruts = ((cel.get('F'), cel.get('G')) if DIAMETRE
                                 else (cel.get('B'), cel.get('C')))
                        sE, rE = nombre(bruts[0]), nombre(bruts[1])
                        if sE is None and rE is None:
                            # La ligne EXISTE mais ne porte aucun chiffre :
                            # l'EUCAST y écrit « IE » (preuves insuffisantes),
                            # « NA » ou un tiret. Ce n'est ni une absence ni un
                            # désaccord — c'est un refus de trancher, et la
                            # valeur que PhénoBac applique est alors une
                            # convention de laboratoire qui doit le dire.
                            ecartes.append(("sans valeur chiffrée (%s)"
                                            % (str(bruts[0] or bruts[1] or "–").strip()[:12]), nom))
                        if sE is not None or rE is not None:
                            # EUCAST met certains seuils entre parenthèses. La
                            # valeur reste la bonne, mais la parenthèse est une
                            # réserve du référentiel : la faire disparaître
                            # silencieusement serait perdre une information.
                            # LA RÉSERVE SE LIT DES DEUX CÔTÉS DE LA LIGNE.
                            # La colonne « ecoff » de la base vaut pour le
                            # COUPLE germe/antibiotique, pas pour une méthode :
                            # ne regarder que les colonnes du mode courant
                            # ferait crier l'outil dans les deux sens pour
                            # rien — la colistine, qui n'a pas de disque,
                            # paraîtrait porter une réserve que le document ne
                            # donne pas, et la ciprofloxacine du staphylocoque,
                            # dont PhénoBac n'a QUE le diamètre, échappait au
                            # contrôle en mode CMI. C'est ainsi que quatre
                            # réserves manquantes sont restées invisibles.
                            if any("(" in str(cel.get(col) or "")
                                   for col in ("B", "C", "F", "G")):
                                nom = nom + "  ⟨valeur entre parenthèses⟩"
                            cands.append((nom, sE, rE))
            # Si des lignes nomment l'espèce du groupe, elles seules valent :
            # sans cela, C. coli concurrence C. jejuni sur la même feuille.
            if espece and cands:
                visees = [x for x in cands if re.search(espece, x[0])]
                if visees:
                    cands = visees
                elif espece_propre:
                    # Ma ligne existe et ne porte pas de chiffre : rien ne
                    # s'applique, et surtout pas la ligne générale.
                    ecartes.append(("ligne propre à l'espèce, sans valeur chiffrée",
                                    "le document ne donne rien pour ce groupe"))
                    cands = []

            # Convention documentée dans le README : la ligne intraveineuse et
            # l'infection systémique servent de référence, un antibiogramme
            # étant rendu sans connaître la voie ni le site.
            for ecarte in (r'urinary|uncomplicated UTI', r'\boral\b'):
                reste = [x for x in cands if not re.search(ecarte, x[0], re.I)]
                if reste: cands = reste

            # Pour le groupe général, écarter les lignes propres à un genre
            # particulier : « except Morganellaceae » est la ligne générale.
            GENRES = {'salmonella': 'Salmonella', 'morganella': 'Morganellaceae', 'serratia': 'Serratia'}
            if groupe in ('entero',) + tuple(GENRES) and cands:
                mien = GENRES.get(groupe)
                autres = [v for k, v in GENRES.items() if k != groupe]
                def garder(nom):
                    # la ligne de mon genre l'emporte
                    if mien and re.search(mien, nom, re.I) and not re.search(r'except', nom, re.I):
                        return True
                    # sinon on écarte les lignes propres à un autre genre
                    for a in autres:
                        if re.search(a, nom, re.I) and not re.search(r'except\s+' + a, nom, re.I):
                            return False
                    if mien and re.search(r'except\s+' + mien, nom, re.I):
                        return False
                    return True
                reste = [x for x in cands if garder(x[0])]
                if reste: cands = reste

            # Plusieurs lignes portant la MÊME valeur ne constituent pas une
            # ambiguïté : il n'y a rien à arbitrer. Sans cette réduction, un
            # écart réel avec l'application se retrouve classé « à arbitrer »
            # et passe inaperçu — c'est arrivé pour la gentamicine.
            if cands:
                distinctes = {(None if s0 == hors_echelle() else s0, r0) for _, s0, r0 in cands}
                if len(distinctes) == 1:
                    cands = [cands[0]]

            if not motif:
                etat, detail = 'absent', "aucun motif de recherche défini pour ce code"
            elif not cands:
                if ecartes:
                    quoi = sorted({e[0] for e in ecartes})
                    etat, detail = 'absent', ("écarté — %s : %s"
                        % (", ".join(quoi), "; ".join(e[1][:48] for e in ecartes[:2])))
                else:
                    etat, detail = 'absent', "le document ne porte pas ce couple sur cette feuille"
            elif len(cands) == 1:
                nom, sE, rE = cands[0]
                if sE == hors_echelle(): sE = None   # « pas de catégorie S » <-> S: null
                # LA PARENTHÈSE SE LIT SUR LA LIGNE RETENUE, pas sur une
                # candidate. L'amoxicilline des entérobactéries n'est entre
                # parenthèses que sur « oral (other indications) » ; la ligne
                # intraveineuse, celle que PhénoBac applique, ne l'est pas.
                # Marquer au moment de la collecte faisait entrer les deux
                # molécules les plus courantes du panel urinaire dans une
                # réserve qui ne les concerne pas.
                vus.add((groupe, code))
                if "parenthèses" in nom:
                    entre_parentheses.add((groupe, code))
                if sE == sA and rE == rA:
                    etat, detail = 'identique', nom
                else:
                    etat, detail = 'different', ("%s : EUCAST %s%s %s%s"
                        % (nom, "S>=" if DIAMETRE else "S<=", sE,
                           "R<" if DIAMETRE else "R>", rE))
            else:
                etat = 'arbitrer'
                detail = "%d lignes possibles :" % len(cands)
            # Un code que PhénoBac ne porte pas : on ne confronte pas, on
            # constate. Avec les excuses qui en sont de vraies.
            if not porte:
                chiffres = [x for x in cands if x[1] is not None or x[2] is not None]
                # Une ligne qui nomme une AUTRE espèce ne vaut pas pour ce
                # groupe : la réclamer serait accuser à tort.
                chiffres = [x for x in chiffres if vise_mon_groupe(groupe, x[0])]
                if chiffres:
                    pourquoi = excuse_absence(groupe, code)
                    nom0, s0, r0 = chiffres[0]
                    if pourquoi:
                        excuses.append((groupe, code, pourquoi))
                    elif code not in PANELS.get(groupe, set()):
                        hors_panel.append((groupe, code, nom0, s0, r0))
                    else:
                        manque_couverture.append((groupe, code, nom0, s0, r0))
                continue

            # LE DRAPEAU « CONVENTION DE LABORATOIRE » DOIT DIRE VRAI.
            #
            # Il signifie « le référentiel ne fixe RIEN pour ce couple », et
            # l'interface l'affiche au biologiste pour qu'il se méfie du
            # chiffre. Il se périme donc tout seul : le jour où l'EUCAST fixe
            # un seuil, la mention devient un mensonge, et elle conseille de se
            # méfier d'une valeur officielle.
            #
            # C'est ce qui était arrivé à six couples de Bacteroides fragilis.
            # On vérifie donc l'équivalence DANS LES DEUX SENS, à chaque
            # confrontation : marqué convention si et seulement si le document
            # ne donne aucun chiffre.
            # Le drapeau « convention » ne concerne que la table ordinaire :
            # un seuil méningé absent de PhénoBac n'est pas une convention,
            # c'est un manque, et il se compte ailleurs.
            conv = convention(groupe, code)
            chiffre = (etat in ('identique', 'different'))
            if MENINGE or DIAMETRE:
                # Le drapeau « convention de laboratoire » dit que le
                # référentiel ne fixe RIEN pour ce couple. Il se juge sur les
                # CMI : un couple peut avoir une concentration critique et
                # aucun diamètre — la vancomycine de l'entérocoque,
                # le méropénème de Pseudomonas — sans que la mention devienne
                # fausse pour autant. L'éprouver ici réclamerait un drapeau
                # sur des couples parfaitement fixés par le document.
                pass
            elif conv and chiffre:
                drapeaux.append((groupe, code, "marqué « convention de laboratoire » "
                                 "alors que le document FIXE ce couple"))
            elif not conv and not chiffre:
                drapeaux.append((groupe, code, "non marqué, alors que le document "
                                 "ne donne aucun chiffre pour ce couple"))
            total[etat] += 1
            marque = {'identique': ' ok ', 'different': '!!!!', 'arbitrer': ' ?? ', 'absent': ' -- '}[etat]
            gauche, droite = ("S>=", "R<") if DIAMETRE else ("S<=", "R>")
            print("  [%s] %-4s application %s%-7s %s%-7s  %s"
                  % (marque, code, gauche, sA, droite, rA, detail))
            if etat == 'arbitrer':
                for nom, sE, rE in cands:
                    concorde = "  <- concorde" if (sE == sA and rE == rA) else ""
                    print("            %-58s %s%-7s %s%s%s"
                          % (nom[:58], gauche, sE, droite, rE, concorde))

    if non_comparables:
        print("\n=== groupes NON COMPARABLES : ils couvrent plusieurs feuilles EUCAST ===")
        print("Comparer reviendrait à appliquer les seuils d'une espèce à une autre.")
        print("Le remède n'est pas de choisir une feuille, mais de scinder le groupe.")
        for g, germes, feuilles in non_comparables:
            print("\n  %s — %s" % (g, ", ".join(germes)))
            print("      feuilles concernées : %s" % ", ".join(feuilles))
            print("      seuils en attente   : %d" % len(bp.get(g, {})))

    # L'AUTRE MOITIÉ DE LA QUESTION. Comparer les seuils que PhénoBac porte ne
    # dit rien de ceux qu'il NE PORTE PAS. Or un seuil méningé manquant n'est
    # pas une absence inoffensive : c'est le seuil ORDINAIRE qui s'applique
    # alors, et il est plus permissif. Un méropénème à 1 mg/L sur un LCR à
    # pneumocoque serait rendu sensible là où le document le dit résistant.
    if MENINGE:
        manques = []
        # Parcourir les groupes QUI ONT UNE FEUILLE, et non ceux qui ont déjà
        # un seuil méningé : un groupe qui n'en porte aucun — Haemophilus,
        # méningocoque — serait sinon sauté, et c'est précisément celui dont
        # le manque est total.
        for groupe in sorted(FEUILLES):
            feuille = FEUILLES.get(groupe)
            if not feuille or feuille not in c.feuilles:
                continue
            for cel in c.lignes(feuille):
                nom = re.sub(r'\s+', ' ', cel.get('A', '')).strip()
                if not re.search(r'mening', nom, re.I) or re.search(r'other than', nom, re.I):
                    continue
                sE, rE = nombre(cel.get('B')), nombre(cel.get('C'))
                if sE is None and rE is None:
                    continue                      # « IE », « Note » : rien à porter
                for code, motif in AGENTS.items():
                    if not re.search(motif, nom, re.I) or code in bp.get(groupe, {}):
                        continue
                    # UN MANQUE SANS CONSÉQUENCE N'EN EST PAS UN. Deux cas :
                    #   · PhénoBac n'a pas non plus de seuil ORDINAIRE — rien
                    #     ne s'applique, la molécule n'est pas catégorisée, et
                    #     c'est le bon comportement ;
                    #   · le seuil ordinaire porte DÉJÀ la valeur méningée —
                    #     c'est le cas quand le document ne donne qu'une ligne
                    #     (« all indications, including meningitis »).
                    # Les signaler ferait du bruit, et le bruit apprend à
                    # ignorer les signalements qui comptent.
                    ord_ = (BP_ORDINAIRE.get(groupe) or {}).get(code)
                    if not ord_:
                        break
                    sO = ord_.get("S"); rO = ord_.get("R")
                    if sO == hors_echelle(): sO = None
                    if (sO, rO) == (sE, rE):
                        break
                    manques.append((groupe, code, nom, sE, rE, sO, rO))
                    break
        if manques:
            print("\n=== SEUILS MÉNINGÉS DU DOCUMENT QUE PHÉNOBAC NE PORTE PAS ===")
            print("Sans eux, c'est le seuil ORDINAIRE qui s'applique sur un LCR,")
            print("et il est plus permissif. Chacun est à ajouter après validation.")
            for g, k, nom, sE, rE, sO, rO in sorted(set(manques)):
                print("  %-12s %-5s  méningé S<=%-7s R>%-7s   appliqué aujourd'hui : S<=%-7s R>%s"
                      % (g, k, sE, rE, sO, rO))
                print("               %s" % nom[:70])
        else:
            print("\nAucun seuil méningé du document ne manque à PhénoBac.")

    # ---- CE QUE LE DOCUMENT DONNE ET QUE PHÉNOBAC NE PORTE PAS ----
    if excuses:
        print("\n=== ABSENCES EXPLIQUÉES PAR UN MÉCANISME DE L'APPLICATION (%d) ==="
              % len(excuses))
        for g, k, pourquoi in sorted(set(excuses)):
            print("  %-12s %-5s %s" % (g, k, pourquoi))
    if hors_panel:
        print("\n=== CHIFFRÉ PAR LE DOCUMENT, HORS DU PANEL DE PHÉNOBAC (%d) ==="
              % len(hors_panel))
        print("Ce n'est pas un défaut : l'application offre un panel CHOISI, celui")
        print("d'un laboratoire de district, et non la liste entière de l'EUCAST.")
        print("C'est la liste de ce qu'elle POURRAIT couvrir — une décision, pas")
        print("une omission.")
        for g, k, nom, sE, rE in sorted(set(hors_panel)):
            print("  %-12s %-5s %s" % (g, k, nom[:56]))
    if manque_couverture:
        print("\n=== AU PANEL, ET SANS SEUIL (%d) ===" % len(manque_couverture))
        print("CELLES-LÀ SONT DES DÉFAUTS : la molécule est offerte à la saisie, le")
        print("biologiste la mesure, et rien ne sort. Chacune est à ajouter après")
        print("validation par un biologiste.")
        for g, k, nom, sE, rE in sorted(set(manque_couverture)):
            gauche, droite = ("S>=", "R<") if DIAMETRE else ("S<=", "R>")
            print("  %-12s %-5s %s%-7s %s%-7s   %s" % (g, k, gauche, sE, droite, rE, nom[:52]))
    else:
        print("\n%s : aucune molécule du panel n'est privée du seuil que le "
              "document lui donne." % ("Diamètres" if DIAMETRE else "Concentrations critiques"))

    if entre_parentheses:
        # LA PARENTHÈSE EST UNE RÉSERVE DU RÉFÉRENTIEL, pas une coquetterie
        # typographique. La note 12 du classeur : « clinical evidence as
        # monotherapy is usually lacking […] Reporting S or I should be
        # avoided and if considered necessary, there should be a comment ».
        print("\n=== SEUILS DONNÉS ENTRE PARENTHÈSES PAR L'EUCAST (%d) ==="
              % len(entre_parentheses))
        print("Fondés sur l'ECOFF : ils séparent le sauvage de l'acquis, et NE")
        print("PRÉDISENT PAS la sensibilité clinique. L'EUCAST demande d'éviter")
        print("de rendre « S » ou « I » sans commentaire (note 12).")
        # LE DRAPEAU DOIT SUIVRE LE DOCUMENT, DANS LES DEUX SENS — même règle
        # que pour « convention de laboratoire ». Une réserve oubliée rend
        # « sensible » sans la dire ; une réserve de trop apprend à ignorer
        # les réserves.
        # … MAIS SEULEMENT SUR LES COUPLES QUE CETTE PASSE A VRAIMENT VUS.
        # La colistine n'a pas de disque : en mode diamètres, son couple n'est
        # jamais visité, et la compter « réserve de trop » ferait six fausses
        # alertes pour une réserve parfaitement fondée côté CMI.
        porte = {tuple(c.split(":")) for c in ECOFF if tuple(c.split(":")) in vus}
        for g, k in sorted(entre_parentheses):
            print("  %-14s %-5s %s" % (g, k,
                  "" if (g, k) in porte else "  <- PhénoBac ne porte PAS la réserve"))
        trop = sorted(porte - entre_parentheses)
        for g, k in trop:
            print("  %-14s %-5s   <- réserve portée sans que le document la donne" % (g, k))
        ecarts_ecoff = len([1 for x in entre_parentheses if x not in porte]) + len(trop)
        print("  → %d écart(s) entre le document et le drapeau ECOFF." % ecarts_ecoff)

    print("\n=== bilan ===")
    print("  identiques         : %d" % total['identique'])
    print("  DIFFÉRENTS         : %d   <- à corriger après validation" % total['different'])
    print("  à arbitrer         : %d   <- plusieurs voies/indications possibles" % total['arbitrer'])
    print("  non comparés       : %d" % total['absent'])
    print("  drapeau incohérent : %d   <- « convention » qui ne dit plus vrai" % len(drapeaux))
    if drapeaux:
        print("\nLE DRAPEAU « CONVENTION DE LABORATOIRE » NE DIT PLUS VRAI :")
        for g, k, pourquoi in drapeaux:
            print("  - %s / %s : %s" % (g, k, pourquoi))
    print("\nAucun fichier n'a été modifié. Toute correction doit être validée")
    print("par un biologiste avant d'être portée dans le code.")


if __name__ == '__main__':
    main()
