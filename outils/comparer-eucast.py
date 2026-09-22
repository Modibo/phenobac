# -*- coding: utf-8 -*-
"""
comparer-eucast.py — confronte les seuils de PhénoBac au tableau EUCAST officiel.

    python3 outils/comparer-eucast.py chemin/vers/v_16.1_Breakpoint_Tables.xlsx

Ne modifie RIEN. Produit un rapport à valider par un biologiste : pour chaque
seuil de l'application, la ou les lignes EUCAST correspondantes et leurs valeurs.

Le classeur officiel se télécharge sur
https://www.eucast.org/bacteria/clinical-breakpoints-and-interpretation/clinical-breakpoint-tables/

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
    'cperfringens':(["C. perfringens"],                      ['Anaerobic bacteria_G-positive']),
    'cdifficile':(["C. difficile"],                          ['Anaerobic bacteria_G-positive']),
}

# Les feuilles d'anaérobies sont découpées en blocs par genre, et le genre ne
# figure QUE dans l'intertitre — pas dans la ligne de l'antibiotique. Sans cette
# correspondance, on compare un Clostridium aux seuils d'un Bacteroides.
SECTIONS = {
    'bfragilis':    'Bacteroides spp.',
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
}


def seuils_phenobac(racine):
    """Extrait la table BP du moteur serveur, sans exécuter de JavaScript."""
    p = os.path.join(racine, 'netlify', 'functions', 'premium-interpret.js')
    s = open(p, encoding='utf-8').read()
    i = s.index('const BP ='); j = s.index('{', i); prof = 0
    for k in range(j, len(s)):
        if s[k] == '{': prof += 1
        elif s[k] == '}':
            prof -= 1
            if prof == 0:
                bloc = s[j:k + 1]; break
    table = {}
    for mg in re.finditer(r'(\w+)\s*:\s*\{((?:[^{}]|\{[^{}]*\})*)\}', bloc):
        groupe, corps = mg.group(1), mg.group(2)
        entrees = {}
        for ma in re.finditer(r'(\w+)\s*:\s*\{\s*S:\s*([\d.]+|null)\s*,\s*R:\s*([\d.]+|null)\s*\}', corps):
            lire = lambda t: None if t == 'null' else float(t)
            entrees[ma.group(1)] = (lire(ma.group(2)), lire(ma.group(3)))
        if entrees:
            table[groupe] = entrees
    return table


def nombre(txt):
    """« 0.001 » dans le classeur EUCAST signifie « pas de catégorie S » ; on le
    laisse tel quel ici, la comparaison le traduit en None côté application."""
    if txt is None: return None
    t = str(txt).strip().strip('()')
    if t in ('-', '', 'IE', 'NA'): return None
    m = re.match(r'^([\d.]+)$', t)
    return float(m.group(1)) if m else None


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    racine = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    c = Classeur(sys.argv[1])
    bp = seuils_phenobac(racine)

    total = {'identique': 0, 'different': 0, 'arbitrer': 0, 'absent': 0}
    non_comparables = []
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
            garde, dedans = [], False
            for cel in lignes:
                nom = cel.get('A', '').replace("\n", " ").strip()
                seul = nom and len([k for k in cel if k != 'A']) == 0
                if seul:
                    dedans = (nom == section); continue
                if dedans: garde.append(cel)
            lignes = garde
        for code in sorted(bp[groupe]):
            sA, rA = bp[groupe][code]
            motif = AGENTS.get(code)
            cands = []
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
                           'campylo':  r'C\. jejuni'}
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
                    # Un retour à la ligne dans le libellé faisait passer
                    # « Cefepime-\nenmetazobactam » pour du céfépime : le motif
                    # voyait une fin de mot là où il y avait un trait d'union.
                    nom = re.sub(r'\s+', ' ', cel.get('A', '')).strip()
                    if re.search(PARTICULIER, nom, re.I) and not re.search(r'other than|all indications|including', nom, re.I):
                        continue
                    if re.search(motif, nom, re.I):
                        bruts = (cel.get('B'), cel.get('C'))
                        sE, rE = nombre(bruts[0]), nombre(bruts[1])
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
                etat, detail = 'absent', "aucune ligne EUCAST correspondante sur cette feuille"
            elif len(cands) == 1:
                nom, sE, rE = cands[0]
                if sE == 0.001: sE = None      # « pas de catégorie S » <-> S: null
                if sE == sA and rE == rA:
                    etat, detail = 'identique', nom
                else:
                    etat, detail = 'different', "%s : EUCAST S<=%s R>%s" % (nom, sE, rE)
            else:
                etat = 'arbitrer'
                detail = "%d lignes possibles :" % len(cands)
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

    print("\n=== bilan ===")
    print("  identiques         : %d" % total['identique'])
    print("  DIFFÉRENTS         : %d   <- à corriger après validation" % total['different'])
    print("  à arbitrer         : %d   <- plusieurs voies/indications possibles" % total['arbitrer'])
    print("  non comparés       : %d" % total['absent'])
    print("\nAucun fichier n'a été modifié. Toute correction doit être validée")
    print("par un biologiste avant d'être portée dans le code.")


if __name__ == '__main__':
    main()
