# -*- coding: utf-8 -*-
"""
extraire-especes.py — les tables d'espèces du classeur EUCAST, lues et non recopiées.

POURQUOI UN OUTIL PLUTÔT QU'UNE RECOPIE

Recopier un tableau de seuils à la main, c'est se donner une chance sur
quelques dizaines de se tromper d'une dilution. Le 24 octobre 2026, quatre
seuils de Bacteroides fragilis se sont révélés faux de la sorte — plus
permissifs que le document, depuis on ne sait quand. L'outil lit les blocs du
classeur, les traduit en lignes de base-connaissances.js, et S'ARRÊTE si une
section attendue manque. Il n'écrit rien : il imprime, et c'est un humain qui
colle, après avoir lu.

Il remplace extraire-anaerobies.py, dont il reprend les sections : réextraire
Prevotella ou Fusobacterium doit redonner EXACTEMENT les lignes déjà en base.
C'est une régression gratuite, et il faut s'en servir.

DEUX MISES EN PAGE, UN SEUL LECTEUR

  · les feuilles d'anaérobies portent PLUSIEURS espèces, chacune annoncée par
    une ligne seule en colonne A (« Cutibacterium acnes ») ;
  · les autres feuilles portent UNE espèce, annoncée par le titre de la
    feuille, et découpent les molécules par classe (« Penicillins »).

Dans les deux cas les colonnes sont les mêmes : B = CMI S ≤, C = CMI R >,
D = ZIT en CMI, E = charge du disque, F = diamètre S ≥, G = diamètre R <,
H = ZIT au disque, et I LES NOTES.

LA COLONNE I A ÉTÉ IGNORÉE PENDANT TOUT CE TEMPS, ET C'EST GRAVE

Les seuils ne disent pas tout. La colonne I porte les règles qui changent un
résultat : « Isolates susceptible to benzylpenicillin can be reported
susceptible to all beta-lactam agents with breakpoints » — une seule
pénicilline G suffit alors à rendre huit β-lactamines, ce qui, dans un
laboratoire qui compte ses disques, n'est pas un détail. Elle porte aussi les
molécules qu'on lit sur le disque d'une AUTRE (« Susceptibility can be
inferred from ampicillin »), sans quoi une case reste vide alors que le
document donne la réponse. Et elle porte l'avertissement qui évite de rendre
une fausse résistance au métronidazole quand l'anaérobiose était mauvaise.

L'outil les imprime, et SIGNALE celles qu'il ne sait pas reconnaître : une
note d'action passée sous silence est exactement le défaut qu'on cherche à
ne plus commettre.

CE QUE L'OUTIL SAIT LIRE, ET QUI NE SE DEVINE PAS

  « 0.001 » en CMI et « 50 » au disque ne sont pas des seuils : c'est la
  note 13 du classeur — un seuil hors échelle, qui signifie « ne JAMAIS
  rendre S ». PhénoBac l'écrit S = null. Les deux doivent aller ensemble ;
  si l'un est là sans l'autre, l'outil s'arrête plutôt que d'inventer.

  « (2) » entre parenthèses est un seuil fondé sur l'ECOFF (note 12) : il
  sépare le sauvage de l'acquis et ne promet rien en clinique. L'outil pose
  la colonne « ecoff ».

  « (screen only) » avec « NA » en CMI n'est pas un seuil clinique mais un
  DÉPISTAGE : colonne « dep », et rien d'autre. Le confondre avec un seuil
  rendrait « sensible » sur une lecture qui ne le dit pas.

  « (uncomplicated UTI only) » vise la cystite simple : site « urinaire ».

  « IE », « Note », « NA » et « – » ne sont pas des nombres. Les prendre
  pour zéro serait inventer un seuil ; l'outil les déclare non chiffrés.

    python3 outils/extraire-especes.py <classeur.xlsx> [groupe…]
"""
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)
from classeur import Classeur                                 # noqa: E402

