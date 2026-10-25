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
- **empreinte** : ae4e8ab090ab72344dc9a4e9bacd45244c47855a483612ef784b3960bc59daf4
- **date** : 2026-10-25
- **résultat** : 403 seuils confrontés — **403 identiques, 0 différent**, 91 non comparés.
  (244 le 24 octobre ; les 159 de plus sont les dix anaérobies à Gram positif et
  les sept espèces aérobies.)

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

### La parenthèse, désormais portée par la base

L'EUCAST donne certains seuils **entre parenthèses**. Ils reposent sur l'ECOFF :
ils séparent la souche sauvage de celle qui a acquis un mécanisme, et le
document l'écrit — « ECOFFs do not predict clinical susceptibility ». La note
12 va plus loin : « clinical evidence as monotherapy is usually lacking […]
**Reporting S or I should be avoided** and if considered necessary, there
should be a comment to explain the need for adjunctive measures ».

La base n'avait pas de colonne pour cette distinction : PhénoBac appliquait la
valeur et perdait la réserve. Il rendait donc une colistine ou un aminoside
« sensible » sur un seuil qui ne le promet pas.

Une colonne `ecoff` la porte depuis le 24 octobre 2026, sur **25 couples** —
la clindamycine de *C. innocuum*, de *Parvimonas*, de *Peptostreptococcus* et
de *Peptoniphilus* s'y sont ajoutées le 25, avec l'ertapénème de
*Bacteroides* ; les vingt premiers sont la
colistine, gentamicine et amikacine chez les entérobactéries, *Acinetobacter*,
*Pseudomonas*, *Salmonella*, *Serratia* et *Morganella* ; gentamicine chez les
staphylocoques ; clindamycine chez *Bacteroides*. Le commentaire paraît quand
la molécule est rendue **S ou I**, et seulement alors : le document autorise
expressément à rendre « R ».

`comparer-eucast.py` vérifie le drapeau **dans les deux sens** à chaque
confrontation, comme celui de « convention de laboratoire ». Au 25 octobre : 0
écart.

### Un outil qui ne connaît pas une molécule ne se tait pas : il accuse

La tétracycline, arrivée le 25 octobre avec *Pasteurella*, *Kingella* et
*C. diphtheriae*, n'avait pas de motif de recherche dans `comparer-eucast.py`.
Faute de motif, le couple passait pour « non chiffré par le document », et
l'outil **réclamait** le drapeau « convention de laboratoire » sur trois
seuils que l'EUCAST donne pourtant. C'est le même défaut que la lecture du
mauvais fichier : l'ignorance d'un vérificateur ne se présente pas comme une
ignorance, elle se présente comme un verdict.

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

## comparer-eucast.py --diametres — diamètres critiques

- **document** : EUCAST, Clinical Breakpoint Tables v16.1, 24 juin 2026 (classeur xlsx)
- **tables** : DZ, DZ_URIN
- **empreinte** : 20ea128f08b308a3d2507891f1366f3d2860f3947b4afc450503d57a407e1627
- **date** : 2026-10-25
- **résultat** : 410 diamètres confrontés — **410 identiques, 0 différent**,
  0 non comparé, 2 à arbitrer (les deux concordent).

### La moitié que personne ne relisait

`outils/extraire-diametres.py` a produit cette table une fois, à partir du
classeur. Depuis, **rien ne la relisait**. `comparer-eucast.py` ne lisait que
les colonnes B et C — les CMI — et `verifier-couverture-eucast.py` ne couvre
que 22 tables sur 39.

C'est pourtant la moitié que lit un laboratoire sans automate : il mesure au
pied à coulisse, en millimètres. Et le sens y est **inversé** — « petit » veut
dire résistant, là où une petite CMI veut dire sensible. Un seuil lu à
l'envers transforme chaque sensible en résistant sans qu'aucune erreur ne
paraisse.

Le mode `--diametres` ne réécrit **rien** de la sélection des lignes : les
indications, les voies, les restrictions d'espèce, les genres qui partagent
une feuille — tout ce savoir vaut pour les deux moitiés. Il change les deux
colonnes qu'on lit, et la table à laquelle on compare.

### Quatre réserves oubliées, que la confrontation des CMI ne pouvait pas voir

L'EUCAST donne **entre parenthèses** la ciprofloxacine et l'amikacine du
staphylocoque, en CMI comme au disque :

