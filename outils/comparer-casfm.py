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
    out, chapitre = [], '?'
    for num, p in enumerate(pages, 1):
        lg = pdfpos.lignes(pdfpos.extraire(pdfpos.contenu(objs, p),
                                           pdfpos.polices(objs, p), 'latin-1'))
        for _y, fr in lg:
            ligne = re.sub(r'\s+', ' ', ' '.join(s for _, s in fr)).strip()
            if len(ligne) > 60:
                continue
            m = re.match(r'^\d+\s*\.\s*\d+\s*\.\s+(\S.*)$', ligne)
            if not m:
                continue
            titre = m.group(1).strip()
            connu = [n for n in CZ.CHAPITRE_GROUPES if n.lower() in titre.lower()]
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
        # LES NOMS SONT COUPÉS EN FIN DE LIGNE, et leur fin est sur la ligne
        # SUIVANTE, sans valeurs. « Pénicilline G (méningites et » +
        # « endocardites) ». Sans recollation, l'indication disparaît et le
        # seuil méningé se compare au seuil ordinaire ; pire,
        # « Triméthoprime- » se lit « triméthoprime » au lieu de
        # « triméthoprime-sulfaméthoxazole ».
        def nom_colonne(fr, xs):
            return ' '.join(s.strip() for x, s in fr
                            if 0 <= x < xs - 14 and s.strip()).strip()

        for i, (y, fr) in enumerate(lg):
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
            k = i + 1
            while (AF.tronque(agent) or not AF.code(agent)[1]) and k < len(lg) and k <= i + 3:
                suite_fr = lg[k][1]
                a_des_valeurs = [v for v in fenetre(xs - 9, xz + 30, suite_fr)
                                 if NOMBRE.match(v)]
                suite = nom_colonne(suite_fr, xs)
                if a_des_valeurs or not suite:
                    break
                agent = (agent + " " + suite).strip()
                k += 1
            out.append((chapitre, agent, nb(s_[0]) if s_ else None,
                        nb(r_[0]) if r_ else None, num, hors_echelle))
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
    T = MP.tables(["BP", "BP_CASFM"])
    EUCAST, CASFM = T["BP"] or {}, T.get("BP_CASFM") or {}

    lues = lignes_casfm(sys.argv[1])
    print("Communiqué lu : %s" % sys.argv[1])
    print("%d lignes de concentrations critiques relevées.\n" % len(lues))

    perdus, perimes, divergents, muets, identiques = [], [], [], [], 0
    autres_sites = 0
    vus = set()

    for chapitre, agent, sC, rC, page, hors in lues:
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
        # Une ligne sans colonne S du tout n'apprend rien ; une ligne qui
        # porte « 0,001 » en apprend beaucoup, et sC y vaut None à dessein.
        if code is None or (sC is None and not hors and rC is None):
            continue
        # Un seuil de cystite, de méningite ou de dépistage ne se compare pas
        # au seuil ordinaire : PhénoBac les range par SITE, et les confondre
        # fabriquerait des écarts qui n'existent pas. Cette passe ne traite
        # que le site ordinaire ; les autres attendent leur propre passe, et
        # le bilan le dit.
        if AF.site(agent) != "standard":
            autres_sites += 1
            continue
        for g in CZ.groupes_vises(chapitre, agent, groupes):
            vus.add((g, code))
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

    print("\n=== bilan ===")
    print("  couples confrontés          : %d" % len(vus))
    print("  CA-SFM et EUCAST d'accord   : %d" % identiques)
    print("  ÉCART PERDU                 : %d" % len(perdus))
    print("  écart à une autre valeur    : %d" % len(divergents))
    print("  écart périmé                : %d" % len(perimes))
    print("  non lus par l'outil         : %d" % len(set(muets)))
    print("  autres sites (cystite, LCR, dépistage), non traités ici : %d" % autres_sites)
    print("\nAucun fichier n'a été modifié. Toute correction doit être validée")
    print("par un biologiste avant d'être portée dans le code.")
    return 1 if (perdus or divergents or perimes or muets) else 0


if __name__ == '__main__':
    sys.exit(main())
