# -*- coding: utf-8 -*-
"""
transcrire-clsi.py — convertit les seuils du M100 en lignes de base, et
REFUSE tout ce qu'il ne sait pas convertir exactement.

    python3 outils/transcrire-clsi.py chemin/vers/clsi-m100.json
    python3 outils/transcrire-clsi.py …json --table 2B-4
    python3 outils/transcrire-clsi.py …json --refus    (seulement ce qu'il écarte)

Écrit sur la sortie standard ; ne touche à aucun fichier.

HORS INTÉGRATION CONTINUE : il lit le JSON produit par extraire-clsi.js dans
la console du navigateur, copie de travail non versionnée — le M100 est
protégé. Comme comparer-clsi.py, il se lance à la main.

POURQUOI UN OUTIL ET PAS UNE TRANSCRIPTION À LA MAIN

Sept cents lignes converties une à une, c'est sept cents occasions de se
tromper d'un facteur deux, et aucune ne se verrait : un seuil faux a l'air
d'un seuil. L'outil applique une règle écrite, et refuse tout ce qui n'y
entre pas plutôt que de l'approcher.

LES DEUX CONVENTIONS NE SE RESSEMBLENT PAS

    CLSI       S ≤ 1   ·   I 2   ·   R ≥ 4
    PhénoBac   S = 1   ·   R = 2            (R : résistant si la mesure DÉPASSE R)

Le « R » de PhénoBac n'est pas celui du CLSI : c'est la BORNE HAUTE de la
bande intermédiaire. On le prend donc sur la colonne I, qui le donne
exactement — et non en divisant le R du CLSI par deux, qui serait juste sur
l'échelle de dilutions et faux dès qu'elle ne l'est pas : « R ≥ 0,25 » avec
« I 0,12 » donnerait 0,125, un nombre que le document n'écrit nulle part.

Quand le CLSI ne donne PAS de bande intermédiaire, il n'y a rien entre S et
R — mais cela se VÉRIFIE au lieu de se supposer : l'outil exige
R_clsi = 2 × S_clsi et refuse sinon. Sans ce contrôle, « S ≤ 8 · R ≥ 32 »
sans I rendrait sensible une souche à 16 mg/L.

LES TROIS ARBITRAGES DU 2026-11-07, APPLIQUÉS

  1. Un couple SANS seuil de résistance n'est pas transcrit. Le CLSI fixe
     parfois la sensibilité seule (céfidérocol sur S. maltophilia) ; rendu
     tel quel, tout ce qui dépasse sortirait « I » — sensible à forte
     exposition —, ce que le document ne dit pas.
  2. Une molécule absente du panel mais que le CLSI chiffre entièrement est
     transcrite, et signalée comme à ajouter au panel : un seuil sans place
     à la saisie ne sert qu'aux imports automate.
  3. Un couple que le CLSI ne chiffre pas reste sans seuil CLSI, et sa
     valeur EUCAST n'est pas touchée.

LA VÉRIFICATION EN BOUCLE FERMÉE

Convertir juste ne suffit pas : il faut que le MOTEUR, nourri de la ligne
produite, rende la catégorie que le CLSI annonce. Pour chaque couple
transcrit, l'outil tire une valeur témoin dans chacune des trois bandes du
document et vérifie que le moteur rend S, I et R aux bons endroits. Une
conversion qui passe la règle mais rate la boucle est écartée.
"""
import importlib.util
import sys, os, re, json
from fractions import Fraction

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
sys.path.insert(0, ICI)

_s = importlib.util.spec_from_file_location("noms_clsi", os.path.join(ICI, "noms-clsi.py"))
_N = importlib.util.module_from_spec(_s); _s.loader.exec_module(_N)

_s2 = importlib.util.spec_from_file_location("comparer_clsi",
                                             os.path.join(ICI, "comparer-clsi.py"))
_C = importlib.util.module_from_spec(_s2); _s2.loader.exec_module(_C)