| | CMI | diamètre |
|---|---|---|
| Ciprofloxacine, *S. aureus* | (0,001) / (2) | (50) / (17) |
| Ciprofloxacine, SCN | (0,001) / (2) | (50) / (22) |
| Amikacine, *S. aureus* | (16) / (16) | (15) / (15) |
| Amikacine, SCN | (16) / (16) | (15) / (15) |

PhénoBac ne portait la réserve que pour la **gentamicine**. Une ciprofloxacine
de staphylocoque était donc rendue « I » sans la réserve que la note 12 exige
— « *Reporting S or I should be avoided and if considered necessary, there
should be a comment* ».

**Pourquoi la confrontation des CMI ne l'avait pas vu** : PhénoBac n'a pas de
concentration critique pour ces couples, seulement un diamètre. Un comparateur
qui part de ce que l'application porte ne visite jamais ce qu'elle ne porte
pas. La réserve est désormais sur **29 couples**.

### Deux pièges du mode, corrigés avant de rien conclure

Le premier passage a crié **32 divergences**. Aucune n'en était une :

- la note 13 s'écrit « S ≤ 0,001 mg/L » en CMI et « **S ≥ 50 mm** » au
  disque. La traduction en `S: null` existait pour les CMI et manquait pour
  les diamètres. Trente-deux fausses alertes valent une absence de contrôle ;
- le drapeau « convention de laboratoire » dit que le référentiel ne fixe
  RIEN pour un couple. Il se juge sur les CMI : la vancomycine de
  l'entérocoque a une concentration critique et **aucun diamètre**, sans que
  la mention devienne fausse. L'invariant est donc neutralisé dans ce mode ;
- l'invariant ECOFF, lui, ne porte que sur les couples que la passe a
  **vraiment visités** : la colistine n'ayant pas de disque, la compter
  « réserve de trop » aurait fait six fausses alertes pour une réserve bien
  fondée côté CMI.

### Les deux « à arbitrer » concordent

| couple | lignes du document | ce que PhénoBac retient |
|---|---|---|
| *Enterococcus* / vancomycine | *E. faecalis* et *E. faecium* 12 mm ; autres entérocoques 15 mm | **12 mm** — les deux espèces qu'il couvre |
| *Pseudomonas* / méropénème | *P. aeruginosa* 20/14 ; autres *Pseudomonas* 24/18 | **20/14** — l'espèce qu'il couvre |

---

## comparer-zit.py — zones d'incertitude technique

- **document** : EUCAST v16.1 (classeur xlsx) ET **CA-SFM 2026, recommandations
  V1.0 septembre 2026, 178 pages** — les TABLES COMPLÈTES, et non le document
  des différences
- **tables** : ZIT, ZIT_CASFM
- **empreinte** : 9127c6a5b2cd1c8911ad2510299faf472a5fb51255dc6fcc94db5b5a2860a106
- **date** : 2026-10-25
- **résultat** : **les deux moitiés faites**. EUCAST : 7 ATU sur 7 retenues.
  CA-SFM : 10 ZIT en CMI confrontées — **10 identiques, 0 divergente,
  0 manquante, 0 en trop**.

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

### Les trois ZIT du CA-SFM, enfin confrontées

Elles étaient appliquées depuis longtemps sans confrontation possible, faute
du bon document. Les voici, avec leur page :

| groupe | molécule | ZIT | CA-SFM 2026 V1.0 |
|---|---|---|---|
| *Enterococcus* | daptomycine | **4 mg/L** | p. 83 |
| *Pseudomonas* | colistine | **4 mg/L** | p. 61 |
| *Staphylococcus* | vancomycine | **2 mg/L** | p. 75 |

Les sept autres ZIT en CMI du document se répartissent ainsi : quatre sont
communes à l'EUCAST et déjà confrontées (pipéracilline-tazobactam et
ciprofloxacine chez les entérobactéries), trois portent sur des molécules hors
du panel de PhénoBac — ceftaroline, ceftobiprole, céfuroxime iv — et deux sur
un chapitre qu'elle ne couvre pas (*Mycobacterium abscessus*). L'outil le dit
molécule par molécule au lieu de les passer sous silence.

### DEUX RESTRICTIONS QUI NE SE LISENT PAS DANS L'EN-TÊTE DU CHAPITRE

Et qui, appliquées de travers, auraient fait douter d'une mesure fiable :

