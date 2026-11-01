# -*- coding: utf-8 -*-
"""
verifier-fratries.py — une correction portée dans UN groupe et pas dans ses frères.

LE DÉFAUT QUE CE CONTRÔLE EXISTE POUR ATTRAPER

L'EUCAST publie UNE table pour les entérobactéries. PhénoBac en porte QUATRE
groupes de seuils — entero, morganella, salmonella, serratia — et c'est le bon
choix : le document chiffre la ciprofloxacine autrement chez Salmonella,
refuse l'imipénème chez Proteus et Morganella, et ne reconnaît la
nitrofurantoïne que chez E. coli. Un seul groupe appliquerait le seuil de l'un
à l'autre, « un chiffre juste au mauvais endroit ».

Ce découpage a UN danger, et un seul : une correction portée dans un groupe et
oubliée dans ses frères. Elle ne se voit pas. Les trois groupes restants
continuent de rendre une catégorie, avec la même assurance qu'avant, et
l'application se contredit elle-même d'un genre à l'autre sans que rien ne
tombe au rouge.

C'EST ARRIVÉ, ET C'EST POURQUOI CE FICHIER EXISTE. Le 25 octobre 2026, la
fosfomycine a été remise à la lettre du document dans le groupe « entero » :
la ligne du site ordinaire a été retirée, remplacée par une ligne urinaire
restreinte à E. coli, parce que l'EUCAST renvoie à une NOTE pour la
fosfomycine iv des autres entérobactéries et des autres indications. Les trois
groupes frères ont gardé leur ligne « standard 8/8 ». Six jours durant,
PhénoBac a rendu, pour une CMI de 16 mg/L hors urine :

    Escherichia coli, Klebsiella…  aucune catégorie   (le document refuse)
    Proteus, Morganella, Providencia, Salmonella, Serratia   R

Même molécule, même famille, même site, même document, réponses opposées selon
le genre. Corrigé le 31 octobre 2026 sur décision du biologiste, les trois
lignes frères retirées. Aucun contrôle ne le voyait : verifier-couverture-eucast.py confronte
le classeur table par table, et les entérobactéries ne figurent pas dans sa
liste — il regarde les vingt-deux tables difficiles, pas celle-là.

CE QUE CE CONTRÔLE REGARDE, ET POURQUOI IL N'A BESOIN D'AUCUN DOCUMENT

Il ne compare pas la base à un référentiel : il compare la base À ELLE-MÊME.
Pour chaque couple (référentiel, antibiotique, méthode) présent dans au moins
deux groupes d'une même fratrie, il regarde sa PORTÉE — le site, et la
restriction d'espèce. Une portée qui diffère d'un frère à l'autre est soit une
différence voulue, qui doit être déclarée ici avec sa raison, soit une
correction inachevée.

Les VALEURS, elles, ont le droit de différer librement : c'est tout l'objet du
découpage, et les confronter au document est le travail de
verifier-couverture-eucast.py et de comparer-eucast.py. Ici on ne regarde que
la portée, parce qu'une portée est une DÉCISION — « ce seuil ne vaut que dans
l'urine », « ce seuil ne vaut que pour E. coli » — et qu'une décision prise
pour un genre d'une famille se prend rarement pour lui seul.

Il ne corrige rien. Changer un seuil est une décision de biologiste.

    python3 outils/verifier-fratries.py
"""
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
BASE = os.path.join(RACINE, "base-connaissances.js")

# Les fratries : des groupes de seuils que le référentiel publie dans UNE SEULE
# table, et que PhénoBac sépare pour pouvoir en exprimer les différences.
#
# N'y mettre que cela. Staphylococcus et les SCN sont deux tables chez
# l'EUCAST ; les y inscrire ferait crier le contrôle sur des différences que le
# document VEUT.
FRATRIES = {
    "entérobactéries": ["entero", "morganella", "salmonella", "serratia"],
}

# Les différences de portée VOULUES, avec leur raison. Une entrée ici est une
# décision prise et écrite ; elle n'est pas un moyen de faire taire le
# contrôle. La clé est (fratrie, référentiel, antibiotique, méthode).
ASSUMEES = {
}

