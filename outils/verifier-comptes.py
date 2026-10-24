# -*- coding: utf-8 -*-
"""
verifier-comptes.py — un nombre écrit à la main finit par mentir.

LE DÉFAUT QUE CE CONTRÔLE EXISTE POUR ATTRAPER

« 37 espèces » était écrit à la main en huit endroits de la page et deux du
README. Le jour où deux entérobactéries ont été ajoutées à l'interprétation,
les dix sont devenus faux EN MÊME TEMPS — et personne ne l'aurait vu : un
texte ne tombe jamais au rouge. Le visiteur, lui, lisait « 37 espèces » sur
une page qui en interprétait 39.

Le même piège vaut pour le nombre de cas d'entraînement, de règles, de
molécules : tout compte recopié est un compte qui dérive.

La page les calcule désormais sur les tables elles-mêmes (N_INTERP, N_ID,
QUIZ_BANK.length). Ce contrôle interdit d'en réécrire un à la main, et
vérifie au passage que les deux comptes ne se confondent pas : interpréter
une espèce demande ses seuils, l'identifier demande son profil biochimique —
Morganella et Providencia ont les premiers, pas le second.

    python3 outils/verifier-comptes.py
"""
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
PAGE = os.path.join(RACINE, "phenobac.html")

# Ce qu'on refuse : un nombre collé à l'un de ces noms, dans du texte DESTINÉ
# À ÊTRE LU. Les commentaires du code racontent l'histoire du défaut et ont le
# droit de citer l'ancien chiffre.
COMPTES = r"\b\d{2,4}\s+(espèces|cas|règles|molécules|phénotypes)\b"


def hors_commentaire(src):
    r"""Le source privé de ses commentaires — HTML, CSS, JavaScript.

    Les commentaires racontent l'histoire des défauts et ont le droit de citer
    l'ancien chiffre : « 37 espèces était écrit à la main en dix endroits ».
    Les oublier faisait échouer ce contrôle sur sa propre explication.

    Le découpage se fait LIGNE À LIGNE, et non par expression régulière sur
    tout le fichier : « /\*.*?\*/ » appariait un « /* » venu d'une chaîne de
    caractères avec le « */ » d'un vrai commentaire, et laissait passer tout
    ce qu'il y avait entre les deux — dont, précisément, l'explication de ce
    contrôle-ci."""
    out, bloc = [], False
    for ligne in src.splitlines():
        nu = ligne
        if bloc:
            if "*/" in nu:
                nu, bloc = nu.split("*/", 1)[1], False
            else:
                continue
        while "/*" in nu:
            avant, reste = nu.split("/*", 1)
            if "*/" in reste:
                nu = avant + " " + reste.split("*/", 1)[1]
            else:
                nu, bloc = avant, True
                break
        nu = re.sub(r"<!--.*?-->", " ", nu)
        if "<!--" in nu:
            nu = nu.split("<!--", 1)[0]
        nu = re.sub(r"(?m)^\s*//.*$", " ", nu)
        out.append(nu)
    return "\n".join(out)


def nombres_du_moteur():
    """Le nombre d'espèces, pris sur le moteur tel qu'il s'exécute.

    PREMIÈRE VERSION : un appel direct à jsc, qui n'existe que sur macOS.
    Elle passait au vert sur le poste et faisait tomber la chaîne sous Linux,
    où jsc n'existe pas — exactement l'angle mort que essai-chargement.js
    surveille pour les bancs JavaScript, et que je venais de rouvrir côté
    Python. moteur_py sait choisir node ou jsc selon ce qui est là ; on passe
    par lui."""
    sys.path.insert(0, ICI)
    import moteur_py as MP                                   # noqa: E402
    orgs = MP.tables(["ORG"])["ORG"]
    return {"org": len(orgs)}


def main():
    with open(PAGE, encoding="utf-8") as f:
        page = f.read()
    ecarts, dits = [], []

    # --- 1. Aucun compte écrit à la main dans le texte lu ---
    nu = hors_commentaire(page)
    durs = sorted(set(m.group(0).strip() for m in re.finditer(COMPTES, nu)))
    if durs:
        ecarts.append("des comptes sont écrits à la main dans la page : %s. "
                      "Le jour où la table change, ils mentent tous en même temps — "
                      "et un texte ne tombe jamais au rouge. Calculez-les "
                      "(N_INTERP, N_ID, QUIZ_BANK.length)." % ", ".join("« %s »" % d for d in durs))
    else:
        dits.append("aucun compte n'est écrit à la main dans le texte de la page.")

    # --- 2. Les deux comptes existent et sont calculés ---
    for nom, source in (("N_INTERP", r"const N_INTERP\s*=\s*Object\.keys\(ORG\)\.length"),
                        ("N_ID", r"const N_ID\s*=\s*Object\.keys\(IDDB\)\.length")):
        if not re.search(source, page):
            ecarts.append("%s n'est plus calculé sur sa table : le compte redeviendrait "
                          "une valeur à tenir à jour." % nom)
    if not ecarts:
        n = nombres_du_moteur()
        iddb = len(re.findall(r"\n  (\w+):\s*\{\s*gram:", page))
        dits.append("%d espèces interprétées, %d identifiées — les deux comptes sont "
                    "distincts, et c'est voulu : interpréter demande des seuils, "
                    "identifier demande un profil biochimique."
                    % (n["org"], iddb))
        if iddb > n["org"]:
            ecarts.append("plus d'espèces identifiables (%d) qu'interprétables (%d) : "
                          "une espèce qu'on sait nommer mais pas interpréter laisse le "
                          "biologiste sans rendu." % (iddb, n["org"]))

    # --- 3. Les ancres de la page statique sont bien remplies ---
    if 'data-compte=' in page and "el.dataset.compte" not in page:
        ecarts.append("la page porte des ancres data-compte que rien ne remplit : "
                      "elles resteraient sur leurs points de suspension.")

    if ecarts:
        print("DES COMPTES PEUVENT MENTIR :")
        for e in ecarts:
            print("  -", e)
        return 1
    print("Les comptes affichés sont calculés sur les tables.")
    for d in dits:
        print("  ·", d)
    return 0


if __name__ == '__main__':
    sys.exit(main())
