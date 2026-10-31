# -*- coding: utf-8 -*-
"""
extraire-voies.py — les seuils du CA-SFM qui dépendent de la VOIE.

    python3 outils/extraire-voies.py CASFM2026_V1.0.pdf > voies.js

CE QUE CE FICHIER EXTRAIT, ET LE DÉFAUT QUI L'A FAIT NAÎTRE

Le communiqué du CA-SFM donne parfois DEUX seuils pour une même molécule,
séparés par la voie d'administration :

    Fosfomycine iv                  S ≤ 32   R > 32     (entérobactéries, p54)
    Fosfomycine per os (cystites),  S ≤  8   R >  8

Un facteur quatre. PhénoBac porte un seuil par couple, plus un seuil urinaire
et un seuil méningé : la table BP ne connaît pas la voie. Elle appliquait donc
le 8 — celui de la voie orale — et comparer-casfm.py annonçait un « écart »
avec le 32 de la voie intraveineuse. Ce n'était pas un écart : c'était la même
molécule, par deux chemins.

Le piège était qu'il ne se voyait pas : la ligne « per os (cystites) » porte
un SITE, elle part donc dans la passe des autres sites ; la ligne « iv » reste
seule au site ordinaire, paraît unique, et se compare. Le filtre qui devait
éviter les faux écarts en fabriquait un.

CE QUE PHÉNOBAC EN FAIT, ET CE QU'ELLE N'EN FAIT PAS

Elle les MONTRE, elle ne catégorise pas avec. Décision du biologiste du
2026-10-31, prise en connaissance de l'alternative :

  — demander la voie au prescripteur et catégoriser dessus : cela ferait de
    PhénoBac l'auteur d'un choix thérapeutique qu'elle n'a pas à faire, sur
    une donnée qu'un compte rendu d'antibiogramme ne porte pas toujours ;
  — afficher les deux seuils, et laisser lire celui qui s'applique.

C'est le second. La catégorie rendue ne change pas d'un iota ; le compte rendu
gagne une ligne qui dit : « ce seuil dépend de la voie, les voici tous les
deux ». Un banc vérifie que l'affichage de cette note ne modifie AUCUNE
catégorie — sans quoi la décision serait trahie par son implémentation.

LECTURE À LA POSITION, comme pour tous les tableaux du CA-SFM : aplaties en
texte, ces lignes se mélangent. On réemploie outils/pdfpos.py et le repérage
de colonnes de comparer-casfm.py, déjà éprouvés.
"""
import io
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)

import importlib.util                                     # noqa: E402
import agents_fr as AF                                    # noqa: E402


def _module(nom, fichier):
    """Les outils du projet portent un tiret dans leur nom : ils ne
    s'importent pas, ils se chargent. Même mécanique que comparer-casfm.py,
    dont on réemploie aussi le repérage de colonnes."""
    spec = importlib.util.spec_from_file_location(nom, os.path.join(ICI, fichier))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


CC = _module("cc", "comparer-casfm.py")
CZ = CC.CZ

ENTETE = '''/* voies.js — engendré par outils/extraire-voies.py. NE PAS ÉDITER À LA MAIN.
   Source : CA-SFM, recommandations %(annee)s, tableaux complets.

   LES SEUILS QUI DÉPENDENT DE LA VOIE D'ADMINISTRATION.

   PhénoBac les MONTRE, elle ne catégorise pas avec : la table BP ne connaît
   que le site, et lui ajouter la voie ferait catégoriser sur une donnée qu'un
   compte rendu d'antibiogramme ne porte pas toujours. Le biologiste lit les
   deux seuils et retient celui qui s'applique.

   « S: null » veut dire AUCUNE catégorie « sensible » par cette voie — une
   décision du comité, pas une valeur manquante. */
(function (racine) {
"use strict";
var VOIES_SOURCE = %(source)s;
var VOIES = {
'''

PIED = '''};

var API = { VOIES: VOIES, VOIES_SOURCE: VOIES_SOURCE };
if (typeof module !== "undefined" && module.exports) module.exports = API;
else racine.PhenoBacVoies = API;

})(typeof self !== "undefined" ? self : this);
'''