# Les différences de portée VUES et PAS ENCORE TRANCHÉES. Elles sont annoncées
# à chaque passage, bruyamment, et le contrôle rend tout de même 0 : une
# question posée au biologiste ne doit pas arrêter la livraison du reste.
#
# CETTE LISTE EST FAITE POUR SE VIDER. Une entrée qui s'y installe redevient
# du bruit, et le bruit est la façon dont un avertissement cesse d'être lu :
# c'est la faiblesse connue de ce mécanisme, et la raison d'écrire ici la
# QUESTION plutôt qu'un simple « à voir ».
EN_SUSPENS = {
}


# ---------------------------------------------------------------------------
# LA SECONDE PASSE : UN COUPLE RESTREINT D'UN CÔTÉ ET PAS DE L'AUTRE
#
# Depuis le 2026-11-01, la restriction d'espèce s'indexe sur
# « groupe:molécule:MÉTHODE » et non plus sur « groupe:molécule ». Il le
# fallait : la vancomycine de l'entérocoque a une CMI valable pour TOUS les
# entérocoques (4 mg/L) et un diamètre qui ne vaut que pour E. faecalis et
# E. faecium (12 mm contre 15). L'ancienne clé ne savait pas le dire.
#
# Mais ce gain a un prix, et il est exactement du genre que ce fichier
# traque : AVANT, une restriction écrite sur la CMI protégeait le disque par
# ricochet ; MAINTENANT, l'oublier sur le disque l'ouvre en silence. Le sens
# de panne s'est inversé — il ouvre au lieu de fermer.
#
# D'où cette passe. Pour chaque couple (référentiel, groupe, molécule, site)
# dont AU MOINS UNE ligne porte une restriction, toutes les autres doivent en
# porter une aussi — ou figurer ci-dessous, avec la raison lue dans le
# document. Une asymétrie non déclarée est un oubli jusqu'à preuve du
# contraire.
ASYMETRIE_VOULUE = {
    ("eucast", "enteroc", "VA", "standard", "cmi"):
        "Classeur v16.1, feuille Enterococcus : la CMI de la vancomycine vaut "
        "4/4 pour E. faecalis et E. faecium (l.81) COMME pour les autres "
        "entérocoques (l.83) ; seul le diamètre sépare (12 contre 15 mm). "
        "Restreindre la CMI retirerait une valeur que l'EUCAST accorde.",
    ("eucast", "pseudo", "MEM", "standard", "cmi"):
        "Feuille Pseudomonas : la CMI du méropénème vaut 2/8 pour "
        "P. aeruginosa (l.49) comme pour les autres Pseudomonas (l.50) ; seul "
        "le diamètre sépare (20/14 contre 24/18).",
    ("eucast", "pseudo", "MEM", "meninge", "cmi"):
        "Feuille Pseudomonas, l.51 : la ligne méningée ne nomme que "
        "P. aeruginosa, et le document ne donne aucune ligne méningée aux "
        "autres Pseudomonas — leur CMI méningée n'existe pas, elle n'est pas "
        "ouverte. L'absence de restriction sur la CMI est ici sans portée.",
}