# Nom EUCAST -> code PhénoBac. Ce qui n'y figure pas n'est pas testé par
# PhénoBac, et c'est une réponse, pas un oubli : l'ampicilline-sulbactam, par
# exemple, n'est pas au panel. L'outil l'imprime en commentaire pour qu'on
# voie ce qu'on laisse.
AGENTS = {
    "benzylpenicillin": "PEN", "ampicillin": "AMP", "amoxicillin": "AMX",
    "amoxicillin-clavulanic acid": "AMC", "piperacillin-tazobactam": "TZP",
    "ertapenem": "ETP", "imipenem": "IPM", "meropenem": "MEM",
    "clindamycin": "DA", "metronidazole": "MTZ", "vancomycin": "VA",
    "moxifloxacin": "MXF", "chloramphenicol": "CAF", "linezolid": "LZD",
    "cefotaxime": "CTX", "ceftriaxone": "CRO", "ceftazidime": "CAZ",
    "cefepime": "FEP", "cefiderocol": "FDC", "aztreonam": "ATM",
    "ciprofloxacin": "CIP", "levofloxacin": "LVX",
    "erythromycin": "E", "azithromycin": "AZM",
    "doxycycline": "DOX", "minocycline": "MIN", "tetracycline": "TET",
    "rifampicin": "RD", "nitrofurantoin": "NIT",
    "trimethoprim-sulfamethoxazole": "SXT", "gentamicin": "GEN",
    "amikacin": "AMK", "teicoplanin": "TEC", "daptomycin": "DAP",
}

# feuille · titre de section (None = la feuille entière) · groupe PhénoBac ·
# espèce visée quand une section en couvre plusieurs.
#
# DEUX GROUPES POUR FUSOBACTERIUM, ET C'EST VOULU. La section couvre
# F. necrophorum ET F. nucleatum, mais le document les SÉPARE sur deux
# molécules : l'amoxicilline-acide clavulanique et la pipéracilline-tazobactam
# sont chiffrées pour le premier et renvoyées à une note pour le second. Un
# seul groupe appliquerait les seuils de l'un à l'autre — « un chiffre juste
# au mauvais endroit », le défaut le plus difficile à repérer.
GN = "Anaerobic bacteria_G-negative"
GP = "Anaerobic bacteria_G-positive"
TABLES = [
    (GN, "Bacteroides spp.", "bfragilis", None),
    (GN, "Prevotella spp.", "prevotella", None),
    (GN, "Fusobacterium necrophorum and Fusobacterium nucleatum",
     "fnecrophorum", "necrophorum"),
    (GN, "Fusobacterium necrophorum and Fusobacterium nucleatum",
     "fnucleatum", "nucleatum"),

    (GP, "Clostridium perfringens", "cperfringens", None),
    (GP, "Clostridium innocuum", "cinnocuum", None),
    (GP, "Clostridium ramosum", "cramosum", None),
    (GP, "Clostridium septicum", "csepticum", None),
    (GP, "Clostridium tertium", "ctertium", None),
    (GP, "Cutibacterium acnes", "cacnes", None),
    (GP, "Cutibacterium avidum", "cavidum", None),
    (GP, "Finegoldia spp.", "finegoldia", None),
    (GP, "Parvimonas micra", "parvimonas", None),
    (GP, "Peptostreptococcus anaerobius", "peptostrepto", None),
    (GP, "Peptoniphilus spp.", "peptoniphilus", None),

    ("Pasteurella", None, "pasteurella", None),
    ("Aeromonas", None, "aeromonas", None),
    ("A.xylosoxidans", None, "achromobacter", None),
    ("K.kingae", None, "kingella", None),
    ("A.sanguinicola_A.urinae", None, "aerococcus", None),
    # DEUX GROUPES, comme pour Fusobacterium : la feuille couvre C. diphtheriae
    # ET C. ulcerans, mais la clindamycine n'est chiffrée que pour la première
    # — « Wild-type C. ulcerans is less susceptible to clindamycin ». Un seul
    # groupe appliquerait le seuil de l'une à l'autre.
    ("C.diphtheriae_C.ulcerans", None, "cdiphtheriae", "diphtheriae"),
    ("C.diphtheriae_C.ulcerans", None, "culcerans", "ulcerans"),
]

