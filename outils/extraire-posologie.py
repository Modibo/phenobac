# -*- coding: utf-8 -*-
"""
extraire-posologie.py — les posologies qui fondent les seuils EUCAST.

CE QUE CE FICHIER EXTRAIT, ET POURQUOI IL FAUT LE LIRE À LA POSITION

EUCAST, *Clinical Breakpoint Tables* v16.1, section « Dosages used to define
breakpoints » (pages 9 à 13). Cinq colonnes :

    Agent | Standard dosage | High dosage | Uncomplicated UTI | Special situations

Aplatie en texte, cette table est illisible : une cellule s'étale sur deux ou
trois lignes, et les colonnes se rejoignent. « Amoxicillin oral 0.5 g x 3 oral
0.75-1 g x 3 oral 0.5 g x 3 oral » ne dit pas lequel des trois schémas est la
posologie forte. On lit donc à la POSITION, comme pour les tableaux du CA-SFM,
avec outils/pdfpos.py.

Les bornes de colonnes ne sont pas écrites en dur : elles sont déduites de la
ligne d'en-tête, qui se répète à chaque famille. Un tableau remis en page
l'année prochaine déplacerait des bornes fixes sans prévenir.

CE QUI EST CONSERVÉ TEL QUEL

« None » est une valeur, pas une absence : l'EUCAST déclare alors qu'il n'y a
PAS de posologie forte pour cette molécule. La confondre avec « non extrait »
ferait inventer un schéma là où le comité dit qu'il n'y en a pas.

    python3 outils/extraire-posologie.py <tables.pdf> > posologie.js
"""
import importlib.util
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)

_s = importlib.util.spec_from_file_location("pdfpos", os.path.join(ICI, "pdfpos.py"))
PDF = importlib.util.module_from_spec(_s)
_s.loader.exec_module(PDF)

PAGES = range(8, 13)          # pages 9 à 13, indices 0
COLONNES = ["agent", "standard", "forte", "urinaire", "particulier"]

# Nom EUCAST → code PhénoBac. Établi à la main, et VÉRIFIÉ : le contrôle plus
# bas signale toute molécule du panel qui n'aurait pas trouvé sa posologie, et
# tout nom EUCAST qu'on aurait cru reconnaître à tort.
#
# Les molécules à deux voies (iv / oral) gardent leurs deux lignes : le
# laboratoire ne sait pas par quelle voie le malade sera traité, et c'est au
# prescripteur de choisir. On les range sous le même code, dans l'ordre où
# l'EUCAST les donne.
CORRESPONDANCE = {
    "Benzylpenicillin": "PEN",
    "Ampicillin iv": "AMP",
    "Amoxicillin iv": "AMX", "Amoxicillin oral": "AMX",
    "Amoxicillin-clavulanic acid iv": "AMC", "Amoxicillin-clavulanic acid oral": "AMC",
    "Piperacillin-tazobactam": "TZP",
    "Temocillin": "TEM",
    "Cefotaxime": "CTX",
    "Ceftazidime": "CAZ",
    "Cefepime": "FEP",
    "Cefoxitin": "FOX",
    "Cefiderocol": "FDC",
    "Ertapenem": "ETP",
    "Imipenem": "IPM",
    "Meropenem": "MEM",
    "Ciprofloxacin": "CIP",
    "Levofloxacin": "LVX",
    "Moxifloxacin": "MXF",
    "Pefloxacin": "PEF",
    "Amikacin": "AMK",
    "Gentamicin": "GEN",
    "Vancomycin iv": "VA", "Vancomycin": "VA",
    "Teicoplanin": "TEC",
    "Daptomycin": "DAP",
    "Azithromycin": "AZM",
    "Erythromycin": "E",
    "Clindamycin": "DA",
    "Doxycycline": "DOX",
    "Minocycline": "MIN",
    "Linezolid": "LZD",
    "Rifampicin": "RD",
    "Trimethoprim-sulfamethoxazole": "SXT",
    "Metronidazole": "MTZ",
    # L'EUCAST donne deux schémas de daptomycine selon l'indication, et c'est
    # une information clinique, pas une redondance : on les garde tous deux.
    # La daptomycine est volontairement ABSENTE : l'EUCAST en donne deux
    # schémas selon l'indication (infection cutanée avec ou sans bactériémie à
    # S. aureus, endocardite droite), et le nom de chaque ligne s'étale sur
    # trois lignes du tableau — il déborde sur la colonne voisine et y fabrique
    # un « S. 6 mg/kg x 1 iv » qui n'existe nulle part. Afficher « 4 mg/kg »
    # sans son indication tromperait ; choisir l'une des deux pour le
    # laboratoire serait prescrire. Le § 26 commande de se taire.
    #
    # Céfoxitine et oxacilline servent au DÉPISTAGE de la méticillino-
    # résistance : l'EUCAST ne leur donne pas de posologie clinique (la
    # céfoxitine est même absente du tableau). Elles n'en ont donc pas, et
    # c'est correct — l'application ne doit pas en inventer.
    "Chloramphenicol": "CAF",
    "Colistin": "COL",
    "Fosfomycin iv": "FOS", "Fosfomycin oral": "FOS",
}


