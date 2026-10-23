# -*- coding: utf-8 -*-
"""
verifier-horsligne.py — l'application tiendra-t-elle encore sans réseau ?

LE DÉFAUT QUE CE CONTRÔLE EXISTE POUR ATTRAPER

PhénoBac a été écrite pour des laboratoires où la connexion est intermittente.
Le § 20 du cahier des charges demande que l'identification, l'antibiogramme,
les seuils, le moteur expert, le contrôle qualité, la formation et le compte
rendu fonctionnent une fois l'application installée, sans réseau.

Tout cela repose sur une liste de huit chemins, SHELL, dans service-worker.js.
Et cette liste se casse de deux façons, toutes deux SILENCIEUSES :

  1. un fichier ajouté à la page et oublié dans SHELL. En ligne, rien ne
     paraît — le réseau le sert. Hors ligne, il manque, et c'est précisément
     le jour où l'on en a besoin qu'on découvre qu'il n'est pas là ;

  2. un chemin de SHELL qui ne correspond à aucun fichier. Celui-là est pire.
     `cache.addAll()` est ATOMIQUE : si un seul des huit chemins répond 404,
     la promesse est rejetée et AUCUN des huit n'est mis en cache. Le code
     avale ce rejet (« .catch(() => {}) ») pour ne pas empêcher
     l'installation — ce qui est le bon choix, mais signifie qu'une faute de
     frappe dans un chemin laisse l'application entièrement sans cache, sans
     la moindre erreur visible. Elle marche parfaitement… jusqu'à la première
     coupure.

Ce contrôle lit la page et le service worker, et confronte les deux listes.

    python3 outils/verifier-horsligne.py
"""
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)

PAGE = os.path.join(RACINE, "phenobac.html")
SW = os.path.join(RACINE, "service-worker.js")

# Ressources extérieures connues et ASSUMÉES. Les polices ne sont pas mises en
# cache par le service worker : hors ligne, le navigateur retombe sur ses
# polices système. C'est un défaut d'apparence, jamais de lecture — aucune
# valeur, aucun seuil, aucune catégorie n'en dépend. Toute AUTRE dépendance
# extérieure qui apparaîtrait serait signalée : une application qui se dit
# hors-ligne ne peut pas tenir à un serveur qu'elle ne contrôle pas.
EXTERIEURES_ASSUMEES = {
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
}


def lire(chemin):
    with open(chemin, encoding="utf-8") as f:
        return f.read()


def ressources_de_la_page(page):
    """Tout ce que la page charge par src= ou href=, hors données en ligne et
    hors gabarits de modèle (${…}), qui ne sont pas des chemins."""
    brut = re.findall(r'(?:src|href)="([^"]+)"', page)
    out = set()
    for r in brut:
        if r.startswith("data:") or "${" in r or r.startswith("#"):
            continue
        out.add(r)
    return out


def shell_du_worker(sw):
    i = sw.index("const SHELL")
    j = sw.index("];", i)
    return [c for c in re.findall(r'"([^"]+)"', sw[i:j])]


def version_du_worker(sw):
    m = re.search(r'const VERSION\s*=\s*"([^"]+)"', sw)
    return m.group(1) if m else None


def main():
    page, sw = lire(PAGE), lire(SW)
    ecarts, dits = [], []

    shell = shell_du_worker(sw)
    version = version_du_worker(sw)
    if not version:
        ecarts.append("service-worker.js n'a plus de constante VERSION : sans elle, "
                      "le cache ne change jamais de nom et aucune livraison n'atteint "
                      "un poste où l'application est installée.")

    # --- 1. Chaque chemin de SHELL existe-t-il réellement ? ---
    # Le contrôle le plus important du fichier : un seul 404 vide tout le cache.
    manquants = []
    for chemin in shell:
        if chemin == "/":
            continue                       # servi par phenobac.html, vérifié à part
        p = os.path.join(RACINE, chemin.lstrip("/"))
        if not os.path.isfile(p):
            manquants.append(chemin)
    if manquants:
        ecarts.append("SHELL cite des fichiers qui n'existent pas : %s. "
                      "cache.addAll() est atomique : un seul 404 et RIEN n'est mis en "
                      "cache, sans erreur visible. L'application marcherait jusqu'à la "
                      "première coupure." % ", ".join(manquants))
    else:
        dits.append("les %d chemins de SHELL correspondent tous à un fichier présent."
                    % len(shell))

    # --- 2. Tout ce que la page charge est-il en cache ? ---
    ressources = ressources_de_la_page(page)
    internes = {r for r in ressources if not r.startswith("http")}
    exterieures = {r for r in ressources if r.startswith("http")}

    def normalise(r):
        return "/" + r.lstrip("/")

    hors_cache = sorted(r for r in internes if normalise(r) not in shell)
    if hors_cache:
        ecarts.append("la page charge des fichiers absents de SHELL : %s. "
                      "En ligne rien ne paraîtrait ; hors ligne ils manqueraient."
                      % ", ".join(hors_cache))
    else:
        dits.append("les %d ressources de même origine chargées par la page sont "
                    "toutes en cache (%s)."
                    % (len(internes), ", ".join(sorted(internes))))

    # --- 3. Une dépendance extérieure nouvelle ? ---
    inconnues = sorted(e for e in exterieures
                       if not any(e.startswith(a) for a in EXTERIEURES_ASSUMEES))
    if inconnues:
        ecarts.append("la page dépend de serveurs extérieurs non assumés : %s. "
                      "Hors ligne, ils ne répondront pas. S'il s'agit d'un agrément "
                      "d'apparence, ajoutez-le à EXTERIEURES_ASSUMEES en disant "
                      "pourquoi ; s'il porte une donnée, il n'a pas sa place dans une "
                      "application hors-ligne." % ", ".join(inconnues))
    else:
        dits.append("seules les polices sont extérieures ; hors ligne, le navigateur "
                    "retombe sur les siennes et aucune valeur n'en dépend.")

    # --- 4. Le moteur et la base sont-ils bien du voyage ? ---
    # Sans eux, l'application s'ouvrirait hors ligne sans pouvoir interpréter,
    # c'est-à-dire sans faire ce pour quoi elle existe.
    for indispensable in ("/moteur.js", "/base-connaissances.js", "/phenobac.html"):
        if indispensable not in shell:
            ecarts.append("%s n'est pas dans SHELL : l'application s'ouvrirait hors "
                          "ligne sans pouvoir interpréter." % indispensable)

    if ecarts:
        print("LE FONCTIONNEMENT HORS LIGNE N'EST PLUS GARANTI :")
        for e in ecarts:
            print("  -", e)
        return 1

    print("L'application tient sans réseau (cache « %s »)." % version)
    for d in dits:
        print("  ·", d)
    return 0


if __name__ == '__main__':
    sys.exit(main())