# Les notes qui CHANGENT un résultat, et ce qu'elles veulent dire. Tout ce qui
# ressemble à une note d'action sans correspondre à l'un de ces motifs est
# signalé « NON TRAITÉE » : une note lue à moitié ne vaut pas mieux que pas lue.
ACTIONNABLES = [
    (re.compile(r"susceptible to benzylpenicillin can be reported susceptible to all beta-lactam", re.I),
     "PEN-S ⇒ toutes les β-lactamines à seuil peuvent être rendues S sans autre test"),
    (re.compile(r"inferred from ([a-z\- ]+?)(?: susceptibility| disk| disc|\.|,)", re.I),
     "TÉMOIN : se lit sur %s"),
    (re.compile(r"Infer susceptibility from ([a-z\- ]+?)(?: susceptibility|\.|,)", re.I),
     "TÉMOIN : se lit sur %s"),
    # « Isolates susceptible to X can be reported susceptible to Y » : c'est X
    # le témoin et Y l'inféré — l'ordre des groupes est inverse de la lecture
    # naïve, et le confondre désignerait le mauvais disque.
    (re.compile(r"Isolates susceptible to ([a-z]+) can be reported susceptible to ([a-z]+)", re.I),
     "TÉMOIN : %2$s se lit sur %1$s"),
    # Forme conditionnelle : la catégorie du témoin décide de celle de l'inféré,
    # et les deux ne sont pas forcément la même (I sur la pénicilline G donne S
    # sur l'amoxicilline mais I sur la céfotaxime). Un témoin ordinaire
    # recopierait la catégorie et se tromperait.
    (re.compile(r"Isolates [\"“]?susceptible, increased exposure[\"”]?\s*\(I\) to ([a-z]+) "
                r"can be reported [\"“]?(susceptible(?:, increased exposure)?)[\"”]?\s*(?:\(I\)\s*)?to ([a-z]+)", re.I),
     "INFÉRENCE CONDITIONNELLE : %1$s I ⇒ %3$s « %2$s »"),
    (re.compile(r"Isolates categorised as screen negative can be reported susceptible to ([a-z]+ and [a-z]+)", re.I),
     "DÉPISTAGE : écran négatif ⇒ %s sensibles ; écran positif ⇒ tester ou rendre R"),
    (re.compile(r"Metronidazole resistance is rare", re.I),
     "FAUSSE RÉSISTANCE : confirmer l'anaérobiose avant de rendre MTZ résistant"),
    (re.compile(r"Inducible clindamycin resistance", re.I),
     "D-TEST : résistance inductible à la clindamycine, à chercher par antagonisme"),
    (re.compile(r"breakpoints in brackets", re.I),
     "ECOFF : seuil entre parenthèses (colonne « ecoff »)"),
    (re.compile(r"can be used to screen for", re.I),
     "DÉPISTAGE : une molécule sert d'écran pour une classe"),
    (re.compile(r"[Bb]eta-lactamase positive isolates can be reported resistant", re.I),
     "β-LACTAMASE : sa détection suffit à rendre R les pénicillines sans inhibiteur"),
]

# Ce qui ressemble à une action. Une note qui correspond ici sans correspondre
# à ACTIONNABLES est imprimée en capitales : l'outil ne la comprend pas.
ODEUR_ACTION = re.compile(
    r"can be reported|should be tested|[Ii]nfer |inferred|screen for|"
    r"must be confirmed|without further testing", re.I)

