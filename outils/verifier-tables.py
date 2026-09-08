# -*- coding: utf-8 -*-
"""
verifier-tables.py — les deux tables de concentrations critiques concordent-elles ?

Les seuils existent en double : dans phenobac.html (affichage, saisie CMI) et
dans netlify/functions/premium-interpret.js (moteur, qui fait foi). Rien
n'empêche de corriger l'un en oubliant l'autre — l'application afficherait
alors une catégorie et le compte-rendu en porterait une autre.

Ce contrôle échoue si les deux tables divergent. Lancé par la CI à chaque push.

    python3 outils/verifier-tables.py
"""
import os, re, sys


def bloc_bp(chemin):
    s = open(chemin, encoding='utf-8').read()
    i = s.index('const BP =')
    j = s.index('{', i)
    prof = 0
    for k in range(j, len(s)):
        if s[k] == '{':
            prof += 1
        elif s[k] == '}':
            prof -= 1
            if prof == 0:
                return s[j:k + 1]
    raise SystemExit("table BP mal formée dans %s" % chemin)


def _val(t):
    return None if t == 'null' else float(t)


def seuils(bloc):
    """{groupe: {code: (S, R)}} — insensible aux commentaires et à la mise en forme."""
    bloc = re.sub(r'/\*.*?\*/', ' ', bloc, flags=re.S)
    bloc = re.sub(r'//[^\n]*', ' ', bloc)
    table = {}
    for mg in re.finditer(r'(\w+)\s*:\s*\{((?:[^{}]|\{[^{}]*\})*)\}', bloc):
        entrees = {}
        # « null » signifie « pas de catégorie S » : à lire comme une valeur à
        # part entière, sinon ces seuils sortent silencieusement du contrôle.
        for ma in re.finditer(r'(\w+)\s*:\s*\{\s*S:\s*([\d.]+|null)\s*,\s*R:\s*([\d.]+|null)\s*\}', mg.group(2)):
            entrees[ma.group(1)] = (_val(ma.group(2)), _val(ma.group(3)))
        if entrees:
            table[mg.group(1)] = entrees
    return table


def referentiel(chemin):
    s = open(chemin, encoding='utf-8').read()
    m = re.search(r'REFERENTIEL\s*=\s*\{([^}]*)\}', s)
    if not m:
        return None
    d = {}
    for k, v in re.findall(r'(\w+)\s*:\s*"([^"]*)"', m.group(1)):
        d[k] = v
    return d


def main():
    racine = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cli = os.path.join(racine, 'phenobac.html')
    srv = os.path.join(racine, 'netlify', 'functions', 'premium-interpret.js')

    a, b = seuils(bloc_bp(cli)), seuils(bloc_bp(srv))
    ecarts = []

    for g in sorted(set(a) | set(b)):
        if g not in a:
            ecarts.append("groupe %s absent du client" % g); continue
        if g not in b:
            ecarts.append("groupe %s absent du serveur" % g); continue
        for code in sorted(set(a[g]) | set(b[g])):
            va, vb = a[g].get(code), b[g].get(code)
            if va != vb:
                ecarts.append("%s/%s : client %s, serveur %s" % (g, code, va, vb))

    ra, rb = referentiel(cli), referentiel(srv)
    if ra and rb:
        for cle in ('nom', 'version', 'etat'):
            if ra.get(cle) != rb.get(cle):
                ecarts.append("référentiel %s : client %r, serveur %r" % (cle, ra.get(cle), rb.get(cle)))
    elif ra or rb:
        ecarts.append("constante REFERENTIEL absente d'un des deux fichiers")

    nb = sum(len(v) for v in b.values())
    if ecarts:
        print("Les deux tables DIVERGENT :")
        for e in ecarts:
            print("  -", e)
        print("\nLe moteur serveur fait foi. Alignez phenobac.html sur lui.")
        return 1

    print("Tables concordantes : %d groupes, %d seuils." % (len(b), nb))
    if rb:
        print("Référentiel déclaré : %s v%s (%s)." % (rb.get('nom'), rb.get('version'), rb.get('etat')))
        if rb.get('etat') == 'partiel':
            print("Note : alignement partiel — les seuils à ligne officielle unique sont")
            print("       conformes ; ceux à lignes multiples attendent un arbitrage.")
        elif rb.get('etat') != 'valide':
            print("Note : les seuils n'ont pas encore été confrontés au tableau officiel")
            print("       (outils/comparer-eucast.py). Ce n'est pas une erreur, c'est un état.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
