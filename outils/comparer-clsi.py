# -*- coding: utf-8 -*-
"""
comparer-clsi.py — confronte PhénoBac au M100, table par table.

    python3 outils/comparer-clsi.py chemin/vers/clsi-m100.json
    python3 outils/comparer-clsi.py …json --table 2B-4
    python3 outils/comparer-clsi.py …json --manquants   (ce que PhénoBac porte
                                         et que le CLSI ne chiffre pas)

Ne modifie RIEN. Produit un rapport à valider par un biologiste.

HORS INTÉGRATION CONTINUE : le JSON qu'il lit est une copie de travail
produite par outils/extraire-clsi.js dans la console du navigateur, et il
n'est pas versionné — le M100 est un document protégé. La chaîne ne peut donc
pas lancer cette confrontation ; elle se fait à la main, le document sous les
yeux, et son résultat se consigne dans CONFRONTATIONS.md, que
verifier-confrontations.py surveille.

POURQUOI UN TROISIÈME COMPARATEUR

comparer-eucast.py lit un classeur, comparer-casfm.py un PDF. Celui-ci lit le
JSON d'un lecteur de console, parce que la session du portail CLSI vit dans un
cookie HttpOnly qu'aucun script hors navigateur ne peut porter. La source
change ; la discipline, non : on affiche ce que dit le document et ce que
porte l'application, et on laisse trancher.

CE QU'IL REFUSE DE FAIRE

  1. Il ne propose RIEN pour une ligne que le lecteur a marquée douteuse (⚠).
     Une valeur qu'un outil n'a pas su répartir entre deux agents ne doit pas
     être proposée à la transcription : c'est exactement là qu'un antibiotique
     se verrait attribuer le seuil de son voisin.

  2. Il n'éclate PAS une table sur plusieurs groupes de son propre chef. Le
     CLSI donne UNE table d'anaérobies là où PhénoBac porte seize groupes, et
     une table d'entérobactéries là où il en porte trois. Appliquer les mêmes
     seuils à tous peut être juste — c'est au biologiste de le dire, pas à un
     programme de le supposer.

  3. Il ne devine aucun nom. La correspondance vit dans outils/noms-clsi.py,
     qui sort en erreur sur un code au sort indécidé. Un nom CLSI inconnu est
     rapporté tel quel, jamais rapproché « au plus proche ».
"""
import importlib.util
import sys, os, re, json

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
sys.path.insert(0, ICI)

# La correspondance des noms vit dans outils/noms-clsi.py — un tiret dans le
# nom de fichier, qu'un import ordinaire ne sait pas lire. On le charge donc
# par son chemin, comme comparer-eucast.py charge moteur_py. La DUPLIQUER ici
# serait pire : deux listes de noms qui divergent valent moins qu'une seule.
_s = importlib.util.spec_from_file_location(
    "noms_clsi", os.path.join(ICI, "noms-clsi.py"))
_N = importlib.util.module_from_spec(_s)
_s.loader.exec_module(_N)
CORRESPONDANCE = _N.CORRESPONDANCE
normaliser = _N.normaliser
HORS_TABLES_DE_SEUILS = _N.HORS_TABLES_DE_SEUILS
SANS_EQUIVALENT = _N.SANS_EQUIVALENT

EDITION_ATTENDUE = "CLSI M100 ED36:2026"

