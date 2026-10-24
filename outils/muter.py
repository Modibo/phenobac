# -*- coding: utf-8 -*-
"""
muter.py — la suite de contrôles mord-elle vraiment ?

LE DÉFAUT QUE CET OUTIL EXISTE POUR ATTRAPER

Un banc qui passe ne prouve rien. Il faut qu'il ÉCHOUE quand le code se
trompe — et cela, aucun banc ne le dit de lui-même. Quatre fois cette
semaine, un contrôle de ce dépôt a affirmé une protection qu'il n'exerçait
pas : le garde-fou des alertes du rendu ciblé, les deux bornes des notes de
la HAS, et la confrontation des arguments à l'antibiogramme, qui ne POUVAIT
pas échouer. Les quatre ont été trouvés par hasard, en écrivant autre chose.

Cet outil les cherche exprès. Il abîme le moteur d'une façon précise — un
seuil doublé, une comparaison inversée, un « et » devenu « ou » — puis il
lance toute la suite. Si rien ne tombe, la mutation a SURVÉCU : il existe
une façon de se tromper que personne ne verrait.

Un survivant n'est pas toujours une faute. Certaines mutations ne changent
rien (code mort, condition équivalente). C'est pourquoi l'outil rend la
LISTE, avec le fichier et la ligne, et laisse juger.

Le dépôt n'est jamais modifié : tout se passe sur une copie.

    python3 outils/muter.py                 # échantillon par défaut
    python3 outils/muter.py --tout          # toutes les mutations possibles
    python3 outils/muter.py --n 40 --graine 7
"""
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
JSC = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"

CIBLES = ["moteur.js"]

# Les façons de se tromper que l'on sait écrire sans y penser. Chaque motif
# porte son nom, parce qu'un rapport qui dit « mutation 37 » ne sert à rien.
OPERATEURS = [
    ("comparaison >= devenue >", r">=", ">"),
    ("comparaison <= devenue <", r"<=", "<"),
    ("égalité stricte inversée", r"===", "!=="),
    ("inégalité stricte inversée", r"!==", "==="),
    ("« et » devenu « ou »", r"&&", "||"),
    ("« ou » devenu « et »", r"\|\|", "&&"),
]

# Les littéraux numériques : un seuil déplacé d'un facteur dix est l'erreur
# la plus grave et la plus facile à commettre.
NOMBRE = re.compile(r"(?<![\w.])(\d+(?:\.\d+)?)(?![\w.])")


def sites(src):
    """[(nom, début, fin, remplacement)] — tous les points mutables."""
    out = []
    for nom, motif, remplacement in OPERATEURS:
        for m in re.finditer(motif, src):
            out.append((nom, m.start(), m.end(), remplacement))
    for m in NOMBRE.finditer(src):
        v = m.group(1)
        if v in ("0", "1", "2"):            # indices et compteurs : trop de bruit
            continue
        out.append(("seuil %s porté à %s" % (v, float(v) * 10),
                    m.start(), m.end(), str(int(float(v) * 10))))
    return out


def masque_code(src):
    """True aux positions qui sont du CODE — ni commentaire, ni chaîne.

    Muter un commentaire ne prouve rien ; muter un nombre dans une phrase
    affichée au biologiste non plus. Ma première version comptait les « /* »
    et cherchait « // » dans la ligne : elle laissait passer les nombres des
    chaînes de caractères — « réincubée à 24 h » s'est retrouvé muté en
    « 240 h », et comptait comme un survivant alors qu'il n'y avait là aucune
    règle à protéger. On fait donc un vrai balayage d'états."""
    n = len(src)
    ok = bytearray(n)
    i, etat, delim = 0, "code", ""
    while i < n:
        c = src[i]
        deux = src[i:i + 2]
        if etat == "code":
            if deux == "//":
                etat, i = "ligne", i + 2
                continue
            if deux == "/*":
                etat, i = "bloc", i + 2
                continue
            if c in "\"'`":
                etat, delim, i = "chaine", c, i + 1
                continue
            ok[i] = 1
            i += 1
        elif etat == "ligne":
            if c == "\n":
                etat = "code"
            i += 1
        elif etat == "bloc":
            if deux == "*/":
                etat, i = "code", i + 2
                continue
            i += 1
        else:                                   # chaîne
            if c == "\\":
                i += 2
                continue
            if c == delim:
                etat = "code"
            i += 1
    return ok


