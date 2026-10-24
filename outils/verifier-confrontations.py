# -*- coding: utf-8 -*-
"""
verifier-confrontations.py — un seuil modifié a-t-il été reconfronté ?

LE DÉFAUT QUE CE CONTRÔLE EXISTE POUR ATTRAPER

Deux outils de ce dépôt confrontent les tables de PhénoBac au document
officiel : comparer-eucast.py pour les concentrations critiques,
comparer-zit.py pour les zones d'incertitude technique. Ni l'un ni l'autre ne
peut tourner en intégration continue — le document n'est pas dans le dépôt, il
n'est pas redistribuable, et le serveur de l'EUCAST refuse les téléchargements
automatiques. Ces confrontations se font donc à la main.

Ce qui se fait à la main s'oublie, et l'oubli ne se voit pas : la chaîne reste
verte, les bancs passent, et un seuil modifié six mois plus tôt n'a jamais été
relu sur le tableau officiel. Le § 26 interdit d'inventer une règle ; il
interdit tout autant d'en garder une qu'on a cessé de vérifier.

Ce contrôle recalcule l'empreinte des tables confrontées et la compare à celle
que CONFRONTATIONS.md a enregistrée. Si elle a bougé, les seuils ont changé
depuis la dernière confrontation, et la livraison s'arrête.

    python3 outils/verifier-confrontations.py
    python3 outils/verifier-confrontations.py --empreintes   (pour les relever)
"""
import hashlib
import json
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
sys.path.insert(0, ICI)
import moteur_py as MP                                       # noqa: E402

REGISTRE = os.path.join(RACINE, "CONFRONTATIONS.md")
SANS_EMPREINTE = re.compile(r"^\(.*\)$")          # « (jamais confrontée …) »


def entrees():
    """Lit le registre. Il est écrit pour être lu par un humain d'abord ;
    la forme « - **clé** : valeur » se laisse analyser sans effort."""
    with open(REGISTRE, encoding="utf-8") as f:
        texte = f.read()
    out = []
    for bloc in re.split(r"\n## ", texte)[1:]:
        titre = bloc.split("\n", 1)[0].strip()
        champs = dict(re.findall(r"^- \*\*(\w+)\*\*\s*:\s*(.+?)\s*$", bloc, re.M))
        manquants = [c for c in ("document", "tables", "empreinte", "résultat")
                     if c not in champs]
        if manquants:
            raise SystemExit(
                "REGISTRE ILLISIBLE — l'entrée « %s » n'a pas de champ %s. "
                "Un registre à moitié rempli ne protège de rien."
                % (titre, ", ".join(manquants)))
        champs["titre"] = titre
        champs["outil"] = titre.split()[0]
        champs["tables"] = [t.strip() for t in champs["tables"].split(",") if t.strip()]
        out.append(champs)
    return out


def empreinte(noms):
    """L'empreinte porte sur les tables TELLES QUE LE MOTEUR LES BÂTIT, pas sur
    le texte du fichier : un commentaire retouché ne doit pas réclamer une
    nouvelle confrontation, un seuil déplacé d'un facteur dix, si."""
    tables = MP.tables(noms)
    absentes = [n for n in noms if tables.get(n) is None]
    if absentes:
        raise SystemExit(
            "CONFRONTATION IMPOSSIBLE — le moteur ne porte plus les tables %s, "
            "que le registre dit avoir confrontées. Table renommée ou supprimée : "
            "le registre ne décrit plus l'application." % ", ".join(absentes))
    canon = json.dumps(tables, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()


def main():
    releve = "--empreintes" in sys.argv
    ecarts, dits, dettes = [], [], []

    for e in entrees():
        vue = empreinte(e["tables"])
        if releve:
            print("%-26s %s  (%s)" % (e["outil"], vue, ", ".join(e["tables"])))
            continue
        if SANS_EMPREINTE.match(e["empreinte"]):
            # Dette assumée et ÉCRITE. On la rappelle, on ne bloque pas :
            # arrêter une livraison sur un document que personne n'a sous la
            # main n'aiderait personne — mais la taire la ferait disparaître.
            dettes.append("%s : %s — tables %s, empreinte actuelle %s…"
                          % (e["outil"], e["résultat"], ", ".join(e["tables"]), vue[:12]))
            continue
        if vue != e["empreinte"]:
            ecarts.append(
                "%s : les tables %s ont changé depuis la confrontation du %s.\n"
                "      registre  %s\n      aujourd'hui %s\n"
                "      Relancez « python3 outils/%s » avec %s sous les yeux, "
                "puis reportez le résultat et la nouvelle empreinte dans "
                "CONFRONTATIONS.md."
                % (e["outil"], ", ".join(e["tables"]), e.get("date", "?"),
                   e["empreinte"], vue, e["outil"], e["document"]))
        else:
            dits.append("%s : %s (confrontation du %s, %s)"
                        % (e["outil"], e["résultat"], e.get("date", "?"),
                           ", ".join(e["tables"])))

    if releve:
        return 0
    if ecarts:
        print("DES SEUILS ONT CHANGÉ SANS ÊTRE RECONFRONTÉS AU DOCUMENT OFFICIEL :")
        for x in ecarts:
            print("  - " + x)
        return 1
    print("Les tables confrontées n'ont pas bougé depuis leur confrontation.")
    for d in dits:
        print("  ·", d)
    for d in dettes:
        print("  ⚠ dette écrite :", d)
    return 0


if __name__ == '__main__':
    sys.exit(main())
