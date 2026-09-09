# -*- coding: utf-8 -*-
"""
proposer-scission.py — propose le découpage d'un groupe de seuils qui couvre
plusieurs feuilles EUCAST, en dérivant les valeurs de la BONNE feuille.

    python3 outils/proposer-scission.py v_16.1_Breakpoint_Tables.xlsx [groupe…]

Ne modifie rien : imprime, pour chaque nouveau groupe, la valeur actuelle et
celle du tableau officiel, avec le motif. À relire avant application.

Règles, identiques à celles du comparateur :
  - « IE », « Note », « NA » ne sont pas des seuils : la valeur en place est
    conservée et signalée comme convention de laboratoire ;
  - « 0.001 » signifie « pas de catégorie S » et devient une borne nulle ;
  - les lignes « meningitis » sont écartées d'ici (surcouche BP_MENINGE) ;
  - à voie ou indication multiples : systémique et intraveineux d'abord ;
  - plusieurs lignes de même valeur ne constituent pas une ambiguïté.
"""
import os, re, sys

ICI = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(ICI, "comparer-eucast.py"), encoding="utf-8").read()
src = src.replace("if __name__ == '__main__':\n    main()", "")
NS = {}
exec(compile(src, "comparer-eucast.py", "exec"), NS)
Classeur, AGENTS, nombre = NS["Classeur"], NS["AGENTS"], NS["nombre"]

# groupe d'origine -> nouveaux groupes : (nom, feuille EUCAST, germes)
SCISSIONS = {
    'grampos': [('listeria', 'L.monocytogenes',   ["L. monocytogenes"]),
                ('coryne',   'Corynebacterium',   ["Corynebacterium spp."])],
    'strep':   [('strep',    'Streptococcus A,B,C,G',      ["S. pyogenes", "S. agalactiae"]),
                ('viridans', 'Viridans group streptococci', ["Streptocoque groupe viridans"])],
    'curved':  [('campylo',  'C.jejuni_C.coli',   ["C. jejuni"]),
                ('vibrio',   'Vibrio',            ["V. cholerae"])],
    'nonferm': [('steno',    'S.maltophilia',     ["S. maltophilia"]),
                ('burk',     'B.cepacia',         ["B. cepacia"])],
    'fastid':  [('haemo',    'H.influenzae',      ["H. influenzae"]),
                ('nmening',  'N.meningitidis',    ["N. meningitidis"]),
                ('ngono',    'N.gonorrhoeae',     ["N. gonorrhoeae"]),
                ('moraxella','M.catarrhalis',     ["M. catarrhalis"])],
    'anaerobe':[('anaerobeN','Anaerobic bacteria_G-negative', ["B. fragilis"]),
                ('anaerobeP','Anaerobic bacteria_G-positive', ["C. perfringens", "C. difficile"])],
}

def meninge(n):
    """Ligne SPÉCIFIQUE au prélèvement méningé.
    « meningitis » apparaît aussi dans « indications other than meningitis » et
    dans « all indications, including meningitis » : ni l'une ni l'autre n'est
    une ligne méningée. Les confondre écarte des seuils valables."""
    return (bool(re.search(r'meningitis', n, re.I))
            and not re.search(r'other than|all indications|including', n, re.I))
def orale(n):   return bool(re.search(r'\boral\b', n, re.I))
def urinaire(n):return bool(re.search(r'urinary|uncomplicated UTI', n, re.I))
def espece(n):  return bool(re.search(r',\s*[A-Z]\.\s*\w', n))

def propose(c, feuille, codes, actuels):
    rows = c.lignes(feuille)
    out, journal = {}, []
    for code in sorted(codes):
        act = actuels[code]
        motif = AGENTS.get(code)
        cands, sans_seuil = [], []
        if motif:
            for cel in rows:
                nom = cel.get('A', '').replace("\n", " ")
                if not re.search(motif, nom, re.I): continue
                b, r = cel.get('B'), cel.get('C')
                sE, rE = nombre(b), nombre(r)
                if rE is None:
                    if b: sans_seuil.append((nom, b))
                    continue
                cands.append((nom, None if sE == 0.001 else sE, rE))
        courants = [x for x in cands if not meninge(x[0])]
        for filtre in (urinaire, orale, espece):
            reste = [x for x in courants if not filtre(x[0])]
            if reste: courants = reste
        distinctes = {(s, r) for _, s, r in courants}
        if not courants:
            motifTxt = ("aucun seuil chiffré (%s)" % sans_seuil[0][1]) if sans_seuil else "absent de la feuille"
            out[code] = act; journal.append((code, act, act, "CONSERVÉ — " + motifTxt))
        elif len(distinctes) > 1:
            out[code] = act; journal.append((code, act, act, "À ARBITRER — %d lignes différentes" % len(distinctes)))
        else:
            nom, sN, rN = courants[0]
            out[code] = (sN, rN)
            etat = "inchangé" if (sN, rN) == tuple(act) else "MODIFIÉ"
            journal.append((code, act, (sN, rN), "%s — %s" % (etat, nom[:40])))
    return out, journal

def main():
    if len(sys.argv) < 2: sys.exit(__doc__)
    c = Classeur(sys.argv[1])
    bp = NS["seuils_phenobac"](os.path.dirname(ICI))
    vises = sys.argv[2:] or sorted(SCISSIONS)
    f = lambda v: "null" if v is None else ("%g" % v)
    for ancien in vises:
        if ancien not in SCISSIONS: 
            print("groupe inconnu : %s" % ancien); continue
        actuels = bp[ancien]
        print("\n" + "=" * 78)
        print("SCISSION DE « %s »  (%d seuils)" % (ancien, len(actuels)))
        for nouveau, feuille, germes in SCISSIONS[ancien]:
            print("\n  --- %s  <- feuille %s  (%s) ---" % (nouveau, feuille, ", ".join(germes)))
            if feuille not in c.feuilles:
                print("      feuille introuvable dans le classeur"); continue
            _, journal = propose(c, feuille, actuels.keys(), actuels)
            for code, av, ap, motif in journal:
                marque = "  " if "inchangé" in motif or "CONSERVÉ" in motif or "ARBITRER" in motif else "->"
                print("      %s %-4s %-14s %-14s %s"
                      % (marque, code, "%s/%s" % (f(av[0]), f(av[1])), "%s/%s" % (f(ap[0]), f(ap[1])), motif))

if __name__ == '__main__':
    main()