def suite(dossier):
    """Lance la suite dans le dossier donné. True si QUELQUE CHOSE tombe."""
    bancs = sorted(f for f in os.listdir(os.path.join(dossier, "outils"))
                   if f.startswith("essai-") and f.endswith(".js"))
    for b in bancs:
        if b == "essai-chargement.js":
            continue                        # ne vaut que sous jsc, et simule Node
        p = subprocess.run([JSC, "outils/" + b], cwd=dossier,
                           capture_output=True, text=True, timeout=120)
        if p.returncode != 0 or "ÉCHEC" in p.stdout:
            return b
    verifs = sorted(f for f in os.listdir(os.path.join(dossier, "outils"))
                    if f.startswith("verifier-") and f.endswith(".py"))
    for v in verifs:
        p = subprocess.run([sys.executable, "-I", "outils/" + v], cwd=dossier,
                           capture_output=True, text=True, timeout=180)
        if p.returncode != 0:
            return v
    return None


def main():
    n = 30
    graine = 1
    tout = "--tout" in sys.argv
    if "--n" in sys.argv:
        n = int(sys.argv[sys.argv.index("--n") + 1])
    if "--graine" in sys.argv:
        graine = int(sys.argv[sys.argv.index("--graine") + 1])

    base = tempfile.mkdtemp(prefix="phenobac-mutation-")
    atelier = os.path.join(base, "depot")
    shutil.copytree(RACINE, atelier,
                    ignore=shutil.ignore_patterns(".git", "node_modules", "__pycache__"))

    # Garde-fou : la suite doit être VERTE avant toute mutation. Si elle est
    # déjà rouge, tous les survivants seraient faux et le rapport, trompeur.
    temoin = suite(atelier)
    if temoin:
        print("ÉPREUVE IMPOSSIBLE — la suite est déjà rouge sans aucune mutation "
              "(%s). Réparez d'abord : sinon chaque mutation paraîtrait détectée."
              % temoin)
        shutil.rmtree(base, ignore_errors=True)
        return 2

    survivants, tues, total = [], 0, 0
    for cible in CIBLES:
        chemin = os.path.join(atelier, cible)
        with open(chemin, encoding="utf-8") as f:
            origine = f.read()
        code = masque_code(origine)
        points = [p for p in sites(origine)
                  if all(code[k] for k in range(p[1], p[2]))]
        if not tout:
            random.Random(graine).shuffle(points)
            points = points[:n]
        print("%s : %d mutation(s) à éprouver.\n" % (cible, len(points)), flush=True)

        for nom, a, b, remplacement in points:
            total += 1
            mute = origine[:a] + remplacement + origine[b:]
            with open(chemin, "w", encoding="utf-8") as f:
                f.write(mute)
            ligne = origine.count("\n", 0, a) + 1
            try:
                attrape = suite(atelier)
            except subprocess.TimeoutExpired:
                attrape = "(délai dépassé — compté comme détecté)"
            if attrape:
                tues += 1
                print("  tuée     %s:%d  %s   → %s" % (cible, ligne, nom, attrape), flush=True)
            else:
                # La LIGNE entière, pas une fenêtre de caractères : une
                # fenêtre à cheval sur deux lignes montrait le commentaire
                # d'à côté et donnait à juger sur autre chose.
                d = origine.rfind("\n", 0, a) + 1
                f2 = origine.find("\n", b)
                extrait = origine[d:f2 if f2 > 0 else len(origine)].strip()
                survivants.append((cible, ligne, nom, extrait))
                print("  SURVIT   %s:%d  %s" % (cible, ligne, nom), flush=True)
        with open(chemin, "w", encoding="utf-8") as f:
            f.write(origine)

    shutil.rmtree(base, ignore_errors=True)
    print("\n%d mutations : %d tuées, %d survivantes (%.0f %% de détection)."
          % (total, tues, len(survivants), 100.0 * tues / total if total else 0))
    if survivants:
        print("\nCE QUE PERSONNE NE VERRAIT :")
        for f, l, nom, extrait in survivants:
            print("  %s:%d — %s" % (f, l, nom))
            print("      %s" % extrait[:130])
    return 0


if __name__ == '__main__':
    sys.exit(main())
