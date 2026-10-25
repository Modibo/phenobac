# -*- coding: utf-8 -*-
"""
agents_fr.py — le nom français d'un antibiotique, et le code de PhénoBac.

POURQUOI UN MODULE À PART

Deux outils lisent le communiqué du CA-SFM : comparer-zit.py pour les zones
d'incertitude, comparer-casfm.py pour le delta des concentrations critiques.
Chacun a besoin de reconnaître « Triméthoprime-sulfaméthoxazole » et d'en
faire « SXT ». Deux listes auraient divergé — c'est ce qui est arrivé le
25 octobre 2026 à douze fonctions recopiées de moteur.js dans la page.

CE QUE LA LECTURE D'UN PDF FAIT AUX NOMS

Le texte extrait n'arrive pas propre. On y trouve « Amo xicilline-acide
clavulanique », « Amoxicilline p er os », « Méropèneme » (la coquille est dans
le document), « Triméthoprime- » suivi de sa fin à la ligne suivante, des
appels de notes collés (« Érythromycine* ») et des numéros de note seuls dans
la colonne du nom (« 1, 2 »). La reconnaissance se fait donc sur une forme
NORMALISÉE — sans accents, sans espaces, sans ponctuation — et par préfixe.

CE QUI N'EST PAS AU PANEL EST DÉCLARÉ, PAS TU

Une molécule que PhénoBac ne teste pas vaut None : c'est une réponse. Un nom
qui ne correspond à rien du tout est signalé comme un DÉFAUT DE L'OUTIL, et
non comme une absence dans l'application — l'ignorance d'un vérificateur ne
doit jamais se présenter comme un verdict.
"""
import re
import unicodedata


def norme(t):
    """« Amo xicilline-acide clavulanique » -> « amoxicillineacideclavulanique »."""
    t = unicodedata.normalize("NFD", str(t))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", t.lower())


# Préfixe normalisé -> code PhénoBac, ou None pour « hors du panel, et c'est
# une décision ». L'ordre compte : on essaie le plus long d'abord, sinon
# « amoxicilline » attraperait « amoxicilline-acide clavulanique ».
TABLE = [
    ("trimethoprimesulfamethoxazole", "SXT"),
    ("amoxicillineacideclavulanique", "AMC"),
    ("ticarcillineacideclavulanique", None),
    ("piperacillinetazobactam", "TZP"),
    ("ceftolozanetazobactam", None),
    ("quinupristinedalfopristine", None),
    ("ampicillinesulbactam", None),
    ("aztreonamavibactam", None),
    ("ceftazidimeavibactam", None),
    ("meropenemvaborbactam", None),
    ("imipenemrelebactam", None),
    ("benzylpenicilline", "PEN"),
    ("penicillineg", "PEN"),
    ("amoxicilline", "AMX"),
    ("ampicilline", "AMP"),
    ("piperacilline", None),      # seule, sans inhibiteur : hors panel
    ("ticarcilline", None),
    ("temocilline", "TEM"),
    ("mecillinam", "MEC"),
    ("oxacilline", "OXA"),
    ("cefoxitine", "FOX"),
    ("cefotaxime", "CTX"),
    ("ceftriaxone", "CRO"),
    ("ceftazidime", "CAZ"),
    ("cefepime", "FEP"),
    ("cefixime", "CFM"),
    ("cefuroxime", None),
    ("cefpodoxime", None),
    ("cefalexine", None),
    ("ceftaroline", None),
    ("ceftobiprole", None),
    ("cefiderocol", "FDC"),
    ("ertapeneme", "ETP"),
    ("imipeneme", "IPM"),
    # « Méropèneme » : la coquille est dans le document. La corriger ici, c'est
    # lire ce qui est écrit ; l'ignorer, c'est perdre la ligne.
    ("meropeneme", "MEM"), ("meropeneme", "MEM"), ("meropeneme", "MEM"),
    ("aztreonam", "ATM"),
    ("ciprofloxacine", "CIP"),
    ("levofloxacine", "LVX"),
    ("ofloxacine", "OFX"),
    ("moxifloxacine", "MXF"),
    ("pefloxacine", "PEF"),
    ("norfloxacine", None),
    ("delafloxacine", None),
    ("acidenalidixique", None),
    ("gentamicine", "GEN"),
    ("amikacine", "AMK"),
    ("tobramycine", None),
    ("kanamycine", None),
    ("nettlmicine", None),
    ("erythromycine", "E"),
    ("azithromycine", "AZM"),
    ("clarithromycine", None),
    ("roxithromycine", None),
    ("spiramycine", None),
    ("clindamycine", "DA"),
    ("pristinamycine", None),
    ("lefamuline", None),
    ("vancomycine", "VA"),
    ("teicoplanine", "TEC"),
    ("dalbavancine", None),
    ("oritavancine", None),
    ("telavancine", None),
    ("daptomycine", "DAP"),
    ("linezolide", "LZD"),
    ("tedizolide", None),
    ("tetracycline", "TET"),
    ("doxycycline", "DOX"),
    ("minocycline", "MIN"),
    ("tigecycline", None),
    ("eravacycline", None),
    ("omadacycline", None),
    ("rifampicine", "RD"),
    ("fosfomycine", "FOS"),
    ("nitrofurantoine", "NIT"),
    ("nitroxoline", None),
    ("trimethoprime", "TMP"),
    ("colistine", "COL"),
    ("chloramphenicol", "CAF"),
    ("acidefusidique", None),
    ("mupirocine", None),
    ("metronidazole", "MTZ"),
    ("gepotidacine", None),
    ("fidaxomicine", None),
    ("sulfamethoxazole", None),   # la fin d'un nom coupé en bout de ligne
]
TABLE.sort(key=lambda x: -len(x[0]))

