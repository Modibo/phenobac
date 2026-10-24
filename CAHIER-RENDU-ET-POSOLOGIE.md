# Cahier des charges — la posologie et le rendu sélectif

Deux ajouts qui portent sur le même objet : **ce que le laboratoire met sur la
feuille, et ce que le clinicien peut en faire**. Ils se complètent — l'un choisit
quelles molécules sont montrées, l'autre rend utilisable celles qui le sont — et
tous deux agissent sur la prescription sans jamais prescrire.

État des sources au 24 octobre 2026 :

| | Source | Disponible |
|---|---|---|
| Posologie | EUCAST *Breakpoint Tables* v16.1, « Dosages used to define breakpoints », p. 9-13 | **oui, en main** |
| Rendu sélectif | HAS/SFM, « Antibiogrammes ciblés » ; CA-SFM, listes à tester et à rendre | **non** — voir B.2 |

---

# PARTIE A — La posologie qui fonde le seuil

## A.1 Le problème

PhénoBac rend « sensible à forte posologie » sans dire ce qu'est cette forte
posologie. Or la catégorie I de l'EUCAST n'est pas une demi-sensibilité : elle
signifie que la molécule marche **à condition d'augmenter l'exposition**. Sans la
dose, la catégorie ne veut rien dire — et le clinicien qui lit « I » prescrit la
dose habituelle, c'est-à-dire précisément celle pour laquelle le seuil dit que ce
ne sera pas suffisant.

Le même raisonnement vaut pour S : un seuil « sensible » n'est valide que pour le
schéma d'administration qui a servi à l'établir. Un laboratoire qui rend S et un
service qui donne la moitié de la dose ne parlent pas du même antibiogramme.

## A.2 La source

EUCAST, *Clinical Breakpoint Tables* v16.1, valides depuis le 24 juin 2026,
section « Dosages used to define breakpoints » (pages 9 à 13). Quatre colonnes :

```
Agent | Standard dosage | High dosage | Uncomplicated UTI | Special situations
```

Extraits vérifiés :

- `Meropenem | 1 g x 3 iv over 30 minutes | 2 g x 3 iv over 3 hours | | Meningitis: 2 g x 3 iv`
- `Ciprofloxacin | 0.5 g x 2 oral or 0.4 g x 2 iv | 0.75 g x 2 oral or 0.4 g x 3 iv | | Meningitis: 0.4 g x 3 iv`
- `Gentamicin | 6-7 mg/kg x 1 iv | None |`
- `Amoxicillin oral | 0.5 g x 3 oral | 0.75-1 g x 3 oral | 0.5 g x 3 oral |`

## A.3 Ce que la table apprend, et qui doit être traité

**« High dosage : None » existe.** Pour la gentamicine, l'ertapénème, la
vancomycine et d'autres, l'EUCAST ne définit **aucune** posologie forte. Si une
telle molécule était rendue I, PhénoBac ne doit pas inventer un schéma : il doit
dire que le référentiel n'en prévoit pas, et que la catégorie I n'y a donc pas de
traduction posologique. C'est le § 26 appliqué à la dose.

**La voie change la posologie**, et parfois la molécule : « Amoxicillin iv » et
« Amoxicillin oral » sont deux lignes distinctes, avec des seuils distincts.
PhénoBac ne connaît aujourd'hui qu'un code `AMX`. Il faudra soit distinguer les
deux, soit afficher les deux schémas et laisser le prescripteur choisir — la
seconde solution est la bonne : le laboratoire ne sait pas par quelle voie le
malade sera traité.

**La cystite simple a sa propre colonne**, et l'EUCAST écrit explicitement :
« When amoxicillin-clavulanic acid is reported for uncomplicated UTI, the report
**must** make clear that the susceptibility category is only valid for
uncomplicated UTI. » C'est une obligation de rendu que PhénoBac ne remplit pas
aujourd'hui. Elle entre dans ce cahier.

**Les situations particulières sont nommées** : méningite surtout, parfois
pneumonie nosocomiale. PhénoBac connaît déjà le contexte méningé (`ctx.mening`)
et l'emploie pour choisir les seuils. Il doit employer le même contexte pour
choisir la posologie — sans quoi il rendrait un seuil méningé avec une dose
ordinaire.

## A.4 Modèle de données

Un fichier produit par extraction, sur le modèle de `base-connaissances.js` :

