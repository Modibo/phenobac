# -*- coding: utf-8 -*-
"""
verifier-tables.py — la base, le moteur et la page disent-ils la même chose ?

CE QUE CE CONTRÔLE VÉRIFIAIT AVANT, ET POURQUOI CE N'EST PLUS CELA

Les seuils existaient en double, dans phenobac.html et dans le moteur, et rien
n'empêchait de corriger l'un en oubliant l'autre : l'application affichait
alors une catégorie et le compte rendu en portait une autre. Ce contrôle
comparait les deux copies.

Le double n'existe plus. base-connaissances.js fait foi, le moteur en
reconstruit ses tables au chargement, et la page les lui emprunte. Il n'y a
donc plus de concordance à surveiller — mais trois propriétés à défendre, dont
la perte ramènerait le problème :

  1. la page ne REDÉCLARE aucune des tables qu'elle emprunte ;
  2. les tables que le moteur bâtit correspondent exactement à la base, règle
     par règle, dans les deux sens ;
  3. le moteur reste cloisonné et n'expose que « PhenoBacMoteur ».

    python3 outils/verifier-tables.py
"""
import importlib.util
import json
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)


def _mod(nom, fichier):
    s = importlib.util.spec_from_file_location(nom, os.path.join(ICI, fichier))
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


MP = _mod("moteur_py", "moteur_py.py")

# Tables que la page emprunte au moteur et ne doit donc plus déclarer.
EMPRUNTEES = ["BP", "BP_MENINGE", "BP_CASFM", "BP_CASFM_URIN", "BP_MENINGE_CASFM",
              "DZ", "DZ_MENINGE", "DZ_CASFM", "DZ_CASFM_URIN", "DZ_TEMOIN", "DZ_CASFM_ESPECE",
              "DISQUE", "DISQUE_CASFM", "ZIT", "ZIT_CASFM", "ZIT_ZONE", "ZIT_ZONE_CASFM",
              "HORS_EUCAST", "CASFM_COUVRE", "CASFM_COUVRE_ESPECE", "DEPISTAGE_CASFM",
              "REFERENTIELS", "OXA_PNEUMO"]

# ORG fait exception : la page le DÉCLARE, mais pour fusionner ce que le
# moteur sait d'une espèce — famille de raisonnement, groupe de seuils,
# résistances naturelles — avec ce qu'elle-même en affiche. Ce qu'il faut
# interdire, ce n'est donc pas la déclaration, c'est que la page reprenne à
# son compte les champs du raisonnement.
CHAMPS_DU_MOTEUR = ["bpGroup", "engine", "intrinsic"]

# Où va chaque seuil, selon ses coordonnées — la même correspondance que celle
# du moteur, réécrite ici pour qu'une erreur de l'un ne soit pas couverte par
# la même erreur dans l'autre.
SEUILS = {
    ("eucast", "cmi", "standard"): "BP",        ("eucast", "cmi", "meninge"): "BP_MENINGE",
    ("casfm", "cmi", "standard"): "BP_CASFM",   ("casfm", "cmi", "urinaire"): "BP_CASFM_URIN",
    ("casfm", "cmi", "meninge"): "BP_MENINGE_CASFM",
    ("eucast", "disque", "standard"): "DZ",     ("eucast", "disque", "meninge"): "DZ_MENINGE",
    ("casfm", "disque", "standard"): "DZ_CASFM", ("casfm", "disque", "urinaire"): "DZ_CASFM_URIN",
}


def noms_declares(code):
    code = re.sub(r'/\*.*?\*/', ' ', code, flags=re.S)
    code = re.sub(r'//[^\n]*', ' ', code)
    return set(re.findall(r'^(?:const|let|var|function)\s+(\w+)', code, re.M))


def base_lue():
    """Les règles, relues du FICHIER — pas via le moteur, sinon on
    comparerait le moteur à lui-même."""
    src = open(os.path.join(RACINE, 'base-connaissances.js'), encoding='utf-8').read()
    cols = re.search(r'const COLONNES = \[(.*?)\];', src, re.S).group(1)
    cols = re.findall(r'"(\w+)"', cols)
    corps = src[src.index("const REGLES = ["):src.index("\n];")]
    regles = []
    # UN COMMENTAIRE EN BOUT DE LIGNE FAISAIT DISPARAÎTRE LA RÈGLE. Le motif
    # exigeait que la ligne FINISSE par « ], » ; une règle suivie de
    # « // se lit sur le disque d'ampicilline » n'était donc pas lue du tout,
    # et la table de référence se construisait sans elle. Le contrôle criait
    # alors que le moteur portait une entrée « que la base n'a pas » — alors
    # que la base l'avait, et que c'est le lecteur qui ne voyait pas. Une
    # ligne de règle peut porter un commentaire ; c'est même souhaitable.
    for ligne in re.findall(r'^\[(.*?)\],\s*(?://.*)?$', corps, re.M):
        # Découpe au premier niveau : une valeur peut être un tableau.
        vals, prof, cour = [], 0, ""
        for ch in ligne:
            if ch == '[': prof += 1
            elif ch == ']': prof -= 1
            if ch == ',' and prof == 0:
                vals.append(cour); cour = ""
            else:
                cour += ch
        vals.append(cour)
        d = {}
        for nom, v in zip(cols, vals):
            v = v.strip()
            if v == "undefined": continue           # absent : la clé n'existe pas
            if v == "null": d[nom] = None
            elif v == "true": d[nom] = True
            elif v.startswith('"'): d[nom] = v.strip('"')
            elif v.startswith('['):
                # Un tableau porte soit des codes d'espèce (chaînes), soit les
                # deux bornes d'une zone d'incertitude (nombres).
                inter = v.strip('[]')
                d[nom] = (re.findall(r'"([^"]*)"', v) if '"' in v
                          else [int(x) if '.' not in x else float(x)
                                for x in inter.split(',') if x.strip()])
            else: d[nom] = float(v) if '.' in v else int(v)
        regles.append(d)
    return regles


