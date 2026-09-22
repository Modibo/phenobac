# -*- coding: utf-8 -*-
"""
pdfpos.py — lecture positionnelle d'un PDF, bibliothèque standard seulement.

Le CA-SFM publie ses tableaux en PDF, et les colonnes ne se lisent qu'à la
position : « ZIT » n'est identifiable que parce qu'elle est la troisième
colonne. D'où une extraction qui conserve les coordonnées, au lieu d'aplatir
le texte.

Trois pièges, rencontrés sur les documents réels du comité :

  - les PDF 1.5+ rangent la plupart des objets dans des FLUX D'OBJETS
    compressés ; sans les déplier, on ne trouve aucune page ;
  - l'encodage des polices simples change d'un document à l'autre (le
    communiqué est en latin-1, le document des différences en MacRoman) ;
  - les polices « sous-ensemble » renumérotent les glyphes, et le texte sort
    décalé d'un nombre constant de caractères.

La table /ToUnicode répond aux deux derniers quand le producteur la fournit,
d'où son emploi systématique, avec l'encodage de repli en dernier recours.

En ligne de commande :

    python3 outils/pdfpos.py document.pdf [page] [encodage-de-repli]

Sans numéro de page, tout le document est extrait. L'encodage de repli vaut
« mac_roman » par défaut ; passez « latin-1 » si les accents sortent faux.
"""

import re, zlib, sys

def objets(data):
    """Renvoie {num: (dict_brut, flux_decompresse_ou_None)}."""
    out = {}
    for m in re.finditer(rb'(\d+)\s+(\d+)\s+obj\b', data):
        num = int(m.group(1)); start = m.end()
        e = data.find(b'endobj', start)
        if e < 0: continue
        body = data[start:e]
        sm = body.find(b'stream')
        raw = None; head = body
        if sm >= 0:
            head = body[:sm]
            s = sm + len(b'stream')
            if data[start+s:start+s+2] == b'\r\n': s += 2
            elif data[start+s:start+s+1] in (b'\n', b'\r'): s += 1
            en = body.find(b'endstream', s)
            raw = body[s:en if en > 0 else len(body)]
            if b'FlateDecode' in head:
                try: raw = zlib.decompress(raw)
                except Exception:
                    try: raw = zlib.decompressobj().decompress(raw)
                    except Exception: raw = b''
        out[num] = (head, raw)
    return deplier_objstm(out)

def deplier_objstm(objs):
    """Les PDF 1.5+ rangent la plupart des objets dans des « flux d'objets »
    compressés : sans les déplier, la recherche de « N 0 obj » ne trouve rien.
    Chaque ObjStm commence par N paires « numéro décalage », puis les corps
    à partir de /First."""
    ajouts = {}
    for num, (head, raw) in list(objs.items()):
        if not re.search(rb'/Type\s*/ObjStm', head) or not raw:
            continue
        mN = re.search(rb'/N\s+(\d+)', head)
        mF = re.search(rb'/First\s+(\d+)', head)
        if not mN or not mF:
            continue
        n, first = int(mN.group(1)), int(mF.group(1))
        entetes = raw[:first].split()
        for i in range(n):
            try:
                onum = int(entetes[2 * i]); off = int(entetes[2 * i + 1])
            except (IndexError, ValueError):
                break
            fin = len(raw)
            if i + 1 < n:
                try: fin = first + int(entetes[2 * i + 3])
                except (IndexError, ValueError): pass
            corps = raw[first + off:fin]
            # Un objet dans un ObjStm n'a jamais de flux : seulement un dictionnaire.
            if onum not in objs:
                ajouts[onum] = (corps, None)
    objs.update(ajouts)
    return objs


def pages(data, objs):
    """Liste des numeros d'objet de type /Page dans l'ordre du document."""
    res = []
    for num, (head, _) in objs.items():
        if re.search(rb'/Type\s*/Page\b', head): res.append(num)
    return sorted(res)

def contenu(objs, pnum):
    head, _ = objs[pnum]
    m = re.search(rb'/Contents\s+(\d+)\s+\d+\s+R', head)
    if m:
        c = int(m.group(1))
        return objs.get(c, (b'', b''))[1] or b''
    m = re.search(rb'/Contents\s*\[(.*?)\]', head, re.S)
    if m:
        buf = b''
        for r in re.finditer(rb'(\d+)\s+\d+\s+R', m.group(1)):
            buf += (objs.get(int(r.group(1)), (b'', b''))[1] or b'') + b'\n'
        return buf
    return b''

# ------------------------------------------------------------------
# Polices : table de correspondance code -> caractère.
#
# Deux pièges rendent l'extraction naïve illisible :
#   - l'encodage des polices simples varie d'un document à l'autre
#     (MacRoman ici, WinAnsi là) ;
#   - les polices « sous-ensemble » renumérotent les glyphes, si bien que
#     le texte sort décalé d'un nombre constant de caractères.
# La table /ToUnicode, quand le producteur la fournit, répond aux deux.
# ------------------------------------------------------------------