- le tableau des fluoroquinolones du chapitre *Enterobacterales* est intitulé
  « **à l'exception du genre Salmonella** » : la ZIT de la ciprofloxacine ne
  vaut pas pour ce genre. L'EUCAST lui donne de même une ligne propre, sans
  ATU. PhénoBac ne la porte pas sur *Salmonella* — vérifié ;
- une ligne qui **nomme une espèce** ne vaut que pour elle. « Vancomycine
  *S. aureus* » ne concerne pas les staphylocoques à coagulase négative, dont
  la ligne « Vancomycine, SCN » ne porte **aucune** ZIT. PhénoBac ne la porte
  pas sur les SCN — vérifié.

Ces deux restrictions étaient jusqu'ici **imprimées en remarque** sous le
tableau, à charge pour le lecteur de les appliquer. Elles sont désormais dans
le code de l'outil, et la confrontation s'en sert.

### L'outil IMPRIMAIT deux listes et laissait l'œil les rapprocher

Jusqu'au 25 octobre 2026, la moitié CA-SFM affichait ce qu'elle lisait dans le
document, puis, séparément, ce que PhénoBac applique. Rapprocher les deux
restait à l'œil du lecteur — c'est-à-dire que personne ne le faisait, et
qu'une ZIT divergente ou manquante n'aurait rien fait tomber.

La confrontation est maintenant faite par l'outil, **dans les deux sens**, et
elle rend un code d'erreur. Le sens inverse manquait d'abord, et son absence a
été prouvée en ajoutant à la base une ZIT de vancomycine sur les SCN : le
contrôle restait vert. Trois fautes réalistes ont servi à l'éprouver, et
chacune le fait tomber :

| faute introduite | ce que l'outil dit |
|---|---|
| ZIT de la daptomycine portée à 8 | « CA-SFM ZIT 4, PhénoBac ZIT 8 » |
| ZIT de la vancomycine étendue aux SCN | « que le document ne donne PAS sur ce groupe » |
| ZIT de la ciprofloxacine appliquée à *Salmonella* | idem |

Un nom d'antibiotique que l'outil ne sait pas lire est signalé comme **un
défaut de l'outil**, et non comme une absence dans l'application : « nom
d'antibiotique que l'outil ne sait pas lire. Ajoutez-le à AGENTS_FR. »
L'ignorance d'un vérificateur ne doit pas se présenter comme un verdict —
c'est la leçon de la tétracycline absente de `comparer-eucast.py`.

### Où trouver les tables complètes du CA-SFM

Elles sont **publiques et téléchargeables**, contrairement à ce que supposait
l'entrée précédente :

    https://www.sfm-microbiologie.org/casfm2026_v1-0-septembre-2026/

L'URL n'a pas d'extension `.pdf` et ressemble à une page, mais elle **sert le
PDF directement** — 178 pages, 9,9 Mo.
sha256 `9ec01d61d5015d05f9fb7d3324a3b7aa1a667bf8631372b4081efa20aaf5dd42`.

Le document des **différences** (`CASFM2026EUCAST.pdf`, 18 pages) reste utile
pour comprendre les écarts, mais il ne sert pas à cette confrontation : ses
ZIT y sont citées en prose, et la lecture par position — qui fait la sûreté de
l'outil — n'a rien sur quoi s'appuyer.

### Ce qui bloquait, et qui ne bloque plus

### La moitié CA-SFM demande un document que le projet n'utilise pas

Le CA-SFM 2026 que PhénoBac référence est celui des **différences** avec
l'EUCAST — 18 pages, dont les ZIT sont citées **en prose**. L'outil lit par
POSITION dans des colonnes « S ≤ | R > | ZIT », et n'a rien sur quoi
s'appuyer. Il le dit maintenant au lieu d'imprimer une section vide : « aucune
ZIT lue dans ce PDF — et ce n'est pas *aucune ZIT* ».

Les trois ZIT propres au CA-SFM que PhénoBac applique y étaient citées en
prose (« le CA-SFM propose un breakpoint à 2 mg/L, avec une ZIT à 4 mg/L »
pour la daptomycine), et une lecture en prose ne vaut pas une lecture par
position. **Cette dette est levée depuis le 25 octobre 2026** : les tables
complètes ont été obtenues, et les trois ZIT sont confrontées ci-dessus.

---

## verifier-couverture-eucast.py — la base dit-elle TOUT ce que le classeur dit ?

