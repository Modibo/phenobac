# Registre des confrontations

Certains contrôles de PhénoBac ne peuvent pas tourner en intégration continue :
ils confrontent les tables de l'application au **document officiel**, et ce
document n'est pas dans le dépôt. L'EUCAST et le CA-SFM le publient sous leur
propre licence ; le serveur de l'EUCAST refuse d'ailleurs les téléchargements
automatiques (403). Ces confrontations sont donc faites **à la main**, par le
biologiste, le document sous les yeux.

Ce qui se fait à la main s'oublie. Ce registre existe pour que l'oubli se
voie : il note contre quel document chaque table a été confrontée, quand, avec
quel résultat — et l'**empreinte** des tables telles qu'elles étaient ce
jour-là.

`outils/verifier-confrontations.py` recalcule cette empreinte à chaque
livraison. Si elle a bougé, les seuils ont changé depuis la dernière
confrontation, et la chaîne s'arrête : **un seuil modifié sans être reconfronté
au référentiel officiel est exactement ce que le § 26 interdit.**

Pour mettre à jour une entrée : relancer l'outil avec le document, reporter le
résultat ici, puis `python3 outils/verifier-confrontations.py --empreintes`
pour obtenir la nouvelle empreinte.

---

## comparer-eucast.py — concentrations critiques

- **document** : EUCAST, Clinical Breakpoint Tables v16.1, 24 juin 2026 (classeur xlsx)
- **tables** : BP, BP_URIN
- **empreinte** : cdcae852b51e8200d058db409d72916503ac2da8f00c62a98254b5b667ef4380
- **date** : 2026-10-24
- **résultat** : 244 seuils confrontés — **244 identiques, 0 différent**, 91 non comparés.

La confrontation porte sur les concentrations critiques de l'EUCAST. Les
seuils méningés (BP_MENINGE) et ceux du CA-SFM ont leurs propres documents et
ne sont pas couverts par cette entrée.

### Quatre divergences trouvées, et corrigées après validation

Elles concernaient *Bacteroides fragilis*, et **toutes allaient dans le sens
permissif** : PhénoBac rendait « sensible » à des concentrations que l'EUCAST
v16.1 tient pour résistantes. Corrigées le 24 octobre 2026, base 2026.12.

| antibiotique | avant | **v16.1, appliqué** |
|---|---|---|
| amoxicilline-ac. clavulanique | S ≤ 4 · R > 8 | **S ≤ 2 · R > 2** |
| imipénème | S ≤ 2 · R > 8 | **S ≤ 1 · R > 1** |
| méropénème | S ≤ 2 · R > 8 | **S ≤ 1 · R > 1** |
| pipéracilline-tazobactam | S ≤ 8 · R > 16 | **S ≤ 2 · R > 2** |

Un *B. fragilis* dont la CMI d'imipénème vaut 2 mg/L était rendu **sensible** ;
il est désormais rendu **résistant**, comme le veut le référentiel.

### Un drapeau devenu faux

Les neuf seuils de *B. fragilis* portaient le drapeau « convention de
laboratoire » — l'interface disait donc « seuil non fixé par l'EUCAST ».
C'était vrai quand ces lignes ont été écrites ; la v16.1 en fixe six. Le
drapeau a été retiré pour l'amoxicilline-acide clavulanique, la clindamycine,
l'imipénème, le méropénème, le métronidazole et la pipéracilline-tazobactam.

Il reste, à juste titre, sur trois :

- **pénicilline G** (S ≤ 0,25 · R > 0,5) et **vancomycine** (S ≤ 2) — le
  tableau des anaérobies à Gram négatif de la v16.1 ne les porte pas ;
- **moxifloxacine** — elle vient du CA-SFM, qui la retient pour l'ensemble des
  anaérobies.

### Une nuance que la base ne sait pas encore porter

L'EUCAST donne la clindamycine **entre parenthèses** : le seuil repose sur
l'ECOFF et non sur des données cliniques, et le document avertit que « la
preuve clinique en monothérapie fait généralement défaut ». La base n'a pas de
colonne pour cette distinction : la valeur est juste, la réserve n'est pas
affichée. La réserve est écrite ici, faute d'une colonne pour la porter.

### Les 91 couples « non comparés », triés

« Non comparé » recouvrait cinq situations très différentes, et c'est cette
confusion qui a laissé dormir les quatre seuils de *B. fragilis*. L'outil les
distingue désormais, et le relevé du 24 octobre 2026 donne :

| | |
|---|---|
| le document ne porte pas ce couple | 38 |
| la ligne existe, sans valeur chiffrée — « IE », « Note », « – » | 44 |
| écarté : dépistage (*screen only*) | 7 + 3 |
| écarté : indication particulière (méningite, endocardite) | 2 |

