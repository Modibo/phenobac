# -*- coding: utf-8 -*-
"""
verifier-tables.py — les deux tables de concentrations critiques concordent-elles ?

Les seuils existent en double : dans phenobac.html (affichage, saisie CMI) et
dans moteur.js (le raisonnement, qui fait foi, chargé par le navigateur ET
par la fonction serveur). Rien
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


def valeurs_texte(bloc):
    """{groupe: {code: "texte"}} — pour les tables dont la valeur est une
    chaîne : la charge du disque (« 30 », « 1 unit », « 1.25-23.75 ») et le
    témoin de l'amoxicilline. Le lecteur numérique les rendait vides, donc
    toujours concordantes — un garde-fou qui ne garde rien."""
    bloc = re.sub(r'/\*.*?\*/', ' ', bloc, flags=re.S)
    bloc = re.sub(r'//[^\n]*', ' ', bloc)
    table = {}
    for mg in re.finditer(r'(\w+)\s*:\s*\{([^{}]*)\}', bloc):
        entrees = {}
        for ma in re.finditer(r'(\w+)\s*:\s*"([^"]*)"', mg.group(2)):
            entrees[ma.group(1)] = ma.group(2)
        if entrees:
            table[mg.group(1)] = entrees
    return table


def intervalles(bloc):
    """{groupe: {code: (lo, hi)}} — pour les zones d'incertitude au disque,
    qui sont des intervalles de millimètres et non une valeur unique."""
    bloc = re.sub(r'/\*.*?\*/', ' ', bloc, flags=re.S)
    bloc = re.sub(r'//[^\n]*', ' ', bloc)
    table = {}
    for mg in re.finditer(r'(\w+)\s*:\s*\{((?:[^{}\[\]]|\[[^\[\]]*\])*)\}', bloc):
        entrees = {}
        for ma in re.finditer(r'(\w+)\s*:\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]', mg.group(2)):
            entrees[ma.group(1)] = (int(ma.group(2)), int(ma.group(3)))
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


def noms_declares(code):
    """Noms déclarés au premier niveau d'un bout de JavaScript."""
    code = re.sub(r'/\*.*?\*/', ' ', code, flags=re.S)
    code = re.sub(r'//[^\n]*', ' ', code)
    return set(re.findall(r'^(?:const|let|var|function)\s+(\w+)', code, re.M))


def cloisonnement(racine):
    """moteur.js ne doit exposer QUE « PhenoBacMoteur ».

    La page et le moteur déclarent des noms identiques — « has », « isR »,
    « finalize »… Tant que le moteur est enfermé dans sa propre fonction,
    cela ne porte pas à conséquence. S'il en sortait, deux « const has » au
    même niveau feraient échouer le script ENTIER de la page, pas seulement
    la ligne fautive : l'application s'ouvrirait sans rien faire. C'est
    arrivé ; d'où ce contrôle."""
    src = open(os.path.join(racine, 'moteur.js'), encoding='utf-8').read()
    ecarts = []

    if '(function (racine) {' not in src or '})(typeof self !== "undefined" ? self : this);' not in src:
        ecarts.append("moteur.js n'est plus enfermé dans sa propre portée — "
                      "ses déclarations atterriraient dans celle de la page")

    page = open(os.path.join(racine, 'phenobac.html'), encoding='utf-8').read()
    inline = "\n".join(re.findall(r'<script>(.*?)</script>', page, re.S))
    communs = noms_declares(src) & noms_declares(inline)
    return ecarts, sorted(communs)


def main():
    racine = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cli = os.path.join(racine, 'phenobac.html')
    srv = os.path.join(racine, 'moteur.js')

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
                           ('const BP_MENINGE_CASFM =', 'CA-SFM, contexte méningé'),
                           # Les diamètres ont la même forme {S, R} que les CMI,
                           # mais le sens inverse. La forme suffit au contrôle de
                           # concordance ; le sens est éprouvé par
                           # outils/essai-diametres.js.
                           ('const DZ =', 'diamètres critiques'),
                           ('const DZ_MENINGE =', 'diamètres, contexte méningé'),
                           ('const DZ_CASFM =', 'diamètres CA-SFM'),
                           ('const DZ_CASFM_URIN =', 'diamètres CA-SFM, urine')):
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

    for nom, etiquette in (('const DZ_TEMOIN =', 'témoins de diamètre'),
                           ('const DISQUE =', 'charges de disque'),
                           ('const DISQUE_CASFM =', 'charges de disque CA-SFM')):
        ba, bb = bloc_bp(cli, nom), bloc_bp(srv, nom)
        if (ba is None) != (bb is None):
            ecarts.append("%s : table présente d'un seul côté" % etiquette); continue
        if ba is None:
            continue
        a, b = valeurs_texte(ba), valeurs_texte(bb)
        totaux[etiquette] = sum(len(v) for v in b.values())
        if not totaux[etiquette]:
            ecarts.append("%s : table lue vide — le contrôle ne garantit plus rien" % etiquette)
        for g in sorted(set(a) | set(b)):
            for code in sorted(set(a.get(g, {})) | set(b.get(g, {}))):
                va, vb = a.get(g, {}).get(code), b.get(g, {}).get(code)
                if va != vb:
                    ecarts.append("%s, %s/%s : client %r, serveur %r" % (etiquette, g, code, va, vb))

    # Les zones d'incertitude au disque sont des INTERVALLES : [19, 20]. Ni la
    # forme {S, R} ni la valeur unique ne les lisent.
    for nom, etiquette in (('const ZIT_ZONE =', 'ZIT au disque'),
                           ('const ZIT_ZONE_CASFM =', 'ZIT au disque, CA-SFM')):
        ba, bb = bloc_bp(cli, nom), bloc_bp(srv, nom)
        if (ba is None) != (bb is None):
            ecarts.append("%s : table présente d'un seul côté" % etiquette); continue
        if ba is None:
            continue
        a, b = intervalles(ba), intervalles(bb)
        totaux[etiquette] = sum(len(v) for v in b.values())
        for g in sorted(set(a) | set(b)):
            for code in sorted(set(a.get(g, {})) | set(b.get(g, {}))):
                va, vb = a.get(g, {}).get(code), b.get(g, {}).get(code)
                if va != vb:
                    ecarts.append("%s, %s/%s : client %s, serveur %s" % (etiquette, g, code, va, vb))

    # Les deux tables qui restreignent : l'espèce pour la céfoxitine, le seuil
    # de dépistage pour la pénicilline. Une divergence y serait invisible à
    # l'usage courant et décisive quand elle joue.
    for nom, etiquette in (('const DZ_CASFM_ESPECE =', 'restriction d\'espèce'),
                           ('const DEPISTAGE_CASFM =', 'dépistages CA-SFM')):
        ba, bb = bloc_bp(cli, nom), bloc_bp(srv, nom)
        if (ba is None) != (bb is None):
            ecarts.append("%s : table présente d'un seul côté" % etiquette); continue
        if ba is None:
            continue
        na = re.sub(r'\s+', '', re.sub(r'//[^\n]*', '', ba))
        nb = re.sub(r'\s+', '', re.sub(r'//[^\n]*', '', bb))
        totaux[etiquette] = na.count(':') - na.count('::')
        if na != nb:
            ecarts.append("%s : client %s, serveur %s" % (etiquette, na[:80], nb[:80]))

    ec, communs = cloisonnement(racine)
    ecarts.extend(ec)

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

    print("moteur.js reste cloisonné : il n'expose que « PhenoBacMoteur »%s."
          % (" (%d noms seraient en collision sans cela)" % len(communs) if communs else ""))
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
