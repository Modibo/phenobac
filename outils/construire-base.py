# -*- coding: utf-8 -*-
"""
construire-base.py — fabrique base-connaissances.js à partir des tables du moteur.

    python3 outils/construire-base.py

Cet outil a servi UNE FOIS, pour la bascule : il a lu les vingt-et-une tables
imbriquées de moteur.js et les a aplaties en une base de règles. Il est
conservé parce qu'il documente la correspondance entre l'ancienne forme et la
nouvelle, et parce qu'il permet de refaire la bascule si elle devait être
reprise. Ce n'est PAS lui qui fait foi : c'est base-connaissances.js.

LE MODÈLE

Une règle est identifiée par cinq coordonnées :

    référentiel · groupe bactérien · antibiotique · méthode · site

et porte ce qui en découle : seuils, charge du disque, zone d'incertitude,
molécule témoin, seuil de dépistage, statut officiel ou conventionnel.

Vingt-et-une tables se réduisent ainsi à une seule, parce que la plupart
n'étaient pas des règles distinctes mais des ATTRIBUTS d'un même couple : la
charge du disque, la zone d'incertitude et le statut « hors référentiel »
accompagnent un seuil, ils ne vivent pas à côté de lui. Le contrôle l'a
confirmé avant la bascule — aucune de ces tables ne portait d'entrée
orpheline.
"""
import io
import json
import os
import subprocess
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
JSC = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"

COLONNES = ["ref", "groupe", "abx", "meth", "site", "S", "R",
            "charge", "zit", "temoin", "dep", "conv", "couv", "espece"]


def tables_du_moteur(chemin):
    """Évalue moteur.js et en rend les tables. On lit les VALEURS, pas le
    texte : une table mal relue par une expression régulière produirait une
    base fausse et silencieuse."""
    noms = ["BP", "BP_MENINGE", "BP_CASFM", "BP_CASFM_URIN", "BP_MENINGE_CASFM",
            "DZ", "DZ_MENINGE", "DZ_CASFM", "DZ_CASFM_URIN", "DZ_TEMOIN", "DZ_CASFM_ESPECE",
            "DISQUE", "DISQUE_CASFM", "ZIT", "ZIT_CASFM", "ZIT_ZONE", "ZIT_ZONE_CASFM",
            "HORS_EUCAST", "CASFM_COUVRE", "CASFM_COUVRE_ESPECE", "DEPISTAGE_CASFM"]
    script = ("var self={}; (new Function('self', readFile('%s')))(self);"
              "var M=self.PhenoBacMoteur; var o={};"
              "%s print(JSON.stringify(o));"
              % (chemin, "".join("o['%s']=M.%s;" % (n, n) for n in noms)))
    r = subprocess.run([JSC, "-e", script], capture_output=True, text=True, cwd=RACINE)
    if r.returncode or not r.stdout.strip():
        raise SystemExit("lecture du moteur impossible : " + (r.stderr or "")[:400])
    return json.loads(r.stdout)