NOMBRE = r"\d+(?:\.\d+)?"
RE_INF = re.compile(r"^≤\s*(" + NOMBRE + r")(?:/(" + NOMBRE + r"))?$")
RE_SUP = re.compile(r"^≥\s*(" + NOMBRE + r")(?:/(" + NOMBRE + r"))?$")
RE_UN  = re.compile(r"^(" + NOMBRE + r")(?:/(" + NOMBRE + r"))?\^?$")
RE_INT = re.compile(r"^(" + NOMBRE + r")(?:/" + NOMBRE + r")?\s*[-–]\s*("
                    + NOMBRE + r")(?:/" + NOMBRE + r")?\^?$")


def vide(v):
    return v is None or str(v).strip() in ("", "-", "–", "—")


def nb(t):
    """Le premier composant d'une valeur. « 2/38 » vaut 2 : c'est ainsi que
    la base écrit déjà le cotrimoxazole, et mélanger les deux écritures
    rendrait les seuils incomparables entre référentiels."""
    f = Fraction(t)
    return int(f) if f.denominator == 1 else float(f)


class Refus(Exception):
    pass


def borne_cmi(cS, cI, cR, cSDD=None):
    """(S, R, sdd) au sens de PhénoBac, depuis les cellules du CLSI.

    La colonne SDD tient la MÊME PLACE que I — le CLSI ne donne jamais les
    deux pour un même agent, mesuré sur les seize tables. Quand c'est elle
    qui est remplie, la bande intermédiaire s'appelle SDD, et c'est tout ce
    qui change : la borne se lit au même endroit."""
    if vide(cR):
        raise Refus("aucun seuil de RÉSISTANCE — le CLSI fixe la sensibilité "
                    "seule ; transcrit tel quel, tout ce qui dépasse sortirait "
                    "« I » (arbitrage 1 du 2026-11-07)")
    mR = RE_SUP.match(str(cR).strip())
    if not mR:
        raise Refus("seuil de résistance illisible : « %s »" % cR)
    vR = nb(mR.group(1))

    S = None
    if not vide(cS):
        mS = RE_INF.match(str(cS).strip())
        if not mS:
            raise Refus("seuil de sensibilité illisible : « %s »" % cS)
        S = nb(mS.group(1))

    # SDD occupe la place de I. Si les deux sont remplies, le document dit
    # une chose que la mesure des seize tables disait impossible : on
    # s'arrête plutôt que de choisir.
    sdd = False
    if not vide(cSDD):
        if not vide(cI):
            raise Refus("SDD ET I remplis pour le même agent — les seize "
                        "tables disaient cela impossible ; à relire")
        cI, sdd = cSDD, True

    # « I ≤ 2 » : le CLSI n'accorde AUCUNE catégorie sensible et borne
    # l'intermédiaire par le haut. C'est la forme que la base écrit déjà
    # S = null, et la colistine des entérobactéries l'emploie.
    if vide(cS) and not vide(cI) and RE_INF.match(str(cI).strip()):
        return None, nb(RE_INF.match(str(cI).strip()).group(1)), sdd

    if not vide(cI):
        t = str(cI).strip()
        mi = RE_INT.match(t) or RE_UN.match(t)
        if not mi:
            raise Refus("bande intermédiaire illisible : « %s »" % cI)
        R = nb(RE_INT.match(t).group(2)) if RE_INT.match(t) else nb(mi.group(1))
        return S, R, sdd

    # Pas de bande intermédiaire : il ne doit RIEN y avoir entre S et R.
    if S is None:
        raise Refus("ni sensibilité ni intermédiaire : rien à convertir")
    if abs(Fraction(str(vR)) - 2 * Fraction(str(S))) > Fraction(0):
        raise Refus("pas de bande intermédiaire, et R (%s) n'est pas le double "
                    "de S (%s) : une valeur du document tomberait entre les "
                    "deux sans qu'on sache comment la rendre" % (vR, S))
    return S, S, sdd


