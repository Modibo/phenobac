# -*- coding: utf-8 -*-
"""
verifier-deploiement.py — ce que le site SERT, comparé à ce que le dépôt DIT.

    python3 outils/verifier-deploiement.py
    python3 outils/verifier-deploiement.py --attendre      (jusqu'à 15 min)

Ne modifie RIEN. Sort en erreur si le site ne sert pas le commit courant.

POURQUOI CE FICHIER EXISTE

Le 7 novembre 2026, deux livraisons de suite ont échoué en intégration
continue sans que personne le sache. L'étape de déploiement est conditionnée
à la réussite des contrôles : elle a été SAUTÉE, et le site a continué de
servir la version précédente. Pendant ce temps, le correctif était annoncé
comme livré.

La vérification employée jusque-là comparait les empreintes du dépôt à celles
du site, en boucle, pendant dix minutes. Elle disait donc « pas encore
déployé » — ce qui est vrai, et parfaitement inutile : elle ne distinguait
pas une chaîne LENTE d'une chaîne ROUGE. Attendre une livraison qui ne
viendra jamais ressemble, minute après minute, à attendre une livraison
lente.

Cet outil lit D'ABORD la conclusion de la chaîne pour le commit courant. Si
elle a échoué, il nomme l'étape fautive et s'arrête — il n'attend pas. Ce
n'est qu'une fois la chaîne verte qu'il regarde ce que le site sert.

L'API de GitHub est interrogée SANS JETON : le dépôt est public, et les
exécutions de la chaîne y sont lisibles. Aucun secret n'est employé ni requis.

HORS INTÉGRATION CONTINUE : ce contrôle vérifie ce qui se passe APRÈS la
chaîne. L'y brancher serait circulaire — il interrogerait sa propre exécution,
encore en cours, et jugerait d'un déploiement que l'étape suivante n'a pas
encore fait. Il se lance à la main après un push, ou en tâche de fond.
"""

import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.request

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://phenobac.komodi-labo.org"
API = "https://api.github.com/repos/Modibo/phenobac/actions/runs?per_page=10"

# Les fichiers que le navigateur charge. base-connaissances.js et langue.js en
# font partie : une livraison qui ne porterait que sur eux serait invisible
# d'une vérification limitée au moteur et à la page.
SERVIS = ["moteur.js", "base-connaissances.js", "service-worker.js",
          "phenobac.html", "langue.js"]


def empreinte_locale(f):
    with open(os.path.join(RACINE, f), "rb") as h:
        return hashlib.sha256(h.read()).hexdigest()[:16]


def empreinte_servie(f):
    # Le paramètre jetable contourne les caches intermédiaires : sans lui, on
    # compare le dépôt à un cache, et non au site.
    url = "%s/%s?x=%d" % (SITE, f, int(time.time() * 1000) % 1000000)
    req = urllib.request.Request(url, headers={"Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return hashlib.sha256(r.read()).hexdigest()[:16]


def json_distant(url):
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def sha_courant():
    return subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=RACINE).decode().strip()


def execution(sha):
    """L'exécution de la chaîne pour ce commit, ou None si elle n'a pas démarré."""
    for r in json_distant(API).get("workflow_runs", []):
        if r["head_sha"] == sha:
            return r
    return None


def etapes_fautives(run_id):
    url = "https://api.github.com/repos/Modibo/phenobac/actions/runs/%d/jobs" % run_id
    fautes = []
    for j in json_distant(url).get("jobs", []):
        for s in j.get("steps", []):
            if s.get("conclusion") == "failure":
                fautes.append("%s › %s" % (j["name"], s["name"]))
    return fautes


def main():
    attendre = "--attendre" in sys.argv
    sha = sha_courant()
    print("commit courant : %s" % sha[:8])

    # 1. La chaîne, d'abord. Une chaîne rouge ne devient pas verte en attendant.
    limite = time.time() + (15 * 60 if attendre else 0)
    run = None
    while True:
        try:
            run = execution(sha)
        except Exception as e:
            print("  l'API de GitHub est injoignable : %s" % e)
            print("  (le contrôle des empreintes reste possible, pas celui de la chaîne)")
            break
        if run and run["status"] == "completed":
            break
        etat = run["status"] if run else "pas encore démarrée"
        if time.time() >= limite:
            print("  chaîne : %s — verdict non connu" % etat)
            if not attendre:
                print("  (relancez avec --attendre pour patienter jusqu'à 15 min)")
            return 2
        print("  chaîne : %s, on patiente…" % etat)
        time.sleep(20)

    if run and run["status"] == "completed":
        print("  chaîne : %s" % run.get("conclusion"))
        if run.get("conclusion") != "success":
            for f in etapes_fautives(run["id"]):
                print("    ÉCHEC à l'étape : %s" % f)
            print()
            print("  LE DÉPLOIEMENT N'A PAS EU LIEU, et il n'aura pas lieu : l'étape")
            print("  de livraison est conditionnée à la réussite des contrôles.")
            print("  Inutile d'attendre les empreintes.")
            return 1

    # 2. Le site, ensuite.
    print()
    limite = time.time() + (10 * 60 if attendre else 0)
    while True:
        ecarts = []
        for f in SERVIS:
            a = empreinte_locale(f)
            try:
                b = empreinte_servie(f)
            except Exception as e:
                ecarts.append((f, a, "injoignable : %s" % e))
                continue
            if a != b:
                ecarts.append((f, a, b))
        if not ecarts or time.time() >= limite:
            break
        print("  %d fichier(s) pas encore à jour, on patiente…" % len(ecarts))
        time.sleep(15)

    if ecarts:
        print("  LE SITE NE SERT PAS LE DÉPÔT :")
        for f, a, b in ecarts:
            print("    %-24s dépôt %s ≠ servi %s" % (f, a, b))
        return 1

    print("  DÉPLOYÉ — les %d fichiers servis correspondent au dépôt" % len(SERVIS))
    for f in SERVIS:
        print("    %-24s %s" % (f, empreinte_locale(f)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