def regles():
    """Les lignes de base-connaissances.js, en champs nommés."""
    s = open(BASE, encoding="utf-8").read()
    # L'ordre des colonnes est déclaré par la base elle-même : le relire plutôt
    # que de le recopier, sinon une colonne insérée décalerait tout ce fichier
    # en silence.
    m = re.search(r'const COLONNES = \[([^\]]*)\]', s)
    if not m:
        print("base-connaissances.js n'expose plus COLONNES : ce contrôle lirait "
              "les champs de travers, et il préfère s'arrêter.")
        sys.exit(2)
    # « [a-z]+ » PERDAIT DEUX COLONNES SANS RIEN DIRE : « S » et « R » sont en
    # capitales. COLONNES devenait treize noms au lieu de quinze, tout ce qui
    # suit « site » glissait de deux rangs, et la restriction d'espèce se
    # lisait « undefined ». Le contrôle trouvait quand même l'écart de site —
    # il paraissait donc marcher, en ayant cessé de voir la moitié de ce qu'il
    # regarde. Un lecteur qui perd une colonne ne se trompe pas à moitié.
    colonnes = re.findall(r'"([A-Za-z]+)"', m.group(1))
    attendues = ("ref", "groupe", "abx", "meth", "site", "espece")
    absentes = [c for c in attendues if c not in colonnes]
    if absentes or len(colonnes) < 10:
        print("COLONNES ne porte pas ce que ce contrôle lit (%d noms, manquants : "
              "%s). Il s'arrête plutôt que de lire les champs de travers."
              % (len(colonnes), ", ".join(absentes) or "aucun"))
        sys.exit(2)
    out = []
    # LES COMMENTAIRES NE SONT PAS DES DONNÉES, et ce lecteur l'a appris de la
    # pire façon : le commentaire écrit pour EXPLIQUER le retrait des trois
    # lignes de fosfomycine en citait les trois lignes, indentées. Le lecteur
    # les a relues comme des règles, et le contrôle a continué de signaler un
    # défaut qui venait d'être corrigé. Un documentaliste pris pour un témoin.
    dans_bloc = False
    for l in s.splitlines():
        nu = l.strip()
        if dans_bloc:
            if "*/" in nu:
                dans_bloc = False
            continue
        if nu.startswith("/*") and "*/" not in nu:
            dans_bloc = True
            continue
        if nu.startswith("//") or nu.startswith("/*"):
            continue
        # Une règle commence EN DÉBUT DE LIGNE. Tout ce qui est indenté dans ce
        # fichier est de la prose ou une table annexe.
        if not (l.startswith('["eucast"') or l.startswith('["casfm"')):
            continue
        l = nu
        ch = re.findall(r'\[[^\[\]]*\]|"[^"]*"|null|undefined|true|false|[-\d.]+',
                        l.split("//")[0].rstrip(",").strip()[1:-1])
        o = {}
        for i, c in enumerate(colonnes):
            o[c] = ch[i].strip('"') if i < len(ch) else "undefined"
        out.append(o)
    return out


def portee(r):
    """Ce qui RESTREINT un seuil : le site, et l'espèce. Pas sa valeur."""
    esp = r.get("espece", "undefined")
    esp = "" if esp in ("undefined", "null") else esp.replace('"', "").strip("[]")
    return (r.get("site", "?"), esp)


def dit_portee(p):
    return p[0] + (" · " + p[1] if p[1] else "")


