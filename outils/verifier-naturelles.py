# -*- coding: utf-8 -*-
"""
verifier-naturelles.py — les résistances naturelles déclarées par le moteur
correspondent-elles au document EUCAST ?

    python3 outils/verifier-naturelles.py

Une résistance naturelle déclarée à tort fait lever une FAUSSE alerte de
cohérence : le biologiste lit « incohérence » devant un résultat juste, et
finit par ne plus croire l'outil. C'est le pire défaut possible pour cette
fonction — pire qu'une alerte manquante, qui ne fait que laisser passer.

Trois contrôles :
  1. le moteur et le client déclarent la même chose ;
  2. les deux correspondent à outils/naturelles.py, transcription du document
     EUCAST « Expected Resistant Phenotypes » v1.2 ;
  3. les valeurs citées en toutes lettres dans les textes du moteur existent
     bien dans une table de seuils.

Attention au piège qui m'a fait signaler deux fausses erreurs : certains codes
d'antibiotiques ne font qu'UNE lettre (E pour érythromycine). Un motif qui
exigerait deux caractères les manquerait sans rien dire.

Le document se télécharge sur
https://www.eucast.org/fileadmin/eucast/pdf/expert_rules/Expected_Resistant_Phenotypes_v1.2_20230113.pdf
et ses NOTES comptent autant que son tableau : la règle 2.8 coche
« tétracyclines » pour S. maltophilia, mais la note précise que la sensibilité
à la doxycycline varie.
"""
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


def main():
    srv = os.path.join(RACINE, 'moteur.js')
    cli = os.path.join(RACINE, 'phenobac.html')
    ref = transcription()
    a = declarations(srv, 'burk')
    b = declarations(cli, 'burk')

    ecarts = []
    for germe in sorted(set(a) | set(b)):
        if a.get(germe) != b.get(germe):
            ecarts.append("%s : moteur %s, client %s"
                          % (germe, sorted(a.get(germe, [])), sorted(b.get(germe, []))))
    for germe in sorted(set(a) | set(ref)):
        attendu = set(ref.get(germe, ('', {}))[1].keys())
        obtenu = a.get(germe, set())
        if attendu != obtenu:
            ecarts.append("%s : moteur %s, document EUCAST %s"
                          % (germe, sorted(obtenu), sorted(attendu)))

    s = open(srv, encoding='utf-8').read()
    tables = valeurs_des_tables(s)
    prose = s[s.index('function rendreR'):]
    orphelines = []
    for c in sorted(set(re.findall(r'(\d+(?:[,.]\d+)?)\s*mg/L', prose)),
                    key=lambda x: float(x.replace(',', '.'))):
        n = c.replace(',', '.')
        if n not in tables and n.rstrip('0').rstrip('.') not in tables:
            orphelines.append(c)

    if ecarts or orphelines:
        print("Des déclarations DIVERGENT :")
        for e in ecarts:
            print("  -", e)
        for o in orphelines:
            print("  - valeur %s mg/L citée dans un texte sans correspondance dans une table" % o)
        return 1

    total = sum(len(c) for c in a.values())
    print("%d résistances naturelles déclarées sur %d germes." % (total, len(a)))
    print("Conformes au document EUCAST « Expected Resistant Phenotypes » v1.2,")
    print("et identiques entre le moteur et le client.")
    print("Les %d valeurs citées dans les textes existent dans les tables." % len(set(re.findall(r'\d+(?:[,.]\d+)?\s*mg/L', prose))))
    return 0


if __name__ == '__main__':
    sys.exit(main())
