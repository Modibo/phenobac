# -*- coding: utf-8 -*-
"""
verifier-naturelles.py — les résistances naturelles déclarées par le moteur
correspondent-elles au document EUCAST ?

    python3 outils/verifier-naturelles.py

Une résistance naturelle déclarée à tort fait lever une FAUSSE alerte de
cohérence : le biologiste lit « incohérence » devant un résultat juste, et
finit par ne plus croire l'outil. C'est le pire défaut possible pour cette
fonction — pire qu'une alerte manquante, qui ne fait que laisser passer.

Quatre contrôles :
  1. le moteur et le client déclarent la même chose ;
  2. les deux correspondent à outils/naturelles.py, transcription du document
     EUCAST « Expected Resistant Phenotypes » v1.2 ;
  3. les valeurs citées en toutes lettres dans les textes du moteur existent
     bien dans une table de seuils ;
  4. AUCUN SEUIL NE CONTREDIT UNE RÉSISTANCE NATURELLE DÉCLARÉE — ajouté le
     2026-11-02, voir plus bas.

Attention au piège qui m'a fait signaler deux fausses erreurs : certains codes
d'antibiotiques ne font qu'UNE lettre (E pour érythromycine). Un motif qui
exigerait deux caractères les manquerait sans rien dire.

Le document se télécharge sur
https://www.eucast.org/fileadmin/eucast/pdf/expert_rules/Expected_Resistant_Phenotypes_v1.2_20230113.pdf
et ses NOTES comptent autant que son tableau : la règle 2.8 coche
« tétracyclines » pour S. maltophilia, mais la note précise que la sensibilité
à la doxycycline varie.
"""
# ---------------------------------------------------------------------------
# LE QUATRIÈME CONTRÔLE : UN SEUIL QUI CONTREDIT UNE RÉSISTANCE NATURELLE
#
# PhénoBac dit deux choses sur un même couple, dans deux tables différentes :
#
#   ORG[espèce].intrinsic[molécule]   « naturellement résistante », avec la
#                                     règle EUCAST qui le justifie ;
#   BP[groupe][molécule]              un seuil, qui peut rendre « S ».
#
# Les deux ne peuvent pas être vraies ensemble. Le moteur lève bien une alerte
# de cohérence quand le résultat sort « S » — mais il le sort quand même, et
# le compte rendu porte alors un « sensible » sur une molécule que
# l'application déclare inactive par nature.
#
# LE CONTRÔLE NE DEMANDE AUCUN DOCUMENT : c'est la base confrontée à
# elle-même. Il a trouvé DIX couples, tous marqués « convention de
# laboratoire » — le drapeau disait vrai sur l'absence de seuil EUCAST, et
# taisait que l'application affirme ailleurs le contraire de ce que le seuil
# permet de rendre.
#
# Ils sont listés ci-dessous pour que le contrôle passe au vert aujourd'hui,
# et pour qu'ils ne puissent pas se multiplier. CE N'EST PAS UN ACQUIT : la
# résolution — retirer le seuil, ou le rendre incapable de conclure
# « sensible » — appartient au biologiste, et chacun de ces couples attend sa
# décision. Un couple ajouté sans figurer ici fera tomber la chaîne.
CONTRADICTIONS_CONNUES = {
    # Stenotrophomonas maltophilia — L1 métallo-β-lactamase, aminosides et
    # carbapénèmes inactifs. Le classeur EUCAST ne porte aucun de ces couples
    # sur sa feuille ; PhénoBac les chiffre par convention.
    ("steno", "AMK"), ("steno", "GEN"), ("steno", "IPM"),
    ("steno", "MEM"), ("steno", "TZP"),
    # Burkholderia cepacia — mêmes familles, même absence de la feuille. Et le
    # CA-SFM a SUPPRIMÉ ce chapitre en 2026 (déjà signalé par reglesCasfm).
    ("burk", "AMK"), ("burk", "GEN"), ("burk", "COL"), ("burk", "TZP"),
    # Listeria monocytogenes — « céphalosporines naturellement inactives
    # (toutes, dont C3G) », règle 4.11 du document EUCAST. C'est le couple le
    # plus lourd des quatorze : rendre une céfotaxime « sensible » sur une
    # Listeria oriente vers un traitement qui ne marchera pas.
    ("listeria", "CTX"),
    # LA CÉFOXITINE DES PRODUCTEURS D'AmpC — quatre couples que je n'avais pas
    # vus, et que ce contrôle a sortis dès qu'il a su se restreindre aux
    # conventions. C. freundii, E. cloacae, K. aerogenes et Serratia portent
    # une céphalosporinase naturelle ; l'EUCAST, lui, ne donne la céfoxitine
    # que comme ÉCRAN — « Cefoxitin (screen only) » —, sans seuil
    # thérapeutique. PhénoBac en a fait un seuil de 8 mg/L, qui peut rendre
    # « sensible » une molécule que l'espèce hydrolyse par construction.
    ("entero", "FOX"), ("serratia", "FOX"),
}