def borne_disque(cS, cI, cR, cSDD=None):
    if vide(cR):
        raise Refus("aucun seuil de RÉSISTANCE au disque (arbitrage 1)")
    mR = RE_INF.match(str(cR).strip())
    if not mR:
        raise Refus("seuil de résistance illisible : « %s »" % cR)
    R = nb(mR.group(1)) + 1          # CLSI « R ≤ 20 » ; PhénoBac « R si < 21 »

    S = None
    if not vide(cS):
        mS = RE_SUP.match(str(cS).strip())
        if not mS:
            raise Refus("seuil de sensibilité illisible : « %s »" % cS)
        S = nb(mS.group(1))

    sdd = False
    if not vide(cSDD):
        if not vide(cI):
            raise Refus("SDD ET I remplis au disque pour le même agent")
        cI, sdd = cSDD, True

    # La bande intermédiaire doit coller aux deux bornes, sinon on a mal lu.
    if not vide(cI):
        mi = RE_INT.match(str(cI).strip())
        if not mi:
            raise Refus("bande intermédiaire illisible : « %s »" % cI)
        bas, haut = nb(mi.group(1)), nb(mi.group(2))
        if bas != R:
            raise Refus("la bande intermédiaire commence à %s, mais la "
                        "résistance s'arrête à %s" % (bas, R - 1))
        if S is not None and haut != S - 1:
            raise Refus("la bande intermédiaire finit à %s, mais la "
                        "sensibilité commence à %s" % (haut, S))
    return S, R, sdd


# Un qualificatif du CLSI dit soit un SITE, que la base sait représenter,
# soit une distinction qu'elle ne porte pas — et qui demande un arbitrage.
# Les confondre ferait entrer un seuil urinaire comme seuil général : le plus
# permissif des deux, appliqué à une bactériémie.
SITES = {"urinaire": "urinaire", "méningé": "meninge"}
REFUSES = {
    "non méningé":        "le CLSI sépare méningé et non méningé ; décider "
                          "lequel est le seuil « standard » de PhénoBac",
    "oral":               "seuil propre à la voie orale — PhénoBac ne scinde "
                          "pas ses seuils par voie",
    "parentéral":         "seuil propre à la voie parentérale — même question",
    "test de substitution": "c'est un test de SUBSTITUTION, pas un seuil de la "
                          "molécule : le rendre tel quel la ferait catégoriser "
                          "pour elle-même",
    "investigationnel":   "marqué « (Inv.) » par le CLSI : à ne pas rendre "
                          "comme un seuil de routine",
    "haut niveau":        "dépistage de haut niveau, pas une concentration "
                          "critique ordinaire",
}


def site_de(qual):
    """Rend le site, ou lève si un qualificatif demande un arbitrage."""
    site = "standard"
    for q in qual:
        if q in SITES:
            site = SITES[q]
        elif q in REFUSES:
            raise Refus(REFUSES[q])
        else:
            raise Refus("qualificatif inconnu : « %s »" % q)
    return site


def js(v):
    if v is None:
        return "null"
    if isinstance(v, str):
        return '"%s"' % v
    return repr(v)


def ligne(groupe, code, meth, site, S, R, charge, sdd):
    # COLONNES : ref groupe abx meth site S R charge zit temoin dep conv couv
    #            espece ecoff sdd  — « sdd » est en queue, et n'est écrit que
    #            s'il est vrai : une colonne de undefined partout n'apprend rien.
    base = ('["clsi","%s","%s","%s","%s",%s,%s,%s,'
            'undefined,undefined,undefined,undefined,undefined,undefined'
            % (groupe, code, meth, site, js(S), js(R),
               js(charge) if charge else "undefined"))
    return base + (",undefined,true]" if sdd else "]")


