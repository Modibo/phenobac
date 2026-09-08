# -*- coding: utf-8 -*-
"""
comparer-eucast.py — confronte les seuils de PhénoBac au tableau EUCAST officiel.

    python3 outils/comparer-eucast.py chemin/vers/v_16.1_Breakpoint_Tables.xlsx

Ne modifie RIEN. Produit un rapport à valider par un biologiste : pour chaque
seuil de l'application, la ou les lignes EUCAST correspondantes et leurs valeurs.

Le classeur officiel se télécharge sur
https://www.eucast.org/bacteria/clinical-breakpoints-and-interpretation/clinical-breakpoint-tables/

Deux pièges traités ici, et c'est la raison d'être de cet outil :

  1. Les renvois de notes sont des exposants COLLÉS à la valeur. Lus naïvement,
     « 8 note 4 » devient 84 : un seuil faux d'un facteur dix. Le lecteur
     écarte les passages en exposant.

  2. Un même antibiotique a plusieurs lignes selon la voie et l'indication
     (« Amoxicillin iv », « oral, uncomplicated UTI », « oral, other
     indications »…). Le choix relève du biologiste, pas du programme : quand
     plusieurs lignes correspondent, l'outil les affiche toutes et demande un
     arbitrage au lieu de trancher tout seul.
"""
import sys, os, re, json, zipfile
from xml.etree import ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
RID = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'


class Classeur:
    def __init__(self, chemin):
        self.z = zipfile.ZipFile(chemin)
        self.ss = self._chaines()
        self.feuilles = self._feuilles()

    def _chaines(self):
        try:
            x = self.z.read('xl/sharedStrings.xml')
        except KeyError:
            return []
        out = []
        for si in ET.fromstring(x).findall('m:si', NS):
            runs = si.findall('m:r', NS)
            if runs:
                bouts = []
                for r in runs:
                    rpr = r.find('m:rPr', NS)
                    if rpr is not None:
                        va = rpr.find('m:vertAlign', NS)
                        if va is not None and va.get('val') == 'superscript':
                            continue          # renvoi de note : écarté
                    t = r.find('m:t', NS)
                    if t is not None and t.text:
                        bouts.append(t.text)
                out.append(''.join(bouts))
            else:
                out.append(''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])))
        return out

    def _feuilles(self):
        rels = {}
        for rel in ET.fromstring(self.z.read('xl/_rels/workbook.xml.rels')):
            rels[rel.get('Id')] = rel.get('Target').lstrip('/')
        out = {}
        for sh in ET.fromstring(self.z.read('xl/workbook.xml')).iter('{%s}sheet' % NS['m']):
            t = rels.get(sh.get(RID), '')
            out[sh.get('name')] = t if t.startswith('xl/') else 'xl/' + t
        return out

    def lignes(self, nom):
        cible = self.feuilles.get(nom)
        if not cible:
            return []
        res = []
        for row in ET.fromstring(self.z.read(cible)).iter('{%s}row' % NS['m']):
            cells = {}
            for c in row.findall('m:c', NS):
                col = re.match(r'[A-Z]+', c.get('r')).group(0)
                v = c.find('m:v', NS)
                if c.get('t') == 's' and v is not None:
                    val = self.ss[int(v.text)]
                elif v is not None:
                    val = v.text
                else:
                    val = ''
                if val:
                    cells[col] = val.strip() if isinstance(val, str) else val
            if cells:
                res.append(cells)
        return res


# Groupe PhénoBac -> feuille du classeur EUCAST
FEUILLES = {
    'entero':   'Enterobacterales',
    'staph':    'Staphylococcus',
    'enteroc':  'Enterococcus',
    'pseudo':   'Pseudomonas',
    'acineto':  'Acinetobacter',
    'nonferm':  'S.maltophilia',
    'pneumo':   'S.pneumoniae',
    'strep':    'Streptococcus A,B,C,G',
    'grampos':  'Streptococcus A,B,C,G',
    'fastid':   'H.influenzae',
    'curved':   'C.jejuni_C.coli',
    'anaerobe': 'Anaerobic bacteria_G-negative',
}

