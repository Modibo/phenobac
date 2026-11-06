# -*- coding: utf-8 -*-
"""
moteur_py.py — lire les tables du moteur depuis Python, en les ÉVALUANT.

Les vérificateurs lisaient jusqu'ici les littéraux dans le texte source. Ces
littéraux n'existent plus : le moteur reconstruit ses tables à partir de
base-connaissances.js au chargement. Les relire au moyen d'une expression
régulière reviendrait à vérifier la base, pas ce que le laboratoire exécute.

On exécute donc le moteur — avec node s'il est là, sinon avec le JavaScriptCore
d'Apple, présent sur tout Mac — et l'on récupère les tables telles qu'il les a
bâties. C'est plus sûr, et cela couvre en prime la reconstruction elle-même.
"""
import json
import os
import shutil
import subprocess

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSC = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"


# LES CINQ FICHIERS, ET NON DEUX.
#
# Cette fonction ne chargeait que base-connaissances.js et moteur.js. Le
# moteur, ne trouvant ni PhenoBacPosologie, ni PhenoBacVoies, ni
# PhenoBacRenduCible, se repliait sur ses tables vides — c'est écrit en toutes
# lettres dans moteur.js : « racine.PhenoBacPosologie || { POSOLOGIE: {} } ».
#
# Conséquence : tout outil Python qui demandait POSOLOGIE, VOIES ou
# RENDU_CIBLE recevait une table VIDE, et une table vide ne se distingue pas
# d'une table dont on n'a rien à dire. Le 2026-11-06, l'empreinte de
# POSOLOGIE pour le registre des confrontations n'a pas pu être calculée : le
# moteur levait au chargement. C'est la trace visible ; l'invisible est qu'un
# contrôle aurait pu passer au vert sur une table vide.
#
# On charge donc les cinq fichiers, dans l'ordre où la page les charge.
_MODULES = ("base-connaissances.js", "posologie.js", "voies.js",
            "rendu-cible.js", "moteur.js")


def _moteur_js(noms):
    return ("var self={};"
            + "".join("(new Function('self', readFile('%s')))(self);" % f
                      for f in _MODULES)
            + "var M=self.PhenoBacMoteur; var o={};"
            + "".join("o['%s']=M.%s;" % (n, n) for n in noms)
            + "print(JSON.stringify(o));")


def _moteur_node(noms):
    return ("const M=require('./moteur.js');const o={};"
            + "".join("o['%s']=M.%s;" % (n, n) for n in noms)
            + "process.stdout.write(JSON.stringify(o));")


def tables(noms):
    """{nom: table} — telles que le moteur les a reconstruites."""
    if shutil.which("node"):
        cmd, src = ["node", "-e", _moteur_node(noms)], "node"
    elif os.path.exists(JSC):
        cmd, src = [JSC, "-e", _moteur_js(noms)], "JavaScriptCore"
    else:
        raise SystemExit("ni node ni JavaScriptCore : impossible d'évaluer le moteur")
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=RACINE)
    if r.returncode or not r.stdout.strip():
        # UN MESSAGE VIDE N'EST PAS UN MESSAGE. Quand le JavaScript engendré
        # ne compile pas — un nom de table mal écrit, par exemple —, le
        # sous-processus ne rend NI sortie NI erreur, et l'outil annonçait
        # « le moteur n'a pas pu être évalué » suivi d'une ligne blanche. On
        # rappelle donc ce qu'on lui a demandé : c'est presque toujours là
        # qu'est la faute.
        raise SystemExit(
            "le moteur n'a pas pu être évalué (%s).\n"
            "      tables demandées : %s\n"
            "      %s" % (src, ", ".join(noms),
                          (r.stderr or "").strip()[:600]
                          or "aucun message : le JavaScript engendré n'a "
                             "probablement pas compilé — vérifiez les noms."))
    return json.loads(r.stdout)