import os, re, sys, importlib.util

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def transcription():
    chemin = os.path.join(RACINE, 'outils', 'naturelles.py')
    spec = importlib.util.spec_from_file_location('naturelles', chemin)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.NATURELLES


def declarations(chemin, ouvrant):
    """{germe: {codes}} lus dans la table ORG du fichier."""
    s = open(chemin, encoding='utf-8').read()
    deb = s.index('const ORG')
    out = {}
    for m in re.finditer(r'\n  (\w+):\s*\{', s[deb:]):
        nom = m.group(1)
        depart = deb + m.end()
        suivant = s.find('\n  ', depart)
        i = s.find('intrinsic:', depart)
        if i < 0:
            continue
        # l'accolade de intrinsic doit appartenir à CE germe
        borne = s.find('\n  %s' % ouvrant, depart + 4000)
        j = s.index('{', i)
        prof = 0
        for k in range(j, len(s)):
            if s[k] == '{':
                prof += 1
            elif s[k] == '}':
                prof -= 1
                if prof == 0:
                    break
        # un code d'antibiotique fait une à trois lettres majuscules
        out[nom] = set(re.findall(r'[{,]\s*([A-Z]{1,3})\s*:\s*"', s[j:k + 1]))
    return {g: c for g, c in out.items() if c}


def valeurs_des_tables(s):
    v = set()
    for nom in ('BP', 'BP_MENINGE', 'BP_CASFM', 'BP_CASFM_URIN', 'BP_MENINGE_CASFM'):
        if 'const %s = {' % nom not in s:
            continue
        i = s.index('const %s = {' % nom); j = s.index('{', i); prof = 0
        for k in range(j, len(s)):
            if s[k] == '{':
                prof += 1
            elif s[k] == '}':
                prof -= 1
                if prof == 0:
                    break
        v |= set(x.rstrip('.') for x in re.findall(r'[SR]:\s*([\d.]+)', s[j:k + 1]))
    for nom in ('ZIT', 'ZIT_CASFM'):
        if 'const %s = {' % nom not in s:
            continue
        i = s.index('const %s = {' % nom); j = s.index('{', i); prof = 0
        for k in range(j, len(s)):
            if s[k] == '{':
                prof += 1
            elif s[k] == '}':
                prof -= 1
                if prof == 0:
                    break
        v |= set(x.rstrip('.') for x in re.findall(r':\s*([\d.]+)', s[j:k + 1]))
    return v


import importlib.util as _ilu


def _mod(nom, fichier):
    _s = _ilu.spec_from_file_location(nom, os.path.join(os.path.dirname(os.path.abspath(__file__)), fichier))
    _m = _ilu.module_from_spec(_s); _s.loader.exec_module(_m); return _m


MP = _mod("moteur_py", "moteur_py.py")