# Notes purement techniques : elles ne changent aucune catégorie. Les déclarer
# ici est une décision, pas un silence.
INOFFENSIVES = re.compile(
    r"concentration of (clavulanic acid|sulbactam|tazobactam) is fixed|"
    r"in the ratio 1:19|"
    r"artefactually low MIC values|"
    r"Examine zones carefully|"
    r"Read the obvious zone edge|"
    r"There may be growth within the inhibition zone|"
    r"Non-wild type isolates were not available|"
    r"must be performed in iron-depleted|"
    r"For information on how to use breakpoints in brackets", re.I)


# LES TÉMOINS : une molécule dont on lit le disque d'une AUTRE.
#
# L'EUCAST chiffre la CMI de l'amoxicilline mais ne lui donne pas de disque :
# « Susceptibility can be inferred from ampicillin ». Sans cette ligne, un
# laboratoire qui travaille au disque — c'est-à-dire la quasi-totalité de
# ceux auxquels PhénoBac s'adresse — verrait l'amoxicilline rester sans
# catégorie alors que le document dit comment la rendre.
#
# CHAQUE TÉMOIN PORTE LA PHRASE QUI LE FONDE, et l'outil VÉRIFIE que cette
# phrase figure bien dans les notes du bloc. Un humain lit et déclare ; la
# machine confronte. Si l'EUCAST change la note, l'extraction s'arrête au lieu
# de reconduire une inférence qui n'est plus écrite nulle part.
AMX_SUR_AMP = "Susceptibility can be inferred from ampicillin"
TEMOINS = {
    ("prevotella", "AMX"):    ("AMP", AMX_SUR_AMP, "standard"),
    ("fnecrophorum", "AMX"):  ("AMP", AMX_SUR_AMP, "standard"),
    ("fnucleatum", "AMX"):    ("AMP", AMX_SUR_AMP, "standard"),
    ("cinnocuum", "AMX"):     ("AMP", AMX_SUR_AMP, "standard"),
    ("cramosum", "AMX"):      ("AMP", AMX_SUR_AMP, "standard"),
    ("csepticum", "AMX"):     ("AMP", AMX_SUR_AMP, "standard"),
    ("ctertium", "AMX"):      ("AMP", AMX_SUR_AMP, "standard"),
    ("cacnes", "AMX"):        ("AMP", AMX_SUR_AMP, "standard"),
    ("cavidum", "AMX"):       ("AMP", AMX_SUR_AMP, "standard"),
    ("finegoldia", "AMX"):    ("AMP", AMX_SUR_AMP, "standard"),
    ("parvimonas", "AMX"):    ("AMP", AMX_SUR_AMP, "standard"),
    ("peptostrepto", "AMX"):  ("AMP", AMX_SUR_AMP, "standard"),
    ("peptoniphilus", "AMX"): ("AMP", AMX_SUR_AMP, "standard"),

    ("pasteurella", "AMP"): ("PEN", "Infer susceptibility from benzylpenicillin susceptibility", "standard"),
    ("pasteurella", "AMX"): ("PEN", "Infer susceptibility from benzylpenicillin susceptibility", "standard"),
    ("kingella", "AMP"): ("PEN", "Susceptibility can be inferred from benzylpenicillin susceptibility", "standard"),
    ("kingella", "AMX"): ("PEN", "Susceptibility can be inferred from benzylpenicillin susceptibility", "standard"),
    ("kingella", "AZM"): ("E", "Infer susceptibility from erythromycin susceptibility", "standard"),
    ("kingella", "DOX"): ("TET", "Isolates categorised as susceptible can be reported susceptible to doxycycline", "standard"),
    ("aerococcus", "AMX"): ("AMP", "Infer susceptibility from ampicillin susceptibility", "standard"),
    ("aerococcus", "LVX"): ("CIP", "Susceptibility can be inferred from ciprofloxacin susceptibility", "urinaire"),
    ("cdiphtheriae", "DOX"): ("TET", "Isolates susceptible to tetracycline can be reported susceptible to doxycycline", "standard"),
    ("culcerans", "DOX"): ("TET", "Isolates susceptible to tetracycline can be reported susceptible to doxycycline", "standard"),
}