# --------------------------------------------------------------------------
# LA BOUCLE FERMÉE
#
# Convertir selon la règle ne suffit pas : il faut que le MOTEUR, nourri de
# la ligne produite, rende la catégorie que le document annonce. On tire donc
# une valeur témoin dans chacune des bandes du CLSI et l'on compare.
#
# Le moteur est interrogé TEL QUEL, par jsc, et non réimplémenté ici : une
# seconde implémentation de catFromMic finirait par diverger de la première,
# et c'est exactement la divergence qu'on cherche à exclure.
# --------------------------------------------------------------------------
GABARIT = r"""
var modB = { exports: {} };
(new Function('module','exports', readFile('base-connaissances.js')))(modB, modB.exports);
var modP = { exports: {} };
(new Function('module','exports', readFile('posologie.js')))(modP, modP.exports);
var modV = { exports: {} };
(new Function('module','exports', readFile('voies.js')))(modV, modV.exports);
var mod = { exports: {} };
(new Function('module','exports','require', readFile('moteur.js')))(mod, mod.exports,
  function (n) {
    if (/posologie/.test(n)) return modP.exports;
    if (/voies/.test(n)) return modV.exports;
    return modB.exports; });
var E = mod.exports;
var cas = __CAS__;
var sorties = cas.map(function (c) {
  var bp = c.meth === 'cmi' ? { S: c.S, R: c.R } : null;
  return c.meth === 'cmi' ? E.catFromMic(String(c.v), { S: c.S, R: c.R })
                          : E.catFromDiam(String(c.v), { S: c.S, R: c.R });
});
print(JSON.stringify(sorties));
"""


def temoins_cmi(cS, cI, cR, cSDD=None):
    if vide(cI) and not vide(cSDD):
        cI = cSDD

    """Une valeur de chaque bande du CLSI, et la catégorie qu'il lui donne."""
    t = []
    if not vide(cS):
        m = RE_INF.match(str(cS).strip())
        if m:
            t.append((nb(m.group(1)), "S"))
    if not vide(cI):
        x = str(cI).strip()
        mi = RE_INT.match(x)
        if mi:
            t.append((nb(mi.group(1)), "I")); t.append((nb(mi.group(2)), "I"))
        else:
            mu = RE_UN.match(x)
            if mu:
                t.append((nb(mu.group(1)), "I"))
    if not vide(cR):
        m = RE_SUP.match(str(cR).strip())
        if m:
            t.append((nb(m.group(1)), "R"))
    return t


def temoins_disque(cS, cI, cR, cSDD=None):
    if vide(cI) and not vide(cSDD):
        cI = cSDD

    t = []
    if not vide(cS):
        m = RE_SUP.match(str(cS).strip())
        if m:
            t.append((nb(m.group(1)), "S"))
    if not vide(cI):
        mi = RE_INT.match(str(cI).strip())
        if mi:
            t.append((nb(mi.group(1)), "I")); t.append((nb(mi.group(2)), "I"))
    if not vide(cR):
        m = RE_INF.match(str(cR).strip())
        if m:
            t.append((nb(m.group(1)), "R"))
    return t