def js(v):
    if v is None:
        return "null"
    if isinstance(v, str):
        return '"%s"' % v.replace("\\", "\\\\").replace('"', '\\"')
    return repr(float(v)) if v != int(v) else str(int(v))


def main():
    if len(sys.argv) < 2 or not sys.argv[1].lower().endswith('.pdf'):
        print(__doc__)
        return 2
    lues = CC.lignes_casfm(sys.argv[1])
    # (groupe, code) -> { voie: (S, R, page) }
    par = {}
    for chapitre, agent, sC, rC, page, hors in lues:
        groupes = CZ.CHAPITRE_GROUPES.get(chapitre) or []
        if not groupes:
            continue
        code, lu = AF.code(agent)
        if not lu or code is None:
            continue
        v = AF.voie(agent)
        if v == "standard":
            continue
        # LA CLÉ PORTE LE SITE, ET C'EST TOUT L'ENJEU.
        #
        # Première version : la clé était (groupe, code), et la voie écrasait.
        # Page 85, streptocoques, il y a TROIS lignes d'amoxicilline :
        #
        #   i=22  Amoxicilline iv                            S ≤ 1    R > 2
        #   i=25  Amoxicilline iv (méningites et endocardites) S ≤ 0,5  R > 0,5
        #   i=28  Amoxicilline per os                        S ≤ 0,5  R > 1
        #
        # Les deux premières ont la même voie et des SITES différents. En
        # écrasant, l'extracteur gardait la dernière lue — la méningée — et
        # l'appariait au per os ordinaire. Il annonçait donc « iv : 0,5 »
        # quand le document dit 1 pour la voie intraveineuse ordinaire.
        #
        # C'est exactement le défaut « garder la dernière ligne » que
        # comparer-casfm.py vient de perdre, et je l'ai rebâti ici en
        # écrivant cet outil. La leçon tient en une phrase : un couple du
        # CA-SFM n'est pas (groupe, molécule) — c'est (groupe, molécule,
        # site, voie), et toute clé plus courte écrase quelque chose.
        for g in CZ.groupes_vises(chapitre, agent, groupes):
            cle = (g, code, AF.site(agent))
            if v in par.setdefault(cle, {}):
                # Deux lignes, même groupe, même site, même voie : on ne
                # choisit pas. On le dit, et on écarte le couple.
                par[cle][v] = "AMBIGU"
            else:
                par[cle][v] = (sC, rC, page)

    # Une seule voie connue n'apprend rien : c'est le seuil ordinaire, déjà
    # dans BP. On ne garde que les couples où le document donne DEUX chemins
    # AU MÊME SITE — c'est là, et seulement là, que la voie change le seuil
    # sans que le site l'explique.
    utiles = {}
    ambigus = []
    for (g, code, site), voies in par.items():
        if any(x == "AMBIGU" for x in voies.values()):
            ambigus.append("%s:%s (%s)" % (g, code, site))
            continue
        if len(voies) > 1:
            utiles[(g, code, site)] = voies

    out = io.StringIO()
    out.write(ENTETE % {"annee": "2026",
                        "source": js("CA-SFM 2026 V1.0, tableaux complets")})
    for (g, code, site) in sorted(utiles):
        voies = utiles[(g, code, site)]
        out.write('  "%s:%s:%s": {\n' % (g, code, site))
        for v in sorted(voies):
            sC, rC, page = voies[v]
            out.write('    %s: { S: %s, R: %s, page: %d },\n'
                      % (v, js(sC), js(rC), page))
        out.write('  },\n')
    out.write(PIED)
    sys.stdout.write(out.getvalue())
    sys.stderr.write("%d couples (groupe, molécule, site) à voies multiples, "
                     "sur %d lignes lues\n" % (len(utiles), len(lues)))
    if ambigus:
        sys.stderr.write("ÉCARTÉS, deux lignes de même voie et même site — "
                         "l'outil ne choisit pas : %s\n" % ", ".join(sorted(ambigus)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
