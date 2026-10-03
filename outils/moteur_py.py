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


def _moteur_js(noms):
    return ("var self={};"
            "(new Function('self', readFile('base-connaissances.js')))(self);"
            "(new Function('self', readFile('moteur.js')))(self);"
            "var M=self.PhenoBacMoteur; var o={};"
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
        raise SystemExit("le moteur n'a pas pu être évalué (%s) :\n%s" % (src, (r.stderr or "")[:600]))
    return json.loads(r.stdout)