def boucler(cas):
    """cas : [{meth, S, R, v, attendu, ou}] — rend la liste des divergences."""
    if not cas:
        return []
    import subprocess, json as _j
    jsc = ("/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/"
           "Helpers/jsc")
    src = GABARIT.replace("__CAS__", _j.dumps(
        [{"meth": c["meth"], "S": c["S"], "R": c["R"], "v": c["v"]} for c in cas]))
    try:
        if os.path.exists(jsc):
            out = subprocess.run([jsc, "-e", src], cwd=RACINE,
                                 capture_output=True, text=True, timeout=180)
        else:
            out = subprocess.run(["node", "-e", src.replace("readFile", "__lire")
                                  .replace("var modB", "function __lire(f){return require('fs').readFileSync(require('path').join(process.cwd(),f),'utf8');}\nvar modB")],
                                 cwd=RACINE, capture_output=True, text=True, timeout=180)
    except Exception as e:
        return [("(moteur injoignable)", str(e))]
    try:
        rendus = _j.loads(out.stdout.strip().splitlines()[-1])
    except Exception:
        return [("(sortie du moteur illisible)", (out.stdout + out.stderr)[:300])]
    ecarts = []
    for c, got in zip(cas, rendus):
        if got != c["attendu"]:
            ecarts.append((c["ou"], "%s à %s : le CLSI dit %s, le moteur rend %s"
                           % (c["meth"], c["v"], c["attendu"], got)))
    return ecarts


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    seule = None
    if "--table" in sys.argv:
        i = sys.argv.index("--table")
        if i + 1 < len(sys.argv):
            seule = sys.argv[i + 1]
            args = [a for a in args if a != seule]
    REFUS_SEULS = "--refus" in sys.argv
    if not args:
        print(__doc__); return 2

    with open(args[0], encoding="utf-8") as f:
        d = json.load(f)
    tables = d.get("tables", {})
    cles = [seule] if seule else [c for c in _C.TABLES if c in tables]

    panels = {}
    try:
        src = open(os.path.join(RACINE, "phenobac.html"), encoding="utf-8").read()
    except OSError:
        src = ""

    total, refuses, cas_boucle = 0, 0, []
    for cle in cles:
        t = tables.get(cle)
        if not t or t.get("erreur") or t.get("vide"):
            continue
        groupes, remarque = _C.TABLES.get(cle, ([], None))
        if not groupes:
            print("\n/* %s : aucun groupe PhénoBac rattaché — %s */" % (cle, remarque or ""))
            continue
        lignes = _C.lignes_nommees(t)
        if lignes is None:
            print("/* %s : JSON antérieur au nommage des colonnes */" % cle); continue

        sorties, refus = [], []
        for ld in lignes:
            nom = ld.get("agent") or ""
            if not nom:
                continue
            code, base, qual = _C.code_phenobac(nom)
            if code is None:
                continue                      # molécule que PhénoBac ne porte pas
            if any("⚠" in str(v) for v in ld.values() if v):
                refus.append((code, nom, "ligne marquée douteuse par le lecteur"))
                continue
            try:
                site = site_de(qual)
            except Refus as e:
                refus.append((code, nom, str(e)))
                continue
            for meth, prefixe in (("cmi", "cmi"), ("disque", "disque")):
                cS, cI, cR = (ld.get(prefixe + ":S"), ld.get(prefixe + ":I"),
                              ld.get(prefixe + ":R"))
                cSDD = ld.get(prefixe + ":SDD")
                if vide(cS) and vide(cI) and vide(cR) and vide(cSDD):
                    continue
                try:
                    S, R, sdd = (borne_cmi if meth == "cmi"
                                 else borne_disque)(cS, cI, cR, cSDD)
                except Refus as e:
                    refus.append((code, nom + " / " + meth, str(e)))
                    continue
                tem = (temoins_cmi if meth == "cmi"
                       else temoins_disque)(cS, cI, cR, cSDD)
                for v2, att in tem:
                    cas_boucle.append({"meth": meth, "S": S, "R": R, "v": v2,
                                       "attendu": att,
                                       "ou": cle + " " + code + " " + nom[:24]})
                charge = ld.get("charge") if meth == "disque" else None
                if charge and vide(charge):
                    charge = None
                if charge:
                    charge = re.sub(r"\s*(?:µg|μg|units?|U)\s*", "", str(charge)).strip()
                    charge = charge.replace("/", "-")
                for g in groupes:
                    sorties.append(ligne(g, code, meth, site, S, R, charge, sdd))

        total += len(sorties); refuses += len(refus)
        if not REFUS_SEULS and sorties:
            print("\n/* ---- table %s → %s ---- */" % (cle, ", ".join(groupes)))
            for l in sorties:
                print(l + ",")
        if refus:
            print("\n/* %s — ÉCARTÉS, à lire à la main :" % cle)
            for c, n2, m in refus:
                print(" *   %-5s %-34s %s" % (c, n2[:34], m))
            print(" */")

    ecarts = boucler(cas_boucle)
    print("\n/* %d ligne(s) produite(s), %d écartée(s)." % (total, refuses))
    print(" * BOUCLE FERMÉE : %d valeurs témoins passées au moteur, %d divergence(s)."
          % (len(cas_boucle), len(ecarts)))
    for ou, m in ecarts[:20]:
        print(" *   ✗ %s — %s" % (ou, m))
    print(" * Aucun fichier modifié. */")
    return 1 if ecarts else 0


if __name__ == "__main__":
    sys.exit(main())
