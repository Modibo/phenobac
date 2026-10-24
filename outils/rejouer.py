# -*- coding: utf-8 -*-
"""
rejouer.py — reproduire une interprétation rendue autrefois. § 18

POURQUOI UN COMPTE RENDU DOIT POUVOIR ÊTRE REJOUÉ

Un antibiogramme rendu en mars est contesté en octobre. Le clinicien
demande pourquoi la céfotaxime avait été rendue résistante ; le biologiste
ressaisit le cas dans PhénoBac — et obtient autre chose, parce que les
règles ont changé entre-temps. Sans moyen de rejouer le rendu AVEC LES
RÈGLES DE L'ÉPOQUE, il ne peut ni défendre sa décision ni reconnaître une
erreur : il ne sait tout simplement plus ce que l'application lui avait dit.

Le § 18 demande donc de « conserver les anciennes versions pour reproduire
une interprétation historique ». Rien n'était prévu pour cela.

CE QUI REND LA CHOSE POSSIBLE SANS RIEN ARCHIVER

Les règles sont des DONNÉES (base-connaissances.js) et le raisonnement est
un FICHIER (moteur.js). Les deux sont versionnés dans git. Toute version
passée est donc déjà conservée — il ne manquait que l'outil pour la
rejouer.

IL FAUT LES DEUX, ET C'EST LE PIÈGE. Reprendre la base de l'époque avec le
moteur d'aujourd'hui ne reproduit rien : les seuils seraient les anciens,
les règles de lecture interprétative les nouvelles. Ce mélange n'a jamais
existé, et le rendu qu'il produit n'est le rendu de personne. On extrait
donc les deux fichiers du MÊME commit.

CE QUE LE COMPTE RENDU PORTE, ET CE QU'IL FAUT EN FAIRE

Le pied de page imprimé indique la date d'édition, la version de PhénoBac,
le référentiel et la version de la base. La DATE est la clé la plus sûre :
le moteur évolue entre deux versions de base, et la date désigne un état
unique du dépôt. D'où « --date », et « --base » en repli.

    python3 outils/rejouer.py --cas cas.json --date 2026-03-15
    python3 outils/rejouer.py --cas cas.json --revision 7460a09 --comparer

Le fichier de cas est la demande telle que l'application l'envoie :

    { "organism": "ecoli", "mode": "sir",
      "results": {"AMX": "R", "CTX": "R"},
      "ctx": {"syn": "Positif"}, "ref": "casfm" }
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)

JSC = ("/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/"
       "Helpers/jsc")
FICHIERS = ["base-connaissances.js", "moteur.js"]


# ---------------------------------------------------------------- le miroir
#
# L'histoire ne se lit PAS dans la copie de travail. Celle-ci est posée dans
# OneDrive, qui hydrate chaque objet à la demande : un « git log » restreint à
# un seul fichier y prend des minutes, et un « git log -S » n'en finit pas.
# Trois tentatives d'optimisation ont échoué avant que je comprenne que le
# goulot n'était pas l'algorithme mais le système de fichiers.
#
# On entretient donc un miroir nu sur disque rapide, rafraîchi à chaque appel.
# Il n'est pas qu'une commodité : reproduire un rendu PUBLIÉ veut dire
# reproduire ce qui a été poussé, pas ce qui traîne en local non commis.
MIROIR = os.path.join(tempfile.gettempdir(), "phenobac-historique.git")


def _assurer_miroir():
    if os.path.isdir(os.path.join(MIROIR, "objects")):
        subprocess.run(["git", "-C", MIROIR, "fetch", "-q", "--all"],
                       capture_output=True, text=True)
        return
    url = subprocess.run(["git", "-C", RACINE, "remote", "get-url", "origin"],
                         capture_output=True, text=True).stdout.strip()
    if not url:
        raise SystemExit("Pas de dépôt distant : impossible de constituer le miroir.")
    print("Constitution du miroir de l'historique (une seule fois)…")
    r = subprocess.run(["git", "clone", "-q", "--bare", url, MIROIR],
                       capture_output=True, text=True)
    if r.returncode:
        raise SystemExit("Clonage du miroir impossible : " + r.stderr.strip())


def git(*args):
    _assurer_miroir()
    r = subprocess.run(["git", "-C", MIROIR] + list(args),
                       capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError("git " + " ".join(args) + " : " + r.stderr.strip())
    return r.stdout


def revision_pour_date(date):
    """Le dernier commit de main à cette date, inclus. « --before » prend une
    date de FIN : on vise donc la fin du jour demandé, sinon un rendu édité
    dans l'après-midi serait rejoué avec le code du matin."""
    s = git("rev-list", "-1", "--before=" + date + " 23:59:59", "main").strip()
    if not s:
        raise SystemExit("Aucun commit avant le %s : le dépôt est plus récent "
                         "que ce compte rendu." % date)
    return s


