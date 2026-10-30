# -*- coding: utf-8 -*-
"""
verifier-raccord.py — la page, la porte et le moteur se parlent-ils encore ?

LE SEUL ENDROIT QUE RIEN NE COUVRAIT

Les bancs éprouvent le moteur : on lui donne un antibiogramme, on vérifie la
catégorie. Ils ne touchent jamais au RACCORD — ce que la page met dans sa
requête, ce que la porte HTTP en fait, ce qu'elle rend, et ce que la page lit
en retour. C'est pourtant là qu'une régression a un jour cassé TOUTES les
interprétations, pour toutes les espèces, sans qu'aucun banc ne bronche : le
raisonnement était intact, c'est la jonction qui ne tenait plus.

Un raccord se casse de quatre façons, et aucune ne se voit à la lecture :

  1. la page envoie un champ que personne ne lit — le réglage est ignoré en
     silence, et l'utilisateur croit l'avoir appliqué ;
  2. la page lit une réponse que le serveur n'émet pas — le champ vaut
     « undefined », et l'écran se vide sans dire pourquoi ;
  3. la page a DEUX chemins vers le même résultat, le moteur local et le
     serveur, et l'un rend un champ que l'autre laisse tomber : le défaut
     n'apparaît qu'hors ligne, ou qu'en ligne ;
  4. la page envoie un mode de saisie que le moteur ne sait pas traiter.

Ce contrôle lit les trois fichiers comme du TEXTE et confronte leurs
vocabulaires. Il ne lance rien : la porte HTTP tient à « crypto » et aux
modules de Netlify, que jsc ne sait pas charger, et Node n'est pas installé
sur le poste. Une vérification qui ne tourne jamais ne vérifie rien — celle-ci
tourne partout.

    python3 outils/verifier-raccord.py
"""
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)

PAGE = os.path.join(RACINE, "phenobac.html")
PORTE = os.path.join(RACINE, "netlify", "functions", "premium-interpret.js")
MOTEUR = os.path.join(RACINE, "moteur.js")


def lire(chemin):
    with open(chemin, encoding="utf-8") as f:
        return f.read()


def bloc(texte, depart, fin="\n}"):
    """Le corps d'une fonction, depuis sa déclaration jusqu'à l'accolade
    fermante en début de ligne. Suffisant ici : toutes les fonctions visées
    sont au premier niveau du fichier."""
    i = texte.index(depart)
    j = texte.index(fin, i)
    return texte[i:j]


# ---------------------------------------------------------------- vocabulaires

def champs_envoyes(page):
    """Ce que la page met dans sa requête. Les trois modes de saisie
    construisent trois objets différents : on les prend tous."""
    corps = bloc(page, "async function renderInterpretRemote(")
    i = corps.index("const envoi =")
    j = corps.index(";", i)
    return set(re.findall(r"(?:^|[{,\s])([a-zA-Z_]\w*)\s*:", corps[i:j]))


def modes_envoyes(page):
    corps = bloc(page, "async function renderInterpretRemote(")
    i = corps.index("const envoi =")
    j = corps.index(";", i)
    return set(re.findall(r"mode\s*:\s*\"(\w+)\"", corps[i:j]))


def modes_traites(moteur):
    corps = bloc(moteur, "function runInterpretation(")
    return set(re.findall(r"input\.mode\s*===\s*\"(\w+)\"", corps))


def champs_lus_par_le_moteur(moteur):
    return set(re.findall(r"input\.([a-zA-Z_]\w*)", moteur))


def champs_lus_par_la_porte(porte):
    return set(re.findall(r"body\.([a-zA-Z_]\w*)", porte))


def champs_emis_par_la_porte(porte):
    """Les clés de la réponse 200. Les réponses d'erreur (402, 400, 405) ont
    leur propre vocabulaire, éprouvé séparément."""
    i = porte.index("statusCode: 200")
    j = porte.index("};", i)
    rep = porte[i:j]
    k = rep.index("JSON.stringify({")
    return set(re.findall(r"(?:[{,]\s*)([a-zA-Z_]\w*)\s*:", rep[k:]))


def champs_rendus_par_interpretRemote(page):
    corps = bloc(page, "async function interpretRemote(")
    rendus = set()
    for m in re.finditer(r"return\s*\{([^}]*)\}", corps):
        rendus |= set(re.findall(r"(?:^|[,\s])([a-zA-Z_]\w*)\s*:", m.group(1)))
    return rendus


def champs_rendus_par_le_moteur_local(page):
    """Le chemin hors ligne : la page appelle le moteur dans la page et bâtit
    elle-même l'objet que le reste du code lira."""
    corps = bloc(page, "async function renderInterpretRemote(")
    m = re.search(r"res\s*=\s*\{([^}]*)\}", corps)
    return set(re.findall(r"(?:^|[,\s])([a-zA-Z_]\w*)\s*:", m.group(1))) if m else set()