def _cmap(flux):
    """Analyse une CMap /ToUnicode -> {code: texte}."""
    table = {}
    if not flux:
        return table
    for bloc in re.findall(rb'beginbfchar(.*?)endbfchar', flux, re.S):
        for src, dst in re.findall(rb'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>', bloc):
            table[int(src, 16)] = _utf16(dst)
    for bloc in re.findall(rb'beginbfrange(.*?)endbfrange', flux, re.S):
        # forme 1 : <lo> <hi> <dst>      forme 2 : <lo> <hi> [<d1> <d2> ...]
        for m in re.finditer(rb'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]+>|\[[^\]]*\])', bloc, re.S):
            lo, hi, dst = int(m.group(1), 16), int(m.group(2), 16), m.group(3)
            if hi - lo > 65535:
                continue
            if dst.startswith(b'['):
                vals = re.findall(rb'<([0-9A-Fa-f]+)>', dst)
                for i, v in enumerate(vals):
                    table[lo + i] = _utf16(v)
            else:
                base = dst[1:-1]
                debut = int(base, 16)
                for i in range(hi - lo + 1):
                    table[lo + i] = _utf16(b'%04x' % (debut + i)) if len(base) <= 4 \
                        else _utf16(base[:-4] + (b'%04x' % (int(base[-4:], 16) + i)))
    return table


def _utf16(hexa):
    try:
        b = bytes.fromhex(hexa.decode() if isinstance(hexa, bytes) else hexa)
    except ValueError:
        return ''
    if len(b) % 2:
        b += b'\x00'
    try:
        return b.decode('utf-16-be')
    except Exception:
        return ''


def polices(objs, pnum):
    """{nom: (table, octets_par_code)} pour les polices de la page."""
    head, _ = objs.get(pnum, (b'', None))
    m = re.search(rb'/Font\s*<<(.*?)>>', head, re.S)
    ressources = m.group(1) if m else b''
    if not ressources:
        # /Resources peut être un renvoi vers un autre objet
        mr = re.search(rb'/Resources\s+(\d+)\s+\d+\s+R', head)
        if mr:
            rh, _ = objs.get(int(mr.group(1)), (b'', None))
            m2 = re.search(rb'/Font\s*<<(.*?)>>', rh or b'', re.S)
            ressources = m2.group(1) if m2 else b''
    out = {}
    for nom, num in re.findall(rb'/([^\s/<>]+)\s+(\d+)\s+\d+\s+R', ressources):
        fh, _ = objs.get(int(num), (b'', None))
        if fh is None:
            continue
        large = b'/Type0' in fh
        mt = re.search(rb'/ToUnicode\s+(\d+)\s+\d+\s+R', fh)
        table = {}
        if mt:
            table = _cmap(objs.get(int(mt.group(1)), (b'', b''))[1])
        out[nom.decode('latin-1')] = (table, 2 if large else 1)
    return out


def _octets(tok):
    """Octets bruts d'une chaîne PDF, littérale (...) ou hexa <...>."""
    if tok.startswith(b'<'):
        h = re.sub(rb'[^0-9A-Fa-f]', b'', tok[1:-1])
        if len(h) % 2:
            h += b'0'
        try:
            return bytes.fromhex(h.decode())
        except ValueError:
            return b''
    s = tok[1:-1]
    out = bytearray(); i = 0
    while i < len(s):
        c = s[i:i + 1]
        if c == b'\\':
            n = s[i + 1:i + 2]
            m = {b'n': b'\n', b'r': b'\r', b't': b'\t', b'b': b'\b', b'f': b'\f',
                 b'(': b'(', b')': b')', b'\\': b'\\'}
            if n in m:
                out += m[n]; i += 2; continue
            o = re.match(rb'[0-7]{1,3}', s[i + 1:i + 4])
            if o:
                out.append(int(o.group(0), 8)); i += 1 + len(o.group(0)); continue
            i += 2; continue
        out += c; i += 1
    return bytes(out)


def decoder(tok, police, repli='mac_roman'):
    """Chaîne PDF -> texte, via la table /ToUnicode si la police en a une."""
    b = _octets(tok)
    table, taille = police if police else (None, 1)
    if table:
        out = []
        pas = taille
        for i in range(0, len(b) - pas + 1, pas):
            code = int.from_bytes(b[i:i + pas], 'big')
            out.append(table.get(code, ''))
        s = ''.join(out)
        if s.strip():
            return s
    if taille == 2 or (len(b) % 2 == 0 and b[:2] == b'\xfe\xff'):
        try:
            return b.decode('utf-16-be')
        except Exception:
            pass
    return b.decode(repli, 'replace')