- **document** : EUCAST, Clinical Breakpoint Tables v16.1, 24 juin 2026 (classeur xlsx)
- **tables** : BP, BP_URIN, DZ, DZ_URIN, DISQUE, DZ_TEMOIN, ECOFF
- **empreinte** : 4b15f7d5dd0ae46135f02333e5558fba6447c55d9a2a1fe1c8753b84b454ebb0
- **date** : 2026-10-25
- **résultat** : 22 tables du classeur relues, **409 règles attendues** — **0 manque,
  0 excédent, 0 écart**, CMI **et** disque.

### Pourquoi il a fallu un deuxième outil

`comparer-eucast.py` ne va que dans **un sens** : il part de ce que la base
porte et le confronte au document. Ce que le document chiffre et que la base
n'a pas lui est invisible. Et il ne lit que les **CMI** — la moitié diamètre
n'était confrontée à rien.

Le 25 octobre 2026, cette moitié manquante s'est vue. L'EUCAST v16.1 donne
**sept diamètres pour *Bacteroides fragilis*** — amoxicilline-clavulanate,
pipéracilline-tazobactam, ertapénème, imipénème, méropénème, clindamycine,
métronidazole — et PhénoBac n'en portait **aucun** : seules les CMI y étaient.
Un laboratoire qui travaille au disque, c'est-à-dire presque tous ceux auxquels
PhénoBac s'adresse, ne pouvait rien rendre sur l'anaérobie le plus fréquent des
suppurations abdominales. Rien ne le disait. Tout était vert.

Le nouvel outil relit les tables par `outils/extraire-especes.py` — la même
lecture mécanique qui sert à les écrire — et confronte **ligne à ligne, dans
les deux sens, CMI et disque**. Une règle que la base porte et que le document
ne donne pas est un écart, **sauf** si elle porte le drapeau « convention de
laboratoire » : c'est tout l'objet de ce drapeau.

### Ce qu'il a trouvé du premier coup

| | |
|---|---|
| *B. fragilis* : diamètres absents | 7 |
| *B. fragilis* : ertapénème absent des deux côtés (CMI **et** disque, entre parenthèses) | 1 |
| *C. perfringens* : ampicilline, amoxicilline, ertapénème — CMI absentes | 3 |

Aucune valeur divergente, aucune valeur en trop : rien que des **manques**.
C'est exactement ce qu'un contrôle à sens unique ne peut pas voir.

### La colonne I du classeur n'avait jamais été lue

Les feuilles ne portent pas que des chiffres. Leur **colonne I** porte les
notes, et trois d'entre elles changent ce qu'un laboratoire peut rendre :

- « *Isolates susceptible to benzylpenicillin can be reported susceptible to
  all beta-lactam agents with breakpoints (including those with Note) without
  further testing* » — un seul disque de pénicilline G suffit alors à rendre
  huit β-lactamines. Dans un laboratoire qui compte ses disques, ce n'est pas
  un détail. PhénoBac le **dit** désormais quand la pénicilline G est
  sensible ; elle ne rend rien d'office, parce que fabriquer une catégorie
  pour une molécule non testée serait fabriquer un résultat (§ 13).
- « *Susceptibility can be inferred from ampicillin* » — l'amoxicilline n'a
  pas de disque et se lit sur celui de l'ampicilline. **Treize** lignes
  « témoin » manquaient : la CMI était portée, le disque restait sans
  catégorie.
- « *Metronidazole resistance is rare, but inadequate anaerobic conditions may
  lead to false resistance* » — la cause la plus probable d'un métronidazole
  résistant n'est pas la souche, c'est la jarre. L'alerte le dit maintenant,
  dans cet ordre.

Chaque témoin déclaré dans l'outil **porte la phrase du document qui le
fonde**, et l'extraction s'arrête si cette phrase n'est plus dans la table :
un humain lit et déclare, la machine confronte. Toute note qui ressemble à une
action sans correspondre à un motif connu est imprimée en capitales,
« NOTE NON TRAITÉE » — une note lue à moitié ne vaut pas mieux qu'une note non
lue. Au 25 octobre : aucune.

### Les dix anaérobies à Gram positif

Ajoutés le même jour, **194 règles** : *Clostridium innocuum*, *C. ramosum*,
*C. septicum*, *C. tertium*, *Cutibacterium acnes*, *C. avidum*,
*Finegoldia magna*, *Parvimonas micra*, *Peptostreptococcus anaerobius*,
*Peptoniphilus* spp.