# Les intitulés de classe ne sont pas des molécules. On les reconnaît à leur
# colonne B, qui porte l'en-tête « MIC breakpoints » au lieu d'une valeur.
EN_TETES = ("mic breakpoints", "s ≤", "antimicrobial agent", "disk content")


def joli(x):
    """20.0 s'écrit 20 : un seuil se relit, et « 20.0 » accroche l'œil pour rien."""
    return str(int(x)) if x == int(x) else str(x)


def js(x):
    return "undefined" if x is None else ("null" if x == "null" else joli(x))


def nombre(v):
    """Le chiffre d'une cellule, ou None. « IE », « Note », « NA » et « – »
    n'en sont pas, et les confondre avec zéro serait inventer un seuil."""
    if v is None:
        return None
    t = str(v).strip().replace(",", ".").strip("()").rstrip("ABCDEFGH")
    if not t or not re.match(r"^\d+(\.\d+)?$", t):
        return None
    return float(t)


def parenthese(v):
    """Le classeur met entre parenthèses les seuils fondés sur l'ECOFF."""
    return v is not None and str(v).strip().startswith("(")


def bloc(lignes, titre):
    """Les lignes du tableau. Avec un titre : la section qui le suit, et elle
    seule. Sans titre : la feuille entière, en-têtes de classe retirés.

    UNE LIGNE SEULE EN COLONNE A N'EST PAS FORCÉMENT UN TITRE. Sous
    « Bacteroides spp. » vient « Breakpoints for Bacteroides spp. are also
    valid for Parabacteroides… » : de la prose, seule en colonne A elle aussi.
    Prise pour la section suivante, elle fermait la section à la ligne d'après
    et le groupe entier se comparait à RIEN. C'est exactement ce qui, le
    24 octobre 2026, a caché quatre seuils faux de B. fragilis. Un vrai titre
    est suivi, à quelques lignes près, de l'en-tête « MIC breakpoints »."""
    seule = lambda c: (c.get('A', '').strip() and len([k for k in c if k != 'A']) == 0)

    def est_titre(j):
        if not seule(lignes[j]):
            return False
        if j > 0 and seule(lignes[j - 1]):
            return False           # ligne de prose sous un titre, pas un titre
        for k in range(j + 1, min(j + 5, len(lignes))):
            if str(lignes[k].get('B') or "").strip().lower().startswith("mic breakpoints"):
                return True
        return False
    if titre is None:
        debut, fin = 0, len(lignes)
    else:
        debut = None
        for i, cel in enumerate(lignes):
            nom = re.sub(r"\s+", " ", cel.get('A', '')).strip()
            if est_titre(i) and nom == titre:
                debut = i + 1
                break
        if debut is None:
            raise SystemExit(
                "EXTRACTION INTERROMPUE — section « %s » introuvable. Le classeur "
                "a changé de structure ; mieux vaut ne rien produire que produire "
                "à côté." % titre)
        fin = len(lignes)
        for j in range(debut, len(lignes)):
            nom = re.sub(r"\s+", " ", lignes[j].get('A', '')).strip()
            if est_titre(j) and nom != titre:
                fin = j
                break
    out = []
    for cel in lignes[debut:fin]:
        nom = re.sub(r"\s+", " ", cel.get('A', '')).strip()
        if not nom or seule(cel):
            continue
        if str(cel.get('B') or "").strip().lower().startswith(EN_TETES):
            continue
        out.append((nom, cel))
    return out


def phrases(texte):
    """Une cellule de notes porte plusieurs items, numérotés « 1. » ou
    lettrés « A. », parfois « 2/A. ». On les sépare pour pouvoir dire,
    item par item, lequel est traité."""
    t = " ".join(str(texte).split())
    morceaux = re.split(r"(?:(?<=\.)|^)\s*(?=(?:\d+/[A-Z]|\d+|[A-Z])\.\s)", t)
    return [m.strip() for m in morceaux if m.strip()]