# Code PhénoBac -> motif de recherche dans la colonne « agent » d'EUCAST.
# Motifs volontairement larges : mieux vaut plusieurs candidats affichés
# qu'un mauvais choix opéré en silence.
AGENTS = {
    'AMX': r'^amoxicillin\b(?!-)', 'AMP': r'^ampicillin\b(?!-)',
    'AMC': r'^amoxicillin-clavulanic', 'TZP': r'^piperacillin-tazobactam',
    'FOX': r'^cefoxitin', 'CTX': r'^cefotaxime', 'CAZ': r'^ceftazidime\b(?!-)',
    'FEP': r'^cefepime', 'ETP': r'^ertapenem', 'IPM': r'^imipenem\b(?!-)',
    'MEM': r'^meropenem\b(?!-)', 'CIP': r'^ciprofloxacin', 'LVX': r'^levofloxacin',
    'GEN': r'^gentamicin\b(?!.*high)', 'HLG': r'gentamicin.*high|high.*gentamicin',
    'AMK': r'^amikacin', 'SXT': r'^trimethoprim-sulfamethoxazole',
    'FOS': r'^fosfomycin', 'COL': r'^colistin', 'AZM': r'^azithromycin',
    'OXA': r'^oxacillin', 'PEN': r'^benzylpenicillin', 'E': r'^erythromycin',
    'DA': r'^clindamycin', 'RD': r'^rifampicin', 'VA': r'^vancomycin',
    'TEC': r'^teicoplanin', 'LZD': r'^linezolid', 'DOX': r'^doxycycline',
    'MTZ': r'^metronidazole', 'CAF': r'^chloramphenicol',
}


def seuils_phenobac(racine):
    """Extrait la table BP du moteur serveur, sans exécuter de JavaScript."""
    p = os.path.join(racine, 'netlify', 'functions', 'premium-interpret.js')
    s = open(p, encoding='utf-8').read()
    i = s.index('const BP ='); j = s.index('{', i); prof = 0
    for k in range(j, len(s)):
        if s[k] == '{': prof += 1
        elif s[k] == '}':
            prof -= 1
            if prof == 0:
                bloc = s[j:k + 1]; break
    table = {}
    for mg in re.finditer(r'(\w+)\s*:\s*\{((?:[^{}]|\{[^{}]*\})*)\}', bloc):
        groupe, corps = mg.group(1), mg.group(2)
        entrees = {}
        for ma in re.finditer(r'(\w+)\s*:\s*\{\s*S:\s*([\d.]+)\s*,\s*R:\s*([\d.]+)\s*\}', corps):
            entrees[ma.group(1)] = (float(ma.group(2)), float(ma.group(3)))
        if entrees:
            table[groupe] = entrees
    return table


def nombre(txt):
    if txt is None: return None
    t = str(txt).strip().strip('()')
    if t in ('-', '', 'IE', 'NA'): return None
    m = re.match(r'^([\d.]+)$', t)
    return float(m.group(1)) if m else None


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    racine = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    c = Classeur(sys.argv[1])
    bp = seuils_phenobac(racine)

    total = {'identique': 0, 'different': 0, 'arbitrer': 0, 'absent': 0}
    for groupe in sorted(bp):
        feuille = FEUILLES.get(groupe)
        print("\n=== groupe %s  ->  feuille EUCAST %s ===" % (groupe, feuille or "(non associée)"))
        if not feuille or feuille not in c.feuilles:
            print("   feuille introuvable — association à compléter dans FEUILLES")
            continue
        lignes = c.lignes(feuille)
        for code in sorted(bp[groupe]):
            sA, rA = bp[groupe][code]
            motif = AGENTS.get(code)
            cands = []
            if motif:
                for cel in lignes:
                    nom = cel.get('A', '')
                    if re.search(motif, nom, re.I):
                        sE, rE = nombre(cel.get('B')), nombre(cel.get('C'))
                        if sE is not None or rE is not None:
                            cands.append((nom, sE, rE))
            if not motif:
                etat, detail = 'absent', "aucun motif de recherche défini pour ce code"
            elif not cands:
                etat, detail = 'absent', "aucune ligne EUCAST correspondante sur cette feuille"
            elif len(cands) == 1:
                nom, sE, rE = cands[0]
                if sE == sA and rE == rA:
                    etat, detail = 'identique', nom
                else:
                    etat, detail = 'different', "%s : EUCAST S<=%s R>%s" % (nom, sE, rE)
            else:
                etat = 'arbitrer'
                detail = "%d lignes possibles :" % len(cands)
            total[etat] += 1
            marque = {'identique': ' ok ', 'different': '!!!!', 'arbitrer': ' ?? ', 'absent': ' -- '}[etat]
            print("  [%s] %-4s application S<=%-7s R>%-7s  %s" % (marque, code, sA, rA, detail))
            if etat == 'arbitrer':
                for nom, sE, rE in cands:
                    concorde = "  <- concorde" if (sE == sA and rE == rA) else ""
                    print("            %-58s S<=%-7s R>%s%s" % (nom[:58], sE, rE, concorde))

    print("\n=== bilan ===")
    print("  identiques         : %d" % total['identique'])
    print("  DIFFÉRENTS         : %d   <- à corriger après validation" % total['different'])
    print("  à arbitrer         : %d   <- plusieurs voies/indications possibles" % total['arbitrer'])
    print("  non comparés       : %d" % total['absent'])
    print("\nAucun fichier n'a été modifié. Toute correction doit être validée")
    print("par un biologiste avant d'être portée dans le code.")


if __name__ == '__main__':
    main()