Dix espèces, **dix tables de seuils** : le document les sépare, et elles
diffèrent franchement — *C. innocuum* n'a ni pénicilline G, ni carbapénème, ni
vancomycine ; *C. ramosum* n'a ni vancomycine ni clindamycine ; *C. tertium*
n'a ni pénicilline G, ni clindamycine, ni pipéracilline-tazobactam. Les
confondre donnerait « un chiffre juste au mauvais endroit ».

*C. innocuum* est résistante à la vancomycine et le moteur le dit ; la mention
n'est **pas** portée comme « résistance naturelle attendue », parce que le
document EUCAST des phénotypes attendus ne la déclare pas et que cette colonne
cite une règle numérotée. § 26.

---

## Les sept espèces aérobies, ajoutées

Le 25 octobre 2026, **126 règles** pour sept groupes de seuils :
*Pasteurella multocida*, *Aeromonas* spp., *Achromobacter xylosoxidans*,
*Kingella kingae*, *Aerococcus urinae / sanguinicola*,
*Corynebacterium diphtheriae* et *C. ulcerans*. Avec les dix anaérobies du
même jour, PhénoBac passe de 43 à **60 espèces**.

**Deux groupes pour les corynébactéries toxinogènes**, et c'est le document
qui l'impose : il chiffre la clindamycine pour *C. diphtheriae* seulement —
« *Wild-type C. ulcerans is less susceptible to clindamycin* ».

### La note 13, et ce qu'elle interdit

Chez *C. diphtheriae* et *C. ulcerans*, le classeur écrit « S ≤ 0,001 mg/L »
et « S ≥ 50 mm » pour la pénicilline G, la céfotaxime et la ciprofloxacine. Ce
ne sont pas des seuils : c'est la **note 13**, un seuil hors échelle qui
signifie « *never report susceptible, standard dosing regimen* ». La base
l'écrit `S: null`, et ces trois molécules ne se rendent qu'en **I** ou en
**R** — une CMI de 0,004 mg/L donne « I », jamais « S ».

L'extracteur **s'arrête** si les deux marques ne vont pas ensemble : « 0,001 »
sans « 50 », ou l'inverse, est une structure qu'on ne comprend pas, et il vaut
mieux ne rien produire que produire à côté.

### Le code de la tétracycline manquait

PhénoBac portait la doxycycline et la minocycline, pas la **tétracycline** —
or c'est elle que l'EUCAST fait lire chez ces trois espèces, soit comme seuil
clinique, soit comme **écran** dont se déduit la doxycycline. Le disque le
plus répandu des laboratoires à moyens comptés n'avait pas de place.

### Deux tables de dépistage, et il en fallait deux

Le dépistage était une notion du **CA-SFM** dans PhénoBac : une seule table,
`DEPISTAGE_CASFM`, consultée uniquement sous ce référentiel. L'EUCAST en a
aussi — « *Tetracycline (screen only)* » chez *Pasteurella* — et ils tombaient
dans la table du mauvais référentiel. Résultat : la mesure restait « non
catégorisée », et l'application affirmait que l'EUCAST ne tranche pas, alors
que le document explique exactement comment conclure.

Pire, le message d'alerte était celui du CA-SFM — « ne pas conclure
résistant, faire une CMI » — et les deux référentiels ne disent **pas** la
même chose : l'EUCAST autorise expressément à rendre résistant faute de CMI.
Attribuer à un référentiel la règle de l'autre est pire qu'un silence. Les
deux textes sont désormais distincts.

### Les seuils de cystite simple, et la question qui les active

Trois seuils d'*Aerococcus* ne valent que pour la cystite simple :
ciprofloxacine, lévofloxacine, nitrofurantoïne. Hors ce contexte, ils ne
s'appliquent pas, et le moteur ne catégorise rien — ce qui est juste.

La question posée à l'utilisateur, en revanche, nommait des molécules
**écrites en dur** : « l'EUCAST ne chiffre le pivmécillinam, le céfixime, la
nitrofurantoïne et le triméthoprime que pour cette indication ». Vrai chez les
entérobactéries, faux chez *Aerococcus*, dont elle taisait les trois
molécules pour en citer deux absentes de son panel. Elle nomme désormais
celles du groupe affiché.

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

*Cutibacterium acnes* n'a pas été ajouté ce jour-là : il relevait de la
feuille des anaérobies à Gram positif. Elle a été traitée le 25 octobre 2026,
en entier — voir l'entrée `verifier-couverture-eucast.py` ci-dessus.

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