def revision_pour_base(version):
    """Le PREMIER commit où la base porte cette version. Au sein d'une même
    version de base les règles sont identiques par construction — c'est tout
    le sens d'un numéro de version — mais le moteur, lui, change. On prend
    donc le plus ancien, et l'on prévient que la date serait plus sûre."""
    # Ne regarder QUE les commits qui touchent le fichier : ils sont une
    # poignée, et c'est le seul endroit où la version peut changer.
    #
    # Deux tentatives plus lentes ont précédé celle-ci, et la leçon vaut d'être
    # écrite : parcourir tout l'historique en appelant « git show » à chaque
    # commit prenait des minutes, et « git log -S » aussi — la pioche impose
    # un parcours complet avec diff. Sur un dépôt posé dans OneDrive, chaque
    # lecture d'objet coûte. Un outil trop lent n'est pas employé, et un outil
    # qu'on n'emploie pas ne vérifie rien.
    marque = 'BASE_VERSION = "%s"' % version
    commits = git("log", "--reverse", "--format=%H", "main",
                  "--", "base-connaissances.js").split()
    for sha in commits:
        if marque in git("show", sha + ":base-connaissances.js"):
            return sha
    n = len(commits)
    raise SystemExit(
        "%s de base-connaissances.js ne porte la version « %s ». "
        "Versions connues : %s."
        % ("La seule révision" if n == 1 else "Aucune des %d révisions" % n,
           version, ", ".join(sorted(_versions_connues(commits))) or "aucune"))


def _versions_connues(commits):
    import re
    vues = set()
    for sha in commits:
        m = re.search(r'BASE_VERSION = "([^"]+)"', git("show", sha + ":base-connaissances.js"))
        if m:
            vues.add(m.group(1))
    return vues


def extraire(revision, dossier):
    manquants = []
    for f in FICHIERS:
        try:
            src = git("show", revision + ":" + f)
        except RuntimeError:
            manquants.append(f)
            continue
        with open(os.path.join(dossier, f), "w", encoding="utf-8") as fh:
            fh.write(src)
    if manquants:
        raise SystemExit(
            "À cette révision, %s n'existe pas encore. Les règles n'étaient "
            "pas encore des données séparées : un rendu antérieur à cette "
            "séparation ne peut pas être rejoué par cet outil." % ", ".join(manquants))


HARNAIS = r"""
var modB = { exports: {} };
(new Function("module", "exports", readFile(DOSSIER + "/base-connaissances.js")))(modB, modB.exports);
var mod = { exports: {} };
(new Function("module", "exports", "require", readFile(DOSSIER + "/moteur.js")))(
    mod, mod.exports, function () { return modB.exports; });
var E = mod.exports;
var demande = JSON.parse(readFile(DOSSIER + "/cas.json"));
var out = E.runInterpretation(demande);
var A = out.interpretation || {};
print(JSON.stringify({
  erreur: out.error || null,
  base: E.BASE_VERSION || null,
  phenotype: A.name || null,
  mecanisme: A.mech || null,
  confiance: A.confiance || null,
  categories: out.categories || {},
  rendues: (A.rendu || []).map(function (x) { return x.abx + " " + x.brut + "->" + x.rendu; }),
  alertes: (A.alerts || []).map(function (x) { return x.lvl + " : " + x.txt; }),
  commentaire: A.commentaireCopiable || A.comment || null
}, null, 1));
"""


def interpreter(dossier, cas):
    with open(os.path.join(dossier, "cas.json"), "w", encoding="utf-8") as fh:
        json.dump(cas, fh, ensure_ascii=False)
    script = os.path.join(dossier, "_rejouer.js")
    with open(script, "w", encoding="utf-8") as fh:
        fh.write(HARNAIS.replace("DOSSIER", json.dumps(dossier)))
    moteur = JSC if os.path.exists(JSC) else None
    cmd = [moteur, script] if moteur else ["node", script]
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=dossier)
    if r.returncode:
        raise SystemExit("L'interprétation a échoué :\n" + (r.stderr or r.stdout))
    return json.loads(r.stdout)


def dit(v):
    """Rien à afficher se dit « — », pas « None » : le lecteur n'a pas à
    connaître le langage dans lequel l'outil est écrit."""
    return "—" if v is None or v == "" else str(v)


def rendre(titre, res):
    print("\n── %s ──" % titre)
    if res.get("erreur"):
        print("  erreur du moteur : %s" % res["erreur"])
        return
    print("  base de règles  : %s" % dit(res.get("base")))
    print("  phénotype       : %s  (confiance %s)" % (dit(res.get("phenotype")), dit(res.get("confiance"))))
    cats = res.get("categories") or {}
    if cats:
        print("  catégories      : " + ", ".join("%s %s" % (k, cats[k]) for k in sorted(cats)))
    if res.get("rendues"):
        print("  lecture interprétative : " + " ; ".join(res["rendues"]))
    if res.get("commentaire"):
        print("  commentaire     : " + res["commentaire"][:200]
              + ("…" if len(res["commentaire"]) > 200 else ""))


