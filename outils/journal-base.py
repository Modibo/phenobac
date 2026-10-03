# -*- coding: utf-8 -*-
"""
journal-base.py — qu'est-ce qui a changé dans les règles ?

    python3 outils/journal-base.py                  # depuis le dernier commit
    python3 outils/journal-base.py --publie v1.2.0  # depuis une étiquette
    python3 outils/journal-base.py HEAD~5           # depuis une révision
    python3 outils/journal-base.py ancienne.js nouvelle.js

§ 18 du cahier des charges : « Lors d'un changement de référentiel, produire
automatiquement un journal : AJOUTÉ, MODIFIÉ, SUPPRIMÉ, INCHANGÉ, avec
ancienne et nouvelle valeur. »

POURQUOI CE N'EST PAS UN LUXE

Un laboratoire qui a rendu « sensible » en mars et « résistant » en octobre
doit pouvoir dire si la souche a changé ou si le seuil a bougé. Sans journal,
la question n'a pas de réponse, et c'est le laboratoire qu'on soupçonne.

C'est aussi le contrôle que l'on passe AVANT de livrer une mise à jour de
référentiel : voir les quarante seuils qu'on déplace, un par un, vaut mieux
que de les découvrir sur un antibiogramme.

REPRODUIRE UN RENDU ANCIEN

Le fichier des règles est autonome et versionné dans git. Pour rejouer une
interprétation telle qu'elle a été produite :

    git show <révision>:base-connaissances.js > base-connaissances.js

Le compte rendu porte les trois versions nécessaires — application,
référentiel, base — précisément pour qu'on sache laquelle reprendre.
"""
import os
import re
import subprocess
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FICHIER = "base-connaissances.js"
CLE = ("ref", "groupe", "abx", "meth", "site")
VALEURS = ("S", "R", "charge", "zit", "temoin", "dep", "conv", "couv", "espece")


def lire(source):
    """{coordonnées: règle} à partir du texte du fichier."""
    cols = re.findall(r'"(\w+)"', re.search(r'const COLONNES = \[(.*?)\];', source, re.S).group(1))
    corps = source[source.index("const REGLES = ["):source.index("\n];")]
    out = {}
    for ligne in re.findall(r'^\[(.*)\],$', corps, re.M):
        vals, prof, cour = [], 0, ""
        for ch in ligne:
            if ch == '[':
                prof += 1
            elif ch == ']':
                prof -= 1
            if ch == ',' and prof == 0:
                vals.append(cour); cour = ""
            else:
                cour += ch
        vals.append(cour)
        d = {}
        for nom, v in zip(cols, vals):
            v = v.strip()
            if v == "undefined":
                continue
            d[nom] = v
        out[tuple(d.get(k, "") for k in CLE)] = d
    return out


def version(source):
    m = re.search(r'const BASE_VERSION = "([^"]*)"', source)
    return m.group(1) if m else "?"


def au_git(revision, chemin=FICHIER):
    r = subprocess.run(["git", "show", "%s:%s" % (revision, chemin)],
                       capture_output=True, text=True, cwd=RACINE)
    if r.returncode:
        raise SystemExit("révision introuvable : %s\n%s" % (revision, r.stderr.strip()[:300]))
    return r.stdout


def nommer(cle):
    ref, groupe, abx, meth, site = [x.strip('"') for x in cle]
    s = "%s · %s / %s · %s" % (ref, groupe, abx, meth)
    return s if site == "standard" else s + " · " + site


def valeur(d):
    return ", ".join("%s=%s" % (k, d[k].strip('"')) for k in VALEURS if k in d) or "(aucune valeur)"


def main():
    args = sys.argv[1:]
    if len(args) == 2 and all(os.path.exists(a) for a in args):
        avant = open(args[0], encoding="utf-8").read()
        apres = open(args[1], encoding="utf-8").read()
        d_avant, d_apres = args[0], args[1]
    else:
        rev = args[0] if args else "HEAD"
        avant = au_git(rev)
        apres = open(os.path.join(RACINE, FICHIER), encoding="utf-8").read()
        d_avant, d_apres = rev, "fichier de travail"

    A, B = lire(avant), lire(apres)
    ajoutes = sorted(set(B) - set(A))
    supprimes = sorted(set(A) - set(B))
    modifies, inchanges = [], 0
    for cle in sorted(set(A) & set(B)):
        a, b = A[cle], B[cle]
        ecarts = [(k, a.get(k), b.get(k)) for k in VALEURS if a.get(k) != b.get(k)]
        if ecarts:
            modifies.append((cle, ecarts))
        else:
            inchanges += 1

    print("JOURNAL DES RÈGLES")
    print("  de   %s   (base %s, %d règles)" % (d_avant, version(avant), len(A)))
    print("  à    %s   (base %s, %d règles)" % (d_apres, version(apres), len(B)))
    print()

    if not (ajoutes or supprimes or modifies):
        print("Aucun changement. %d règles inchangées." % inchanges)
        return 0

    # Oublier d'incrémenter la version est l'erreur qui rend un journal
    # inutile : deux bases différentes porteraient le même numéro, et un
    # compte rendu ancien ne serait plus rattachable à ses règles. C'est donc
    # un ÉCHEC, pas un avertissement — la CI le voit avant la livraison.
    oubli = version(avant) == version(apres)
    if oubli:
        print("⊘  BASE_VERSION n'a pas changé alors que les règles, si.")
        print("   Un rendu ancien et un rendu neuf porteraient le même numéro et")
        print("   ne seraient plus rattachables à leurs règles. Incrémentez-la.")
        print()

    for titre, liste in (("MODIFIÉ", modifies),):
        if not liste:
            continue
        print("%s — %d" % (titre, len(liste)))
        for cle, ecarts in liste:
            print("  %s" % nommer(cle))
            for k, av, ap in ecarts:
                print("      %-7s %s  →  %s" % (k, av if av is not None else "(absent)",
                                                ap if ap is not None else "(absent)"))
        print()

    for titre, liste, src in (("AJOUTÉ", ajoutes, B), ("SUPPRIMÉ", supprimes, A)):
        if not liste:
            continue
        print("%s — %d" % (titre, len(liste)))
        for cle in liste:
            print("  %-48s %s" % (nommer(cle), valeur(src[cle])))
        print()

    print("INCHANGÉ — %d" % inchanges)
    return 1 if oubli else 0


if __name__ == '__main__':
    sys.exit(main())