```js
POSOLOGIE = {
  MEM: { standard: "1 g x 3 IV en 30 min",
         forte:    "2 g x 3 IV en 3 h",
         urinaire: null,
         particulier: { mening: "2 g x 3 IV en 30 min (ou 3 h)" } },
  GEN: { standard: "6-7 mg/kg x 1 IV", forte: null, … }
}
```

`forte: null` signifie « l'EUCAST n'en définit pas », et doit s'afficher comme
tel. Ne jamais confondre avec « pas encore extrait » : l'extraction vérifie que
chaque molécule du panel a une entrée, et échoue sinon.

Versionné par `POSOLOGIE_VERSION`, lié à la version des tables. Le journal des
règles (`journal-base.py`) doit couvrir ce fichier comme il couvre la base.

## A.5 Ce qui s'affiche

**À l'écran**, sous la catégorie de chaque molécule renseignée : le schéma qui
fonde le seuil, choisi selon le contexte déclaré (méningé, urinaire, standard).
Discret — une ligne, en gris.

**Au compte-rendu**, dans la colonne d'interprétation ou en note de bas de
tableau. Pour une molécule rendue **I**, la mention est obligatoire et visible :
la catégorie I sans sa posologie est inexploitable.

**La provenance (§ 23)** : la posologie est `CALCULÉ` — elle est lue dans la
table du référentiel pour le contexte déclaré, rien n'est déduit.

## A.6 La limite, et elle est stricte

PhénoBac affiche **la posologie qui a servi à définir le seuil**. Ce n'est pas
une prescription :

- aucune adaptation au poids (hors ce que la table donne déjà en mg/kg), à la
  fonction rénale, à l'âge, à la grossesse ;
- aucun choix entre deux molécules ;
- aucune durée de traitement.

La formule à employer, et qui doit figurer près de l'affichage : *« Seuil établi
pour ce schéma. L'adaptation au malade relève du prescripteur. »* Le § 13 du
cahier maître interdit à PhénoBac de devenir un système de prescription ; cette
limite n'est pas négociable et doit être éprouvée par un banc.

## A.7 Vérification

`outils/essai-posologie.js` :

1. chaque molécule du panel de chaque espèce a une entrée — sinon l'écran
   afficherait un vide sans que personne ne sache s'il manque une donnée ou si
   le référentiel se tait ;
2. `forte: null` s'affiche « l'EUCAST ne définit pas de posologie forte » et
   jamais un schéma inventé ;
3. une molécule rendue **I** s'accompagne toujours d'une posologie forte, ou de
   la mention qu'il n'y en a pas ;
4. en contexte méningé, c'est la posologie méningée qui s'affiche — éprouvé dans
   les deux sens, comme les seuils le sont déjà ;
5. l'amoxicilline-clavulanate rendue pour une cystite porte la mention que la
   catégorie ne vaut que pour cette indication (exigence EUCAST citée en A.3) ;
6. aucune chaîne de l'application ne contient de verbe de prescription
   (« prescrire », « administrer », « donner ») dans les textes de posologie.

`outils/verifier-posologie.py` : la table bâtie correspond exactement au PDF
extrait, molécule par molécule, dans les deux sens.

---

# PARTIE B — Le rendu sélectif

## B.1 Le problème

PhénoBac rend tout ce qui a été testé. Rendre « imipénème S » sur une *E. coli*
d'ECBU sensible à l'amoxicilline, c'est mettre un carbapénème sous les yeux d'un
prescripteur qui n'en a pas besoin — et il sera parfois prescrit, parce qu'il est
là. Ne pas le rendre tant que les molécules de première ligne sont actives est le
levier de maîtrise des antibiotiques le plus puissant dont dispose un
laboratoire : il ne coûte rien, ne demande aucun réactif, et agit sur chaque
prescription.

## B.2 L'état des sources — ce qui bloque, et ce qu'on fait

Les listes françaises existent mais ne sont pas accessibles depuis
l'environnement de travail :

- HAS/SFM, « Antibiogrammes ciblés » (infections urinaires à entérobactéries,
  femme adulte ≥ 12 ans) : le site de la HAS refuse l'accès automatisé (403) ;
- CA-SFM, listes « à tester » et « à rendre » par famille : dans le communiqué
  complet, que PhénoBac ne reprend pas — il n'en garde que le delta.

**Conséquence, et elle commande la conception.** Je ne rédigerai aucune liste de
mémoire : le § 26 l'interdit, et une liste de rendu inventée ferait masquer des
résultats sur la foi de rien.

