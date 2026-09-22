# -*- coding: utf-8 -*-
"""
classeur.py — lecture d'un classeur .xlsx avec la bibliothèque standard.

Partagé par outils/comparer-eucast.py et outils/comparer-zit.py : les deux
lisent le même tableau officiel EUCAST, et il serait absurde d'en maintenir
deux lecteurs.

Un détail compte plus qu'il n'y paraît : les appels de note sont des « runs »
en exposant à l'intérieur de la même cellule. Sans les écarter, « 8 » avec le
renvoi 5 se lit « 85 ». Les valeurs seraient fausses sans bruit. La lecture
des chaînes partagées les supprime donc.
"""
import re, zipfile
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