def page_items(data, objs, pg, i):
    flux = PDF.contenu(objs, pg[i])
    pol = PDF.polices(objs, pg[i])
    return PDF.extraire(flux, pol, "latin-1")


def bornes(frags):
    """Les milieux entre abscisses d'en-tête. Déduire plutôt que coder en dur :
    une remise en page déplacerait des bornes fixes sans rien dire."""
    xs = [x for x, _ in frags]
    return [(xs[i] + xs[i + 1]) / 2.0 for i in range(len(xs) - 1)]


def colonne(x, b):
    for i, seuil in enumerate(b):
        if x < seuil:
            return i
    return len(b)


def lire(chemin):
    data = open(chemin, "rb").read()
    objs = PDF.deplier_objstm(PDF.objets(data))
    pg = PDF.pages(data, objs)

    lignes_table = []
    b = None
    for i in PAGES:
        for y, frags in PDF.lignes(page_items(data, objs, pg, i)):
            txt = " ".join(s for _, s in frags)
            if "Standard dosage" in txt and "High dosage" in txt:
                b = bornes(frags)          # l'en-tête se répète à chaque famille
                continue
            if b is None:
                continue
            cells = [""] * len(COLONNES)
            for x, s in frags:
                c = colonne(x, b)
                cells[c] = (cells[c] + " " + s).strip()
            lignes_table.append(cells)
    if b is None:
        raise SystemExit("En-tête « Standard dosage » introuvable : le document "
                         "n'est pas celui attendu, ou sa mise en page a changé.")
    return lignes_table


# Lignes qui ne sont pas des molécules : notes de bas de tableau, renvois.
BRUIT = re.compile(r"^(\*|EUCAST|Dosages|Uncomplicated UTI:|§|\d)|^$")


def agreger(lignes_table):
    """Une molécule, puis ses lignes de continuation (colonne 0 vide)."""
    out, courant = [], None
    for cells in lignes_table:
        nom = cells[0].strip()
        if nom and not BRUIT.match(nom):
            courant = {"agent": nom, "standard": cells[1], "forte": cells[2],
                       "urinaire": cells[3], "particulier": cells[4]}
            out.append(courant)
        elif courant and not nom:
            for k, c in zip(COLONNES[1:], cells[1:]):
                if c:
                    courant[k] = (courant[k] + " " + c).strip()
    return out


def propre(s):
    s = re.sub(r"\s+", " ", (s or "")).strip()
    # Le tableau emploie « . » comme case vide dans quelques lignes.
    return "" if s in (".", ". .", "..") else s


# ------------------------------------------------- croisement des deux lectures
#
# DEUX BIBLIOTHÈQUES, CHACUNE BONNE À UNE CHOSE.
#
# pdfpos donne la GÉOMÉTRIE : sans elle, impossible de savoir lequel de trois
# schémas d'affilée est la posologie forte. Mais elle décode le texte par la
# table de la police, et sur ce document elle y perd la barre oblique :
# « 6-7 mg/kg » devient « 6-7 mgg ». Une posologie fausse est pire que pas de
# posologie.
#
# pypdf décode correctement, mais ne rend pas de position exploitable ici : la
# plupart de ses fragments arrivent avec une matrice à zéro.
#
# On garde donc la géométrie de l'une et les caractères de l'autre, et SURTOUT
# on vérifie : toute cellule qui ne se retrouve pas telle quelle dans le texte
# correctement décodé est réparée depuis celui-ci, ou l'extraction s'arrête.
# Rien n'est deviné, rien n'est corrigé « au jugé ».

