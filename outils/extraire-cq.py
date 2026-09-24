# -*- coding: utf-8 -*-
"""
extraire-cq.py — cibles de contrôle de qualité, au disque, depuis le CA-SFM.

    python3 outils/extraire-cq.py casfm_complet.txt

Pourquoi cette table existe : PhénoBac sait désormais traduire un diamètre en
catégorie. Encore faut-il que le diamètre soit juste. Un lot de disques mal
conservé, une gélose trop épaisse, un inoculum trop dense — et toutes les
zones se déplacent ensemble, sans que rien ne le signale. Le contrôle sur
souche de référence est le seul garde-fou : si E. coli ATCC 25922 ne donne
pas 22 mm ± 4 à l'amikacine, ce n'est pas la souche du malade qui est en
cause, c'est la manipulation.

Les tableaux du chapitre 1.4 du communiqué sont réguliers sur leurs trois
dernières colonnes — charge du disque, diamètre cible, limites acceptables —
et c'est tout ce qui est lu ici. Les colonnes de CMI, elles, arrivent
disloquées par les retours à la ligne ; elles ne sont pas reprises.
"""
import re
import sys

# Souche de référence -> groupe de seuils de PhénoBac. Ne sont retenues que
# les souches « sauvages » du contrôle de routine : celles des points 1.4.10
# et suivants servent à contrôler la DÉTECTION d'un mécanisme de résistance,
# ce qui est un autre exercice.
SOUCHES = [
    ("ecoli25922",   "1.4.1",  "Escherichia coli",      "ATCC 25922", "entero"),
    ("paeru27853",   "1.4.2",  "Pseudomonas aeruginosa", "ATCC 27853", "pseudo"),
    ("saureus29213", "1.4.3",  "Staphylococcus aureus", "ATCC 29213", "staph"),
    ("efaecalis29212", "1.4.4", "Enterococcus faecalis", "ATCC 29212", "enteroc"),
    ("spneumo49619", "1.4.5",  "Streptococcus pneumoniae", "ATCC 49619", "pneumo"),
    ("hinflu49766",  "1.4.6",  "Haemophilus influenzae", "ATCC 49766", "haemo"),
    ("cjejuni33560", "1.4.7",  "Campylobacter jejuni",  "ATCC 33560", "campylo"),
]

# Nom français du communiqué -> code PhénoBac. Les noms tronqués par un retour
# à la ligne (« Amoxicilline-acide » pour « Amoxicilline-acide clavulanique »)
# figurent tels qu'ils apparaissent : c'est la ligne qui porte les chiffres.
CODES = {
    'amoxicilline': 'AMX', 'ampicilline': 'AMP',
    'amoxicilline-acide': 'AMC', 'amoxicilline-acide clavulanique': 'AMC',
    # « Pipéracilline- » avec son tiret final est un nom coupé par un retour à
    # la ligne : il n'existe pas d'autre association commençant ainsi. La
    # pipéracilline seule, sans tiret, n'est pas reprise — PhénoBac ne la
    # porte pas, et la confondre avec l'association serait une faute.
    'pipéracilline-tazobactam': 'TZP', 'pipéracilline-': 'TZP',
    'céfoxitine': 'FOX',
    'céfotaxime': 'CTX', 'ceftazidime': 'CAZ', 'céfépime': 'FEP',
    'ertapénème': 'ETP', 'imipénème': 'IPM', 'méropénème': 'MEM',
    'ciprofloxacine': 'CIP', 'gentamicine': 'GEN', 'amikacine': 'AMK',
    'triméthoprime-': 'SXT', 'triméthoprime-sulfaméthoxazole': 'SXT',
    'colistine': 'COL', 'pénicilline g': 'PEN', 'érythromycine': 'E',
    'clindamycine': 'DA', 'vancomycine': 'VA', 'téicoplanine': 'TEC',
    'rifampicine': 'RD', 'linézolide': 'LZD', 'oxacilline': 'OXA',
    'lévofloxacine': 'LVX', 'azithromycine': 'AZM', 'minocycline': 'MIN',
    'chloramphénicol': 'CAF', 'métronidazole': 'MTZ', 'doxycycline': 'DOX',
    'témocilline': 'TEM', 'céfidérocol': 'FDC', 'daptomycine': 'DAP',
    'moxifloxacine': 'MXF', 'fosfomycine': 'FOS', 'péfloxacine': 'PEF',
}

# Les trois dernières colonnes : charge du disque, cible, limites acceptables.
# La cible est parfois un intervalle d'un millimètre (« 22-23 ») lorsque la
# valeur médiane tombe entre deux entiers.
QUEUE = re.compile(
    r'\s(\d+(?:[.,]\d+)?(?:-\d+(?:[.,]\d+)?)?|\d+\s*(?:unité|unit|UI))'   # charge
    r'\s+(\d+)(?:-(\d+))?'                                                # cible
    r'\s+(\d+)-(\d+)\s*$')                                                # limites