La mécanique est donc livrée **vide**, et la liste est une **règle locale du
laboratoire** au sens du § 6 : affichée comme telle, avec son auteur, sa date et
sa justification. C'est d'ailleurs la réalité de la plupart des laboratoires — la
liste de rendu est une politique d'établissement, discutée avec les cliniciens.

Le jour où le document HAS ou le communiqué complet est fourni, une liste de
référence documentée peut être livrée **en plus**, marquée comme officielle et
distincte des règles locales — exactement comme les seuils EUCAST le sont des
conventions de laboratoire.

## B.3 Modèle

```js
RENDU = {
  "<groupe ou espèce>": {
    site: "urines" | "hemoculture" | "*",
    premiere:  ["AMX", "SXT", "FOS", "NIT"],   // toujours rendues
    cascade:   [ { si: "toutes R parmi premiere", alors: ["CTX", "CIP"] },
                 { si: "toutes R parmi premiere+cascade", alors: ["IPM"] } ],
    jamais:    ["OXA"],                          // dépistage, pas un rendu
    auteur: "…", date: "…", motif: "…"           // § 6 : règle locale tracée
  }
}
```

## B.4 Règles

1. **Désactivé par défaut.** Un laboratoire qui ne l'a pas configuré rend tout,
   comme aujourd'hui.
2. **Rien n'est effacé.** Les molécules masquées restent dans l'état, dans
   l'export CSV, dans la surveillance et dans le registre. Le § 16 l'exige : on
   n'écrase jamais une donnée brute. L'écran porte un bouton « montrer les
   molécules non rendues », et le compte-rendu une mention du nombre masqué.
3. **La cascade se calcule sur les catégories rendues**, après lecture
   interprétative — une molécule rendue R par la lecture interprétative compte
   comme R pour la cascade.
4. **Une alerte ne se masque jamais.** Si une molécule masquée porte une alerte
   de cohérence ou une incohérence d'identification, elle est rendue visible et
   l'alerte s'affiche. Masquer un signal de danger pour économiser une ligne
   serait indéfendable.
5. **Le masquage figure au compte-rendu**, nommé : « rendu sélectif appliqué
   (règle locale du laboratoire, <date>) — n molécules testées non rendues ». Un
   clinicien doit pouvoir demander le reste, et savoir qu'il existe.
6. **Provenance (§ 23)** : une molécule masquée n'est ni `MESURÉ` ni `CALCULÉ`
   pour le lecteur du compte-rendu — elle est absente, et la note l'explique.

## B.5 Ce qui pourrait mal tourner, et la garde correspondante

| Risque | Garde |
|---|---|
| Masquer la seule molécule active | la cascade ne masque jamais une molécule S si aucune molécule de première ligne n'est S |
| Masquer une alerte | règle 4 |
| Liste périmée après évolution des résistances | la date de la règle locale est affichée ; au-delà de 12 mois, l'interface la signale comme à revoir |
| Croire officielle une liste locale | marquage § 6 permanent, comme pour les seuils hors référentiel |

## B.6 Vérification

`outils/essai-rendu-selectif.js` :

1. désactivé par défaut : aucun masquage sans configuration ;
2. toutes les premières lignes R → la cascade libère le palier suivant, et lui
   seul ;
3. une molécule de première ligne S → les paliers suivants restent masqués ;
4. aucune molécule S en première ligne et aucune en cascade → rien n'est masqué
   (garde du tableau B.5) ;
5. une molécule masquée portant une alerte est rendue visible ;
6. les données masquées restent intégralement dans l'export CSV et dans la
   surveillance — éprouvé par comparaison champ à champ ;
7. le compte-rendu porte la mention du masquage et le nombre de molécules
   concernées.

---

# Ce qui n'est pas dans ce cahier, et pourquoi

- **Adapter la dose au malade** (poids, fonction rénale, âge, grossesse) :
  c'est de la prescription. § 13.
- **Choisir entre deux molécules actives** : idem.
- **Une liste de rendu « par défaut » tirée de la littérature** : sans document
  officiel en main, ce serait une invention présentée comme une règle. § 26.

---

*Sources : EUCAST, Clinical Breakpoint Tables v16.1, 24 juin 2026, p. 9-13 —
<https://www.eucast.org/fileadmin/eucast/pdf/breakpoints/v_16.1_Breakpoint_Tables.pdf>.
HAS, « Antibiogrammes ciblés — Recommandation », à obtenir.*
