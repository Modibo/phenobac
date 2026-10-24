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
    tables = MP.tables(["BP", "BP_URIN", "BP_MENINGE", "HORS_EUCAST", "ECOFF"])
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
    laisse tel quel ici, la comparaison le traduit en None côté application."""
    if txt is None: return None
    t = str(txt).strip().strip('()')
    if t in ('-', '', 'IE', 'NA'): return None
    m = re.match(r'^([\d.]+)$', t)
    return float(m.group(1)) if m else None


MENINGE = False


def main():
    global MENINGE
    MENINGE = "--meninge" in sys.argv
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    racine = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    c = Classeur(sys.argv[1])
    bp = seuils_phenobac(racine)

    total = {'identique': 0, 'different': 0, 'arbitrer': 0, 'absent': 0}
    non_comparables = []
    drapeaux = []
    entre_parentheses = set()

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
        for code in sorted(bp[groupe]):
            sA, rA = bp[groupe][code]
            motif = AGENTS.get(code)
            cands = []
            # POURQUOI un couple n'est pas comparé. « Aucune ligne
            # correspondante » recouvrait cinq situations très différentes —
            # de « le document ne le porte pas » à « il le porte, et nous ne
            # l'avons pas vu ». Les confondre a laissé dormir quatre seuils
            # divergents de Bacteroides fragilis. On note donc chaque mise à
            # l'écart, et le rapport la restitue.
            ecartes = []
            if motif:
                # Deux groupes partagent la feuille des staphylocoques : on ne
                # retient que les lignes de l'espèce concernée, sinon celles de
                # S. aureus et des coagulase-négative se mélangent.
                ESPECES = {'salmonella': r'Salmonella',
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
                        bruts = (cel.get('B'), cel.get('C'))
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
                            if any("(" in str(x or "") for x in bruts):
                                nom = nom + "  ⟨valeur entre parenthèses⟩"
                            cands.append((nom, sE, rE))
            # Si des lignes nomment l'espèce du groupe, elles seules valent :
            # sans cela, C. coli concurrence C. jejuni sur la même feuille.
            if espece and cands:
                visees = [x for x in cands if re.search(espece, x[0])]
                if visees: cands = visees

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
                distinctes = {(None if s0 == 0.001 else s0, r0) for _, s0, r0 in cands}
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
                if sE == 0.001: sE = None      # « pas de catégorie S » <-> S: null
                # LA PARENTHÈSE SE LIT SUR LA LIGNE RETENUE, pas sur une
                # candidate. L'amoxicilline des entérobactéries n'est entre
                # parenthèses que sur « oral (other indications) » ; la ligne
                # intraveineuse, celle que PhénoBac applique, ne l'est pas.
                # Marquer au moment de la collecte faisait entrer les deux
                # molécules les plus courantes du panel urinaire dans une
                # réserve qui ne les concerne pas.
                if "parenthèses" in nom:
                    entre_parentheses.add((groupe, code))
                if sE == sA and rE == rA:
                    etat, detail = 'identique', nom
                else:
                    etat, detail = 'different', "%s : EUCAST S<=%s R>%s" % (nom, sE, rE)
            else:
                etat = 'arbitrer'
                detail = "%d lignes possibles :" % len(cands)
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
            if MENINGE:
                pass
            elif conv and chiffre:
                drapeaux.append((groupe, code, "marqué « convention de laboratoire » "
                                 "alors que le document FIXE ce couple"))
            elif not conv and not chiffre:
                drapeaux.append((groupe, code, "non marqué, alors que le document "
                                 "ne donne aucun chiffre pour ce couple"))
            total[etat] += 1
            marque = {'identique': ' ok ', 'different': '!!!!', 'arbitrer': ' ?? ', 'absent': ' -- '}[etat]
            print("  [%s] %-4s application S<=%-7s R>%-7s  %s" % (marque, code, sA, rA, detail))
            if etat == 'arbitrer':
                for nom, sE, rE in cands:
                    concorde = "  <- concorde" if (sE == sA and rE == rA) else ""
                    print("            %-58s S<=%-7s R>%s%s" % (nom[:58], sE, rE, concorde))

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
                    if sO == 0.001: sO = None
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
        porte = {tuple(c.split(":")) for c in ECOFF}
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
