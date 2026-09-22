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


def bloc_bp(chemin, nom='const BP ='):
    s = open(chemin, encoding='utf-8').read()
    if nom not in s:
        return None
    i = s.index(nom)
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


def valeurs_simples(bloc):
    """{groupe: {code: valeur}} — pour les tables à une seule valeur par
    couple, comme les zones d'incertitude technique."""
    bloc = re.sub(r'/\*.*?\*/', ' ', bloc, flags=re.S)
    bloc = re.sub(r'//[^\n]*', ' ', bloc)
    table = {}
    for mg in re.finditer(r'(\w+)\s*:\s*\{([^{}]*)\}', bloc):
        entrees = {}
        for ma in re.finditer(r'(\w+)\s*:\s*([\d.]+)', mg.group(2)):
            entrees[ma.group(1)] = float(ma.group(2))
        if entrees:
            table[mg.group(1)] = entrees
    return table


def referentiels(chemin):
    """{cle: {nom, version, etat, ...}} pour chaque entrée du registre."""
    s = open(chemin, encoding='utf-8').read()
    m = re.search(r'const REFERENTIELS\s*=\s*\{', s)
    if not m:
        return None
    j = s.index('{', m.start())
    prof = 0
    for k in range(j, len(s)):
        if s[k] == '{':
            prof += 1
        elif s[k] == '}':
            prof -= 1
            if prof == 0:
                bloc = s[j:k + 1]
                break
    else:
        raise SystemExit("registre REFERENTIELS mal formé dans %s" % chemin)
    bloc = re.sub(r'/\*.*?\*/', ' ', bloc, flags=re.S)
    bloc = re.sub(r'//[^\n]*', ' ', bloc)
    out = {}
    for mg in re.finditer(r'(\w+)\s*:\s*\{([^{}]*)\}', bloc):
        d = {}
        for k2, v2 in re.findall(r'(\w+)\s*:\s*"([^"]*)"', mg.group(2)):
            d[k2] = v2
        out[mg.group(1)] = d
    return out


def main():
    racine = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cli = os.path.join(racine, 'phenobac.html')
    srv = os.path.join(racine, 'netlify', 'functions', 'premium-interpret.js')

    ecarts = []
    totaux = {}

    # Quatre tables existent maintenant en double : les seuils courants, ceux
    # du prélèvement méningé, et les deux tables de différences du CA-SFM.
    # Toutes doivent être contrôlées, sinon l'ajout d'une table échappe
    # silencieusement au garde-fou.
    for nom, etiquette in (('const BP =', 'seuils courants'),
                           ('const BP_MENINGE =', 'seuils méningés'),
                           ('const BP_CASFM =', 'différences CA-SFM'),
                           ('const BP_CASFM_URIN =', 'CA-SFM, infection urinaire'),
                           ('const BP_MENINGE_CASFM =', 'CA-SFM, contexte méningé')):
        ba, bb = bloc_bp(cli, nom), bloc_bp(srv, nom)
        if ba is None and bb is None:
            continue
        if ba is None or bb is None:
            ecarts.append("%s : table présente d'un seul côté" % etiquette); continue
        a, b = seuils(ba), seuils(bb)
        totaux[etiquette] = sum(len(v) for v in b.values())
        for g in sorted(set(a) | set(b)):
            if g not in a:
                ecarts.append("%s : groupe %s absent du client" % (etiquette, g)); continue
            if g not in b:
                ecarts.append("%s : groupe %s absent du serveur" % (etiquette, g)); continue
            for code in sorted(set(a[g]) | set(b[g])):
                va, vb = a[g].get(code), b[g].get(code)
                if va != vb:
                    ecarts.append("%s, %s/%s : client %s, serveur %s" % (etiquette, g, code, va, vb))

    # Les zones d'incertitude technique existent elles aussi en double, et
    # elles ne portent qu'une valeur par couple : autre forme, autre lecture.
    for nom, etiquette in (('const ZIT =', 'ZIT communes'),
                           ('const ZIT_CASFM =', 'ZIT propres au CA-SFM')):
        ba, bb = bloc_bp(cli, nom), bloc_bp(srv, nom)
        if ba is None and bb is None:
            continue
        if ba is None or bb is None:
            ecarts.append("%s : table présente d'un seul côté" % etiquette); continue
        a, b = valeurs_simples(ba), valeurs_simples(bb)
        totaux[etiquette] = sum(len(v) for v in b.values())
        for g in sorted(set(a) | set(b)):
            for code in sorted(set(a.get(g, {})) | set(b.get(g, {}))):
                va, vb = a.get(g, {}).get(code), b.get(g, {}).get(code)
                if va != vb:
                    ecarts.append("%s, %s/%s : client %s, serveur %s" % (etiquette, g, code, va, vb))

    ra, rb = referentiels(cli), referentiels(srv)
    if ra and rb:
        for nom_ref in sorted(set(ra) | set(rb)):
            if nom_ref not in ra:
                ecarts.append("référentiel %s absent du client" % nom_ref); continue
            if nom_ref not in rb:
                ecarts.append("référentiel %s absent du serveur" % nom_ref); continue
            for cle in ('nom', 'version', 'etat'):
                if ra[nom_ref].get(cle) != rb[nom_ref].get(cle):
                    ecarts.append("référentiel %s, %s : client %r, serveur %r"
                                  % (nom_ref, cle, ra[nom_ref].get(cle), rb[nom_ref].get(cle)))
    elif ra or rb:
        ecarts.append("registre REFERENTIELS absent d'un des deux fichiers")

    if ecarts:
        print("Les deux tables DIVERGENT :")
        for e in ecarts:
            print("  -", e)
        print("\nLe moteur serveur fait foi. Alignez phenobac.html sur lui.")
        return 1

    print("Tables concordantes : " + ", ".join("%s %d" % (k, v) for k, v in totaux.items()) + ".")
    for cle in ('eucast', 'casfm'):
        d = (rb or {}).get(cle)
        if not d:
            continue
        print("Référentiel déclaré : %s %s (%s)." % (d.get('nom'), d.get('version'), d.get('etat')))
        if d.get('etat') == 'aligne':
            print("  Tous les seuils qu'EUCAST définit sont conformes ; ceux qu'il ne")
            print("  définit pas sont marqués « hors EUCAST » dans l'éditeur.")
        elif d.get('etat') == 'delta':
            print("  Différences françaises seulement : tout couple absent des tables")
            print("  CA-SFM garde sa valeur EUCAST. Voir REFERENTIEL-CASFM.md.")
        elif d.get('etat') == 'partiel':
            print("  Note : alignement partiel — les seuils à ligne officielle unique sont")
            print("         conformes ; ceux à lignes multiples attendent un arbitrage.")
        elif d.get('etat') != 'valide':
            print("  Note : les seuils n'ont pas encore été confrontés au tableau officiel")
            print("         (outils/comparer-eucast.py). Ce n'est pas une erreur, c'est un état.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