Les **82 premiers** sont des seuils que le référentiel ne fixe pas. Tous les 82
portent la marque « convention de laboratoire », et l'interface le dit. Aucun
ne se fait passer pour officiel.

Les seuils **méningés** ne sont couverts par aucune entrée de ce registre :
l'outil les écarte volontairement (ils vivent dans BP_MENINGE) et rien ne les
confronte. C'est une dette de plus, à ouvrir.

### Le drapeau « convention » est désormais vérifié des deux côtés

Il signifie « le référentiel ne fixe RIEN pour ce couple ». Il se périme donc
tout seul : le jour où l'EUCAST fixe un seuil, la mention devient un mensonge
et conseille de se méfier d'une valeur officielle. C'est ce qui était arrivé à
six couples de *B. fragilis*.

`comparer-eucast.py` vérifie maintenant l'équivalence à chaque confrontation —
marqué convention **si et seulement si** le document ne donne aucun chiffre —
et compte les écarts dans son bilan. Au 24 octobre 2026 : **0**.

### Pourquoi c'était invisible

Le découpage en sections prenait TOUTE ligne où seule la première colonne est
remplie pour un titre de tableau. Or les feuilles d'anaérobies empilent
plusieurs tableaux — Bacteroides, Prevotella, Fusobacterium — et une phrase
d'explication suit le titre : « Breakpoints for Bacteroides spp. are also
valid for Parabacteroides spp. … ». Elle refermait la section aussitôt
ouverte, et le groupe se comparait à **rien**.

Le rapport disait alors « aucune ligne EUCAST correspondante » — exactement ce
qu'il affiche aussi quand le document ne porte pas l'antibiotique. Les deux
situations se confondaient, et c'est ainsi que quatre seuils divergents sont
restés invisibles. L'outil distingue désormais les titres de la prose, et
signale une section vide au lieu de la taire.

---

## comparer-eucast.py --meninge — concentrations critiques des méningites

- **document** : EUCAST, Clinical Breakpoint Tables v16.1, 24 juin 2026 (classeur xlsx)
- **tables** : BP_MENINGE
- **empreinte** : f1184083a29ee2fe7bae4e955ba10efa3df94d59345aefb0c9878337d8c937cb
- **date** : 2026-10-24
- **résultat** : 21 seuils confrontés — 21 identiques, 0 différent, 0 manquant.

Ces seuils-là n'étaient confrontés par **rien**. L'outil écartait volontairement
les lignes « (meningitis) » du document — le rendu courant se fait hors
méningite — et personne ne regardait l'autre moitié. Or c'est celle qui fait
passer une pénicilline de « I » à « R » sur un liquide céphalo-rachidien.

Le mode `--meninge` retourne le filtre : il ne retient QUE les lignes de
méningite, et les confronte à BP_MENINGE.

### Et la question inverse : ce que PhénoBac ne porte pas

Comparer les seuils présents ne dit rien de ceux qui manquent. Un seuil méningé
absent n'est pas inoffensif : c'est le seuil **ordinaire** qui s'applique
alors, et il est plus permissif. L'outil parcourt donc aussi le document dans
l'autre sens.

Il ne signale que les manques qui **changent quelque chose** — ni ceux où
PhénoBac n'a pas non plus de seuil ordinaire (rien ne s'applique, la molécule
n'est pas catégorisée, et c'est juste), ni ceux où le seuil ordinaire porte
déjà la valeur méningée, ce qui arrive quand le document ne donne qu'une ligne
« all indications, including meningitis ». Au 24 octobre 2026 : aucun.

---

## comparer-zit.py — zones d'incertitude technique

- **document** : EUCAST v16.1 (classeur xlsx) ET CA-SFM 2026 V1.0 (pdf)
- **tables** : ZIT, ZIT_CASFM
- **empreinte** : 9127c6a5b2cd1c8911ad2510299faf472a5fb51255dc6fcc94db5b5a2860a106
- **date** : 2026-10-24
- **résultat** : moitié EUCAST faite — **7 ATU sur 7 retenues**, aux bonnes valeurs.
  Moitié CA-SFM : impossible avec le document que PhénoBac référence (voir plus bas).

### L'outil lisait le mauvais fichier, et il ACCUSAIT

Premier passage : « ABSENTE de PhénoBac » pour les sept zones d'incertitude de
l'EUCAST. PhénoBac les porte toutes les sept, aux bonnes valeurs.

C'est **le même défaut que celui de `comparer-eucast.py`, et à la même cause** :
l'outil cherchait `const ZIT =` dans `netlify/functions/premium-interpret.js`.
Le 3 octobre 2026, les règles sont devenues des données et cette constante a
disparu — mais le fichier existe toujours, ce qui est pire : la lecture ne
levait aucune erreur, elle rendait une table **vide**.