def notes_du_bloc(lignes):
    """Les notes de la colonne I, dans l'ordre, sans les bandeaux de page."""
    bandeau = ("EUCAST Clinical Breakpoint", "For abbreviations",
               "Disk diffusion (EUCAST standardised", "Notes Numbered notes relate")
    vues, out = set(), []
    for _nom, cel in lignes:
        v = cel.get('I')
        if not v:
            continue
        for p in phrases(v):
            if p.startswith(bandeau) or p in vues:
                continue
            vues.add(p)
            out.append(p)
    return out


def dire_notes(notes):
    """Imprime chaque note, en disant ce qu'elle impose — ou qu'on ne sait pas."""
    if not notes:
        print("//   (aucune note dans la colonne I)")
        return 0
    inconnues = 0
    for p in notes:
        lu = None
        for motif, sens in ACTIONNABLES:
            m = motif.search(p)
            if m:
                lu = (sens.replace("%1$s", "{0}").replace("%2$s", "{1}")
                          .replace("%3$s", "{2}").replace("%s", "{0}").format(*m.groups())
                      if "%" in sens else sens)
                break
        if lu:
            marque = "→ " + lu
        elif INOFFENSIVES.search(p):
            marque = "   (technique, ne change aucune catégorie)"
        elif ODEUR_ACTION.search(p):
            marque = "→ NOTE NON TRAITÉE — à lire et à décider À LA MAIN"
            inconnues += 1
        else:
            marque = "   (informative)"
        print("//   note : %s" % p[:300])
        print("//      %s" % marque)
    return inconnues


def ligne(groupe, code, meth, site, S, R, charge, dep, ecoff, zit, note):
    champs = ['"eucast"', '"%s"' % groupe, '"%s"' % code, '"%s"' % meth, '"%s"' % site,
              js(S), js(R),
              '"%s"' % charge if charge else "undefined",
              zit or "undefined", "undefined",
              js(dep), "undefined", "undefined", "undefined"]
    if ecoff:
        champs.append("true")
    return "[" + ",".join(champs) + "]," + (note or "")