def main():
    ecarts = []
    page = open(os.path.join(RACINE, 'phenobac.html'), encoding='utf-8').read()
    moteur = open(os.path.join(RACINE, 'moteur.js'), encoding='utf-8').read()

    # ---- 1. la page ne redéclare rien ----
    inline = "\n".join(re.findall(r'<script>(.*?)</script>', page, re.S))
    for n in EMPRUNTEES:
        if re.search(r'^const %s = [\{\[\d]' % n, inline, re.M):
            ecarts.append("phenobac.html redéclare %s : les deux copies pourraient diverger" % n)
    for champ in CHAMPS_DU_MOTEUR:
        if re.search(r'\b%s\s*:' % champ, inline):
            ecarts.append("phenobac.html porte « %s » : ce champ relève du moteur, et "
                          "les deux copies pourraient diverger" % champ)
    if "Object.assign({}, _M.ORG[id]" not in inline:
        ecarts.append("phenobac.html ne construit plus ORG à partir de celui du moteur")

    # ---- 2. le moteur bâtit exactement ce que la base contient ----
    regles = base_lue()
    bati = MP.tables(sorted(set(SEUILS.values())) + ["DISQUE", "DISQUE_CASFM", "ZIT",
                                                    "ZIT_CASFM", "ZIT_ZONE", "ZIT_ZONE_CASFM",
                                                    "DZ_TEMOIN", "DEPISTAGE",
                                                    "DEPISTAGE_CASFM"])
    attendu = {n: {} for n in bati}

    def met(n, g, a, v):
        attendu[n].setdefault(g, {})[a] = v

    for r in regles:
        cle = (r["ref"], r["meth"], r["site"])
        if "S" in r or "R" in r:
            if cle in SEUILS:
                met(SEUILS[cle], r["groupe"], r["abx"], {"S": r.get("S"), "R": r.get("R")})
        if "charge" in r:
            met("DISQUE_CASFM" if r["ref"] == "casfm" else "DISQUE", r["groupe"], r["abx"], r["charge"])
        if "zit" in r:
            n = ("ZIT_CASFM" if r["ref"] == "casfm" else "ZIT") if r["meth"] == "cmi" \
                else ("ZIT_ZONE_CASFM" if r["ref"] == "casfm" else "ZIT_ZONE")
            met(n, r["groupe"], r["abx"], r["zit"])
        if "temoin" in r: met("DZ_TEMOIN", r["groupe"], r["abx"], r["temoin"])
        # Le dépistage va dans la table de SON référentiel. Tout mettre dans
        # celle du CA-SFM rendait les dépistages EUCAST inopérants, en
        # silence : la mesure était rendue « non catégorisée ».
        if "dep" in r:    met("DEPISTAGE_CASFM" if r["ref"] == "casfm" else "DEPISTAGE",
                              r["groupe"], r["abx"], r["dep"])

    for n in sorted(attendu):
        A, B = attendu[n], bati.get(n, {})
        for g in sorted(set(A) | set(B)):
            for a in sorted(set(A.get(g, {})) | set(B.get(g, {}))):
                va, vb = A.get(g, {}).get(a), B.get(g, {}).get(a)
                if va != vb:
                    ecarts.append("%s/%s/%s : base %s, moteur %s" % (n, g, a, va, vb))

    # ---- 3. cloisonnement ----
    if '(function (racine) {' not in moteur or '})(typeof self !== "undefined" ? self : this);' not in moteur:
        ecarts.append("moteur.js n'est plus enfermé dans sa propre portée — ses "
                      "déclarations atterriraient dans celle de la page")
    communs = noms_declares(moteur) & noms_declares(inline)

    if ecarts:
        print("La base, le moteur et la page DIVERGENT :")
        for e in ecarts[:25]:
            print("  -", e)
        if len(ecarts) > 25:
            print("  … et %d autres." % (len(ecarts) - 25))
        return 1

    n = sum(len(t) for tbl in bati.values() for t in tbl.values())
    print("%d règles dans la base ; le moteur en bâtit %d entrées, toutes conformes."
          % (len(regles), sum(len(g) for t in bati.values() for g in t.values())))
    print("La page n'en redéclare aucune : elle les emprunte au moteur.")
    print("moteur.js reste cloisonné%s."
          % (" (%d noms seraient en collision sans cela)" % len(communs) if communs else ""))
    src = MP.tables(["SOURCES", "BASE_VERSION"])
    for cle, d in sorted(src["SOURCES"].items()):
        print("  %-7s %s %s — publié le %s" % (cle, d["nom"], d["version"], d["publie"]))
    print("  base de connaissances : version %s" % src["BASE_VERSION"])
    return 0


if __name__ == '__main__':
    sys.exit(main())