Un vérificateur qui lit le mauvais fichier ne se tait pas : il accuse. Il lit
désormais la base, par le même chemin que les autres.

### La moitié CA-SFM demande un document que le projet n'utilise pas

Le CA-SFM 2026 que PhénoBac référence est celui des **différences** avec
l'EUCAST — 18 pages, dont les ZIT sont citées **en prose**. L'outil lit par
POSITION dans des colonnes « S ≤ | R > | ZIT », et n'a rien sur quoi
s'appuyer. Il le dit maintenant au lieu d'imprimer une section vide : « aucune
ZIT lue dans ce PDF — et ce n'est pas *aucune ZIT* ».

Les trois ZIT propres au CA-SFM que PhénoBac applique — daptomycine 4 chez
l'entérocoque, colistine 4 chez *Pseudomonas*, vancomycine 2 chez le
staphylocoque — restent donc non confrontées. Le texte du document les
mentionne (« le CA-SFM propose un breakpoint à 2 mg/L, avec une ZIT à
4 mg/L » pour la daptomycine), mais une lecture en prose ne vaut pas une
lecture par position : il faut les tables complètes. C'est une dette, elle est écrite,
et la chaîne la rappelle à chaque livraison sans bloquer : bloquer sur un
document que personne n'a sous la main n'aiderait personne.

---

## Les anaérobies manquants, ajoutés

Le 24 octobre 2026, le classeur v16.1 obtenu, *Prevotella* spp.,
*Fusobacterium necrophorum* et *F. nucleatum* ont été ajoutés — **51 règles**,
lues par `outils/extraire-anaerobies.py` et jamais recopiées à la main :
quatre seuils de *B. fragilis* s'étaient révélés faux le matin même.

**Deux groupes pour *Fusobacterium***, et c'est le document qui l'impose : il
chiffre l'amoxicilline-acide clavulanique et la pipéracilline-tazobactam pour
*F. necrophorum*, et les renvoie à une note pour *F. nucleatum*. Un seul
groupe aurait appliqué les seuils de l'un à l'autre — « un chiffre juste au
mauvais endroit ».

Plusieurs couples n'ont qu'un seuil **au disque** : l'EUCAST renvoie à une
note pour la CMI. C'est fidèle — la lecture au disque conclut, la CMI non.

*Cutibacterium acnes* n'a pas été ajouté : il relève de la feuille des
anaérobies à Gram positif, qui reste à traiter.

## Ce que l'absence de document avait bloqué

Le 24 octobre 2026, trois anaérobies manquants ont été demandés — *Prevotella*,
*Fusobacterium*, *Cutibacterium acnes*. Ils n'ont **pas** été ajoutés, et la
raison mérite d'être écrite.

Le classeur EUCAST **v16.1** n'est pas téléchargeable automatiquement (403 sur
le xlsx, 404 sur le PDF). Seule la **v15.0** l'est. Deux chemins s'offraient,
et les deux sont fermés :

- **transcrire les seuils de la v15.0** : la base déclare v16.1, et deux
  versions mêlées dans une même base sont pires qu'une espèce manquante —
  personne ne saurait plus de quel référentiel vient un rendu ;
- **réutiliser les seuils de *B. fragilis*** pour les autres anaérobies à Gram
  négatif : la v15.0 montre que l'EUCAST publie **une table par espèce**, et
  qu'elles diffèrent. La pénicilline G est à S ≤ 0,5 mg/L chez *Prevotella*,
  à 0,25 chez *B. fragilis*. Les confondre donnerait de faux « sensibles ».

Il faut donc le classeur v16.1. **Son adresse est connue depuis le 24 octobre
2026**, relevée sur la page officielle des tables — mes tentatives précédentes
échouaient sur un chemin deviné, et non sur un refus du serveur :

    https://www.eucast.org/fileadmin/eucast/pdf/breakpoints/v_16.1_Breakpoint_Tables.pdf    (4,4 Mo)
    https://www.eucast.org/fileadmin/eucast/pdf/breakpoints/v_16.1_Breakpoint_Tables.xlsx   (2,7 Mo)

Les deux répondent 200. Avec le classeur en main, trois dettes se referment
d'un coup : les anaérobies manquants, la confrontation des ZIT ci-dessus, et
une nouvelle confrontation des concentrations critiques.

Les streptocoques des groupes C et G, eux, ont été ajoutés le même jour **sans
document nouveau** : la table de l'EUCAST s'intitule « Streptococcus groups A,
B, C and G », et PhénoBac la portait déjà sous le nom « strepacg ». Seule
l'espèce manquait.