def construire(T):
    regles = {}          # (ref, groupe, abx, meth, site) -> dict

    def r(ref, groupe, abx, meth, site):
        return regles.setdefault((ref, groupe, abx, meth, site), {})

    # --- seuils de CMI ---
    for table, ref, site in (("BP", "eucast", "standard"),
                             ("BP_MENINGE", "eucast", "meninge"),
                             ("BP_CASFM", "casfm", "standard"),
                             ("BP_CASFM_URIN", "casfm", "urinaire"),
                             ("BP_MENINGE_CASFM", "casfm", "meninge")):
        for g, t in T[table].items():
            for a, v in t.items():
                d = r(ref, g, a, "cmi", site)
                d["S"], d["R"] = v.get("S"), v.get("R")

    # --- seuils de diamètre, et la charge qui en fait partie ---
    for table, charges, ref, site in (("DZ", "DISQUE", "eucast", "standard"),
                                      ("DZ_MENINGE", "DISQUE", "eucast", "meninge"),
                                      ("DZ_CASFM", "DISQUE_CASFM", "casfm", "standard"),
                                      ("DZ_CASFM_URIN", "DISQUE_CASFM", "casfm", "urinaire")):
        for g, t in T[table].items():
            for a, v in t.items():
                d = r(ref, g, a, "disque", site)
                d["S"], d["R"] = v.get("S"), v.get("R")
                ch = T[charges].get(g, {}).get(a)
                if ch:
                    d["charge"] = ch

    # --- zones d'incertitude : une valeur en CMI, un intervalle au disque ---
    for table, ref, meth in (("ZIT", "eucast", "cmi"), ("ZIT_CASFM", "casfm", "cmi"),
                             ("ZIT_ZONE", "eucast", "disque"), ("ZIT_ZONE_CASFM", "casfm", "disque")):
        for g, t in T[table].items():
            for a, v in t.items():
                r(ref, g, a, meth, "standard")["zit"] = v

    # --- l'amoxicilline se lit sur le disque d'ampicilline ---
    for g, t in T["DZ_TEMOIN"].items():
        for a, v in t.items():
            r("eucast", g, a, "disque", "standard")["temoin"] = v

    # --- dépistages : un seul côté de la catégorie ---
    for g, t in T["DEPISTAGE_CASFM"].items():
        for a, v in t.items():
            r("casfm", g, a, "disque", "standard")["dep"] = v

    # --- restriction d'espèce ---
    for cle, esp in T["DZ_CASFM_ESPECE"].items():
        g, a = cle.split(":")
        r("casfm", g, a, "disque", "standard")["espece"] = esp

    # --- statut : convention de laboratoire, et couverture CA-SFM ---
    for g, l in T["HORS_EUCAST"].items():
        for a in l:
            r("eucast", g, a, "cmi", "standard")["conv"] = True
    for g, l in T["CASFM_COUVRE"].items():
        for a in l:
            esp = T["CASFM_COUVRE_ESPECE"].get(g + ":" + a)
            r("eucast", g, a, "cmi", "standard")["couv"] = esp if esp else True

    lignes = []
    for (ref, g, a, meth, site), d in sorted(regles.items()):
        lignes.append([ref, g, a, meth, site,
                       d.get("S", ABSENT), d.get("R", ABSENT),
                       d.get("charge", ABSENT), d.get("zit", ABSENT),
                       d.get("temoin", ABSENT), d.get("dep", ABSENT),
                       d.get("conv", ABSENT), d.get("couv", ABSENT),
                       d.get("espece", ABSENT)])
    return lignes


class Absent(object):
    """Distinct de None. « null » veut dire « aucune catégorie sensible » —
    une décision du comité — tandis que l'absence veut dire qu'il n'y a pas
    de seuil du tout. Les confondre créerait des règles qui n'existent pas :
    la ligne de l'amoxicilline, qui ne porte qu'un témoin, deviendrait un
    seuil {S:null, R:null} et le renvoi vers le disque d'ampicilline serait
    perdu."""
    pass


ABSENT = Absent()


def js(v):
    if isinstance(v, Absent):
        return "undefined"
    if v is None:
        return "null"
    if v is True:
        return "true"
    if isinstance(v, str):
        return '"%s"' % v
    if isinstance(v, list):
        return "[" + ",".join(js(x) for x in v) + "]"
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return repr(v)


def main():
    T = tables_du_moteur("moteur.js")
    lignes = construire(T)

    sortie = os.path.join(RACINE, "base-connaissances.js")
    with io.open(sortie, "w", encoding="utf-8") as f:
        f.write(ENTETE % {"n": len(lignes), "cols": ", ".join('"%s"' % c for c in COLONNES)})
        for l in lignes:
            f.write("[" + ",".join(js(v) for v in l) + "],\n")
        f.write(PIED)
    print("base-connaissances.js : %d règles" % len(lignes))
    return 0