def main():
    lignes = regles()
    if len(lignes) < 500:
        print("seules %d règles ont été lues dans base-connaissances.js : le "
              "lecteur s'est cassé, et un contrôle qui ne lit rien ne trouve "
              "rien." % len(lignes))
        return 2

    # CHAQUE GROUPE DÉCLARÉ DOIT EXISTER DANS LA BASE. Un groupe renommé, ou
    # un lecteur qui ne ramasse plus rien, laisserait ce contrôle « au vert »
    # en n'ayant comparé personne — le plus silencieux des échecs, et celui
    # que ce fichier existe précisément pour empêcher ailleurs.
    presents = set(r["groupe"] for r in lignes)
    vides = [g for gs in FRATRIES.values() for g in gs if g not in presents]
    if vides:
        print("ces groupes sont déclarés dans FRATRIES et absents de la base : %s. "
              "Le contrôle s'arrête : comparer une fratrie amputée reviendrait à "
              "ne rien comparer en annonçant que tout va bien."
              % ", ".join(sorted(vides)))
        return 2

    ecarts, suspendus, dits = [], [], []
    for nom, groupes in sorted(FRATRIES.items()):
        par = {}
        for r in lignes:
            if r["groupe"] not in groupes:
                continue
            par.setdefault((r["ref"], r["abx"], r["meth"]), {})[r["groupe"]] = portee(r)

        communs = compares = 0
        for cle in sorted(par):
            vus = par[cle]
            if len(vus) < 2:
                continue            # une absence n'est pas une portée
            compares += 1
            if len(set(vus.values())) == 1:
                communs += 1
                continue
            detail = "; ".join("%s %s" % (g, dit_portee(vus[g])) for g in sorted(vus))
            k = (nom,) + cle
            if k in ASSUMEES:
                dits.append("différence voulue — %s %s %s : %s (%s)"
                            % (cle[0], cle[1], cle[2], detail, ASSUMEES[k]))
            elif k in EN_SUSPENS:
                suspendus.append("%s %s %s — %s\n      %s"
                                 % (cle[0], cle[1], cle[2], detail, EN_SUSPENS[k]))
            else:
                ecarts.append("fratrie « %s », %s %s %s : la portée diffère — %s. "
                              "Soit c'est voulu, et il faut le dire dans ASSUMEES "
                              "avec la raison ; soit une correction n'a été portée "
                              "que dans un groupe."
                              % (nom, cle[0], cle[1], cle[2], detail))
        dits.append("fratrie « %s » (%s) : %d couples présents dans au moins deux "
                    "groupes, %d de même portée."
                    % (nom, ", ".join(groupes), compares, communs))

    if suspendus:
        print("DIFFÉRENCES DE PORTÉE VUES, PAS ENCORE TRANCHÉES :")
        for s in suspendus:
            print("  · " + s)
        print("")

    if ecarts:
        print("UNE CORRECTION N'A PEUT-ÊTRE ÉTÉ PORTÉE QUE DANS UN GROUPE :")
        for e in ecarts:
            print("  -", e)
        print("\nAucun fichier n'a été modifié. Toute correction doit être "
              "validée par un biologiste avant d'être portée dans le code.")
        return 1

    # ------------------------------------------------------------------
    # SECONDE PASSE : au sein d'un couple, chaque méthode est-elle tranchée ?
    # ------------------------------------------------------------------
    # UNE EXCEPTION NOMMÉE N'EST PAS UNE RESTRICTION, et confondre les deux
    # faisait crier ce contrôle sur l'oxacilline du 2026-11-01. Quand un
    # couple porte À LA FOIS une ligne générale et une ligne qui nomme des
    # espèces, la seconde ne restreint rien : elle fait exception à la
    # première, et les autres espèces gardent la valeur générale. Il n'y a
    # alors aucune méthode à couvrir. La règle est celle du moteur, et elle
    # se recalcule ici au lieu de se recopier.
    generales = set()
    for r in lignes:
        if r.get("espece", "undefined") in ("undefined", "null"):
            generales.add((r["ref"], r["groupe"], r["abx"], r.get("site", "?"),
                           r.get("meth", "?")))

    couples = {}
    for r in lignes:
        cle = (r["ref"], r["groupe"], r["abx"], r.get("site", "?"))
        esp = r.get("espece", "undefined")
        if esp not in ("undefined", "null") \
           and cle + (r.get("meth", "?"),) in generales:
            continue                      # exception nominative, pas restriction
        couples.setdefault(cle, []).append(
            (r.get("meth", "?"), "" if esp in ("undefined", "null") else esp))

    muets, declares, examines = [], [], 0
    for cle, rangs in sorted(couples.items()):
        if len(rangs) < 2:
            continue
        restreints = [m for m, e in rangs if e]
        if not restreints or len(restreints) == len(rangs):
            continue
        examines += 1
        for meth, esp in sorted(rangs):
            if esp:
                continue
            raison = ASYMETRIE_VOULUE.get(cle + (meth,))
            ou = "%s %s/%s %s · %s" % (cle[0], cle[1], cle[2], cle[3], meth)
            if raison:
                declares.append("%s — %s" % (ou, raison))
            else:
                muets.append("%s : restreint en « %s », libre ici."
                             % (ou, ", ".join(sorted(restreints))))

    if muets:
        print("UNE RESTRICTION D'ESPÈCE NE COUVRE PAS TOUTES LES MÉTHODES DU COUPLE :")
        for m in muets:
            print("  -", m)
        print("\nDepuis que la clé porte la méthode, l'oubli OUVRE le seuil au "
              "lieu de le fermer. Soit la ligne doit porter la même restriction, "
              "soit l'asymétrie est voulue et se déclare dans ASYMETRIE_VOULUE "
              "avec la ligne du document qui la fonde.")
        print("\nAucun fichier n'a été modifié. Toute correction doit être "
              "validée par un biologiste avant d'être portée dans le code.")
        return 1

    print("Dans chaque fratrie, une restriction posée sur un genre est posée "
          "sur tous — ou déclarée.")
    for d in dits:
        print("  ·", d)
    print("Et dans chaque couple, une restriction posée sur une méthode est "
          "posée sur toutes — ou déclarée (%d couples asymétriques examinés)."
          % examines)
    for d in declares:
        print("  ·", d)
    return 0


if __name__ == '__main__':
    sys.exit(main())
