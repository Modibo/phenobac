# -*- coding: utf-8 -*-
"""
verifier-clsi.py — les 822 lignes du CLSI tiennent-elles debout ?

LE TROU QUE CE CONTRÔLE BOUCHE

Les seuils du CLSI sont PRODUITS par outils/transcrire-clsi.py, qui les
vérifie en boucle fermée : chaque couple est éprouvé contre le moteur avec
une valeur témoin tirée dans chacune des bandes du document.

Mais cette boucle tourne à la GÉNÉRATION, et elle ne peut pas tourner
ailleurs : elle a besoin du JSON du M100, qui n'est pas versionné — le
document est protégé. La chaîne ne la lancera jamais.

Entre deux générations, rien ne regardait donc ces 822 lignes. Une
correction à la main, un copier-coller malheureux, une colonne décalée :
la base se chargerait, l'application rendrait des catégories, et personne
ne verrait rien. verifier-confrontations.py surveille les CHANGEMENTS —
il dit que les tables ont bougé, pas qu'elles sont justes.

Ce contrôle-ci vérifie ce qu'on peut vérifier SANS le document : la forme.
Elle ne prouve pas qu'un seuil est le bon, mais elle attrape tout ce qui
ne peut pas être juste.

    python3 outils/verifier-clsi.py
"""
import io
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
COLONNES = ["ref", "groupe", "abx", "meth", "site", "S", "R", "charge", "zit",
            "temoin", "dep", "conv", "couv", "espece", "ecoff", "sdd", "ns"]
SITES = ("standard", "urinaire", "meninge")


def lignes_base():
    """Les lignes de la base, découpées en respectant les listes d'espèces."""
    out = []
    for brut in io.open(os.path.join(RACINE, "base-connaissances.js"),
                        encoding="utf-8"):
        if not brut.startswith('["'):
            continue
        ch = brut.rstrip().rstrip(",")[1:-1]
        parts, prof, cur = [], 0, ""
        for c in ch:
            if c == "[":
                prof += 1
            elif c == "]":
                prof -= 1
            if c == "," and prof == 0:
                parts.append(cur); cur = ""
            else:
                cur += c
        parts.append(cur)
        l = {}
        for i, nom in enumerate(COLONNES):
            l[nom] = parts[i].strip().strip('"') if i < len(parts) else "undefined"
        out.append(l)
    return out


def nombre(v):
    if v in ("null", "undefined", ""):
        return None
    try:
        return float(v)
    except ValueError:
        return "?"


def especes_connues():
    """Les identifiants d'espèce que le moteur connaît, par groupe."""
    src = io.open(os.path.join(RACINE, "phenobac.html"), encoding="utf-8").read()
    # ORG vit dans phenobac.html : « sepidermidis:{ … bpGroup?… } ». On se
    # contente des identifiants déclarés, le rattachement au groupe étant
    # vérifié ailleurs.
    return set(re.findall(r"^\s{2}([a-z][a-z0-9]{3,}):\{", src, re.M))