# --------------------------------------------------------------------------
# Quelle table du M100 vise quel groupe de PhénoBac.
#
# Une table qui en vise PLUSIEURS n'est pas une erreur — le CLSI découpe le
# monde bactérien autrement que PhénoBac —, mais elle demande un arbitrage,
# et l'outil le dit à chaque fois plutôt que de recopier en silence.
# --------------------------------------------------------------------------
TABLES = {
    "2A-1":  (["entero", "morganella", "serratia"],
              "le CLSI ne sépare pas Morganella ni Serratia des autres "
              "entérobactéries ; PhénoBac le fait, pour leurs résistances "
              "naturelles"),
    "2A-2":  (["salmonella"], None),
    "2B-1":  (["pseudo"], None),
    "2B-2":  (["acineto"], None),
    "2B-3":  (["burk"],
              "table VIDE par décision du CLSI : les seuils de B. cepacia "
              "ont été retirés, ses deux méthodes de référence ne concordant "
              "pas"),
    "2B-4":  (["steno"], None),
    "2B-5":  ([],
              "« Other Non-Enterobacterales » : portée fixée par un "
              "commentaire général, pas par une liste de genres. Aucun groupe "
              "de PhénoBac ne lui est rattaché d'office — voir Achromobacter, "
              "qui n'a de source CLSI nulle part"),
    "2C":    (["staph", "scn"],
              "le découpage par espèce du CLSI ne recouvre pas celui de "
              "PhénoBac : S. lugdunensis est traité comme S. aureus, et "
              "S. epidermidis a ses propres seuils"),
    "2D":    (["enteroc"], None),
    "2E":    (["haemo"], None),
    "2F":    (["ngono"], None),
    "2G":    (["pneumo"], None),
    "2H-1":  (["strepb", "strepacg"], None),
    "2H-2":  (["viridans"], None),
    "2I":    (["nmening"], None),
    "2J":    (["bfragilis", "cperfringens", "prevotella", "fnucleatum",
               "fnecrophorum", "finegoldia", "parvimonas", "peptostrepto",
               "peptoniphilus", "cacnes", "cavidum", "cdifficile",
               "cinnocuum", "cramosum", "csepticum", "ctertium"],
              "UNE table pour SEIZE groupes. Le CLSI ne distingue pas les "
              "anaérobies entre eux ; PhénoBac oui. Chaque groupe demande sa "
              "décision"),
    # Les lectures directes sur hémoculture ne sont pas les seuils ordinaires
    # d'un groupe : elles valent pour un prélèvement et un temps de lecture.
    "3F-2":  ([], "lecture DIRECTE sur hémoculture, deux temps de lecture — "
                  "ce n'est pas le seuil ordinaire du groupe"),
    "3F-3":  ([], "lecture directe sur hémoculture (P. aeruginosa)"),
    "3F-4":  ([], "lecture directe sur hémoculture (Acinetobacter)"),
}


def vide(v):
    return v is None or str(v).strip() in ("", "-", "–", "—")


def douteux(v):
    return v is not None and "⚠" in str(v)


def charger(chemin):
    with open(chemin, encoding="utf-8") as f:
        d = json.load(f)
    ed = d.get("edition")
    if ed and ed != EDITION_ATTENDUE:
        print("ATTENTION : le JSON dit « %s », on attendait « %s ». "
              "Les seuils changent d'une édition à l'autre."
              % (ed, EDITION_ATTENDUE))
    return d


def lignes_nommees(t):
    """Chaque ligne de la table, rendue en dictionnaire colonne -> valeur.

    Le lecteur nomme ses colonnes depuis l'en-tête du document (« cmi:SDD »,
    « disque:R », « charge »…) : on ne déduit rien d'une position."""
    cols = t.get("colonnes")
    if not cols:
        return None
    out = []
    for l in t.get("lignes", []):
        if l and l[0] == "§":          # ligne de section, pas de données
            continue
        d = {}
        for i, nom in enumerate(cols):
            d[nom] = l[i] if i < len(l) else None
        d["_renvois"] = l[-1] if len(l) > len(cols) else ""
        out.append(d)
    return out


def code_phenobac(nom_clsi):
    base, qual = normaliser(nom_clsi)
    return CORRESPONDANCE.get(base), base, qual