ENTETE = u'''// base-connaissances.js — les règles, en données.
//
// CE FICHIER FAIT FOI. Le moteur ne contient plus de seuil : il reconstruit
// ses tables à partir d'ici, au chargement. Mettre à jour un référentiel ne
// demande donc plus de toucher à l'application.
//
// UNE RÈGLE EST IDENTIFIÉE PAR CINQ COORDONNÉES
//
//   référentiel · groupe bactérien · antibiotique · méthode · site
//
// et porte ce qui en découle. Les colonnes, dans l'ordre :
//
//   ref     eucast | casfm
//   groupe  groupe de seuils (entero, staph, pneumo…)
//   abx     code de l'antibiotique
//   meth    cmi | disque
//   site    standard | meninge | urinaire
//   S, R    seuils. « null » en S signifie AUCUNE catégorie « sensible » à
//           posologie standard : c'est une décision du comité, pas une valeur
//           manquante. « undefined » signifie qu'il n'y a pas de seuil du
//           tout. La distinction est essentielle — les confondre ferait
//           d'une ligne qui ne porte qu'un témoin un seuil {S:null, R:null},
//           et le renvoi vers le disque d'ampicilline serait perdu
//   charge  charge du disque. Un diamètre ne veut rien dire sans elle
//   zit     zone d'incertitude technique : une valeur en CMI, un intervalle
//           [bas, haut] au disque
//   temoin  molécule dont on lit le disque à la place (amoxicilline sur
//           ampicilline, chez les entérobactéries et à l'EUCAST seulement)
//   dep     seuil de DÉPISTAGE : au-dessus on conclut « sensible », en
//           dessous on ne conclut pas. Ce n'est pas un seuil clinique
//   conv    le référentiel ne fixe RIEN pour ce couple ; la valeur est une
//           convention de laboratoire, et l'interface le dit
//   couv    le CA-SFM couvre ce couple que l'EUCAST laisse sans seuil.
//           true, ou la liste des espèces concernées
//   espece  restriction d'espèce (la céfoxitine, chez E. coli seulement)
//
// PROVENANCE. Elle est portée par référentiel, dans SOURCES ci-dessous :
// document, version et date de validité. La page précise de chaque
// différence CA-SFM reste dans REFERENTIEL-CASFM.md ; elle n'a pas été
// recopiée ici, parce qu'une page fausse serait pire que pas de page.
//
// Produit une première fois par outils/construire-base.py à partir des
// tables du moteur, puis maintenu ici. outils/verifier-tables.py échoue si
// les tables reconstruites s'écartent de ce que le client affiche, et
// outils/comparer-eucast.py si elles s'écartent du classeur officiel.

(function (racine) {
"use strict";

const SOURCES = {
  eucast: { nom: "EUCAST", version: "16.1", publie: "2026-06-24",
            document: "Breakpoint tables for interpretation of MICs and zone diameters, v16.1" },
  casfm:  { nom: "CA-SFM", version: "2026", publie: "2026-09-01",
            document: "Recommandations CA-SFM / EUCAST, version 2026" }
};

// Version de la base elle-même, distincte de celle de l'application : elle
// change dès qu'une règle change, et accompagne chaque compte rendu.
const BASE_VERSION = "2026.10";

const COLONNES = [%(cols)s];

/* %(n)d règles. */
const REGLES = [
'''

PIED = u'''];

/* Chaque ligne redevient un objet nommé : le moteur n'a pas à connaître
   l'ordre des colonnes, et en ajouter une ne casse rien. */
function enObjets(lignes) {
  return lignes.map(function (l) {
    const o = {};
    for (let i = 0; i < COLONNES.length; i++) o[COLONNES[i]] = l[i];
    return o;
  });
}

const BASE = { SOURCES, BASE_VERSION, COLONNES, REGLES, regles: enObjets(REGLES) };

if (typeof module !== "undefined" && module.exports) module.exports = BASE;
else racine.PhenoBacBase = BASE;

})(typeof self !== "undefined" ? self : this);
'''

if __name__ == '__main__':
    sys.exit(main())