def main():
    L = [l for l in lignes_base() if l["ref"] == "clsi"]
    autres = [l for l in lignes_base() if l["ref"] != "clsi"]
    ko = []

    def faute(l, quoi):
        ko.append("%s/%s/%s/%s : %s"
                  % (l["groupe"], l["abx"], l["meth"], l["site"], quoi))

    for l in L:
        S, R = nombre(l["S"]), nombre(l["R"])
        if S == "?" or R == "?":
            faute(l, "seuil illisible (%s / %s)" % (l["S"], l["R"])); continue

        # 1. LE SENS DES BORNES. En CMI un seuil de sensibilité est SOUS
        #    celui de résistance ; au disque c'est l'inverse, un grand
        #    diamètre étant favorable. Une ligne qui les intervertit rendrait
        #    sensible ce qui est résistant — le défaut le plus grave que la
        #    forme seule puisse attraper.
        if S is not None and R is not None:
            if l["meth"] == "cmi" and S > R:
                faute(l, "CMI : S (%s) au-dessus de R (%s)" % (S, R))
            if l["meth"] == "disque" and S < R:
                faute(l, "disque : S (%s) en dessous de R (%s)" % (S, R))

        # 2. « ns » DIT QU'IL N'Y A RIEN ENTRE S ET R. Si les deux bornes
        #    diffèrent, il reste une bande, et la nuance ment.
        if l["ns"] == "true":
            if S is None or R is None or S != R:
                faute(l, "« ns » mais S (%s) ≠ R (%s) : une bande subsiste"
                      % (l["S"], l["R"]))
            if l["sdd"] == "true":
                faute(l, "« sdd » ET « ns » : la bande ne peut pas porter "
                         "deux noms")

        # 3. « sdd » NOMME UNE BANDE : il en faut une.
        if l["sdd"] == "true" and S is not None and R is not None and S == R:
            faute(l, "« sdd » sans bande intermédiaire (S = R = %s)" % S)

        if l["site"] not in SITES:
            faute(l, "site inconnu : « %s »" % l["site"])

        if l["charge"] not in ("undefined", "") and not re.match(
                r"^\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?$", l["charge"]):
            faute(l, "charge de disque mal formée : « %s »" % l["charge"])
        if l["meth"] == "cmi" and l["charge"] not in ("undefined", ""):
            faute(l, "une CMI ne porte pas de charge de disque")

    # 4. SDD ET NS SONT DES NOTIONS DU CLSI. Les voir ailleurs serait une
    #    erreur de catégorie : l'EUCAST ne nomme pas ses bandes ainsi.
    for l in autres:
        if l["sdd"] == "true" or l["ns"] == "true":
            ko.append("%s %s/%s : « %s » porte une nuance du CLSI"
                      % (l["ref"], l["groupe"], l["abx"], l["ref"]))

    # 5. DEUX LIGNES POUR LA MÊME IDENTITÉ SONT UNE DISTINCTION PERDUE.
    #    Le chargeur du moteur lève déjà là-dessus, mais il ne tient pas
    #    compte de la portée d'espèce : deux lignes de portées différentes
    #    sont légitimes, deux de même portée ne le sont pas.
    vus = {}
    for l in L:
        cle = (l["groupe"], l["abx"], l["meth"], l["site"], l["espece"])
        vus.setdefault(cle, 0)
        vus[cle] += 1
    for cle, n in sorted(vus.items()):
        if n > 1:
            ko.append("%s/%s/%s/%s espèce %s : %d lignes pour la même identité"
                      % (cle + (n,)))

    # 6. UNE PORTÉE D'ESPÈCE QUI NE DÉSIGNE PERSONNE NE S'APPLIQUE JAMAIS,
    #    et le seuil qu'elle porte dort sans que rien ne le dise.
    connues = especes_connues()
    for l in L:
        if l["espece"] in ("undefined", ""):
            continue
        for sp in re.findall(r'"([a-z0-9]+)"', l["espece"]):
            if sp not in connues:
                faute(l, "espèce inconnue du moteur : « %s »" % sp)

    print("%d lignes CLSI examinées." % len(L))
    if ko:
        print("\nLES SEUILS DU CLSI NE TIENNENT PAS DEBOUT :")
        for m in ko[:40]:
            print("  - " + m)
        if len(ko) > 40:
            print("  … et %d autres." % (len(ko) - 40))
        return 1

    nsdd = sum(1 for l in L if l["sdd"] == "true")
    nns = sum(1 for l in L if l["ns"] == "true")
    nsite = sum(1 for l in L if l["site"] != "standard")
    nesp = sum(1 for l in L if l["espece"] not in ("undefined", ""))
    print("  · les bornes vont dans le bon sens : S sous R en CMI, "
          "S au-dessus de R au disque.")
    print("  · %d « SDD » portent une bande intermédiaire, %d « NS » n'en "
          "portent aucune, et aucune ligne ne porte les deux." % (nsdd, nns))
    print("  · %d lignes visent un site autre que standard, %d une espèce "
          "nommée — toutes connues du moteur." % (nsite, nesp))
    print("  · aucune identité en double, et aucune nuance du CLSI égarée "
          "sous un autre référentiel.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