def rapport_table(cle, t, codes_base):
    groupes, remarque = TABLES.get(cle, ([], None))
    print("\n" + "=" * 74)
    print("TABLE %s   →   %s" % (cle, ", ".join(groupes) if groupes
                                 else "AUCUN groupe de PhénoBac"))
    if remarque:
        print("  ⚑ %s" % remarque)
    if len(groupes) > 1:
        print("  ⚑ %d groupes pour une seule table : chaque report est une "
              "décision." % len(groupes))

    if t.get("erreur"):
        print("  (illisible : %s)" % t["erreur"]); return
    if t.get("vide"):
        print("  (aucune table de seuils dans cette section)"); return

    lignes = lignes_nommees(t)
    if lignes is None:
        print("  (ce JSON est antérieur au nommage des colonnes : "
              "rejouer extraire-clsi.js)"); return

    vus, inconnus, suspects = set(), [], []
    for d in lignes:
        nom = d.get("agent") or ""
        if not nom:
            continue
        code, base, qual = code_phenobac(nom)
        valeurs = [(k, v) for k, v in d.items()
                   if (":" in k) and not vide(v)]
        if any(douteux(v) for _, v in valeurs) or douteux(nom):
            suspects.append((nom, code))
            continue
        if code is None:
            inconnus.append(base)
            continue
        vus.add(code)
        detail = "  ".join("%s %s" % (k, v) for k, v in valeurs)
        charge = d.get("charge")
        print("  %-5s %-34s %s%s"
              % (code, nom[:34],
                 ("[" + str(charge) + "] ") if not vide(charge) else "",
                 detail if detail else "(aucune valeur)"))
        if qual:
            print("        qualificatifs : %s" % ", ".join(qual))

    if suspects:
        print("\n  LIGNES ÉCARTÉES — le lecteur n'a pas su les répartir, et "
              "rien n'en sera proposé :")
        for nom, code in suspects:
            print("    ⚠ %s%s" % (nom[:60], (" → " + code) if code else ""))

    if inconnus:
        print("\n  Noms CLSI sans code PhénoBac (molécules que l'application "
              "ne porte pas) :")
        print("    " + ", ".join(sorted(set(inconnus))))

    # Ce que PhénoBac porte pour ces groupes et que le CLSI ne chiffre pas.
    for g in groupes:
        manquants = sorted(codes_base.get(g, set()) - vus)
        if not manquants:
            continue
        print("\n  %s — porté par PhénoBac, SANS seuil dans cette table :" % g)
        for c in manquants:
            note = ""
            if c in HORS_TABLES_DE_SEUILS:
                note = "  → %s : %s" % HORS_TABLES_DE_SEUILS[c]
            elif c in SANS_EQUIVALENT:
                note = "  → %s" % SANS_EQUIVALENT[c][:70]
            print("    %-5s%s" % (c, note))


def codes_par_groupe():
    """Les couples que PhénoBac porte aujourd'hui, par groupe — tous
    référentiels confondus. C'est la liste de ce qu'il faudra pouvoir rendre
    sous CLSI, pas celle de ce qui y est déjà."""
    src = open(os.path.join(RACINE, "base-connaissances.js"),
               encoding="utf-8").read()
    out = {}
    for m in re.finditer(r'\[\s*"(?:eucast|casfm|clsi)"\s*,\s*"([a-z0-9_]+)"\s*,'
                         r'\s*"([A-Z0-9]+)"', src):
        out.setdefault(m.group(1), set()).add(m.group(2))
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    seule = None
    if "--table" in sys.argv:
        i = sys.argv.index("--table")
        if i + 1 < len(sys.argv):
            seule = sys.argv[i + 1]
            args = [a for a in args if a != seule]
    if not args:
        print(__doc__)
        return 2

    d = charger(args[0])
    codes = codes_par_groupe()
    tables = d.get("tables", {})
    cles = [seule] if seule else [c for c in TABLES if c in tables]
    for cle in cles:
        if cle not in tables:
            print("La table %s n'est pas dans ce JSON." % cle); continue
        rapport_table(cle, tables[cle], codes)

    anom = d.get("anomalies") or []
    print("\n" + "=" * 74)
    print("%d anomalie(s) dans le JSON lu." % len(anom))
    for a in anom[:10]:
        print("  ⚠ %s" % a)
    print("\nAucun fichier n'a été modifié. Toute transcription doit être "
          "validée par un biologiste avant d'être portée dans le code.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