def champs_attendus_de_la_reponse(page):
    """Ce que l'appelant lit sur l'objet rendu, quel que soit le chemin."""
    corps = bloc(page, "async function renderInterpretRemote(")
    return set(re.findall(r"\bres\.([a-zA-Z_]\w*)", corps))


# ------------------------------------------------------------------- contrôles

# « license » n'est pas un champ d'interprétation : la porte le consomme et ne
# le transmet pas au moteur. Il est ajouté par interpretRemote, pas par la page.
HORS_MOTEUR = {"license"}

# « locked » n'est pas émis dans le corps d'une réponse 200 : il est fabriqué
# par interpretRemote quand la porte répond 402, et c'est le seul moyen pour
# le client de distinguer un refus de licence d'une panne.
FABRIQUES_PAR_LE_CLIENT = {"locked"}


def main():
    page, porte, moteur = lire(PAGE), lire(PORTE), lire(MOTEUR)
    ecarts = []
    dits = []

    # --- 1. Tout ce que la page envoie est lu par quelqu'un ---
    envoyes = champs_envoyes(page)
    lus = champs_lus_par_le_moteur(moteur) | champs_lus_par_la_porte(porte)
    orphelins = sorted(envoyes - lus - HORS_MOTEUR)
    if orphelins:
        ecarts.append("la page envoie des champs que personne ne lit : %s. "
                      "Le réglage est ignoré en silence." % ", ".join(orphelins))
    dits.append("%d champs envoyés par la page, tous lus (%s)."
                % (len(envoyes), ", ".join(sorted(envoyes))))

    # --- 2. Tous les modes de saisie sont traités ---
    m_envoyes, m_traites = modes_envoyes(page), modes_traites(moteur)
    # Le mode S/I/R est le cas par défaut du moteur : il n'apparaît dans aucun
    # test d'égalité, il est ce qui reste quand les autres ont échoué.
    inconnus = sorted(m_envoyes - m_traites - {"sir"})
    if inconnus:
        ecarts.append("la page sait envoyer des modes que le moteur ne traite pas : %s."
                      % ", ".join(inconnus))
    dits.append("%d modes de saisie envoyés (%s), tous traités."
                % (len(m_envoyes), ", ".join(sorted(m_envoyes))))

    # --- 3. Tout ce que la page lit dans la réponse est émis ---
    emis = champs_emis_par_la_porte(porte)
    rendus_reseau = champs_rendus_par_interpretRemote(page)
    inventes = sorted(rendus_reseau - emis - FABRIQUES_PAR_LE_CLIENT)
    if inventes:
        ecarts.append("interpretRemote lit des champs que la porte n'émet pas : %s. "
                      "Ils vaudraient « undefined » sans que rien ne le dise."
                      % ", ".join(inventes))
    dits.append("la porte émet %s ; interpretRemote en retient %s."
                % (", ".join(sorted(emis)), ", ".join(sorted(rendus_reseau))))

    # --- 4. Les deux chemins rendent la même chose ---
    # C'est le contrôle qui compte le plus : un champ rendu par le moteur local
    # et oublié par le chemin réseau ne casse QU'EN LIGNE, et inversement. Le
    # défaut ne se voit alors que sur la moitié des postes.
    local = champs_rendus_par_le_moteur_local(page)
    attendus = champs_attendus_de_la_reponse(page)
    manque_au_reseau = sorted((attendus & local) - rendus_reseau - FABRIQUES_PAR_LE_CLIENT)
    manque_au_local = sorted((attendus & rendus_reseau) - local - FABRIQUES_PAR_LE_CLIENT)
    if manque_au_reseau:
        ecarts.append("le chemin réseau ne rend pas %s, que le moteur local rend et que la page lit : "
                      "le défaut n'apparaîtrait qu'EN LIGNE." % ", ".join(manque_au_reseau))
    if manque_au_local:
        ecarts.append("le moteur local ne rend pas %s, que le chemin réseau rend et que la page lit : "
                      "le défaut n'apparaîtrait qu'HORS LIGNE." % ", ".join(manque_au_local))
    dits.append("les deux chemins rendent les mêmes champs (%s) ; la page en lit %s."
                % (", ".join(sorted(local)), ", ".join(sorted(attendus))))

    # --- 5. Rien de ce que la page lit n'est absent des deux chemins ---
    nulle_part = sorted(attendus - local - rendus_reseau - FABRIQUES_PAR_LE_CLIENT)
    if nulle_part:
        ecarts.append("la page lit %s, qu'aucun des deux chemins ne produit."
                      % ", ".join(nulle_part))

    # --- 6. La panne de réseau reste reconnaissable à la source ---
    # Sans cette marque, une TypeError de « fetch » — « Load failed » sous
    # Safari — se confond avec une variable oubliée, et l'application accuse
    # l'utilisateur d'un défaut qui n'est pas le sien.
    corps_ir = bloc(page, "async function interpretRemote(")
    if corps_ir.count("reseau = true") < 2:
        ecarts.append("interpretRemote ne marque plus les échecs de transport "
                      "(err.reseau) : une panne de réseau redeviendrait indiscernable "
                      "d'un défaut de l'application.")
    else:
        dits.append("les échecs de transport sont marqués à la source (%d fois)."
                    % corps_ir.count("reseau = true"))

    # --- 7. Le contrat écrit en tête de la porte dit-il encore vrai ? ---
    # Un commentaire périmé est pire qu'absent : il est cru.
    #
    # Le contrôle porte sur le BLOC DE LA REQUÊTE, et exige que chaque champ y
    # ouvre sa propre ligne. Chercher le mot n'importe où dans l'en-tête serait
    # trop indulgent : « diam » figure aussi dans la liste des modes, et la
    # ligne qui décrit le champ pourrait disparaître sans que rien ne bronche.
    # Éprouvé : la suppression de cette seule ligne fait échouer le contrôle.
    entete = porte[:porte.index("const crypto")]
    i = entete.index("// Appel : POST {")
    requete = entete[i:entete.index("// }", i)]
    # Le champ ouvre sa ligne, suivi de « : », « , » ou de son gabarit « {…} ».
    declares = set(re.findall(r"^//\s+([a-zA-Z_]\w*)\s*[:,{]", requete, re.M))
    oublies = sorted(envoyes - declares)
    if oublies:
        ecarts.append("le contrat écrit en tête de premium-interpret.js ne mentionne pas %s, "
                      "que la page envoie pourtant." % ", ".join(oublies))
    modes_oublies = sorted(m for m in m_envoyes if '"%s"' % m not in requete)
    if modes_oublies:
        ecarts.append("le contrat écrit en tête de premium-interpret.js ne mentionne pas "
                      "le ou les modes %s." % ", ".join(modes_oublies))
    if not oublies and not modes_oublies:
        dits.append("le contrat écrit en tête de la porte décrit la requête réellement envoyée.")

    # --- LA LANGUE DOIT VOYAGER AVEC CHAQUE DEMANDE ---
    #
    # La porte HTTP exécute SA PROPRE copie de moteur.js, dans son propre
    # module. La langue du moteur est un état de module : la porte ne sait
    # rien de celle de la page.
    #
    # Deux défauts, trouvés en production le 30 octobre 2026 :
    #   1. la correction du quiz passait par la porte SANS « lang », et
    #      s'affichait en français au milieu d'une séance en anglais ;
    #   2. sur un conteneur tiède — le cas normal — une requête sans « lang »
    #      aurait hérité de la langue de l'appelante PRÉCÉDENTE. Un
    #      laboratoire francophone pouvait recevoir un compte rendu en
    #      anglais parce qu'un autre venait d'en demander un.
    #
    # On exige donc que CHAQUE appel à interpretRemote porte « lang », et que
    # la porte ne laisse jamais la langue non dite.
    appels = re.findall(r"interpretRemote\(\s*\{(.*?)\}\s*\)", page, re.S)
    sansLangue = [a for a in appels if "lang" not in a]
    if not appels:
        ecarts.append("aucun appel à interpretRemote({...}) relevé dans la page : "
                      "l'écriture de l'appel a changé et ce contrôle ne voit plus rien.")
    elif sansLangue:
        ecarts.append("%d des %d appels à la porte ne portent pas « lang » : la porte "
                      "exécute sa propre copie du moteur et répondrait dans la langue "
                      "de la requête précédente. Premier fautif : « %s »."
                      % (len(sansLangue), len(appels),
                         " ".join(sansLangue[0].split())[:90]))
    else:
        dits.append("les %d appels à la porte portent tous « lang » : la réponse ne peut "
                    "pas hériter de la langue d'un autre laboratoire." % len(appels))

    if 'lang: body.lang === "en" ? "en" : "fr"' not in porte:
        ecarts.append("la porte ne pose plus explicitement la langue du moteur. Le "
                      "moteur la garde dans un état de module : sur un conteneur tiède, "
                      "une requête sans « lang » rendrait la langue de la précédente.")
    else:
        dits.append("la porte pose la langue à chaque requête, avec un défaut explicite — "
                    "jamais celle héritée de l'appel précédent.")

    if ecarts:
        print("LE RACCORD NE TIENT PLUS :")
        for e in ecarts:
            print("  -", e)
        return 1

    print("Le raccord page ↔ porte ↔ moteur est cohérent.")
    for d in dits:
        print("  ·", d)
    return 0


if __name__ == '__main__':
    sys.exit(main())
