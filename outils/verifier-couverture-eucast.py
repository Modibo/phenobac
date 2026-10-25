# -*- coding: utf-8 -*-
"""
verifier-couverture-eucast.py — la base dit-elle TOUT ce que le classeur dit ?

HORS INTÉGRATION CONTINUE : il lui faut le classeur officiel de l'EUCAST
(2,7 Mo, licence EUCAST), qui n'est pas dans le dépôt et que le serveur de
l'EUCAST ne laisse pas télécharger automatiquement. Il se lance à la main, le
document sous les yeux, et son résultat est consigné dans CONFRONTATIONS.md —
où outils/verifier-confrontations.py recalcule l'empreinte des tables à chaque
livraison et ARRÊTE la chaîne si elles ont bougé depuis. C'est là qu'est le
garde-fou, pas ici.

LE DÉFAUT QUE CE CONTRÔLE EXISTE POUR ATTRAPER

outils/comparer-eucast.py confronte les seuils de PhénoBac à ceux du
classeur. C'est précieux, mais cela ne va que dans UN SENS : il part de ce
que la base porte. Ce que le document chiffre et que la base ne porte pas
lui est invisible. Et il ne lit que les CMI — la moitié diamètre n'était
confrontée à rien.

Le 24 octobre 2026, cette moitié manquante s'est vue : l'EUCAST v16.1 donne
sept diamètres pour Bacteroides fragilis (amoxicilline-clavulanate,
pipéracilline-tazobactam, ertapénème, imipénème, méropénème, clindamycine,
métronidazole) et PhénoBac n'en portait AUCUN. Un laboratoire qui travaille
au disque — c'est-à-dire presque tous ceux auxquels PhénoBac s'adresse — ne
pouvait rien rendre sur l'anaérobie le plus fréquent des suppurations
abdominales. Rien ne le disait. Tout était « vert ».

CE QUE FAIT CE CONTRÔLE

Il relit les tables du classeur par outils/extraire-especes.py — la même
lecture mécanique qui a servi à les écrire — et confronte ligne à ligne,
dans les DEUX SENS, CMI ET DISQUE :

  · une règle du document absente de la base  -> MANQUE
  · une règle de la base absente du document  -> EN TROP, sauf si elle porte
    le drapeau « conv » : une convention de laboratoire assumée, que
    l'interface annonce comme telle
  · une règle présente des deux côtés mais différente -> ÉCART

Il ne corrige rien. Changer un seuil est une décision de biologiste.

    python3 outils/verifier-couverture-eucast.py [classeur.xlsx]

Sans classeur, il cherche celui que CONFRONTATIONS.md désigne, et s'il ne le
trouve pas il le DIT et rend 0 : la chaîne d'intégration continue n'a pas le
document sous la main, et un contrôle qui ne peut pas tourner doit le dire
plutôt que de faire semblant.
"""
import importlib.util
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
sys.path.insert(0, ICI)
from classeur import Classeur                                 # noqa: E402

# Emplacements où le classeur peut avoir été déposé. Son URL est dans
# CONFRONTATIONS.md ; on ne le télécharge pas depuis un contrôle.
CANDIDATS = [
    "/tmp/eucast161/v_16.1_Breakpoint_Tables.xlsx",
    os.path.join(RACINE, "documents", "v_16.1_Breakpoint_Tables.xlsx"),
]


def extracteur():
    s = importlib.util.spec_from_file_location(
        "extraire_especes", os.path.join(ICI, "extraire-especes.py"))
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


def regles_de_la_base():
    """Les lignes de base-connaissances.js, par groupe, telles qu'écrites."""
    s = open(os.path.join(RACINE, "base-connaissances.js"), encoding="utf-8").read()
    par_groupe = {}
    for l in s.splitlines():
        if not l.startswith('["eucast",'):
            continue
        g = re.match(r'^\["eucast","([a-z0-9]+)"', l).group(1)
        par_groupe.setdefault(g, []).append(l.split("//")[0].strip())
    return par_groupe


def champs(l):
    return re.findall(r'\[[^\[\]]*\]|"[^"]*"|null|undefined|true|false|[-\d.]+',
                      l.rstrip(",").lstrip("[").rstrip("]"))


def cle(l):
    """Les cinq coordonnées : référentiel, groupe, antibiotique, méthode, site."""
    return tuple(champs(l)[:5])


def valeur(l):
    """Tout le reste : c'est là que se logent les écarts."""
    return tuple(champs(l)[5:])


def main():
    chemin = None
    for a in sys.argv[1:]:
        if a.endswith(".xlsx"):
            chemin = a
    if not chemin:
        chemin = next((p for p in CANDIDATS if os.path.isfile(p)), None)
    if not chemin:
        print("Classeur EUCAST absent de ce poste — contrôle NON EXÉCUTÉ.")
        print("  Il se télécharge à l'adresse citée dans CONFRONTATIONS.md, puis :")
        print("    python3 outils/verifier-couverture-eucast.py <classeur.xlsx>")
        print("  Ce n'est pas un succès : c'est un contrôle qui n'a pas eu lieu.")
        return 0

    E = extracteur()
    c = Classeur(chemin)
    base = regles_de_la_base()

    manques, en_trop, ecarts = [], [], []
    lues = 0

    for feuille, titre, groupe, espece in E.TABLES:
        attendues, _notes = E.regles(c, feuille, titre, groupe, espece)
        attendues = [a.split("//")[0].strip() for a in attendues]
        lues += len(attendues)
        doc = {cle(a): a for a in attendues}
        app = {cle(b): b for b in base.get(groupe, [])}

        for k, a in sorted(doc.items()):
            if k not in app:
                manques.append((groupe, a))
            elif valeur(a) != valeur(app[k]):
                ecarts.append((groupe, a, app[k]))
        for k, b in sorted(app.items()):
            if k in doc:
                continue
            # « conv » (colonne 12) : convention de laboratoire assumée, que
            # l'interface annonce. Elle a le droit de n'être pas dans le
            # document — c'est tout son objet.
            ch = champs(b)
            if len(ch) > 11 and ch[11] == "true":
                continue
            en_trop.append((groupe, b))

    print("Classeur lu : %s" % chemin)
    print("%d règle(s) attendues par le document, sur %d table(s)."
          % (lues, len(E.TABLES)))

    if manques:
        print("\n=== LE DOCUMENT LE DONNE, LA BASE NE L'A PAS (%d) ===" % len(manques))
        print("Ce sont des molécules que le laboratoire ne peut pas rendre.")
        for g, a in manques:
            print("  %-14s %s" % (g, a))
    if en_trop:
        print("\n=== LA BASE LE PORTE, LE DOCUMENT NE LE DONNE PAS (%d) ===" % len(en_trop))
        print("Sans le drapeau « conv », c'est un seuil dont on ignore la source.")
        for g, b in en_trop:
            print("  %-14s %s" % (g, b))
    if ecarts:
        print("\n=== MÊME COUPLE, VALEURS DIFFÉRENTES (%d) ===" % len(ecarts))
        print("À corriger APRÈS validation par un biologiste.")
        for g, a, b in ecarts:
            print("  %-14s document : %s" % (g, a))
            print("  %-14s base     : %s" % ("", b))

    n = len(manques) + len(en_trop) + len(ecarts)
    if n:
        print("\n%d écart(s). Aucun fichier n'a été modifié." % n)
        return 1
    print("\nAucun écart : pour ces %d tables, la base dit exactement ce que "
          "dit le classeur,\nen CMI comme au disque." % len(E.TABLES))
    return 0


if __name__ == '__main__':
    sys.exit(main())