def pages(texte):
    out, courante = {}, None
    for ligne in texte.splitlines():
        m = re.match(r'^===== PAGE (\d+) ', ligne)
        if m:
            courante = int(m.group(1)); out[courante] = []
        elif courante is not None:
            out[courante].append(ligne.split('|', 1)[-1])
    return out


def section(pg, numero, suivant):
    """Lignes comprises entre deux titres de section (1.4.1, 1.4.2…)."""
    debut = re.compile(r'^\s*' + re.escape(numero) + r'\.\s')
    fin = re.compile(r'^\s*' + re.escape(suivant) + r'\.\s') if suivant else None
    dedans, garde = False, []
    for n in sorted(pg):
        for ligne in pg[n]:
            if debut.search(ligne):
                dedans = True; continue
            if dedans and fin and fin.search(ligne):
                return garde
            if dedans:
                garde.append(ligne)
    return garde


def lire(lignes):
    table = {}
    for ligne in lignes:
        l = re.sub(r'\s+', ' ', ligne).strip()
        if not l:
            continue
        # Le PDF coupe parfois un intervalle au milieu : « 22- 23 ». Sans ce
        # recollage, la ligne ne ressemble plus à rien et la molécule
        # disparaît de la table — la gentamicine et le méropénème y étaient
        # passés, et rien ne l'avait signalé.
        l = re.sub(r'(\d)\s*-\s*(\d)', r'\1-\2', l)
        m = QUEUE.search(l)
        if not m:
            continue
        # Entre le nom et les colonnes de diamètres s'intercalent celles des
        # CMI. Le nom est donc la suite de mots qui PRÉCÈDE le premier jeton
        # chiffré — ou le premier tiret, qui marque une CMI sans valeur.
        mots, nom = l[:m.start()].strip().split(), []
        for mot in mots:
            # « Note » tient lieu de valeur de CMI quand le comité renvoie à
            # une remarque : c'est une colonne, pas un morceau du nom.
            if (mot in ("-", "\u2013", "\u2014") or mot.lower().startswith("note")
                    or re.match(r'^[-\u2212(]?[\d.,]', mot)):
                break
            nom.append(mot)
        nom = " ".join(nom).lower()
        nom = re.sub(r'\s*\((?:dépistage|concentration fixe|ratio[^)]*)\)$', '', nom).strip()
        code = CODES.get(nom)
        if not code:
            continue
        # « 1 unité » et « 1 unit » désignent le même disque : le communiqué
        # est en français, le tableau EUCAST en anglais. Une seule graphie,
        # sinon le contrôle croisé des charges signale un écart qui n'en est pas.
        charge = m.group(1).replace(',', '.').replace('unité', 'unit')
        charge = re.sub(r'\s+', ' ', charge).strip()
        cible = int(m.group(2)) if not m.group(3) else (int(m.group(2)) + int(m.group(3))) / 2
        bas, haut = int(m.group(4)), int(m.group(5))
        if not (bas <= cible <= haut):
            # La ligne a été mal découpée par l'extraction du PDF. C'est le
            # cas du cotrimoxazole chez le pneumocoque, dont les colonnes
            # arrivent dans le désordre (« 22-26 18 » au lieu de « 22 18-26 »).
            # On préfère un trou, que verifier-cq.py signale, à une cible
            # devinée : un contrôle de qualité faux est pire que pas de
            # contrôle du tout.
            continue
        # Une molécule vue deux fois (voies différentes) : la première suffit.
        table.setdefault(code, {"charge": charge, "cible": cible, "min": bas, "max": haut})
    return table


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    pg = pages(open(sys.argv[1], encoding='utf-8').read())
    numeros = [s[1] for s in SOUCHES] + ["1.4.8"]

    print("/* Contrôle de qualité au disque — souches de référence, CA-SFM 2026,")
    print("   chapitre 1.4. Produit par outils/extraire-cq.py.")
    print()
    print("   Un diamètre hors limites ne met pas en cause la souche du malade :")
    print("   il met en cause le lot de disques, la gélose, l'inoculum ou la")
    print("   lecture. Tant qu'il n'est pas rentré dans les limites, les")
    print("   antibiogrammes du jour ne devraient pas être rendus. */")
    print("const CQ = {")
    total = 0
    for i, (cle, num, espece, atcc, groupe) in enumerate(SOUCHES):
        t = lire(section(pg, num, numeros[i + 1]))
        total += len(t)
        abx = ", ".join('%s:{c:"%s",v:%s,min:%d,max:%d}'
                        % (k, v["charge"], ("%g" % v["cible"]), v["min"], v["max"])
                        for k, v in sorted(t.items()))
        print('  %s:{ espece:"%s", souche:"%s", groupe:"%s",' % (cle, espece, atcc, groupe))
        print('    abx:{ %s } },' % abx)
    print("};")
    print("\n// %d cibles sur %d souches." % (total, len(SOUCHES)), file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
