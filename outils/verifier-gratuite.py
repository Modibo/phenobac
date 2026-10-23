# -*- coding: utf-8 -*-
"""
verifier-gratuite.py — l'application tient-elle la promesse qu'elle affiche ?

PhénoBac écrit sur sa page d'accueil :

    GRATUIT · SANS COMPTE · SANS LICENCE

Ce n'est pas un argument de vente, c'est un engagement envers des
laboratoires qui n'ont pas de budget logiciel. Il doit donc être vérifiable
autrement que par la bonne volonté de celui qui modifie le code.

L'infrastructure de licence existe toujours — signature, révocation, modale
d'activation — et c'est délibéré : des licences d'ÉTABLISSEMENT pourraient
être émises un jour pour un usage institutionnel. Elle est simplement
DORMANTE : `isPremium()` rend true sans condition, et le serveur accorde
tout (`FREE_SPECIES = null`).

Une infrastructure dormante se réveille par accident. Il suffit d'une
condition réintroduite dans `isPremium()`, ou d'une liste d'espèces remise
dans le serveur, pour que la page continue d'annoncer « sans licence »
pendant que l'application en réclame une. Ce contrôle l'empêche.

Il vérifie aussi que les messages dormants ne MENTENT pas. Un texte qui
annonce une fonction payante, même inatteignable, sera cru le jour où il
s'affichera — c'est exactement ainsi qu'un contrat d'API périmé a trompé
pendant des mois.

    python3 outils/verifier-gratuite.py
"""
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)

PAGE = os.path.join(RACINE, "phenobac.html")
PORTE = os.path.join(RACINE, "netlify", "functions", "premium-interpret.js")

# Formules par lesquelles un message annoncerait un verrou. Elles sont
# cherchées dans les CHAÎNES affichées, pas dans les commentaires : un
# commentaire qui explique pourquoi rien n'est payant doit rester possible.
VERROUS = [
    r"fonction Premium",
    r"Premium requise?",
    r"licence valide est requise",
    r"fait partie de PhénoBac Premium",
    r"pour retrouver Premium",
    r"Débloquer",
]


def lire(chemin):
    with open(chemin, encoding="utf-8") as f:
        return f.read()


def sans_commentaires(js):
    """Retire les commentaires de ligne. Grossier — il ne distingue pas un
    « // » dans une chaîne —, mais il ne sert qu'à éviter de reprocher à un
    commentaire ce qu'on reproche à un message."""
    return "\n".join(re.sub(r"//.*$", "", l) for l in js.split("\n"))


def main():
    page, porte = lire(PAGE), lire(PORTE)
    ecarts, dits = [], []

    # --- 1. La promesse est-elle bien affichée ? ---
    # Si elle disparaissait, le reste de ce contrôle n'aurait plus d'objet —
    # et il vaut mieux s'en apercevoir que vérifier dans le vide.
    promesse = re.search(r"[Gg]ratuit,?\s*sans compte,?\s*sans licence", page)
    if not promesse:
        ecarts.append("la page n'affiche plus « Gratuit, sans compte, sans licence ». "
                      "Si la promesse a changé, ce contrôle doit changer avec elle — "
                      "il ne doit pas continuer à vérifier un engagement retiré.")
    else:
        dits.append("la page affiche « %s »." % promesse.group(0))

    # --- 2. isPremium() rend-il true sans condition ? ---
    m = re.search(r"function isPremium\(\)\s*\{([^}]*)\}", page)
    if not m:
        ecarts.append("isPremium() est introuvable.")
    else:
        corps = m.group(1).strip()
        if not re.fullmatch(r"return\s+true\s*;?", corps):
            ecarts.append("isPremium() n'est plus inconditionnel : « %s ». "
                          "La page promet pourtant « sans licence ». Si des licences "
                          "d'établissement sont réintroduites, la promesse affichée doit "
                          "changer en même temps." % corps)
        else:
            dits.append("isPremium() rend true sans condition : aucune fonction n'est verrouillée.")

    # --- 3. Le serveur accorde-t-il tout ? ---
    m = re.search(r"const FREE_SPECIES\s*=\s*([^;]+);", porte)
    if not m:
        ecarts.append("FREE_SPECIES est introuvable dans premium-interpret.js.")
    elif m.group(1).strip() != "null":
        ecarts.append("le serveur restreint les espèces gratuites (FREE_SPECIES = %s) "
                      "alors que la page promet « sans licence ». Le client serait plus "
                      "permissif que le serveur : l'utilisateur verrait une interprétation "
                      "commencer puis être refusée." % m.group(1).strip())
    else:
        dits.append("le serveur accorde l'interprétation à toutes les espèces (FREE_SPECIES = null).")

    # --- 4. Aucun message n'annonce un verrou ---
    propre = sans_commentaires(page)
    trouves = []
    for motif in VERROUS:
        for mm in re.finditer(motif, propre):
            debut = max(0, mm.start() - 60)
            trouves.append(propre[debut:mm.end() + 40].replace("\n", " ").strip())
    if trouves:
        ecarts.append("des messages annoncent une fonction payante, que PhénoBac n'a pas : %s. "
                      "Même inatteignable, un tel texte sera cru le jour où il s'affichera."
                      % " | ".join(t[:90] for t in trouves[:4]))
    else:
        dits.append("aucun message n'annonce de fonction payante ni de déblocage.")

    # --- 5. Chaque appel à openUpgrade reste hors d'atteinte ---
    # La modale d'activation garde sa raison d'être — une licence
    # d'établissement —, mais elle ne doit plus s'ouvrir en barrant une route.
    # La garde ne se trouve pas forcément sur la même ligne que l'appel : un
    # « if(...) { » peut la porter trois lignes plus haut. On regarde donc une
    # fenêtre, faute de quoi le contrôle reprocherait à un appel correctement
    # gardé de ne pas l'être — et, à force de faux reproches, on le désactive.
    lignes = propre.split("\n")
    suspects = []
    for i, l in enumerate(lignes):
        if "openUpgrade(" not in l or "function openUpgrade" in l:
            continue
        # Les lignes VIDES ne comptent pas : les commentaires retirés plus haut
        # en laissent, et une fenêtre comptée en lignes brutes s'arrêterait
        # avant la garde, à quatre commentaires d'explication près.
        avant, j = [], i - 1
        while j >= 0 and len(avant) < 6:
            if lignes[j].strip():
                avant.append(lignes[j])
            j -= 1
        fenetre = "\n".join(avant) + "\n" + l
        garde = re.search(r"isPremium\(\)|expired|reason|onclick|=>", fenetre)
        if not garde:
            suspects.append(l.strip())
    ouvertures = [l for l in lignes if "openUpgrade(" in l and "function openUpgrade" not in l]
    if suspects:
        ecarts.append("la modale d'activation s'ouvre sans garde de licence : %s"
                      % " | ".join(s[:90] for s in suspects[:3]))
    else:
        dits.append("les %d ouvertures de la modale sont gardées ou déclenchées par "
                    "l'utilisateur ; aucune ne barre une route." % len(ouvertures))

    if ecarts:
        print("L'APPLICATION NE TIENT PLUS LA PROMESSE QU'ELLE AFFICHE :")
        for e in ecarts:
            print("  -", e)
        return 1

    print("GRATUIT · SANS COMPTE · SANS LICENCE — et le code le confirme.")
    for d in dits:
        print("  ·", d)
    return 0


if __name__ == '__main__':
    sys.exit(main())