def texte_fiable(chemin):
    import pypdf
    r = pypdf.PdfReader(chemin)
    pages = {}
    for i in PAGES:
        frags = []
        def visiteur(texte, cm, tm, police, taille, _f=frags):
            s = (texte or "").strip()
            if s:
                _f.append(s)
        r.pages[i].extract_text(visitor_text=visiteur)
        pages[i] = frags
    return pages


def reparer(cellule, fiables, defauts):
    """Rend la cellule telle qu'elle est écrite dans le document."""
    c = propre(cellule)
    if not c:
        return c
    # Une cellule est assemblée depuis plusieurs fragments : elle n'égale donc
    # aucun fragment pris isolément. On la cherche dans le TEXTE de la page,
    # et non dans la liste des fragments — ma première version comparait aux
    # fragments et criait à l'ambiguïté sur des cellules parfaitement saines.
    if c in fiables["texte"]:
        return c                                       # déjà exacte
    # La corruption ne fait que PERDRE des caractères — « mg/kg » devient
    # « mgg », la barre oblique et le k disparaissant tous deux. Le texte abîmé
    # est donc toujours une SOUS-SÉQUENCE du texte véritable : on cherche le
    # fragment fiable dont il se déduit par suppressions, et par rien d'autre.
    #
    # Deux garde-fous, parce qu'une sous-séquence courte se retrouve partout :
    # le candidat ne doit pas être démesurément plus long, et il doit être
    # UNIQUE. Deux candidats, c'est une ambiguïté — et on ne tranche pas une
    # ambiguïté au hasard dans une posologie.
    candidats = [propre(f) for f in fiables["fragments"]
                 if _sous_sequence(c, propre(f))
                 and len(propre(f)) <= len(c) + max(4, len(c) // 4)
                 and propre(f) != c]
    uniques = sorted(set(candidats))
    if len(uniques) == 1:
        defauts.append((c, uniques[0]))
        return uniques[0]
    if not uniques:
        # Cellule longue, assemblée depuis plusieurs fragments : aucun fragment
        # isolé ne la couvre. On la retrouve alors dans le TEXTE de la page,
        # comme la plus courte fenêtre dont elle est une sous-séquence. Sans
        # cela, la posologie méningée du cotrimoxazole serait partie avec deux
        # « mgg » au lieu de « mg/kg ».
        rec = _recouvrer(c, fiables["texte"])
        if rec:
            defauts.append((c, rec))
            return rec
    if len(uniques) > 1:
        raise SystemExit(
            "Cellule ambiguë, extraction interrompue : %r pourrait être %s. "
            "Une posologie ne se tranche pas au hasard." % (c, " ou ".join(map(repr, uniques[:3]))))
    return c


def _recouvrer(c, texte):
    """La plus courte fenêtre de `texte` dont `c` est une sous-séquence.

    Bornée : au-delà de la longueur de la cellule plus la moitié, ce n'est plus
    une restitution mais une coïncidence, et l'on préfère échouer."""
    limite = len(c) + max(8, len(c) // 2)
    meilleure = None
    debut = -1
    while True:
        debut = texte.find(c[0], debut + 1)
        if debut < 0:
            break
        j, k = debut, 0
        fin = min(len(texte), debut + limite)
        while j < fin and k < len(c):
            if texte[j] == c[k]:
                k += 1
            j += 1
        if k == len(c) and (meilleure is None or j - debut < len(meilleure)):
            meilleure = texte[debut:j]
    return meilleure if meilleure and meilleure != c else None


def _sous_sequence(petit, grand):
    """petit s'obtient-il de grand en SUPPRIMANT des caractères ?"""
    it = iter(grand)
    return all(ch in it for ch in petit)


def js(valeur):
    if valeur is None:
        return "null"
    return '"' + valeur.replace("\\", "\\\\").replace('"', '\\"') + '"'


def main():
    if len(sys.argv) < 2:
        print(__doc__.strip().split("\n")[-1], file=sys.stderr)
        return 2
    molecules = agreger(lire(sys.argv[1]))

    # Le texte correctement décodé, toutes pages confondues : c'est lui qui
    # fait foi pour les caractères.
    _pages = texte_fiable(sys.argv[1])
    _frags = [f for liste in _pages.values() for f in liste]
    fiables = {"fragments": _frags, "texte": propre(" ".join(_frags))}
    defauts = []
    for m in molecules:
        for k in COLONNES:
            m[k] = reparer(m[k], fiables, defauts)

    # LE CONTRÔLE QUI COMPTE : une cellule qui ne se retrouve pas telle quelle
    # dans le document n'a pas été lue, elle a été fabriquée par le découpage.
    # On s'arrête plutôt que de livrer une posologie inventée.
    suspectes = []
    for m in molecules:
        if CORRESPONDANCE.get(propre(m["agent"])) is None:
            continue                       # hors panel : non employé, non vérifié
        for k in COLONNES[1:]:
            v = propre(m[k])
            if v and v not in fiables["texte"]:
                suspectes.append((propre(m["agent"]), k, v))
    if suspectes:
        print("EXTRACTION INTERROMPUE — cellules introuvables dans le document :",
              file=sys.stderr)
        for agent, col, v in suspectes[:10]:
            print("    %-26s %-11s %r" % (agent[:26], col, v[:58]), file=sys.stderr)
        print("Ces valeurs viennent du découpage, pas du document. Corrigez le "
              "parseur, ou excluez la molécule en disant pourquoi.", file=sys.stderr)
        return 1

    # Code PhénoBac → liste de schémas (une entrée par voie d'administration).
    table = {}
    inconnus = []
    for m in molecules:
        nom = propre(m["agent"])
        code = CORRESPONDANCE.get(nom)
        if not code:
            inconnus.append(nom)
            continue
        std, forte = propre(m["standard"]), propre(m["forte"])
        entree = {
            "voie": nom,
            "standard": None if std.lower() == "none" or not std else std,
            # « None » est une DÉCISION du comité : pas de posologie forte pour
            # cette molécule. On la conserve comme telle, distincte d'une
            # absence d'extraction, que le contrôle plus bas interdit.
            "forte": None if forte.lower() == "none" or not forte else forte,
            "urinaire": propre(m["urinaire"]) or None,
            "particulier": propre(m["particulier"]) or None,
        }
        table.setdefault(code, []).append(entree)

    print("/* posologie.js — engendré par outils/extraire-posologie.py. NE PAS ÉDITER À LA MAIN.")
    print("   Source : EUCAST, Clinical Breakpoint Tables v16.1, valides depuis le")
    print("   2026-06-24, « Dosages used to define breakpoints », pages 9 à 13.")
    print("")
    print("   « forte: null » signifie que l'EUCAST NE DÉFINIT PAS de posologie forte")
    print("   pour cette molécule — ce n'est pas une donnée manquante. Une catégorie I")
    print("   n'y a donc pas de traduction posologique, et l'application doit le dire")
    print("   plutôt que d'inventer un schéma. */")
    print("(function (racine) {")
    print('"use strict";')
    print("var POSOLOGIE = {")
    for code in sorted(table):
        print("  %s: [" % code)
        for e in table[code]:
            print("    { voie: %s, standard: %s, forte: %s, urinaire: %s, particulier: %s }," % (
                js(e["voie"]), js(e["standard"]), js(e["forte"]),
                js(e["urinaire"]), js(e["particulier"])))
        print("  ],")
    print("};")
    print('var POSOLOGIE_VERSION = "EUCAST 16.1 (2026-06-24)";')
    print("var P = { POSOLOGIE: POSOLOGIE, POSOLOGIE_VERSION: POSOLOGIE_VERSION };")
    print("if (typeof module !== \"undefined\" && module.exports) module.exports = P;")
    print("else racine.PhenoBacPosologie = P;")
    print("})(typeof self !== \"undefined\" ? self : this);")

    print("\n%d molécules du document rattachées à %d codes."
          % (sum(len(v) for v in table.values()), len(table)), file=sys.stderr)
    if defauts:
        print("%d cellules réparées depuis le texte fiable (caractères perdus par "
              "la table de police) :" % len(defauts), file=sys.stderr)
        for avant, apres in defauts[:8]:
            print("    %r → %r" % (avant, apres), file=sys.stderr)
    if inconnus:
        print("Noms non rattachés (normal s'ils ne sont pas au panel) : %s"
              % ", ".join(sorted(set(inconnus))), file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