# Ce qui occupe la colonne du nom sans être un nom : appels de notes, numéros
# de page, en-têtes. Les prendre pour des antibiotiques inconnus gonflerait la
# liste des « non lus » et noierait les vrais.
# Les secondes moitiés des noms composés. Si elles suivent un nom connu, le
# nom lu n'est pas celui qu'on croit.
SECONDES_MOITIES = ("acide", "clavulanique", "tazobactam", "sulbactam",
                    "avibactam", "relebactam", "vaborbactam", "dalfopristine",
                    "sulfamethoxazole", "enmetazobactam", "durlobactam")

PAS_UN_NOM = re.compile(r"^[\d\s,.*/-]*$")
BRUIT = {"casfm", "zit", "", "note", "notes"}


# UN NOM COUPÉ EN FIN DE LIGNE EST UN PIÈGE, PAS UN NOM.
#
# « Triméthoprime- » est le début de « Triméthoprime-sulfaméthoxazole ». Pris
# pour un nom entier, il donne TMP là où le document parle de SXT : un chiffre
# juste au mauvais endroit, le défaut le plus difficile à repérer. De même,
# « Pénicilline G (méningites et » attend « endocardites) » à la ligne
# suivante, et l'indication change le seuil.
#
# Le lecteur recolle (voir comparer-casfm.py) ; ce garde-fou attrape ce qui
# lui échappe, en SIGNALANT au lieu de deviner.
INCOMPLET = re.compile(r"[-–]\s*$")


def tronque(agent):
    t = str(agent).strip()
    if INCOMPLET.search(t):
        return True
    return t.count("(") > t.count(")")


def code(agent):
    """(code, lu). « lu » distingue « hors panel, c'est voulu » — le code vaut
    alors None — de « nom que l'outil ne sait pas lire », qui est un défaut de
    l'outil et doit se voir."""
    if PAS_UN_NOM.match(str(agent)):
        return None, True                     # appel de note : rien à lire
    n = norme(agent)
    if not n or n in BRUIT:
        return None, True
    if tronque(agent):
        return None, False          # nom coupé : à recoller, jamais à deviner
    # UN NOM QUI EST LE DÉBUT D'UN AUTRE EST AMBIGU, PAS RECONNU.
    #
    # « Amoxicilline-acide » est le début de « Amoxicilline-acide
    # clavulanique », dont la fin est à la ligne suivante. Reconnu par
    # préfixe, il donnait AMX — l'amoxicilline — avec les seuils de
    # l'association, et pour les cystites par-dessus le marché. Trois
    # erreurs d'un coup, et aucune visible.
    #
    # On ne refuse que ce qui n'est PAS un nom complet par ailleurs :
    # « Triméthoprime » seul existe (TMP) même s'il commence
    # « Triméthoprime-sulfaméthoxazole », et il se reconnaît.
    exact = [c for p, c in TABLE if p == n]
    if exact:
        return exact[0], True
    if any(p.startswith(n) and p != n for p, _c in TABLE):
        return None, False          # début d'un nom plus long : à recoller
    for prefixe, c in TABLE:
        if n.startswith(prefixe):
            reste = n[len(prefixe):]
            # … et symétriquement, ce qui SUIT un nom connu peut en faire un
            # autre : « amoxicilline » + « acide… » n'est pas l'amoxicilline.
            if any(p.startswith(n) for p, _c in TABLE if len(p) > len(prefixe)):
                return None, False
            if reste and any(reste.startswith(q) for q in SECONDES_MOITIES):
                return None, False
            return c, True
    return None, False


# Indication portée par l'intitulé. PhénoBac range les seuils par SITE, et
# comparer un seuil de cystite au seuil ordinaire donnerait un faux écart.
def site(agent):
    a = norme(agent)
    if "cystite" in a or "urinaire" in a:
        return "urinaire"
    if "meningite" in a:
        return "meninge"
    if "depistage" in a:
        return "depistage"
    if "endocardite" in a:
        return "endocardite"
    return "standard"