def _txt(tok):
    """Decode une chaine PDF litterale (...) ou hexa <...>."""
    if tok.startswith(b'<'):
        h = re.sub(rb'[^0-9A-Fa-f]', b'', tok[1:-1])
        if len(h) % 2: h += b'0'
        b = bytes.fromhex(h.decode())
        if len(b) % 2 == 0 and b[:2] in (b'\xfe\xff',):
            return b.decode('utf-16-be', 'replace')
        # souvent du UTF-16BE sans BOM dans les polices Identity-H
        try: return b.decode('utf-16-be')
        except Exception: return b.decode('mac_roman', 'replace')
    s = tok[1:-1]
    out = bytearray(); i = 0
    while i < len(s):
        c = s[i:i+1]
        if c == b'\\':
            n = s[i+1:i+2]
            m = {b'n': b'\n', b'r': b'\r', b't': b'\t', b'b': b'\b', b'f': b'\f',
                 b'(': b'(', b')': b')', b'\\': b'\\'}
            if n in m: out += m[n]; i += 2; continue
            o = re.match(rb'[0-7]{1,3}', s[i+1:i+4])
            if o: out.append(int(o.group(0), 8)); i += 1 + len(o.group(0)); continue
            i += 2; continue
        out += c; i += 1
    return out.decode('mac_roman', 'replace')

TOK = re.compile(rb'(\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]*>|\[|\]|[-+]?[\d.]+|/[^\s/\[\]<>()]+|[A-Za-z\'"*]+)')

def extraire(flux, polices_page=None, repli='mac_roman'):
    """Renvoie [(x, y, texte)] pour un flux de contenu.

    polices_page : sortie de polices(), pour décoder via /ToUnicode.
    repli        : encodage employé faute de table (mac_roman ou latin-1)."""
    polices_page = polices_page or {}
    police = None
    res = []
    pile = []
    tm = [1,0,0,1,0,0]; tlm = tm[:]
    leading = 0.0
    for m in TOK.finditer(flux):
        t = m.group(1)
        if t in (b'[', b']'):
            if t == b'[': pile.append('[')
            continue
        if re.fullmatch(rb'[-+]?[\d.]+', t):
            try: pile.append(float(t))
            except Exception: pile.append(0.0)
            continue
        if t.startswith(b'(') or t.startswith(b'<'):
            pile.append(decoder(t, police, repli)); continue
        if t.startswith(b'/'):
            pile.append(t.decode('latin-1')); continue
        op = t.decode('latin-1')
        args = [a for a in pile if a != '[']
        if op == 'BT': tm = [1,0,0,1,0,0]; tlm = tm[:]
        elif op == 'Tf':
            # /NomDePolice taille Tf — le nom est le premier argument /…
            noms = [x for x in args if isinstance(x, str) and x.startswith('/')]
            if noms:
                police = polices_page.get(noms[0][1:])
        elif op == 'TL' and args: leading = args[-1] if isinstance(args[-1], float) else 0
        elif op == 'Tm' and len(args) >= 6:
            tm = [float(v) for v in args[-6:]]; tlm = tm[:]
        elif op == 'Td' and len(args) >= 2:
            tx, ty = float(args[-2]), float(args[-1])
            tlm = [tlm[0], tlm[1], tlm[2], tlm[3], tlm[4]+tx*tlm[0]+ty*tlm[2], tlm[5]+tx*tlm[1]+ty*tlm[3]]
            tm = tlm[:]
        elif op == 'TD' and len(args) >= 2:
            tx, ty = float(args[-2]), float(args[-1]); leading = -ty
            tlm = [tlm[0], tlm[1], tlm[2], tlm[3], tlm[4]+tx*tlm[0]+ty*tlm[2], tlm[5]+tx*tlm[1]+ty*tlm[3]]
            tm = tlm[:]
        elif op in ("T*",):
            tlm = [tlm[0], tlm[1], tlm[2], tlm[3], tlm[4]-leading*tlm[2], tlm[5]-leading*tlm[3]]
            tm = tlm[:]
        elif op in ('Tj', "'", '"'):
            if op != 'Tj':
                tlm = [tlm[0], tlm[1], tlm[2], tlm[3], tlm[4]-leading*tlm[2], tlm[5]-leading*tlm[3]]
                tm = tlm[:]
            s = ''.join(a for a in args if isinstance(a, str) and not a.startswith('/'))
            if s: res.append((tm[4], tm[5], s))
        elif op == 'TJ':
            s = ''.join(a for a in args if isinstance(a, str) and not a.startswith('/'))
            if s: res.append((tm[4], tm[5], s))
        pile = []
    return res

def lignes(items, tol=2.5):
    """Regroupe les fragments en lignes triees haut->bas, gauche->droite."""
    items = sorted(items, key=lambda it: (-it[1], it[0]))
    out = []; cur = []; y = None
    for x, yy, s in items:
        if y is None or abs(yy - y) <= tol:
            cur.append((x, s)); y = yy if y is None else y
        else:
            out.append((y, sorted(cur))); cur = [(x, s)]; y = yy
    if cur: out.append((y, sorted(cur)))
    return out

if __name__ == '__main__':
    data = open(sys.argv[1], 'rb').read()
    objs = objets(data)
    pg = pages(data, objs)
    only = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].strip() else None
    repli = sys.argv[3] if len(sys.argv) > 3 else 'mac_roman'
    for i, p in enumerate(pg, 1):
        if only and i != only: continue
        print(f"\n===== PAGE {i} (obj {p}) =====")
        for y, frags in lignes(extraire(contenu(objs, p), polices(objs, p), repli)):
            print(f"{y:7.1f} | " + "  ".join(s for _, s in frags))