def regles(c, feuille, titre, groupe, espece_visee, journal=None):
    """Les lignes de base-connaissances.js qu'impose cette table du classeur.

    Rendue à part de main() pour que outils/verifier-couverture-eucast.py
    confronte la base à CE QUE LE DOCUMENT DIT, sans repasser par le texte
    imprimé. Un vérificateur qui relirait la sortie de l'outil vérifierait
    l'impression, pas la lecture.

    `journal` reçoit les commentaires (molécules non portées, notes) quand on
    veut les voir ; la liste rendue ne contient que des règles.
    """
    dire = journal.append if journal is not None else (lambda _x: None)
    out = []
    lignes_bloc = bloc(c.lignes(feuille), titre)
    notes = notes_du_bloc(lignes_bloc)

    for nom, cel in lignes_bloc:
        base = re.sub(r"\s*[,(].*$", "", nom).strip().lower()
        base = re.sub(r"\s+(iv|oral)$", "", base)
        code = AGENTS.get(base)
        if not code:
            dire("//   %-48s — non testé par PhénoBac" % nom[:48])
            continue

        m = re.search(r",\s*[A-Z]\.\s*(\w+)", nom)
        note = ""
        if m:
            if espece_visee and m.group(1).lower() != espece_visee:
                continue
            note = "   // propre à %s" % m.group(0).lstrip(", ")

        depistage = "screen only" in nom.lower()
        site = "urinaire" if "uti only" in nom.lower() else "standard"

        sM, rM = nombre(cel.get('B')), nombre(cel.get('C'))
        sD, rD = nombre(cel.get('F')), nombre(cel.get('G'))
        charge = (str(cel.get('E')).strip() if cel.get('E') else None)
        ecoffM = parenthese(cel.get('B'))
        ecoffD = parenthese(cel.get('F'))

        horsM, horsD = (sM == 0.001), (sD == 50)
        if (horsM or horsD) and not (horsM and horsD) and sM is not None and sD is not None:
            raise SystemExit(
                "EXTRACTION INTERROMPUE — %s / %s : le classeur donne « S ≤ %s » "
                "et « S ≥ %s ». La note 13 veut les deux ensemble (0.001 et 50) ; "
                "l'un sans l'autre, on ne sait pas ce qui est voulu."
                % (groupe, code, cel.get('B'), cel.get('F')))
        if horsM:
            sM = "null"
        if horsD:
            sD = "null"

        zitM = cel.get('D') and "[%s]" % cel.get('D') or None
        zitD = cel.get('H') and "[%s]" % cel.get('H') or None

        if depistage:
            if sD is not None:
                out.append(ligne(groupe, code, "disque", site, None, None,
                                 charge, sD, False, None, note))
            else:
                dire("//   %-48s — dépistage non chiffré" % nom[:48])
            continue

        if sM is not None:
            out.append(ligne(groupe, code, "cmi", site, sM, rM, None, None,
                             ecoffM, zitM, note))
        if sD is not None and charge:
            out.append(ligne(groupe, code, "disque", site, sD, rD, charge, None,
                             ecoffD, zitD, note))
        if sM is None and sD is None:
            dire("//   %-48s — le document ne chiffre pas (« %s »)"
                 % (nom[:48], str(cel.get('B') or "–").strip()[:12]))

    texte_notes = " ".join(notes)
    for (g, code), (tem, phrase, site_t) in sorted(TEMOINS.items()):
        if g != groupe:
            continue
        if phrase.lower() not in texte_notes.lower():
            raise SystemExit(
                "EXTRACTION INTERROMPUE — le témoin %s/%s se réclame de la phrase\n"
                "  « %s »\n"
                "qui ne figure PLUS dans les notes de la table. Reconduire "
                "l'inférence sans elle, ce serait la supposer." % (groupe, code, phrase))
        out.append('["eucast","%s","%s","disque","%s",undefined,undefined,undefined,'
                   'undefined,"%s",undefined,undefined,undefined,undefined],'
                   '   // se lit sur le disque de %s (note du classeur)'
                   % (groupe, code, site_t, tem, tem))
    return out, notes


def main():
    if len(sys.argv) < 2:
        print(__doc__.strip().splitlines()[-1], file=sys.stderr)
        return 2
    c = Classeur(sys.argv[1])
    vises = set(sys.argv[2:])
    total, vus, inconnues = 0, 0, 0

    for feuille, titre, groupe, espece_visee in TABLES:
        if vises and groupe not in vises:
            continue
        vus += 1
        print("\n// --- %s%s (EUCAST v16.1, feuille « %s ») ---"
              % (titre or feuille,
                 " — %s" % espece_visee if espece_visee else "", feuille))
        journal = []
        lignes_regles, notes = regles(c, feuille, titre, groupe, espece_visee, journal)
        inconnues += dire_notes(notes)
        for j in journal:
            print(j)
        for l in lignes_regles:
            print(l)
        print("// %d règle(s) pour le groupe « %s »." % (len(lignes_regles), groupe))
        total += len(lignes_regles)

    if vises and vus != len(vises):
        raise SystemExit("Groupe(s) inconnu(s) : %s"
                         % ", ".join(sorted(vises - {t[2] for t in TABLES})))
    print("\n// %d règle(s) au total, %d table(s)." % (total, vus))
    if inconnues:
        print("//\n// %d note(s) d'action NON TRAITÉE(S) ci-dessus. Les coller sans les "
              "lire\n// reviendrait à publier des seuils dont on ignore les conditions."
              % inconnues)
    return 0


if __name__ == '__main__':
    sys.exit(main())