def main():
    srv = os.path.join(RACINE, 'moteur.js')
    cli = os.path.join(RACINE, 'phenobac.html')
    ref = transcription()
    a = declarations(srv, 'burk')

    ecarts = []
    # La page déclarait autrefois sa propre copie d'ORG, qu'il fallait
    # confronter à celle du moteur. Elle ne la déclare plus : elle l'emprunte.
    # Ce qu'il faut garder, c'est que personne ne la redéclare — sans quoi la
    # divergence reviendrait sans que rien ne la cherche.
    page = open(cli, encoding='utf-8').read()
    if re.search(r'intrinsic\s*:\s*\{', page):
        ecarts.append("phenobac.html redéclare des résistances naturelles : elles "
                      "appartiennent au moteur, qui les porte avec la règle EUCAST "
                      "qui les justifie, et les deux copies pourraient diverger")
    for germe in sorted(set(a) | set(ref)):
        attendu = set(ref.get(germe, ('', {}))[1].keys())
        obtenu = a.get(germe, set())
        if attendu != obtenu:
            ecarts.append("%s : moteur %s, document EUCAST %s"
                          % (germe, sorted(obtenu), sorted(attendu)))

    s = open(srv, encoding='utf-8').read()
    # Les tables sont ÉVALUÉES : le moteur ne les porte plus comme littéraux.
    tables = set()
    for nom, tbl in MP.tables(['BP', 'BP_MENINGE', 'BP_CASFM', 'BP_CASFM_URIN',
                               'BP_MENINGE_CASFM', 'ZIT', 'ZIT_CASFM']).items():
        for grp in tbl.values():
            for v in grp.values():
                vals = v.values() if isinstance(v, dict) else [v]
                for x in vals:
                    if isinstance(x, (int, float)):
                        tables.add(('%f' % x).rstrip('0').rstrip('.'))
    prose = s[s.index('function rendreR'):]
    orphelines = []
    for c in sorted(set(re.findall(r'(\d+(?:[,.]\d+)?)\s*mg/L', prose)),
                    key=lambda x: float(x.replace(',', '.'))):
        n = c.replace(',', '.')
        if n not in tables and n.rstrip('0').rstrip('.') not in tables:
            orphelines.append(c)

    # --- 4. aucun seuil ne contredit une résistance naturelle déclarée ---
    # LA PREMIÈRE VERSION DE CE CONTRÔLE ACCUSAIT TRENTE COUPLES JUSTES.
    # Elle refusait tout seuil posé sur une molécule déclarée naturellement
    # inactive. Or le référentiel chiffre lui-même la colistine des
    # entérobactéries, alors que Serratia, Proteus et Providencia y sont
    # naturellement résistants : le document porte les DEUX faits sans se
    # contredire, et la mesure tombera normalement du côté « R ».
    #
    # LA CONTRADICTION N'EXISTE QUE SI LE SEUIL EST UNE CONVENTION — c'est-à-
    # dire quand le référentiel ne chiffre RIEN et que PhénoBac a mis un
    # chiffre quand même, sur une molécule qu'il déclare par ailleurs
    # inactive par nature. Là, les deux affirmations sont toutes deux de
    # PhénoBac, et elles se contredisent.
    seuils = MP.tables(['BP', 'BP_MENINGE', 'BP_URIN', 'BP_CASFM',
                        'BP_CASFM_URIN', 'BP_MENINGE_CASFM'])
    conventions = MP.tables(['HORS_EUCAST']).get('HORS_EUCAST') or {}
    groupes = {}
    for m in re.finditer(r'^\s{2}(\w+):\s*\{.*?bpGroup:\s*"(\w+)"', s, re.M | re.S):
        groupes.setdefault(m.group(1), m.group(2))
    contradictions, declarees = [], 0
    for germe, molecules in sorted(a.items()):
        grp = groupes.get(germe)
        if not grp:
            continue
        for k in sorted(molecules):
            porte = any((tbl.get(grp) or {}).get(k) for tbl in seuils.values())
            if not porte:
                continue
            # Seuil du référentiel : les deux faits coexistent dans le
            # document, il n'y a rien à trancher.
            if k not in (conventions.get(grp) or {}):
                continue
            if (grp, k) in CONTRADICTIONS_CONNUES:
                declarees += 1
            else:
                contradictions.append("%s (%s) / %s : déclarée naturellement "
                                      "résistante ET chiffrée" % (germe, grp, k))

    if contradictions:
        ecarts.extend(contradictions)

    if ecarts or orphelines:
        print("Des déclarations DIVERGENT :")
        for e in ecarts:
            print("  -", e)
        for o in orphelines:
            print("  - valeur %s mg/L citée dans un texte sans correspondance dans une table" % o)
        return 1

    total = sum(len(c) for c in a.values())
    print("%d résistances naturelles déclarées sur %d germes." % (total, len(a)))
    print("Conformes au document EUCAST « Expected Resistant Phenotypes » v1.2.")
    print("La page ne les redéclare pas : elle les emprunte au moteur.")
    print("Les %d valeurs citées dans les textes existent dans les tables." % len(set(re.findall(r'\d+(?:[,.]\d+)?\s*mg/L', prose))))
    print("Aucun seuil ne contredit une résistance naturelle, hors les %d "
          "contradictions déclarées — qui attendent un arbitrage, pas un "
          "classement." % declarees)
    return 0


if __name__ == '__main__':
    sys.exit(main())