def comparer(ancien, actuel):
    """Ce qui a changé, et rien d'autre. Un outil de comparaison qui réaffiche
    tout oblige à chercher la différence à l'œil — c'est ainsi qu'on la rate."""
    print("\n── ce qui a changé depuis ──")
    ecarts = []
    if ancien.get("phenotype") != actuel.get("phenotype"):
        ecarts.append("phénotype : « %s » → « %s »" % (dit(ancien.get("phenotype")), dit(actuel.get("phenotype"))))
    if ancien.get("confiance") != actuel.get("confiance"):
        ecarts.append("confiance : %s → %s" % (dit(ancien.get("confiance")), dit(actuel.get("confiance"))))
    a, b = ancien.get("categories") or {}, actuel.get("categories") or {}
    for k in sorted(set(a) | set(b)):
        if a.get(k) != b.get(k):
            ecarts.append("%s : %s → %s" % (k, a.get(k, "—"), b.get(k, "—")))
    ra, rb = set(ancien.get("rendues") or []), set(actuel.get("rendues") or [])
    for x in sorted(rb - ra):
        ecarts.append("lecture interprétative AJOUTÉE : " + x)
    for x in sorted(ra - rb):
        ecarts.append("lecture interprétative RETIRÉE : " + x)
    if ancien.get("base") != actuel.get("base"):
        ecarts.append("base de règles : %s → %s" % (dit(ancien.get("base")), dit(actuel.get("base"))))

    # Le commentaire fait PARTIE du rendu : c'est lui que le clinicien a lu.
    # Le passer sous silence revenait à annoncer « rien n'a changé » devant
    # deux textes différents — et ma première version le faisait.
    ca, cb = (ancien.get("commentaire") or "").strip(), (actuel.get("commentaire") or "").strip()
    commentaire_change = (ca != cb)

    # Les alertes aussi : une alerte qui n'existait pas à l'époque explique
    # qu'on n'en ait pas tenu compte.
    aa, ab = set(ancien.get("alertes") or []), set(actuel.get("alertes") or [])
    for x in sorted(ab - aa):
        ecarts.append("alerte AJOUTÉE depuis : " + x[:100])
    for x in sorted(aa - ab):
        ecarts.append("alerte RETIRÉE depuis : " + x[:100])

    if not ecarts and not commentaire_change:
        print("  RIEN. Le même cas donnerait aujourd'hui exactement le même rendu.")
        return
    for e in ecarts:
        print("  - " + e)
    if commentaire_change:
        # Distinguer la forme du fond : une reformulation n'est pas un
        # changement d'avis, et les confondre ferait rouvrir des dossiers
        # pour rien.
        meme_fond = ca and cb and (ca in cb or cb in ca)
        print("  - commentaire : %s" % ("REFORMULÉ — l'ancien texte est contenu dans le nouveau, "
                                        "le fond n'a pas bougé"
                                        if meme_fond else "RÉÉCRIT — le fond peut avoir changé"))
        print("      avant : " + (ca[:150] + ("…" if len(ca) > 150 else "") or "(aucun)"))
        print("      après : " + (cb[:150] + ("…" if len(cb) > 150 else "") or "(aucun)"))
    if True:
        print("\n  Un rendu passé n'est pas FAUX parce qu'il diffère du rendu d'aujourd'hui :")
        print("  il a été produit avec les règles en vigueur à sa date. C'est ce que")
        print("  cet outil sert à établir.")


def main():
    p = argparse.ArgumentParser(description="Rejouer une interprétation avec les règles d'une date passée.")
    p.add_argument("--cas", required=True, help="fichier JSON de la demande")
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--date", help="date du compte rendu (AAAA-MM-JJ)")
    g.add_argument("--revision", help="commit git précis")
    g.add_argument("--base", help="version de la base de connaissances")
    p.add_argument("--comparer", action="store_true",
                   help="montrer en plus ce que donnerait le code actuel")
    a = p.parse_args()

    with open(a.cas, encoding="utf-8") as fh:
        cas = json.load(fh)

    if a.date:
        rev = revision_pour_date(a.date)
    elif a.base:
        rev = revision_pour_base(a.base)
        print("La version de base désigne plusieurs états du moteur ; « --date » "
              "serait plus sûr.\nPremier commit portant cette base : %s" % rev[:9])
    else:
        rev = git("rev-parse", a.revision).strip()

    quand = git("log", "-1", "--format=%ad %s", "--date=short", rev).strip()
    print("Révision rejouée : %s — %s" % (rev[:9], quand[:70]))

    with tempfile.TemporaryDirectory() as d:
        extraire(rev, d)
        ancien = interpreter(d, cas)
    rendre("rendu de l'époque", ancien)

    if a.comparer:
        with tempfile.TemporaryDirectory() as d:
            for f in FICHIERS:
                with open(os.path.join(RACINE, f), encoding="utf-8") as src, \
                     open(os.path.join(d, f), "w", encoding="utf-8") as dst:
                    dst.write(src.read())
            actuel = interpreter(d, cas)
        rendre("rendu d'aujourd'hui", actuel)
        comparer(ancien, actuel)
    return 0


if __name__ == '__main__':
    sys.exit(main())
