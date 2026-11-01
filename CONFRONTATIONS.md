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
- **empreinte** : e08194906a6285e8066e07cf8b7946221ee04c6971dc3228280f5ee7b5cfc65f
- **date** : **2026-11-01, le classeur en main** (sha256 `5de6f4a097f7f655…`)
- **résultat** : **511 seuils confrontés — 511 identiques, 0 différent**,
  0 drapeau incohérent, 91 non comparés. Diamètres : **437 identiques, 0
  différent**, 2 à arbitrer (vancomycine et méropénème, deux lignes
  possibles). Méningé : **24 identiques, 0 différent**.
- **pourquoi l'empreinte a bougé sans nouvelle confrontation** : le
  2026-10-31, trois lignes ont été **retirées** de BP —
  `morganella/salmonella/serratia · FOS · cmi · standard 8-8`. Aucune
  valeur n'a été ajoutée ni modifiée. Le retrait applique à trois groupes
  frères la lecture déjà consignée ici le 2026-10-25 — « Fosfomycin iv,
  other Enterobacterales : **Note** » — portée ce jour-là dans le seul
  groupe `entero`. Le classeur n'a pas été rouvert : il n'est pas
  téléchargeable (403) et la ligne qui fonde le retrait est celle qui est
  écrite plus bas, dans « LE MANQUE : la fosfomycine au disque ». Une
  prochaine confrontation complète reste due dès que le classeur est en
  main — c'est une dette, pas un acquis.
- **résultat** : **512** seuils confrontés — **512 identiques, 0 différent**,
  91 non comparés. Dans l'autre sens : aucune molécule du panel n'est privée
  du seuil que le document lui donne, et **plus aucun couple hors panel** —
  les 109 ont été portés le 25 octobre 2026 sur décision du biologiste.
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

### Et enfin la question inverse, sur les TRENTE-NEUF groupes

`verifier-couverture-eucast.py` répond à cette question de façon exacte, ligne
à ligne — mais pour **22 tables seulement**, celles dont la mise en page est
simple. Les dix-sept grandes feuilles empilent des lignes par indication, par
voie et par espèce, et tout le savoir qui permet de choisir la bonne est
**ici**, dans `comparer-eucast.py`. On l'y emploie donc, dans les deux modes.

La boucle ne parcourait que les codes que PhénoBac **porte**. Elle parcourt
maintenant aussi les quarante codes qu'elle sait tester, et le rapport trie
en trois :

| | CMI | diamètres |
|---|---|---|
| absences expliquées par un mécanisme (témoin, dépistage) | — | 6 |
| chiffré par le document, **hors du panel** de PhénoBac | 109 | 26 |
| **au panel, et sans seuil** | **0** | **1** |

Les 109 et les 26 ne sont **pas** des défauts : PhénoBac offre un panel
choisi, celui d'un laboratoire de district, et non la liste entière de
l'EUCAST — la tétracycline du pneumocoque n'y est pas, et c'est une décision.
La troisième ligne, elle, en est : la molécule est offerte à la saisie, le
biologiste la mesure, et rien ne sort.

### DEUX RÈGLES QUI MANQUAIENT À LA SÉLECTION DES LIGNES

Le premier passage réclamait **137** couples. Seize venaient d'un défaut de
l'outil, et une dix-septième d'un défaut plus subtil :

- **une ligne qui nomme une espèce ne vaut que pour elle.** « Clindamycin,
  C. diphtheriae » ne concerne pas *C. ulcerans* ; « Daptomycin, S. aureus »
  ne concerne pas les SCN ; « Nitrofurantoin …, S. saprophyticus » ne concerne
  ni *S. aureus* ni les autres SCN ; « Trimethoprim …, E. coli and Klebsiella »
  ne concerne ni *Salmonella*, ni *Serratia*, ni les Morganellaceae. Une liste
  d'espèces par groupe règle cela, avec la clause « **except** » prise dans le
  bon sens ;

- **une ligne qui nomme mon espèce gouverne, MÊME SANS CHIFFRE.** Le document
  donne à *Salmonella* sa propre ligne de ciprofloxacine, dont le diamètre est
  « Note » : il n'y a **pas** de disque pour ce genre, et l'EUCAST fait écran à
  la péfloxacine. Retomber sur la ligne générale des entérobactéries (25/22)
  faisait réclamer un seuil que le référentiel refuse de donner. « Note » n'est
  pas une absence de ligne : c'est un refus de trancher, et il vaut pour moi.

Après ces deux règles, les comptes avant/après sont inchangés — 403 CMI et
410 diamètres identiques — et il ne reste **qu'un** manque.

### LE MANQUE : la fosfomycine au disque

L'EUCAST v16.1 donne, pour *E. coli* :

| ligne du document | CMI | disque | diamètre |
|---|---|---|---|
| Fosfomycin iv (infections originating from the urinary tract), *E. coli* | 8 / 8 | 200 µg | **24 / 24** |
| Fosfomycin oral (uncomplicated UTI only), *E. coli* | 8 / 8 | 200 µg | **24 / 24** |
| Fosfomycin iv (other indications), *E. coli* | Note | — | Note |
| Fosfomycin iv, **other Enterobacterales** | Note | — | Note |

PhénoBac porte la CMI 8/8 et **aucun diamètre**. Un laboratoire qui mesure
26 mm sur un disque de 200 µg s'entend répondre « l'EUCAST ne reconnaît pas la
méthode au disque pour ce couple » — ce qui est faux, et c'est le test le
moins cher qui existe pour une cystite simple.

Deux restrictions vont avec : le seuil ne vaut que pour ***E. coli*** et que
pour les indications **urinaires**. PhénoBac rendait « fosfomycine S » pour
*Klebsiella* et *Enterobacter*, et hors contexte urinaire.

**Corrigé le 25 octobre 2026, à la lettre du document, sur décision du
biologiste.** La ligne porte désormais le site `urinaire` et la restriction
d'espèce `["ecoli"]`, et le diamètre 24 mm / 200 µg est ajouté.

Une limite est assumée : PhénoBac n'a **qu'un** site urinaire, et la question
posée dit « cystite simple ». La ligne intraveineuse du document vise plus
large — « infections d'origine urinaire », pyélonéphrite comprise. Le
rattachement est donc un peu PLUS ÉTROIT que le document : sur une
pyélonéphrite, la molécule reste sans catégorie tant que la question n'est pas
cochée. C'est le sens prudent de l'écart, et l'usage courant — fosfomycine
orale, cystite simple — est couvert.

### Une absence doit dire SA raison, pas la plus courante

« L'EUCAST ne reconnaît pas la méthode des disques pour ce couple » était la
seule explication donnée à un diamètre non catégorisé. Elle devient **fausse**
dès qu'un seuil existe mais ne s'applique pas ici : sur une *Klebsiella*, elle
envoyait faire une CMI qui n'aurait pas été catégorisée davantage ; sur un
*E. coli* hors contexte urinaire, elle cachait qu'il suffisait de répondre à
une question. Une mauvaise raison coûte un examen et fait douter de l'outil.

Le moteur distingue maintenant trois cas, et **l'espèce passe avant le
contexte** — sur une *Klebsiella* hors contexte, les deux raisons valent, mais
seule la première est réparable par l'utilisateur :

| situation | ce qui est dit |
|---|---|
| l'espèce n'est pas celle du document | « l'EUCAST ne chiffre ce couple que pour *E. coli* » |
| l'indication n'est pas cochée | « répondre à la question du contexte suffit à le catégoriser » |
| le document ne donne vraiment pas de disque | le message d'origine, qui redevient vrai |

---

## comparer-eucast.py --meninge — concentrations critiques des méningites

- **document** : EUCAST, Clinical Breakpoint Tables v16.1, 24 juin 2026 (classeur xlsx)
- **tables** : BP_MENINGE
- **empreinte** : e51141f67263aa01bde405f9981d47bb84b598418fb28b6e72e17a9da801b838
- **date** : 2026-10-25
- **résultat** : **24** seuils confrontés — 24 identiques, 0 différent, 0 manquant.

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
- **empreinte** : 016d9cba32aafc429ec2ee880cb1e5115620ae3ba5347ca579f1fbd4aded864e
- **date** : 2026-10-25
- **résultat** : **435** diamètres confrontés — **435 identiques, 0 différent**,
  0 non comparé, 2 à arbitrer (les deux concordent). Dans l'autre sens : aucune
  molécule du panel n'est privée de son diamètre ; il reste 2 couples hors
  panel, faute de charge de disque dans le document, et 6 absences expliquées
  par un témoin ou un écran.

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
- **empreinte** : 26083b44169f21e985921bfe4e01faf62ea360982d3715d34662fe38d0f96656
- **date** : 2026-10-25, empreinte reprise le 2026-11-01
- **pourquoi l'empreinte a bougé sans nouvelle confrontation** : `ZIT_CASFM` a
  gagné **une** entrée, lue sur la page 72 du communiqué — la pénicilline G de
  *S. aureus*, ZIT « ≤ 0,125 ». Rien du côté EUCAST n'a changé, et le classeur
  n'a pas été rouvert : il reste inaccessible. La confrontation complète des
  ZIT reste due.
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
- **empreinte** : 60256cc034ef90c4f3ae22f98931a81d240415a4d72837d0981acf221898e8ce
- **date** : 2026-10-25, empreinte reprise le 2026-10-31
- **pourquoi l'empreinte a bougé sans nouvelle confrontation** : même
  raison que ci-dessus — trois lignes retirées de BP, aucune ajoutée. Et
  une PORTÉE à rappeler : la liste `TABLES` de cet outil ne contient que
  les **vingt-deux tables difficiles** (anaérobies, *Pasteurella*,
  *Aeromonas*, *Achromobacter*, *Kingella*, *Aerococcus*,
  *Corynebacterium*). **Les entérobactéries n'y figurent pas** : son
  « 0 manque, 0 excédent » n'a jamais parlé des lignes retirées, et ne
  parle pas davantage de celles qui restent. C'est ce trou qui a laissé
  la fosfomycine se contredire six jours durant, et c'est pourquoi
  `outils/verifier-fratries.py` existe.
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

## La couverture élargie, et le piège qu'elle a tendu

Le 25 octobre 2026, les **111 couples hors panel** relevés par le balayage
inverse ont été portés, sur décision du biologiste : **133 règles** — 109 en
CMI, 24 au disque — sur 20 groupes de seuils et 33 espèces, soit 160 entrées de
panel. Cyclines, β-lactamines, fluoroquinolones et divers, tout le lot.

Les lignes ont été **produites** par `comparer-eucast.py --proposer`, qui
réutilise la sélection de lignes du comparateur — indications, voies,
restrictions d'espèce — et non recopiées. Chacune porte en commentaire
l'intitulé du document dont elle vient.

### Le proposeur fabriquait d'abord des règles FAUSSES

Deux fautes, attrapées avant de coller quoi que ce soit :

- la **note 13** s'écrit `null`, pas `0.001`. Le comparateur le savait pour
  comparer ; le proposeur l'avait oublié pour écrire. Une ciprofloxacine à
  0,001 mg/L sur un staphylocoque aurait été rendue **sensible** — l'inverse
  exact de ce que la note veut dire ;
- une ligne qui ne vaut que pour **une partie du groupe** porte la colonne
  `espece`. L'imipénème et la pipéracilline-tazobactam de l'entérocoque ne
  valent que pour *E. faecalis*, la nitrofurantoïne des SCN que pour
  *S. saprophyticus*.

Un outil qui fabrique des règles doit les fabriquer justes, sinon c'est une
machine à introduire des fautes. Un premier script d'extension des panels a
d'ailleurs dérapé — 252 ajouts au lieu de 111, parce qu'il lisait tout le
fichier au lieu du bloc inséré. Annulé, refait depuis la source exacte.

### LE PIÈGE : trois seuils méningés du pneumocoque

Porter l'ampicilline, la ceftriaxone et le méropénème au panel du pneumocoque
**sans leurs valeurs de méningite**, c'était laisser le seuil ordinaire
s'appliquer à un liquide céphalo-rachidien :

| | ordinaire | méningé | effet sur un LCR, avant correction |
|---|---|---|---|
| ceftriaxone | S ≤ 0,5 · R > 2 | S ≤ 0,5 · R > 0,5 | CMI 1 mg/L rendue **I** au lieu de **R** |
| méropénème | S ≤ 2 · R > 2 | S ≤ 0,25 · R > 0,25 | CMI 1 mg/L rendue **S** au lieu de **R** |
| ampicilline | S ≤ 0,5 · R > 1 | S ≤ 0,06 · R > 0,06 | CMI 0,5 mg/L rendue **S** au lieu de **R** |

C'est exactement le danger pour lequel le mode `--meninge` avait été écrit, et
il l'a attrapé **le jour même** — parce que les molécules venaient d'arriver au
panel. Un élargissement de couverture et ses seuils méningés se portent donc
ensemble, jamais l'un sans l'autre.

---

## comparer-casfm.py — le delta CA-SFM, calculé

- **document** : CA-SFM, recommandations 2026 V1.0 septembre 2026 (178 pages),
  confronté au classeur EUCAST v16.1 par l'intermédiaire de la table BP
- **tables** : BP_CASFM, BP_CASFM_URIN, BP_MENINGE_CASFM
- **empreinte** : 639b7198a583324768f94ada3a202178f83e6368c3cb937081a3fdbfd07a5507
- **date** : 2026-11-01, le communiqué ET le document des différences sous les yeux
- **portée du registre élargie le même jour** : l'empreinte ne couvrait que
  `BP_CASFM`. La passe des autres sites ayant rendu `BP_CASFM_URIN` et
  `BP_MENINGE_CASFM` comparables, quatorze lignes urinaires ont pu être
  ajoutées **sans que le garde-fou bronche** : il surveillait une table sur
  trois. Les trois y sont désormais.
- **résultat** : **271 couples confrontés, 259 où les deux comités disent la
  même chose.** 13 écarts portés dans le delta ce jour (9 concentrations
  critiques + 4 diamètres ; un dixième, « listeria LZD », a été porté puis
  retiré — voir plus bas). Zéro nom que l'outil ne sait pas lire. **Deux
  écarts restent à arbitrer**, apparus quand le lecteur a su distinguer les
  espèces à l'intérieur d'un chapitre :

  | groupe | molécule | page | CA-SFM | PhénoBac applique |
  |---|---|---|---|---|
  | *S. aureus* | oxacilline | 72 | S ≤ 2 · R > 2 | S ≤ 0,25 · R > 0,25 |
  | SCN | vancomycine | 75 | S ≤ 2 · R > 2 | S ≤ 4 · R > 4 |

  Et **une ligne du delta que le communiqué ne dit nulle part** :
  `ngono GEN 16 / 16`. La page 108 ne mentionne 16 mg/L que dans une **note**,
  pour distinguer les souches sauvages de celles ayant acquis un mécanisme —
  c'est un **ECOFF**, pas une concentration critique clinique, et PhénoBac
  l'applique comme un seuil de catégorisation.

  Restent hors comparaison : **1** couple à plusieurs lignes (la
  ciprofloxacine des entérobactéries, dont la seconde ligne appartient au
  sous-tableau « *Salmonella* spp. » — les sous-titres ne sont pas encore
  lus), 6 dépendant de la voie, 1 colonne S portant le mot « Note » (p72,
  pénicilline G), et 20 lignes de dépistage ou d'endocardite.

## Le classeur en xlsx, 2026-11-01 : la dette est close

Déposé par le biologiste (sha256 `5de6f4a097f7f655…`). Les quatre
confrontations qui attendaient depuis une semaine ont tourné :

| passe | résultat |
|---|---|
| concentrations critiques | **511 identiques, 0 différent**, 0 drapeau incohérent |
| diamètres | **437 identiques, 0 différent**, 2 à arbitrer |
| méningé | **24 identiques, 0 différent** |
| couverture, 22 tables | **409 règles, aucun écart** |

**La base EUCAST de PhénoBac dit exactement ce que dit le classeur.**

### Mais le comparateur a commencé par accuser ma propre livraison

Il réclamait le drapeau « convention de laboratoire » sur `staph / TOB` et
`scn / TOB` — « le document ne donne aucun chiffre pour ce couple ». Le
classeur donne pourtant `Tobramycin, S. aureus (2)/(2)`, exactement ce que
j'avais lu sur le PDF une heure plus tôt.

La cause : **`AGENTS`, le vocabulaire du comparateur, ne connaissait pas la
tobramycine.** Faute de motif, la ligne du classeur n'était pas trouvée, le
couple passait pour absent du document, et le drapeau était réclamé sur une
valeur parfaitement fixée.

> **Une molécule ajoutée au panel doit l'être dans `AGENTS` aussi**, sinon la
> confrontation cesse de la couvrir sans le dire. La kanamycine y figure
> désormais elle aussi, quoique l'EUCAST l'ait retirée en v14.0 : c'est ainsi
> que l'outil peut le **constater** plutôt que de l'ignorer.

### La couverture étendue aux six autres groupes, le même jour

L'EUCAST chiffre la tobramycine pour six groupes de plus que PhénoBac ne
portait pas. Sur décision du biologiste, ils sont ajoutés — et le classeur
donne **deux lignes** par groupe, que PhénoBac distingue par le site :

| groupe | systémique (entre parenthèses) | urinaire (sans) |
|---|---|---|
| `entero`, `morganella`, `salmonella`, `serratia` | 2 / 2 · disque 16 / 16 | 2 / 2 · disque 16 / 16 |
| `pseudo` | 2 / 2 · disque 18 / 18 | 2 / 2 · disque 18 / 18 |
| `acineto` | 4 / 4 · disque 17 / 17 | 4 / 4 · disque 17 / 17 |

Seule la ligne systémique porte la réserve « entre parenthèses » (`ecoff`) ;
le compte passe de 31 à 37 couples, et `essai-regles.js` le dit avec sa
raison. Vérifié : un *E. coli* à 1 mg/L de tobramycine reçoit désormais la
règle « EUCAST : Tobramycine, Gentamicine — seuil donné entre parenthèses,
fondé sur l'ECOFF ».

**`shigella` et `salmonella` ne reçoivent pas la molécule au panel**, et ce
n'est pas un oubli : leur panel ne porte **aucun aminoside**, parce que ces
molécules sont inactives sur les salmonelloses et shigelloses
intra-cellulaires. Les seuils existent dans la base — le groupe est celui des
entérobactéries — mais la saisie ne les propose pas, et c'est la bonne
façon : offrir une case qu'on ne devrait pas remplir est une invitation.

Après extension : **517 concentrations critiques identiques, 0 différente ;
443 diamètres identiques, 0 différent.**

## Les restrictions d'espèce du site ordinaire, 2026-11-01

Le classeur a permis de trancher `scn PEN`, et la correction en a découvert
deux autres de la même forme.

```
Benzylpenicillin, S. aureus             0,125 / 0,125
Benzylpenicillin, S. lugdunensis        0,125 / 0,125
Benzylpenicillin, other staphylococci   Note / Note
Imipenem, E. faecalis                   0,001 / 4
Piperacillin-tazobactam, E. faecalis    0,001 / 16
```

**La restriction d'espèce était écrite dans la base et non lue par le
moteur.** `getBP()` et `getDZ()` ne la consultaient qu'aux branches
urinaires ; au site ordinaire, le retour final rendait la valeur sans
regarder l'espèce. Trois couples en souffraient :

| couple | avant | après |
|---|---|---|
| *S. epidermidis*, *S. saprophyticus*, *S. haemolyticus* · pénicilline G | **S** à 0,06 | aucune catégorie |
| *E. faecium* · imipénème | **I** à 2 | aucune catégorie |
| *E. faecium* · pipéracilline-tazobactam | **I** à 8 | aucune catégorie |

*S. aureus* et *S. lugdunensis* gardent leur pénicilline G ; *E. faecalis*
garde ses deux molécules.

> Une restriction écrite dans la base et ignorée par le moteur est **pire
> qu'une restriction absente** : elle donne à relire une garantie qui
> n'existe pas.

## La porte d'entrée des carbapénémases, ouverte le 2026-11-01

Le CA-SFM 2026 fait rendre les carbapénèmes résistants pour toute souche
productrice de carbapénémase, « quel que soit le type d'enzyme produite et
**les CMI des carbapénèmes** ». La règle était écrite, citée, et elle
marchait — **mais seulement quand un carbapénème sortait déjà R ou I**,
parce qu'elle vivait dans la branche phénotypique « suspicion de
carbapénémase », laquelle ne s'ouvre que sur un carbapénème atteint.

Une souche à carbapénémase **confirmée** dont les trois carbapénèmes sortent
sensibles ne la traversait jamais — le cas que la phrase nomme, et le plus
dangereux, les producteurs d'OXA-48 ayant souvent des CMI basses.

| *E. coli*, OXA-48 confirmée, CA-SFM | avant | après |
|---|---|---|
| ETP, IPM, MEM tous lus **S** | S · S · S | **R · R · R** (+ CTX et CRO R) |
| ETP lu I | déjà R · R · R | inchangé |
| carbapénémase non confirmée | rien | rien |

Le filet est posé dans `finalize()`, que toutes les branches traversent, et
un drapeau empêche de rejouer ce qu'une branche a déjà fait. **Même
correction, même jour, que pour le bloc aminosides** : une règle qui ne
dépend pas du phénotype ne doit pas vivre dans une branche de phénotype.

**Et la ceftriaxone a rejoint la céfotaxime.** La règle OXA-48 écrivait
« céfotaxime *et ceftriaxone* rendus résistants » et ne rendait que la
céfotaxime. La ceftriaxone est au panel depuis toujours.

## Les six dernières pages du document des différences, lues le 2026-11-01

**Aucune ne porte de seuil à corriger.** Quatre sont de la méthode ou de la
politique, deux ont du contenu opérationnel.

- **p3, concentrations PK/PD** — l'EUCAST a supprimé son tableau en v14.0 ;
  le CA-SFM garde le terme. Rien à porter.
- **p4, aminopénicillines** — le CA-SFM **refuse délibérément** de scinder
  par voie et par site là où l'EUCAST le fait, « pour ne pas complexifier la
  présentation des tableaux », et parce que les posologies françaises
  diffèrent. **Cela confirme le travail sur les voies** : PhénoBac ne montre
  que les scissions que le CA-SFM maintient réellement.
- **p16-17, anaérobies** — le CA-SFM maintient des *breakpoints* cliniques
  là où l'EUCAST se replie sur les ECOFF, en les adaptant du CLSI. C'est la
  provenance de plusieurs valeurs d'anaérobies de PhénoBac.
- **p18, valeurs adaptées du CLSI** — la page nomme les molécules
  concernées. **Confronté : les six que PhénoBac porte sont déjà marquées
  `conv`** — `acineto` CAZ, FEP, MIN, TZP et `steno` LVX, MIN. La convention
  de laboratoire disait vrai ; elle a maintenant sa source.

### Deux trouvailles qui demandent une décision

**Le céfidérocol au disque (p5) — PORTÉ le 2026-11-01.** Le CA-SFM
« recommande de **ne pas utiliser la méthode des disques** » pour les
*Enterobacterales*, à cause des défauts de corrélation entre diamètres et
CMI « observés plus particulièrement avec les souches multi-résistantes pour
lesquelles le testing du céfidérocol peut s'avérer utile » — c'est-à-dire
que **le disque ment précisément là où l'on a besoin de lui**. Les tables du
communiqué le disent aussi : p50, colonne disque « Note », note 5/A
« déterminer la CMI par microdilution en milieu liquide ».

Pour *Pseudomonas*, le comité est moins catégorique : p59, « disque 30 µg ·
27 », et « si le diamètre est < 27 mm, déterminer la CMI ». Le disque ne
catégorise pas, il **dépiste**.

| | avant, sous CA-SFM | après |
|---|---|---|
| entérobactéries ×4 · FDC | disque 23 / 23 | **aucun diamètre** |
| *Pseudomonas* · FDC | disque 22 / 22 | **dépistage à 27 mm** — ≥ 27 « sensible », en dessous aucune catégorie et renvoi à la CMI |

Les deux mécanismes existaient déjà dans le moteur : `dzCasfmDivergent()`
pour le refus du disque, la colonne `dep` pour le dépistage. **Les quatre
lignes de CMI CA-SFM ajoutées ne changent aucune valeur** — elles redisent
le 2 / 2 de l'EUCAST — mais c'est leur EXISTENCE qui retire le diamètre.
`comparer-casfm.py` les comptait « périmées » à bon droit ; elles lui sont
déclarées, avec la raison.

> **Et la consigne du dépistage nommait la mauvaise molécule.** « Le disque
> de *pénicilline G* ne sert ici qu'à reconnaître les souches sensibles » —
> écrit quand `strepacg PEN` était le seul dépistage CA-SFM au disque. Un
> résultat de céfidérocol s'expliquait par une phrase sur la pénicilline G.
> Elle nomme désormais la molécule testée. Une consigne qui nomme la
> mauvaise molécule est pire qu'une consigne générale : le biologiste croit
> avoir mal lu son propre écran.

**La recherche de pénicillinase chez *Pasteurella* (p15) — PORTÉE le
2026-11-01.** Le document des différences est explicite sur le partage :
l'EUCAST « propose des breakpoints pour la pénicilline G, l'ampicilline et
l'amoxicilline, mais n'indique pas la nécessité de rechercher la présence
d'une pénicillinase avant de rendre un résultat sensible pour ces
molécules ». Le CA-SFM l'exige, par un test chromogénique, et tranche —
communiqué p113, chapitre 5.21, note 1 :

> « Les souches productrices de β-lactamase doivent être catégorisées
> « résistantes » à la pénicilline G et aux aminopénicillines (sans
> inhibiteurs de β-lactamase). »

**Aucun chiffre ne bouge** : les concentrations critiques du chapitre sont
celles de l'EUCAST, et la base ne change pas (`BASE_VERSION` reste
`2026.33`). Ce qui change est une CONDUITE, et elle vaut une catégorie.

| test à la β-lactamase | sous CA-SFM | sous EUCAST |
|---|---|---|
| **positif** | PEN, AMP, AMX **rendus R** par `rendreR()`, la lecture de paillasse conservée à côté | **rien ne change** — une note dit que le CA-SFM l'exigerait |
| **négatif** | les chiffres s'appliquent, sans réserve — c'est la « conduite à tenir » que le comité précise | rien |
| **non fait / non renseigné** | on réclame le test AVANT de rendre sensible, sans rien rendre R à la place | rien — l'exigence n'est pas la sienne |

L'**amoxicilline-acide clavulanique est épargnée** dans tous les cas : le
comité écrit « sans inhibiteurs », et c'est elle le traitement de référence
de la morsure. L'étendre aurait retiré au clinicien la seule molécule que le
chapitre lui recommande.

La vérification qui compte est la négative, et elle est au banc
(`essai-especes-aerobies.js`, section 10 bis, 15 contrôles) : **sous EUCAST,
un test positif ne doit RIEN changer.** C'est l'erreur qu'on ne verrait pas,
parce que le rendu serait « plus prudent », donc plausible.

### Et la page ne posait pas la question

Le moteur lisait déjà `c.blac` pour *Haemophilus*, le gonocoque et
*Moraxella*. ***Pasteurella* avait `ctx:[]`** — aucune question. Une règle
branchée là serait restée **inatteignable pour toujours** : le contexte
arrive vide, la condition est fausse, il n'y a rien à voir, et tous les
bancs restent verts.

C'est la forme la plus discrète du défaut qui revient dans tout ce dépôt :
**une chose juste déclarée à un seul endroit quand il en fallait deux.** Le
moteur sait lire la réponse, la page ne sait pas poser la question, et les
deux fichiers sont corrects pris séparément.

**`outils/essai-contexte.js`** (nouveau, dans la chaîne) le mesure par
différentiel, sans lire le code : pour chaque espèce et chaque question, il
interprète le même antibiogramme avec la réponse et sans elle, et tient deux
ensembles — ce à quoi le moteur RÉPOND, ce que la page OFFRE. Il exige
l'égalité. Les deux écarts sont des défauts de sens opposé : du code mort
d'un côté, une question posée pour rien de l'autre.

> **Un seul profil ne suffisait pas, et la première version a accusé
> vingt-deux questions justes.** Elle interprétait un antibiogramme tout
> sensible. Or une question de contexte ne sert qu'en présence d'une
> résistance : le D-test ne se lit que si l'érythromycine est atteinte, la
> synergie au clavulanate que si une C3G l'est. Le banc balaie désormais une
> famille de profils où chaque molécule du panel se présente une fois
> résistante isolément. Un contrôle qui accuse à tort est pire qu'un
> contrôle absent : on finit par le désarmer.

État : **28 751 interprétations comparées à leur témoin, 0 écart.** Le banc
a été éprouvé en retirant la question de *Pasteurella* — il la nomme
(« code mort : pasteurella.blac ») — et en retirant celle d'*Haemophilus*.

## Le bloc aminosides des staphylocoques, porté le 2026-11-01

Sur décision du biologiste : **d'un seul tenant**, plutôt que la kanamycine
seule. La page 74 du communiqué donne six lignes et trois notes, et les notes
sont des **règles de rendu**, pas des remarques.

### Deux molécules au panel

| molécule | EUCAST v16.1 | CA-SFM 2026 | où |
|---|---|---|---|
| **tobramycine** | *S. aureus* (2)/(2) · disque (18)/(18) ; SCN (2)/(2) · (20)/(20) — **entre parenthèses** (p38) | mêmes valeurs (p74) | panel commun |
| **kanamycine** | **retirée en v14.0** | *S. aureus* 8/8 · disque 18/18 ; SCN 8/8 · 22/22 (p74) | **ajout CA-SFM** |

La kanamycine ne va pas dans le panel commun : en mode EUCAST elle n'aurait
aucun seuil, et proposer une saisie qu'on ne sait pas catégoriser est une
fausse promesse. `CASFM_PANEL` existe pour cela.

Les quatre lignes de tobramycine portent le drapeau `ecoff` — la convention
de PhénoBac pour les valeurs que l'EUCAST met entre parenthèses, comme la
gentamicine et l'amikacine qui l'encadrent. Le compte passe de 29 à 31
couples, et `essai-regles.js` le dit avec sa raison.

### Trois déductions, dont une qui manquait depuis toujours

```
note 2 : « Les souches résistantes à la gentamicine sont résistantes à TOUS
          les aminosides. »
note 3 : tobramycine, S. aureus — « Interprétation valable pour l'amikacine. »
note 4 : tobramycine, SCN — « Les souches résistantes à la tobramycine sont
          résistantes à la kanamycine et à l'amikacine. »
```

**Aucune des trois n'était appliquée.** La première coûtait le plus : un
*S. aureus* gentamicine **R** dont l'amikacine était lue **S** sortait
« amikacine sensible », sous les deux référentiels — l'aminoside de recours
rendu actif sur une souche que le comité tient pour résistante à tous.

Vérifié, CA-SFM (sous EUCAST, rien ne bouge) :

| cas | gentamicine | tobramycine | kanamycine | amikacine |
|---|---|---|---|---|
| *S. aureus*, GEN R | R | S → **R** | S → **R** | S → **R** |
| *S. aureus*, TOB R seule | S | R | S | S → **R** |
| *S. epidermidis*, TOB R seule | S | R | S → **R** | S → **R** |
| tout sensible | S | S | S | S |

**On ne déduit que dans le sens « R ».** La note 3 dit l'interprétation
« valable » dans les deux sens, mais rendre *sensible* une molécule qu'on n'a
pas testée serait inventer une catégorie — ce que PhénoBac ne fait jamais. Le
sens R est celui que les notes 2 et 4 écrivent explicitement, et c'est le sens
qui protège.

> **La règle est posée dans `finalize()`, pas dans une branche du moteur.**
> Elle ne dépend pas du phénotype reconnu, seulement du résultat de la
> gentamicine et de la tobramycine. L'accrocher à une branche l'aurait rendue
> muette dans les autres — exactement le défaut qui laisse la règle des
> carbapénémases hors d'atteinte quand les carbapénèmes sortent sensibles
> (page 8, plus haut).

### Empreintes EUCAST reprises, et cette fois le document était là

`BP`, `BP_URIN`, `DZ`, `DZ_URIN` et `ECOFF` ont bougé : quatre lignes de
tobramycine ajoutées, **lues sur la page 38 du classeur v16.1** que le
biologiste a déposé le jour même. Les confrontations complètes restent dues —
les outils attendent le **xlsx**, et c'est un PDF — mais les valeurs ajoutées,
elles, viennent bien du document.

## Le classeur EUCAST v16.1, reçu le 2026-11-01

Déposé par le biologiste — **en PDF**, 123 pages, sha256 `925098e165792fed…`.
`comparer-eucast.py` et `verifier-couverture-eucast.py` attendent le
**classeur xlsx** et ne savent pas le lire ; les deux confrontations
complètes restent donc dues. Mais le PDF se lit par position, comme le
CA-SFM, et **les deux questions qui l'attendaient sont tranchées**.

### L'oxacilline des staphylocoques : pas d'erreur, une convention déclarée

EUCAST v16.1, page 35, ne donne **aucune** concentration critique clinique
d'oxacilline pour *S. aureus* :

```
Oxacillin (screen only), S. pseudintermedius, S. intermedius,
                         S. schleiferi, S. coagulans      NA / NA · 1 µg · 20/20
Oxacillin, other staphylococci                            Note / Note / Note / Note
```

La méticillino-résistance se détecte à la **céfoxitine (screen only)**. Les
lignes `staph OXA 0,25` et `scn OXA 0,25` de PhénoBac portent déjà le drapeau
`conv` — convention de laboratoire assumée, que l'interface annonce. **Rien à
corriger**, et le soupçon d'erreur EUCAST était infondé.

### Les trois β-lactamines du pneumocoque en LCR : pas une recopie

EUCAST v16.1, page 51 :

```
Benzylpenicillin (endocarditis and meningitis)   0,06 / 0,06
Ampicillin iv   (endocarditis and meningitis)    0,06 / 0,06
Amoxicillin iv  (endocarditis and meningitis)    0,06 / 0,06
```

**Les trois partagent réellement la valeur.** Mon soupçon — « trois
β-lactamines à la valeur de la pénicilline G ressemblent à une recopie » —
était faux. PhénoBac est juste côté EUCAST ; c'est le CA-SFM qui monte
l'amoxicilline et l'ampicilline à 0,5, et c'est déjà porté.

### Mais une trouvaille, à la même page

```
Benzylpenicillin, S. aureus        0,125 / 0,125
Benzylpenicillin, S. lugdunensis   0,125 / 0,125
Benzylpenicillin, other staphylococci   Note / Note / Note / Note
```

PhénoBac applique **0,125 à tout le groupe `scn`** — *S. epidermidis*,
*S. haemolyticus*, *S. saprophyticus* — là où l'EUCAST écrit « Note ». Et
contrairement à l'oxacilline, **cette ligne ne porte pas le drapeau `conv`** :
elle se présente comme une valeur du référentiel. La même forme que tout le
reste de la série : une valeur juste pour une espèce, appliquée à un groupe.

## Les pages 8 et 9 du document des différences, lues le 2026-11-01

### Page 9 — rien à porter, et c'est vérifié

- **acide nalidixique** : l'EUCAST n'en donne plus, le CA-SFM en garde « mais
  le résultat ne permet en aucun cas d'en déduire la sensibilité ou la
  résistance des autres fluoroquinolones ». PhénoBac ne l'a pas au panel et
  n'en déduit rien. Le document conclut lui-même : « **absence d'impact sur
  les résultats des fluoroquinolones entre les deux référentiels** » ;
- **dépistage des carbapénémases** : l'EUCAST propose le seul disque de
  méropénème à 28 mm, le CA-SFM un logigramme à plusieurs disques (annexe 6).
  Les deux sont **en amont** de PhénoBac, qui demande au laboratoire le
  résultat de son propre test ;
- ***Pseudomonas*, lévofloxacine** : seuil à 0,5 **et** le commentaire
  « forte posologie au minimum ; activité inférieure à celle de la
  ciprofloxacine » — les deux sont déjà en place.

### Page 8 — la règle est implémentée, et elle ne peut pas atteindre le cas qu'elle nomme

Le CA-SFM 2026 « recommande désormais d'interpréter les résultats bruts
**S ou SFP** comme « résistant » aux carbapénèmes pour les souches
productrices de carbapénémase, et ce **quel que soit le type d'enzyme
produite et les CMI des carbapénèmes** ».

PhénoBac porte cette règle, citation comprise, avec la sous-règle OXA-48 pour
céfotaxime et ceftriaxone. **Vérifié, et elle marche** :

| *E. coli*, OXA-48 confirmée | EUCAST | CA-SFM |
|---|---|---|
| ETP lu **I**, IPM et MEM lus S | I · S · S | **R · R · R** (+ CTX R) |
| ETP, IPM, MEM **tous lus S** | S · S · S | **S · S · S** |

La seconde ligne est le défaut. La branche « carbapénémase » n'est atteinte
que si **un carbapénème est déjà lu R ou I** ; une souche à carbapénémase
confirmée dont les trois carbapénèmes sortent sensibles ne la traverse
jamais. Or c'est exactement le cas que la règle nomme — « quel que soit les
CMI » — et le plus dangereux : les producteurs d'OXA-48 ont souvent des CMI
de carbapénèmes basses.

> Une règle juste, citée, testée, et qui ne peut pas s'appliquer là où son
> propre texte la réclame. Ce n'est pas une décision à prendre : c'est une
> porte d'entrée manquante.

## Les pages 11 et 12 du document des différences, lues le 2026-11-01

### Page 12 — quatre valeurs confirmées, rien à changer

| ce que la page 12 affirme | PhénoBac |
|---|---|
| l'EUCAST ne donne **aucun** seuil à la daptomycine des entérocoques (mention « IE ») | la ligne EUCAST porte le drapeau `conv` — convention de laboratoire assumée ✓ |
| le CA-SFM propose **2 mg/L avec une ZIT à 4** | CA-SFM 2 / 2, ZIT 4 ✓ |
| l'EUCAST propose **0,03** pour les streptocoques A/C/G et **0,125** pour le B | EUCAST 0,03 et 0,125 ✓ |
| le CA-SFM retient **0,06** pour A/C/G et garde 0,125 pour le B | CA-SFM 0,06 et 0,125 ✓ |

Page lue, aucune action. La justification du 0,06 vaut d'être connue du
laboratoire : « la plupart des techniques automatisées ne permettent pas de
mesurer des CMI < 0,06 mg/L », et un seuil à 0,03 imposerait le recours
systématique au disque.

### Page 11 — trois notes, et un écart désormais porté

**Confirmé** : la vancomycine de *S. aureus* à **1 mg/L avec ZIT à 2** —
PhénoBac l'applique déjà, et la page 11 en donne la raison (les prérequis
PK/PD ne sont pas atteints à 2 mg/L, et le risque d'échec est documenté).

**Hors panel** : le CA-SFM **conserve la kanamycine**, que l'EUCAST a
supprimée en v14.0, « en précisant bien qu'il s'agit d'un test de dépistage
permettant de rendre l'amikacine ».

**Demandée le 2026-11-01, et NON ajoutée — parce qu'elle n'est pas seule.**
La page 74 du communiqué donne un bloc « Aminosides » cohérent, et la
kanamycine n'en est qu'une ligne :

```
Gentamicine, S. aureus             2 / 2   disque 10 µg  18/18
Gentamicine, SCN                   2 / 2   disque 10 µg  22/22
Kanamycine (dépistage), S. aureus  8 / 8   disque 30 µg  18/18
Kanamycine (dépistage), SCN        8 / 8   disque 30 µg  22/22
Tobramycine, S. aureus             2 / 2   disque 10 µg  18/18
Tobramycine, SCN                   2 / 2   disque 10 µg  20/20

note 2 : « Les souches résistantes à la gentamicine sont résistantes à TOUS
          les aminosides. »
note 3 : « Interprétation valable pour l'amikacine. »
note 4 : « Les souches résistantes à la tobramycine sont résistantes à la
          kanamycine et à l'amikacine. »
```

État de PhénoBac : **la tobramycine manque aussi**, et **aucune des trois
déductions n'est appliquée**. Vérifié — un *S. aureus* gentamicine **R** dont
l'amikacine est lue **S** sort « amikacine S », sous les deux référentiels,
chez *S. aureus* comme chez *S. epidermidis* :

| | gentamicine | amikacine lue | amikacine rendue |
|---|---|---|---|
| *S. aureus*, EUCAST et CA-SFM | **R** | S | **S** |
| *S. epidermidis*, EUCAST et CA-SFM | **R** | S | **S** |

> **C'est un écart plus lourd que la kanamycine absente, et il porte sur une
> molécule que PhénoBac rend déjà.** Ajouter la kanamycine dans un réseau de
> déductions qui en compte deux manquantes serait poser une brique dans un
> mur troué — la forme exacte du défaut que cette série passe son temps à
> corriger. Le bloc aminosides se fait d'un seul tenant, ou pas.

**Hors modèle** : le CA-SFM propose un seuil d'oxacilline à 2 mg/L pour
*S. pettenkoferi* (au lieu de 0,25), parce que des souches à 0,5 et 1 mg/L
sont dépourvues du gène *mec*. PhénoBac ne modélise pas cette espèce.

#### L'écart ouvert : la pénicilline G de *S. aureus*

C'est l'explication de la ligne que `comparer-casfm.py` signalait depuis
trois jours sous « la colonne S n'a pas été lue (elle porte un mot) ».
**Le mot est « Note », et la page 11 dit ce qu'il signifie :**

> « une CMI de pénicilline G **> 0,125 mg/L** permet en effet de confirmer la
> présence de pénicillinase et qu'une CMI **≤ 0,125 mg/L ne permet pas
> d'exclure** la présence d'une pénicillinase »

Le comité refuse donc de conclure « sensible » sur la seule CMI. Le tableau
de la page 72 le dit à sa façon : colonne S = *Note*, R > 0,125, et une
**ZIT à « ≤ 0,125 »** — toute la plage basse est incertaine.

**PhénoBac rend « S », sans la moindre réserve.** Vérifié : *S. aureus*,
pénicilline G à 0,06 mg/L, référentiel CA-SFM, β-lactamase non renseignée ou
déclarée négative → **S**, aucune alerte, aucun commentaire.

Trois façons de le corriger, et aucune n'est neutre :

1. **`S: null, R: 0,125`** — plus aucune catégorie « sensible ». Une CMI
   ≤ 0,125 deviendrait **I**. C'est fidèle au refus du comité, mais « I » se
   lit « sensible à forte posologie » : un clinicien pourrait prescrire de la
   pénicilline à forte dose sur une souche productrice de pénicillinase. **Le
   remède serait pire que le mal.**
2. **Étendre la ZIT à une borne ouverte.** Aujourd'hui `enZit()` ne reconnaît
   qu'une valeur exacte (`p.v !== z`) ; il faudrait une forme « ≤ x » pour
   couvrir toute la plage basse. La mesure serait alors signalée incertaine,
   avec renvoi au disque — ce que le comité demande. C'est la lecture la plus
   fidèle, et elle demande une évolution du moteur.
3. **Une alerte sans changement de seuil** : garder « S » et ajouter la
   réserve du comité en commentaire. Le moins invasif, mais la catégorie
   rendue reste celle que le CA-SFM refuse.

#### Porté le 2026-11-01 : la solution 2, la ZIT à borne ouverte

**Décision du biologiste.** La ligne du delta ne porte **que la ZIT** —
`["casfm","staph","PEN","cmi","standard", …, "<=0.125", …]`. Pas de S ni de R :
la valeur reste celle de l'EUCAST (0,125 / 0,125), et c'est l'**incertitude**
qui est propre au CA-SFM. La solution 1 aurait rendu « I » toute la plage
basse, et « I » se lit « sensible à forte posologie ».

| CMI | EUCAST | CA-SFM |
|---|---|---|
| 0,03 · 0,06 · 0,125 | S | **S + ZIT** |
| 0,25 · 1 | R | R |

> *Pénicilline G à 0,06 mg/L : valeur en zone d'incertitude technique
> (ZIT ≤ 0,125 mg/L). La catégorie « S » n'est pas reproductible à cette
> valeur — la traiter comme incertaine.*

**La ZIT accepte désormais deux formes** : un nombre (la valeur exacte, forme
historique) et `"<=x"` (toute la plage basse). `zitBorne()` n'en admet pas
d'autre et **lève** sur le reste : une ZIT mal écrite qu'on prendrait pour
« pas de ZIT » désarmerait l'avertissement en silence. Vérifié — `"0.125"`,
`"<=abc"`, `"≤0.125"` et `""` lèvent tous.

> **Et un banc a attrapé la faute que j'allais livrer.** J'avais appliqué le
> lecteur strict à l'affichage, y compris à la ZIT des **diamètres**, qui a
> une autre forme — « 18–20 », mise en forme à la source. L'alerte levait donc
> sur un diamètre parfaitement normal : un afficheur qui refuse d'afficher.
> Deux rôles, deux fonctions : `zitBorne()` **lit** et ne devine pas,
> `zitTexte()` **affiche** et ne casse pas.

## La page 6 du document des différences, lue le 2026-11-01

Elle porte sur le cotrimoxazole et le triméthoprime, et elle a été lue avant
de toucher à la restriction d'espèce d'`entero` — qui était l'étape suivante.
**Elle l'a arrêtée.**

### Quatre valeurs confirmées, rien à changer

| ce que la page 6 affirme | ce que PhénoBac applique |
|---|---|
| l'EUCAST donne à *Serratia* un seuil SXT plus élevé (2 vs 0,5) « associé à un rendu minimal *sensible à forte posologie* » | EUCAST `S: null, R: 2` — aucune catégorie S, I jusqu'à 2 ✓ |
| le CA-SFM a adopté le seuil S de l'EUCAST pour les infections systémiques (0,5) | CA-SFM 0,5 / 0,5 ✓ |
| le CA-SFM propose 2 mg/L pour les infections urinaires sans signes de gravité | CA-SFM urinaire 2 / 2 ✓ |
| le CA-SFM conserve un rendu « sensible à forte posologie » jusqu'à 2 mg/L pour *Acinetobacter* | CA-SFM `0,5 / 2` ✓ |

### Un désaccord entre les deux textes du CA-SFM

La page 6 écrit « **pour *Acinetobacter* uniquement** ». Or la page 77 du
communiqué donne aux staphylocoques exactement la même ligne :

```
Triméthoprime-sulfaméthoxazole (autres infections)   0,5 / 2   disque 24 / 19
```

Le même intervalle intermédiaire, pour un chapitre dont la prose dit qu'il ne
l'a pas. **Rien n'a été changé** : le tableau fait foi pour les valeurs,
PhénoBac le suit, et le comparateur annonce zéro écart. Choisir la prose
contre la table reviendrait à préférer la source la plus faible. C'est écrit
ici pour que la question ne se reperde pas.

### Tranché le 2026-11-01 : garder la restriction

**Décision du biologiste : la restriction d'espèce de l'EUCAST vaut aussi
sous CA-SFM pour le triméthoprime, et les trois lignes du 31 octobre sont
retirées.**

`morganella`, `salmonella` et `serratia` perdent leur triméthoprime
urinaire — CMI et diamètre, six lignes. Le résultat est que le triméthoprime
se comporte désormais **à l'identique sous les deux référentiels** :

| espèce | EUCAST | CA-SFM |
|---|---|---|
| *E. coli*, *K. pneumoniae*, *K. oxytoca*, *S. aureus* | S | S |
| *Enterobacter*, *Proteus*, *Salmonella*, *Serratia* | aucune | aucune |

**La nitrofurantoïne n'est pas concernée** : le document des différences n'en
parle nulle part, rien n'indique que le CA-SFM s'aligne sur la portée de
l'EUCAST pour elle, et les quatre lignes du 31 octobre restent —
`salmonella`, `serratia`, `staph`, `strepacg`.

Les quatre couples que PhénoBac ne porte **pas par décision** sont déclarés
dans `comparer-casfm.py` avec leur raison, et comptés à part : sans cela ils
reviendraient à chaque passage comme une question déjà tranchée, et une
question qui revient finit par ne plus être lue.

### Le raisonnement, pour mémoire

Les deux textes tiraient en sens contraire :

C'était l'étape suivante, et elle ne se fera pas sans décision. Les deux
textes tirent en sens contraire :

- **le communiqué, page 54** : « Nitrofurantoïne (cystites) 64 / 64 » et
  « Triméthoprime (cystites) 2 / 2 », sans aucun qualificatif d'espèce — donc
  pour tout le chapitre des entérobactéries ;
- **le document des différences, page 6** : « pour le triméthoprime
  (*Enterobacterales* et staphylocoques) […] le CA-SFM a adopté les
  modifications de *breakpoints* proposées par l'EUCAST en 2026 » — et
  l'EUCAST, lui, restreint le triméthoprime à *E. coli*, *K. pneumoniae* et
  *K. oxytoca*.

« Adopter les *breakpoints* » parle des **valeurs** ; la restriction est une
**portée**. Les deux ne se déduisent pas l'une de l'autre, et aucune des deux
lectures n'est absurde — c'est pourquoi la question a été posée au lieu
d'être tranchée par l'outil.

Vérifié, pour que la décision se prenne sur des faits : **aucune espèce du
groupe `entero` ne porte de résistance naturelle déclarée** à la
nitrofurantoïne ni au triméthoprime — la règle du 31 octobre (« lever, sauf
là où PhénoBac sait que l'espèce est résistante ») ne tranche donc pas ce
cas-ci. Ce qu'elle laisserait passer, en revanche, est nommable : lever la
restriction donnerait une catégorie **nitrofurantoïne à *Klebsiella***, que
l'EUCAST écarte — non par résistance naturelle, mais pour activité
insuffisante.

> Et la question remontait d'un cran : si le CA-SFM suit l'EUCAST sur le
> triméthoprime, les trois lignes portées le 31 octobre étaient elles aussi à
> revoir. C'est ce qui a été décidé, et elles sont retirées.

## Les trois dernières questions, tranchées le 2026-11-01

Elles attendaient le classeur EUCAST ; le biologiste a tranché sans lui, sur
le CA-SFM.

### 1 — Oxacilline : appliquer le CA-SFM

Page 72, le communiqué donne **trois** lignes :

```
Oxacilline (dépistage), S. intermedius, S. pseudintermedius        NA / NA
Oxacilline, S. aureus, S. lugdunensis, S. saprophyticus
            et S. pettenkoferi                                      2 / 2
Oxacilline, autres espèces                                       0,25 / 0,25
```

`staph` (*S. aureus*) avait reçu 2 / 2 la veille. Restaient *S. lugdunensis*
et *S. saprophyticus*, qui vivent dans le groupe `scn` de PhénoBac aux côtés
de *S. epidermidis* et *S. haemolyticus*, lesquels relèvent du 0,25.

**Le modèle ne savait pas l'exprimer, et le dire a demandé une correction du
moteur.** `ESPECE_LIMITE` était une table unique, partagée par les deux
référentiels sous deux noms, avec deux défauts dormants :

- **la dernière ligne lue écrasait la précédente** — un couple restreint des
  deux côtés n'en gardait qu'une restriction, choisie par l'ordre du fichier ;
- **une restriction du CA-SFM aurait valu sous EUCAST**, et réciproquement.

La restriction appartient à la **ligne**, donc au référentiel de la ligne.
`especeAutorisee()` reçoit maintenant celui qui a fourni la valeur et ne
consulte que sa table, sans repli. Et `getBP()` l'honore enfin **en CMI sous
CA-SFM** : seules les branches EUCAST la consultaient, si bien que le 2 mg/L
se serait appliqué à tout `scn`, *S. epidermidis* compris.

Vérifié, CMI 1 mg/L (souche sauvage) :

| espèce | EUCAST | CA-SFM |
|---|---|---|
| *S. aureus*, *S. lugdunensis*, *S. saprophyticus* | R | **S** |
| *S. epidermidis*, *S. haemolyticus* | R | R |

### 2 — Ampicilline du pneumocoque en LCR

`casfm pneumo AMP cmi meninge 0,5 / 0,5`, alignée sur l'amoxicilline portée
la veille. PhénoBac portait `0,06` — la valeur de la **pénicilline G** — pour
les trois β-lactamines. Les deux interchangeables disent désormais la même
chose, et le dépistage de la page 85 cesse de diverger : **20 chiffres de
dépistage identiques au seuil appliqué, 0 différent.**

### 3 — Fosfomycine, site ordinaire

La question d'ouverture de la série, close. Le CA-SFM chiffre la fosfomycine
intraveineuse hors urine, là où l'EUCAST renvoie à une note :

| groupe | page | CMI | disque |
|---|---|---|---|
| entérobactéries (4 groupes) | 54 | 32 / 32 | 200 µg · 21 / 21 |
| *Pseudomonas* | 61 | 128 / 128 | 200 µg · 12 / 12 |
| *S. aureus* | 77 | 32 / 32 | *Note* — pas de disque |

*S. saprophyticus* n'en reçoit pas : PhénoBac lui connaît une résistance
naturelle à la fosfomycine, et `scn` n'est pas `staph`.

### L'état du delta, au terme de la série

| | |
|---|---|
| couples confrontés, site ordinaire | 274 — **255 d'accord, 0 écart** |
| sites urinaire et méningé | **59 d'accord, 0 écart**, 1 couple absent |
| dépistage | **20 identiques, 0 différent**, 8 couples absents |
| couples à plusieurs lignes | **0** |
| endocardite et autres, non traités | **0** |

Tout ce que l'outil sait lire est confronté, et rien ne diverge.

**Une question neuve, née de la correction du moteur** : maintenant que les
restrictions d'espèce sont séparées par référentiel, on voit que le CA-SFM
n'en pose aucune là où l'EUCAST en pose. `entero NIT` est restreint à
*E. coli* et `entero TMP` à *E. coli*, *K. pneumoniae* et *K. oxytoca* —
restrictions EUCAST, qui continuent de valoir sous CA-SFM alors que la
page 54 donne les deux molécules à tout le chapitre. C'est la même décision
que celle du 31 octobre, appliquée aux groupes voisins mais pas à `entero`
lui-même. Elle concerne *Enterobacter*, *Citrobacter* et *Shigella*.

## Le second document du CA-SFM, lu le 2026-10-31

`CASFM2026EUCAST.pdf` — « Différences principales entre le CA-SFM et
l'EUCAST », 18 pages, sha256 `7c033caa9195ea2e…`, téléchargé avec l'accord du
biologiste depuis
`sfm-microbiologie.org/wp-content/uploads/2026/09/CASFM2026EUCAST.pdf`.

**C'est le texte qui explique ce que les tableaux ne disent pas.** Deux
lectures d'aujourd'hui en dépendaient, et elles tombent en sens inverse l'une
de l'autre.

### `ngono GEN 16-16` : la ligne est JUSTE

Retirée le soir au motif que la page 108 du communiqué ne cite 16 mg/L que
dans une note — un ECOFF. `essai-referentiel.js` est tombé en citant « p. 14 »,
et la page 14 dit :

> « Le CA-SFM propose un seuil à 16 mg/L, **basé sur l'ECOFF**, permettant de
> séparer les souches sauvages des souches non sauvages. La justification est
> basée sur […] d'être en adéquation avec les recommandations thérapeutiques
> françaises, qui positionnent la gentamicine comme alternative […] »

Le comité **adopte** l'ECOFF comme seuil, délibérément, parce que l'EUCAST
marque la molécule « – » (impropre au traitement) et que les recommandations
françaises en font une alternative. La ligne est remise, et la divergence est
exactement ce que le delta existe pour porter.

### `viridans PEN 0,25-0,25` : la ligne est FAUSSE

Portée le matin, parmi les dix. La page 95 du communiqué la présente comme
toutes les autres. La page 13 du document des différences dit :

> « Pour la pénicilline G, le CA-SFM ne conserve que le seuil à 0,25 mg/L
> **à seule visée de dépistage**. »

Ce n'était pas une concentration critique clinique. Portée, elle rendait
**« R » un viridans à 0,5 mg/L que l'EUCAST catégorise « I »**. Les deux
lignes, CMI et disque, sont retirées, et le couple est déclaré dans
`comparer-casfm.py` avec sa source — pas pour faire taire l'outil, mais parce
que cette part du CA-SFM vit dans l'autre document.

> **Un chiffre dans une colonne « S ≤ » ne dit pas à quoi il sert.** Là le
> comité adopte un ECOFF comme seuil clinique, ici il garde un seuil pour le
> seul dépistage — et le tableau ne distingue pas les deux cas. Les deux
> textes se lisent ensemble ou pas du tout.

### Ce que ce document confirme par ailleurs

- **p10, *Burkholderia cepacia* complex** : « Le chapitre et les précédents
  breakpoints cliniques **ont été supprimés** », remplacés par une fiche
  pratique en Annexe 3 ; et « l'EUCAST, de son côté, **n'a jamais proposé de
  breakpoints cliniques** ». L'absence de chapitre *B. cepacia* dans le
  communiqué n'est donc pas un oubli, et les dix valeurs `burk` de PhénoBac
  portent déjà le drapeau `conv` — convention de laboratoire assumée, que
  l'interface annonce. Rien à corriger, et maintenant on sait pourquoi.

**Pages encore à exploiter** : p4 aminopénicillines & Enterobacterales, p5
céfidérocol, p6 cotrimoxazole (l'EUCAST a abaissé ses seuils en 2026), p7
témocilline, p8–9 règles d'interprétation et dépistage des carbapénémases,
p11 amikacine/kanamycine des staphylocoques, p12 daptomycine des
entérocoques, p15 amoxicilline de *Moraxella*, p16–17 anaérobies, p18
breakpoints adaptés du CLSI.

### Les six décisions portées le 2026-10-31

Sur décision du biologiste, après relecture page par page. **Seize lignes
ajoutées**, CMI et diamètre ensemble à chaque fois que le document en donne
un — porter la CMI seule ferait se contredire les deux méthodes dans le même
référentiel, ce que la journée a déjà montré deux fois.

| site | groupe | molécule | page | CA-SFM porté | PhénoBac appliquait |
|---|---|---|---|---|---|
| LCR | *Haemophilus* | méropénème | 106 | 0,25 / 0,25 | 2 / 2 |
| LCR | pneumocoque | amoxicilline | 85 | 0,5 / 0,5 | 0,06 / 0,06 |
| ordinaire | *S. aureus* | oxacilline | 72 | 2 / 2 | 0,25 / 0,25 |
| ordinaire | SCN | vancomycine | 75 | 2 / 2 | 4 / 4 |
| cystite | entéro. ×4 | amox.-clav. | 48 | 32 / 32 · disque 16 / 16 | 8 / 8 · disque 19 / 19 |
| cystite | *salmonella*, *serratia* | témocilline | 48 | 8 / 16 · disque 20 / 17 | aucun seuil |

**Le méropénème d'*Haemophilus* a demandé une correction du moteur.** Le CA-SFM
ne donne AUCUN diamètre méningé — il renvoie à une note et demande la CMI.
`getDZ()` avait déjà la bonne règle (« un couple à CMI méningée mais sans
diamètre méningé ne retombe pas sur le diamètre ordinaire »), mais elle ne
regardait que la table EUCAST. Sans l'étendre, une souche à 21 mm serait
sortie « sensible » au disque pendant que la CMI la disait résistante, dans
la même méningite et sous le même référentiel.

#### « ngono GEN » : retirée, puis REMISE

Le balayage en sens inverse l'avait signalée, et à juste titre au vu du seul
communiqué : sa page 108 ne cite « CMI ≤ 16 mg/L » que dans une **note**, pour
séparer les souches sauvages de celles ayant acquis un mécanisme — la
définition d'un **ECOFF**, et un ECOFF employé comme seuil clinique est une
faute.

Elle a donc été retirée. `outils/essai-referentiel.js` est tombé au rouge **en
citant sa source** : « p. 14 — gentamicine / *N. gonorrhoeae* : l'EUCAST écarte
la molécule ». Cette page 14 n'est pas celle du communiqué : c'est celle du
document **« Différences principales entre le CA-SFM et l'EUCAST »**, un second
texte que ce poste n'a pas.

La ligne est remise, et la question reste ouverte. Le sens inverse ne lit que
le communiqué complet ; une valeur qu'il ne retrouve pas n'est pas pour autant
sans source, et il le dit désormais dans son propre rapport.

> Un banc qui tombe en citant sa source vaut mieux qu'une suppression qui
> paraît propre. C'est la seule des six décisions qui n'a pas pu être
> exécutée, et elle demande le second document.

#### Ce qui reste, et c'est nommé

**Huit couples que le communiqué chiffre et que PhénoBac n'a pas**, tous de la
même forme : *le CA-SFM donne la molécule à tout le chapitre, l'EUCAST la
restreint à certaines espèces, et PhénoBac suit l'EUCAST.*

| molécule | groupes | restriction EUCAST que PhénoBac applique |
|---|---|---|
| nitrofurantoïne | *morganella*, *salmonella*, *serratia*, *staph*, *strepacg* | *E. coli* chez les entérobactéries, *S. saprophyticus* chez les SCN, *E. faecalis* chez les entérocoques |
| triméthoprime | *morganella*, *salmonella*, *serratia* | *E. coli*, *K. pneumoniae*, *K. oxytoca* |

**Arbitré le 2026-10-31 : la restriction est levée, sauf là où PhénoBac sait
déjà que l'espèce est résistante.** Sept couples portés (CMI et diamètre) :

| couple | page | CMI | disque |
|---|---|---|---|
| *salmonella* · nitrofurantoïne | 54 | 64 / 64 | 100 µg · 11 / 11 |
| *serratia* · nitrofurantoïne | 54 | 64 / 64 | 100 µg · 11 / 11 |
| *S. aureus* · nitrofurantoïne | 77 | 64 / 64 | 100 µg · 13 / 13 |
| strepto. A/C/G · nitrofurantoïne | 93 | 64 / 64 | 100 µg · 15 / 15 |
| *morganella* · triméthoprime | 54 | 2 / 2 | 5 µg · 15 / 15 |
| *salmonella* · triméthoprime | 54 | 2 / 2 | 5 µg · 15 / 15 |
| *serratia* · triméthoprime | 54 | 2 / 2 | 5 µg · 15 / 15 |

**Le huitième ne l'est pas, et ce n'est pas une prudence.**
`morganella NIT` couvre *Proteus mirabilis*, *P. vulgaris*, *Morganella
morganii* et *Providencia*, et PhénoBac porte **déjà** pour ces quatre
espèces la résistance naturelle à la nitrofurantoïne — EUCAST, phénotypes
résistants attendus v1.2, règles 1.10, 1.12 et 1.14. Vérifié : forcer « S »
sur un *Proteus* déclenche aujourd'hui « Incohérence : nitrofurantoïne rendue
S alors qu'une résistance naturelle est attendue ». Porter 64 / 64 ferait
rendre « sensible » une souche que la même interprétation contredirait deux
lignes plus bas.

> **La ligne générale d'un chapitre ne défait pas une résistance naturelle
> connue de l'espèce.**

Reste ouvert, du même ordre : `scn NIT` est restreint par l'EUCAST à
*S. saprophyticus* alors que la page 77 donne la nitrofurantoïne à tout le
chapitre des staphylocoques. Lever cette restriction-là concernerait
*S. epidermidis*, *S. lugdunensis* et *S. haemolyticus*.

### Les sous-titres et le dépistage, 2026-11-01 : plus rien n'échappe à la confrontation

**Les sous-titres.** Le communiqué ouvre parfois un sous-tableau au milieu
d'un chapitre : page 52, « *Salmonella* spp. » centré, suivi du dépistage à
l'acide nalidixique et à la péfloxacine, puis d'une ciprofloxacine à
0,06 / 0,06 — la valeur propre aux salmonelles, là où la ligne générale dit
0,25 / 0,5. Sans le voir, l'outil rangeait les deux dans le même seau et
déclarait le couple « à plusieurs lignes, décision de modèle ».

Sur les pages 47 à 124, **il y en a exactement un**. Deux fausses pistes
avant d'y arriver, et les deux valent d'être écrites :

- *réemployer `CHAPITRES` pour les reconnaître* — « Salmonella » n'y est pas
  et ne peut pas y être : c'est un GROUPE de PhénoBac, pas un chapitre du
  document. Réemployer la table d'à côté parce qu'elle ressemble ne
  détectait rien du tout ;
- *détecter sur toute la page* — un sous-titre ne vaut que pour ce qui le
  SUIT. Posée au-dessus de la boucle, la détection appliquait « Salmonella »
  à la page 52 entière, ligne générale comprise, et les deux lignes
  devenaient salmonelles. **Un titre est une frontière, pas une étiquette de
  page.**

Et une portée mal bornée : `sous` ne se remettait à zéro qu'au chapitre
suivant, si bien que le sous-tableau de la page 52 scopait encore les pages
53 à 57 — neuf couples perdus d'un coup, le bilan tombé de 271 à 262 **sans
que rien ne crie**. Il se remet à zéro à chaque page : le document répète ses
en-têtes de colonnes, un sous-tableau qui continuerait répéterait son titre,
et s'il ne le faisait pas le couple reviendrait dans « plusieurs lignes » —
visible, pas silencieux.

**Résultat : 0 couple à plusieurs lignes**, contre neuf le matin.

**Le dépistage.** Vingt-huit lignes portent « (dépistage) », et le communiqué
les met dans la même colonne « S ≤ » que les autres. PhénoBac n'a pas de
mécanique de dépistage en CMI — la colonne `dep` ne sert qu'au disque — mais
elle porte des seuils **cliniques** de l'EUCAST pour les mêmes couples. On
les confronte donc en disant ce qu'on compare : **19 chiffres identiques, 1
différent, 8 couples absents.**

| | page | dépistage CA-SFM | seuil appliqué |
|---|---|---|---|
| pneumocoque · ampicilline (LCR) | 85 | 0,5 / 0,5 | 0,06 / 0,06 |

C'est le même couple de chiffres que l'amoxicilline méningée portée la
veille, et le même fil : PhénoBac porte `0,06` au site méningé pour la
pénicilline G, l'ampicilline **et** l'amoxicilline. L'amoxicilline est
corrigée ; l'ampicilline ne peut pas l'être sur ce document, qui n'en donne
qu'un seuil de dépistage. Il faut le classeur EUCAST.

> Un dépistage a lui aussi son site. Le pneumocoque en porte deux page 85, et
> les comparer tous deux au seuil ordinaire annonçait un écart qui n'existait
> pas. Le dépistage prime pour dire CE QUE LA LIGNE EST ; il n'efface pas le
> site où elle s'applique.

Les huit couples absents sont des molécules que PhénoBac n'a pas pour ces
groupes : tétracycline chez *Acinetobacter*, les entérobactéries et les
viridans ; ampicilline et ertapénème chez *Campylobacter*.

**Le compte est désormais clos : « endocardite et autres, non traités ici :
0 ».** Les quatre passes — site ordinaire, urinaire, méningé, dépistage —
couvrent toutes les lignes que l'outil sait lire.

### La passe des autres sites, faite le 2026-10-31

Les lignes de cystite et de LCR étaient **comptées, jamais comparées** — un
silence de quarante-neuf lignes qui ne se distinguait pas d'un accord. Elles
ne se comparent pas au seuil ordinaire, c'est vrai ; elles se comparent très
bien au seuil **du même site**, et `comparer-casfm.py` le fait désormais en
rejouant l'ordre exact de `getBP()` : méningé d'abord, puis CA-SFM urinaire,
CA-SFM ordinaire, EUCAST urinaire, EUCAST ordinaire. Reproduire cet ordre est
la seule façon de comparer ce que le laboratoire **reçoit**.

**44 d'accord, 6 écarts, 10 couples absents.** Les six écarts sont trois
faits :

| site | groupe | molécule | page | CA-SFM | PhénoBac applique |
|---|---|---|---|---|---|
| LCR | *Haemophilus* | méropénème | 106 | S ≤ 0,25 · R > 0,25 | **S ≤ 2 · R > 2** |
| LCR | pneumocoque | amoxicilline | 85 | S ≤ 0,5 · R > 0,5 | **S ≤ 0,06 · R > 0,06** |
| cystite | entéro., morganella, salmonella, serratia | amox.-clav. | 48 | S ≤ 32 · R > 32 | **S ≤ 8 · R > 8** |

Les deux premiers vont dans des sens opposés : sur *Haemophilus*, PhénoBac
est **huit fois trop permissive** en LCR ; sur le pneumocoque, **huit fois
trop stricte**. La page 85 mérite un regard : PhénoBac porte `0,06 / 0,06` au
site méningé pour la **pénicilline G, l'ampicilline ET l'amoxicilline** — or
`0,06` est la valeur de la pénicilline G, et le CA-SFM donne `0,5 / 0,5` aux
deux autres. Trois β-lactamines qui partagent la valeur de la première
ressemblent à une recopie.

Les dix couples absents sont d'une autre nature — le communiqué chiffre la
molécule, PhénoBac n'a pas le couple du tout : nitrofurantoïne pour
`morganella`, `salmonella`, `serratia`, `staph` et `strepacg` ; triméthoprime
et témocilline pour `morganella`, `salmonella`, `serratia`. **La
nitrofurantoïne demande une prudence particulière** : PhénoBac la restreint à
*E. coli*, restriction venue de l'EUCAST, et *Proteus* et *Morganella* lui
sont **naturellement résistants**. Porter `64 / 64` sur `morganella` parce
que la ligne du communiqué ne le restreint pas donnerait un « sensible » sur
une espèce qui ne l'est jamais.

> Et un faux écart évité de justesse : `agents_fr.site()` testait
> « méningite » **avant** « dépistage ». La ligne « Ampicilline (dépistage –
> méningites et endocardites) » du pneumocoque partait donc au site méningé
> et se comparait au seuil **clinique** du LCR, annonçant un écart d'un
> facteur huit. Un seuil de dépistage dit « cette souche mérite une CMI »,
> pas « ce traitement marchera ». Le dépistage passe désormais en premier.
- **portée** : le passage de 279 à 264 couples n'est pas une perte de
  couverture, c'est la fin d'un mélange. Trois chapitres étaient mal
  rattachés — le pneumocoque aux streptocoques A/C/G, la mélioïdose à
  *Burkholderia cepacia*, le complexe *diphtheriae* à *Corynebacterium* spp. —
  et les couples qui en sortaient n'auraient jamais dû être comparés.

### Les seize noms illisibles : un défaut de lecture, pas seize molécules

La première passe laissait **seize noms non lus**, et leurs lignes n'étaient
donc confrontées à rien — un silence qui ne se distinguait pas d'un accord.
Ce n'étaient pas seize molécules inconnues : c'était **quatre défauts de
lecture**, trouvés en regardant le document page par page.

1. **La fenêtre de recollation balayait toute la largeur.** Un nom coupé se
   recolle sur la ligne suivante, à condition qu'elle ne porte pas de
   valeurs. Le test allait de la colonne S jusqu'à ZIT+30, et attrapait la
   **charge du disque** (x≈330), qui appartient à la même ligne continuée :

   ```
   y=366  Triméthoprime-               S≤ 2  R> 2   1,25-
   y=354  sulfaméthoxazole (infections              23,75
   ```

   « 23,75 » est la fin de « 1,25-23,75 µg ». L'outil y voyait une nouvelle
   ligne de seuils et refusait de recoller. Le test porte désormais sur les
   seules colonnes S et R.

2. **Les notes de bas de page coupaient la recollation.** Le communiqué les
   intercale dans la marge droite (x≈491), ENTRE un nom et sa fin. Une ligne
   vide dans la colonne du nom n'est ni une suite ni une nouvelle ligne :
   c'est du texte de marge. On l'enjambe.

3. **Le budget se comptait en lignes brutes.** Plafonné à trois lignes, il
   était mangé par les marges et les numéros de page, alors qu'une indication
   de site s'étale jusqu'à trois lignes de texte. Il se compte maintenant en
   lignes **utiles**.

4. **Les colonnes voisines laissaient des miettes** dans la fenêtre du nom :
   « Amoxicilline-acide **,2** clavulanique », « Imipénème-relebactam **4** ».
   Un fragment sans aucune lettre n'appartient pas à un nom.

   > Et la première version de ce filtre a fabriqué le défaut qu'elle devait
   > réduire : elle rangeait « ) » parmi les miettes, et mangeait la
   > parenthèse fermante de « Amoxicilline iv (méningites et endocardites **)** ».
   > Le nom restait tronqué pour toujours. Une parenthèse nue n'est pas du
   > bruit : elle ferme une indication.

Restaient **trois graphies** absentes du vocabulaire, et la table les
connaissait déjà **sous leur orthographe anglaise** : « meropenemvaborbactam »
et « imipenemrelebactam » y figuraient, mais le CA-SFM écrit
« Méropénème-vaborbactam » — un « e » de plus à la normalisation. Cinq lignes
étaient déclarées illisibles alors que la réponse était écrite deux lignes
plus haut. Les trois sont hors panel, et « None » est une réponse.

**Ce que cela change au fond :** six lignes du CA-SFM n'étaient confrontées à
rien — dont le **cotrimoxazole de cinq espèces** : *Listeria*, les
entérobactéries, *Acinetobacter*, *Stenotrophomonas* et *Staphylococcus*.
Pour celles-là, un laboratoire sous CA-SFM recevait la valeur EUCAST sans que
rien ne le dise.

### Puis la liste d'écarts elle-même s'est révélée bâtie sur du sable

Les noms lus, il restait deux confusions **dans la comparaison** — et toutes
deux gonflaient la liste d'écarts de candidats qui n'en étaient pas.

**« Je n'ai rien lu » n'est pas « le comité refuse la catégorie S ».**
Trois états se confondaient sous `sC is None` : la cellule porte « 0,001 »
(le comité refuse — c'est une décision), la cellule porte un mot comme
« Note » (l'outil n'a rien lu — c'est une lacune), ou il n'y a pas de
cellule. Page 72, `Pénicilline G, | Note | 0,125` : la colonne S porte un
appel de note, la valeur est à la ligne suivante — **S ≤ 0,125, comme
l'EUCAST** — et l'outil annonçait un écart.

> Faire dire à un comité qu'il refuse une catégorie qu'il accorde pousserait
> PhénoBac à rendre « R » là où le document rend « S ». C'est la pire
> direction possible, et c'est celle que produisait la confusion.

**Un couple peut avoir PLUSIEURS lignes au même site, et l'outil en gardait
une — au hasard de l'ordre de lecture.** Ce qui les sépare est écrit dans le
libellé :

| chapitre | molécule | lignes |
|---|---|---|
| *Haemophilus* p105 | amoxicilline | « iv » S ≤ 2 · « per os » **S = 0,001** |
| streptocoques p90 | pénicilline G | « *S. agalactiae* » S ≤ 0,125 · « *S. pyogenes* » S ≤ 0,06 |
| entérocoques p81 | vancomycine | « *E. faecalis* et… » · « autres » |
| *Campylobacter* p117 | ciprofloxacine | « *Campylobacter* » · « *C. fetus* » |

Pour *Haemophilus*, l'outil annonçait « pas de catégorie S » à
l'amoxicilline — ce qui n'est vrai que **per os**. Il les recense désormais
et **n'en compare aucune** : distinguer la voie d'administration, ou une
espèce à l'intérieur d'un chapitre, est une **décision de modèle** qui
appartient au biologiste, pas à l'extracteur. Choisir serait inventer.

### La fosfomycine, que j'avais désignée comme l'écart le plus urgent

Elle n'en est pas un. Page 54, entérobactéries :

```
Fosfomycine iv                  S ≤ 32   R > 32
Fosfomycine per os (cystites),  S ≤  8   R >  8
```

PhénoBac applique **S ≤ 8** — exactement la ligne *per os, cystites*.
L'« écart » annoncé était la ligne **intraveineuse**, une voie que la table
`BP` ne modélise pas.

**Et il s'était caché derrière le filtre des sites.** La ligne *per os
(cystites)* porte un site : elle part dans la passe des autres sites. La
ligne *iv* reste seule au site ordinaire, paraît unique, et se compare. Un
écart de VOIE prenait donc l'apparence d'un écart de SEUIL, et le filtre qui
devait éviter les faux écarts en fabriquait un.

`agents_fr.voie()` lit désormais la voie, et les six couples concernés ne
sont plus comparés :

| chapitre | molécule | iv | orale |
|---|---|---|---|
| entérobactéries p54 | fosfomycine | S ≤ 32 | S ≤ 8 *(cystites)* |
| *Pseudomonas* p61 | fosfomycine | S ≤ 128 | — |
| *Staphylococcus* p77 | fosfomycine | S ≤ 32 | — |
| *Haemophilus* p105 | amoxicilline | S ≤ 2 | **pas de S** |
| *Haemophilus* p105 | amox.-clavulanique | S ≤ 2 | **pas de S** |
| streptocoques p85 | amoxicilline | S ≤ 1 | S ≤ 0,5 |

> « iv » se cherche comme un MOT : « Lévofloxacine » contient « iv », et le
> chercher dans la chaîne normalisée rendrait intraveineuse la moitié des
> fluoroquinolones.

### Décision du biologiste, 2026-10-31 : montrer les deux seuils

Deux chemins étaient possibles pour la voie d'administration :

- **demander la voie et catégoriser dessus** — PhénoBac deviendrait l'auteur
  d'un choix thérapeutique qu'elle n'a pas à faire, sur une donnée qu'un
  compte rendu d'antibiogramme ne porte pas toujours ;
- **afficher les deux seuils**, et laisser lire celui qui s'applique.

C'est le second. La catégorie rendue ne change pas ; le compte rendu gagne
une ligne qui dit « ce seuil dépend de la voie, les voici tous les deux ».

`outils/extraire-voies.py` produit la table, et **cinq couples** seulement y
figurent — ceux où le document donne deux voies **au même site** :

| groupe | molécule | iv | orale | page |
|---|---|---|---|---|
| *Haemophilus* | amoxicilline | S ≤ 2 · R > 2 | **pas de S** · R > 2 | 105 |
| *Haemophilus* | amox.-clavulanique | S ≤ 2 · R > 2 | **pas de S** · R > 2 | 105 |
| streptocoques A, C, G | amoxicilline | S ≤ 1 · R > 2 | S ≤ 0,5 · R > 1 | 85 |
| streptocoque B | amoxicilline | S ≤ 1 · R > 2 | S ≤ 0,5 · R > 1 | 85 |
| *viridans* | amoxicilline | S ≤ 1 · R > 2 | S ≤ 0,5 · R > 1 | 85 |

#### J'ai rebâti dans cet outil le défaut que je venais d'en retirer

Première version de l'extracteur : la clé était `(groupe, molécule)`, et la
voie écrasait. Page 85, il y a **trois** lignes d'amoxicilline :

```
i=22  Amoxicilline iv                              S ≤ 1    R > 2
i=25  Amoxicilline iv (méningites et endocardites) S ≤ 0,5  R > 0,5
i=28  Amoxicilline per os                          S ≤ 0,5  R > 1
```

Les deux premières ont la même voie et des **sites** différents. En écrasant,
l'extracteur gardait la dernière lue — la méningée — et l'appariait au *per
os* ordinaire : il annonçait « iv : 0,5 » là où le document dit 1.

> C'est exactement le défaut « garder la dernière ligne » que
> `comparer-casfm.py` venait de perdre, et je l'ai reconstruit en écrivant
> l'outil suivant. La leçon tient en une phrase : **un couple du CA-SFM n'est
> pas (groupe, molécule) — c'est (groupe, molécule, site, voie), et toute clé
> plus courte écrase quelque chose.**

#### Et la fosfomycine n'est PAS un seuil dépendant de la voie

Ses deux lignes diffèrent par la voie **et** par le site :

```
Fosfomycine iv                  S ≤ 32   (site ordinaire)
Fosfomycine per os (cystites)   S ≤  8   (site urinaire)
```

Le document ne donne donc **aucun** seuil oral au site ordinaire. Or PhénoBac
applique **S ≤ 8** au site ordinaire — c'est-à-dire la valeur *urinaire*, là
où la ligne ordinaire du CA-SFM dit **32**. C'est un écart réel, d'une forme
différente de celle annoncée, et il demande la lecture d'un biologiste : la
question n'est pas « quelle voie ? » mais « pourquoi PhénoBac applique-t-elle
hors urine un seuil que le CA-SFM réserve à la cystite ? ».

#### La table est maintenant lue par l'application (2026-10-31)

`voies.js` est livré, déclaré aux **quatre** endroits qu'un fichier de données
doit occuper — `phenobac.html`, le `SHELL` du service worker, le `Dockerfile`
et `install-caddy.sh` ; l'oubli des deux derniers avait rendu le site 502 le
24 octobre. Le moteur l'expose en `A.voies`, l'écran en fait une section et le
compte rendu imprimé une ligne sous la catégorie — là où le **prescripteur**,
seul à connaître la voie, peut la lire.

**Le moteur ne catégorise toujours pas avec.** `voiesPour()` ne rend qu'un
texte, et il **refuse** dans quatre cas, chacun évitant d'annoncer un seuil
qui n'a pas servi :

| refus | pourquoi |
|---|---|
| hors CA-SFM | la table est celle du CA-SFM, avec sa page ; sous EUCAST l'afficher attribuerait à un référentiel la règle de l'autre |
| seuils saisis par le laboratoire | le seuil appliqué est alors le sien |
| site qui ne correspond pas | la clé porte le site ; on ne retombe jamais sur « standard » par défaut |
| une seule voie connue | c'est le seuil ordinaire, déjà dans `BP` : il n'apprend rien |

`outils/essai-voies.js` (30 contrôles, dans la chaîne) tient la décision par
un **différentiel** : toutes les espèces, huit profils, deux référentiels —
960 paires — interprétées **avec** la table puis **sans**, et l'on exige que
les deux interprétations soient identiques champ pour champ, hors le champ
`voies`. Vider la table est possible parce que le moteur la lit à chaque
appel ; c'est l'interrupteur qui donne au banc son pouvoir de refus. Vérifié
par mutation : brancher la table sur `getBP()` — le geste que la décision
interdit — fait tomber le banc.

> Un différentiel ne vaut rien s'il compare deux fois le même silence. Ma
> première version du banc cadrait le référentiel par `cadrer()` **avant**
> l'appel, alors que `runInterpretation()` refait `cadrer(input.ref, …)` à son
> entrée : les cinq couples étaient déclarés inatteignables et le différentiel
> comparait 960 fois deux absences. Le contrôle de **portée** — chaque couple
> doit être atteint par au moins une espèce, et la comparaison doit avoir
> tourné au moins une fois avec la note — l'a dit tout de suite. C'est à cela
> qu'il sert, et c'est pourquoi un « rien n'a changé » sans lui ne prouve rien.

Deux autres défauts posés puis retirés en chemin, tous deux muets :

- j'ai appelé `cadrer()` **en croyant mettre en forme un nombre**. `cadrer()`
  FIXE LE RÉFÉRENTIEL : chaque note affichée aurait silencieusement renvoyé le
  moteur sous EUCAST au milieu d'une interprétation CA-SFM. Un nom qui
  ressemble à ce qu'on cherche n'est pas ce qu'on cherche ;
- les treize bancs rendaient **la base de connaissances pour tout nom de
  fichier non reconnu**. `require("./voies")` aurait rendu la base, `VOIES`
  serait resté vide, et les trente contrôles auraient passé au vert sans voir
  une seule voie. Leur résolveur **lève** désormais.

**Ce qui reste hors de la table, et c'est nommé :** l'EUCAST a lui aussi des
seuils séparés par la voie. Ils ne sont pas lus — le classeur n'est pas
redistribuable — et c'est pourquoi la note ne paraît que sous CA-SFM.

**Le bilan honnête**, après ces trois corrections : 279 couples confrontés,
228 où les deux comités disent la même chose, **27 écarts candidats** bâtis
sur des lignes uniques, sans ambiguïté de voie ni d'espèce, **8 couples** à
plusieurs lignes et **6** dont le seuil dépend de la voie — tous en attente
d'une décision de modèle —, **1** dont la colonne S n'a pas été lue.

Les cinquante-deux de la passe précédente en contenaient donc **vingt-deux
qui n'étaient pas des écarts** : un artefact de lecture et vingt-et-un choix
arbitraires entre deux lignes. Une liste d'écarts qu'on présente à un
biologiste doit être une liste d'écarts — vingt-deux faux candidats auraient
coûté sa confiance à l'outil entier.

### Le rattachement des chapitres était faux, et j'ai livré trois valeurs de pneumocoque

Trouvé le 2026-10-31 en relisant les pages **avant** de soumettre vingt-sept
écarts au biologiste. C'est le plus grave défaut de cette série, parce qu'il a
atteint la production.

`CHAPITRE_GROUPES` était un **dictionnaire**, et l'on retenait la première clé
qui soit une sous-chaîne du titre. « Streptococcus pneumoniae » contient
« Streptococcus » :

| chapitre du communiqué | rattaché à | aurait dû l'être à |
|---|---|---|
| p84 *Streptococcus pneumoniae* | strepacg, strepb, viridans | **pneumo** |
| p89 Streptocoques des groupes A, B, C ou G | *(absent de la table)* | strepacg, strepb |
| p94 Autres streptocoques | *(absent de la table)* | viridans |
| p101 *Corynebacterium diphtheriae* complex | coryne | **rien** — c'est une autre table que *Corynebacterium* spp. |

Les deux chapitres absents étaient rangés sous « ? <titre> » et **sautés** —
aucune valeur fausse n'en est sortie, et c'est le bon réflexe. Mais le résultat
net est que `strepacg`, `strepb` et `viridans` n'avaient **jamais** été
confrontés à leur propre chapitre, et que tout ce qu'on leur attribuait venait
du pneumocoque. Un silence vaut mieux qu'une erreur ; un silence qu'on ne
compte pas vaut beaucoup moins qu'un silence qu'on affiche. Les deux lecteurs
listent désormais les chapitres qu'ils ont sautés.

#### Ce qui est parti en production

`voies.js`, livré le matin même (`767f0b6`), portait :

```
"strepacg:AMX:standard":  { iv: {S:1, R:2, page:85}, orale: {S:0.5, R:1, page:85} },
"strepb:AMX:standard":    { iv: {S:1, R:2, page:85}, orale: {S:0.5, R:1, page:85} },
"viridans:AMX:standard":  { iv: {S:1, R:2, page:85}, orale: {S:0.5, R:1, page:85} },
```

La page 85 est celle du **pneumocoque**. Le CA-SFM renvoie l'amoxicilline des
streptocoques A, B, C et G à une **note** (p90, « se déduit de la sensibilité à
la pénicilline G ») et ne donne aux autres streptocoques qu'une **ligne unique
sans voie** (p95, 0,5 / 2). Ces trois couples n'auraient dû porter **aucune**
note. Corrigés le jour même ; il reste `pneumo:AMX`, qui est la vraie ligne.

> Le banc d'alors était vert, et il avait raison : la note ne changeait aucune
> catégorie. **Il ne demandait pas d'où venaient les valeurs.** Un banc qui
> prouve ce qu'on lui a demandé, pas ce qui compte.

#### La correction de fond : une valeur porte sa provenance

La table portait `page: 85`, et 85 paraissait suffire. **Une valeur qui ne dit
pas d'où elle vient ne peut pas être prise en défaut.** Chaque couple de
`voies.js` porte maintenant son `chapitre`, et `essai-voies.js` le confronte à
une seconde lecture écrite à la main, le communiqué sous les yeux. Deux sources
qui se contredisent s'arrêtent ; une seule source ne se contredit jamais.
Vérifié par mutation : remettre `strepacg` à la place de `pneumo` fait tomber
le banc sur « aucun couple n'est attendu pour strepacg ».

`CHAPITRE_GROUPES` est désormais construit à partir d'une **liste ordonnée**,
du plus précis au plus général, et le complexe *diphtheriae* y est **nommé et
rattaché à rien** — ce qui n'est pas la même chose que ne pas le nommer.

#### Et *Burkholderia pseudomallei* n'est pas *Burkholderia cepacia*

Trouvé dans la foulée, en relisant les dix écarts restants page par page. Le
chapitre p67–68 du communiqué est celui de la **mélioïdose**, pathogène du
groupe de risque 3. Le groupe `burk` de PhénoBac porte ***Burkholderia
cepacia***, opportuniste de la mucoviscidose. Deux organismes sans rapport,
deux tables sans rapport — et le motif « Burkholderia » les confondait.

Quatre « écarts » en sortaient : ceftazidime, imipénème, méropénème,
cotrimoxazole. Le communiqué **ne traite pas** *B. cepacia* ; PhénoBac garde
donc ses valeurs EUCAST, et elle a raison. Même forme exactement que le
complexe *diphtheriae* : un nom de genre partagé, deux espèces différentes.

#### La correction de fond, seconde couche : une ligne de la table doit se relire

`CHAPITRES` porte maintenant une **troisième colonne** — ce que le chapitre
couvre, ou pourquoi il ne va nulle part — et `verifier_chapitres()` refuse une
ligne muette. Ce n'est pas un commentaire : tant que le rattachement tenait
dans une sous-chaîne, personne ne pouvait voir que « Burkholderia » accrochait
la mélioïdose à *B. cepacia*, ni que « Streptococcus » accrochait le
pneumocoque aux streptocoques A/C/G. Dix-neuf chapitres, chacun avec sa phrase.

#### Le bilan refait

| | avant | après |
|---|---|---|
| couples confrontés | 279 | 264 |
| d'accord | 228 | 250 |
| **écarts candidats** | **27** | **10** |
| écarts à une autre valeur | 2 | 0 |
| couples à plusieurs lignes | 8 | 9 |
| dépendant de la voie | 6 | 6 |

Les dix-sept écarts disparus étaient **cinq** lectures du mauvais chapitre
*Corynebacterium*, **huit** du chapitre du pneumocoque et **quatre** de celui
de la mélioïdose. Les deux « écarts à une autre valeur » étaient de la même
famille. Un nouveau est apparu, lu cette fois dans le bon chapitre :
*viridans* / pénicilline G, p95.

> **Dix-neuf des vingt-neuf « écarts » annoncés au biologiste n'en étaient
> pas.** Une liste d'écarts qu'on lui présente doit être une liste d'écarts :
> le coût de dix-neuf faux candidats n'est pas le temps perdu, c'est la
> confiance dans les dix vrais.

#### Les dix, relus page par page le 2026-10-31

Chacun a été confronté au texte positionné de sa page, hors de l'outil qui
l'avait produit.

| groupe | molécule | page | CA-SFM | PhénoBac (EUCAST) | forme |
|---|---|---|---|---|---|
| *Acinetobacter* | ceftazidime | 63 | `0,001` / R > 8 | S ≤ 8 · R > 8 | refus de S |
| *Acinetobacter* | céfépime | 63 | `0,001` / R > 8 | S ≤ 8 · R > 8 | refus de S |
| *Acinetobacter* | pipé.-tazobactam | 62 | `0,001` / R > 16 | S ≤ 16 · R > 16 | refus de S |
| *Stenotrophomonas* | lévofloxacine | 66 | `0,001` / R > 1 | S ≤ 1 · R > 2 | refus de S |
| *Pseudomonas* | lévofloxacine | 60 | `0,001` / R > 0,5 | pas de S · R > 2 | R déplacé |
| *S. aureus* | ciprofloxacine | 74 | `0,001` / R > 1 | pas de S · R > 2 | R déplacé |
| SCN | ciprofloxacine | 74 | `0,001` / R > 1 | pas de S · R > 2 | R déplacé |
| *Listeria* | linézolide | 100 | S ≤ 2 · R > 2 | S ≤ 2 · R > 4 | zone I supprimée |
| viridans | pénicilline G | 95 | S ≤ 0,25 · R > 0,25 | S ≤ 0,25 · R > 1 | zone I supprimée |
| *Serratia* | cotrimoxazole | 54 | S ≤ 0,5 · R > 0,5 | **pas de S** · R > 2 | le CA-SFM **accorde** |

`0,001` est la convention du document — note 13 — pour « ne jamais rendre
sensible ». Les deux comités l'emploient.

Le *Serratia* mérite un mot : la page 54 porte **deux** lignes de
cotrimoxazole, « (infections urinaires sans signes de gravité) » 2 / 2 et
« (autres infections) » 0,5 / 0,5. C'est la seconde qui vaut au site
ordinaire. `entero`, `morganella` et `salmonella` portent déjà 0,5 / 0,5 ;
seul `serratia` porte la valeur EUCAST propre à ce genre. Le CA-SFM est donc
ici **plus permissif** que l'EUCAST — le seul des dix dans ce sens.

Non comptée parmi les dix, et c'est voulu : p72, pénicilline G des
staphylocoques, la colonne S porte le mot « Note ». Ce n'est pas un refus
chiffrable, et l'outil a eu raison de ne pas deviner.

### La fosfomycine, reprise le 2026-10-31 : ce n'est pas un écart CA-SFM

En remontant la piste, l'écart annoncé contre le CA-SFM s'est révélé être
autre chose, et de plus grave : **une correction portée dans un groupe et
oubliée dans ses trois frères.**

Le 25 octobre 2026, `f0465a8` a retiré du groupe `entero` la ligne

```
["eucast","entero","FOS","cmi","standard",8,8,…]
```

et l'a remplacée par une ligne **urinaire**, restreinte à **E. coli**, parce
que l'EUCAST v16.1 renvoie à une **note** pour la fosfomycine iv des « autres
entérobactéries » et des « autres indications ». La correction était juste.
Elle n'a touché qu'un groupe sur quatre.

PhénoBac porte quatre groupes de seuils pour une seule table de l'EUCAST —
`entero`, `morganella`, `salmonella`, `serratia` — et c'est le bon choix : le
document chiffre la ciprofloxacine autrement chez *Salmonella*, refuse
l'imipénème chez *Proteus* et *Morganella*, ne reconnaît la nitrofurantoïne
que chez *E. coli*. Mais les trois frères ont gardé leur ligne
`standard 8/8`. Six jours plus tard, pour une CMI de **16 mg/L hors urine** :

| espèce | ce que rend PhénoBac |
|---|---|
| *E. coli*, *Klebsiella*, *Enterobacter*, *Citrobacter*, *Shigella* | **aucune catégorie** — le document refuse de trancher |
| *Proteus mirabilis*, *P. vulgaris*, *Morganella morganii*, *Providencia* | **R** |
| *Salmonella* spp. | **R** |
| *Serratia marcescens* | **R** |

Même molécule, même famille, même site, même document, **réponses opposées
selon le genre** — et sous les deux référentiels. Six espèces, dont *Proteus
mirabilis*, l'un des uropathogènes les plus fréquents.

> Ce n'est donc pas « PhénoBac applique hors urine un seuil que le CA-SFM
> réserve à la cystite ». C'est : **PhénoBac applique encore, pour six
> espèces, un seuil qu'elle a déjà retiré pour les autres.** Le CA-SFM n'avait
> fait que rendre le reliquat visible, par sa ligne iv à 32.

#### Pourquoi rien ne le voyait

`verifier-couverture-eucast.py` confronte le classeur **table par table**, et
sa liste `TABLES` ne contient que les vingt-deux tables difficiles — anaérobies,
*Pasteurella*, *Aeromonas*, *Achromobacter*, *Kingella*, *Aerococcus*,
*Corynebacterium*. Les entérobactéries n'y figurent pas. Son « 409 règles, 0
manque, 0 en trop » était vrai, et ne parlait pas de ces lignes.

#### `outils/verifier-fratries.py`

Nouveau contrôle, et il n'a besoin d'**aucun document** : il compare la base
**à elle-même**. Pour chaque couple (référentiel, antibiotique, méthode)
présent dans au moins deux groupes d'une fratrie, il regarde sa **portée** —
le site, et la restriction d'espèce. Les **valeurs** ont le droit de différer,
c'est l'objet du découpage ; une **portée** est une décision, et une décision
prise pour un genre se prend rarement pour lui seul.

Sur la base d'aujourd'hui : **54 couples** présents dans au moins deux
groupes, 53 de même portée, **un seul** écart — la fosfomycine. Pas de bruit,
donc rien à faire taire.

> Son premier lecteur perdait deux colonnes sans rien dire : `"([a-z]+)"` ne
> ramasse pas `"S"` ni `"R"`, en capitales dans `COLONNES`. Treize noms au
> lieu de quinze, tout ce qui suit `site` glissé de deux rangs, et la
> restriction d'espèce lue « undefined ». Le contrôle trouvait **quand même**
> l'écart de site — il paraissait marcher en ayant cessé de voir la moitié de
> ce qu'il regarde. Il exige désormais de retrouver les colonnes qu'il lit, et
> s'arrête sinon.

#### Aperçu de la correction, mesuré puis défait

Les trois lignes frères retirées — la traduction fidèle de « ce seuil ne vaut
que pour *E. coli*, indications urinaires » dans un modèle à quatre groupes,
puisque *E. coli* vit dans `entero` : le contrôle passe à **54/54**, et les
six espèces rendent « aucune catégorie » pour la fosfomycine, dans l'urine
comme hors de l'urine. *E. coli* garde sa catégorie urinaire.

#### Appliqué le 2026-10-31, sur décision du biologiste

Les trois lignes sont **retirées**. Les six espèces rendent désormais « aucune
catégorie » pour la fosfomycine, dans l'urine comme hors de l'urine, et
*E. coli* garde sa catégorie urinaire. C'est le même message que celui que
*E. coli* et *Klebsiella* recevaient déjà hors urine : l'application ne se
contredit plus d'un genre à l'autre.

Leur donner la restriction `["ecoli"]` au lieu de les retirer aurait fabriqué
des lignes mortes — aucune *Salmonella* n'est un *E. coli* — et le contrôle
l'aurait d'ailleurs refusé : il a été essayé, et il crie encore.

`verifier-fratries.py` passe à **54/54** et **entre dans la chaîne**. Base
`2026.21`, service worker `v87`.

> Deux fois de suite, le lecteur de ce contrôle a lu de travers sans le dire.
> `"([a-z]+)"` ne ramasse pas `"S"` ni `"R"` — deux colonnes perdues. Puis,
> une fois le défaut corrigé, le **commentaire** écrit pour expliquer le
> retrait citait les trois lignes retirées, indentées : le lecteur les a
> relues comme des règles et a continué de signaler un défaut qui venait
> d'être réparé. Un documentaliste pris pour un témoin. Il saute désormais
> les blocs de commentaire, n'accepte une règle qu'en début de ligne, et
> s'arrête si l'un des groupes qu'il déclare est absent de la base — car un
> contrôle qui ne compare personne et annonce que tout va bien est le plus
> silencieux des échecs, celui-là même qu'il existe pour empêcher ailleurs.

### Le défaut propre à la façon dont PhénoBac porte le CA-SFM

PhénoBac ne porte pas un second référentiel entier : elle porte le **delta** —
quarante-cinq règles — et tout couple absent garde sa valeur EUCAST. C'est la
bonne façon de faire, et elle a un défaut qui lui est propre :

> un écart du CA-SFM que PhénoBac ignore ne se voit **pas**. Le laboratoire
> choisit « CA-SFM », croit travailler avec, et reçoit la valeur EUCAST.
> L'erreur est silencieuse, et elle porte le nom du comité français.

Le document des différences (18 pages) énumère ces écarts en prose ; s'y fier
reviendrait à recopier une liste. L'outil lit les **tables complètes** et
**calcule** le delta en les confrontant à ce que PhénoBac applique sous
EUCAST — table BP, confrontée au classeur officiel le même jour, 403 seuils,
403 identiques.

### CE QUI EST VÉRIFIÉ : la colistine de *Pseudomonas*

> CA-SFM 2026, **page 61** : Colistine · S ≤ **2** · R > **2** · ZIT 4

PhénoBac porte la ZIT 4 pour ce couple, et **pas** les seuils. Sous CA-SFM,
une CMI de colistine à 4 mg/L sur *Pseudomonas aeruginosa* est donc rendue
**« S »** — par la valeur EUCAST (4/4) — alors que le CA-SFM la tient pour
**résistante**, et que 4 mg/L tombe dans sa zone d'incertitude technique.

C'est une décision de dernier recours, prise sur un rendu qui contredit le
référentiel que le laboratoire a choisi.

### LES 38 AUTRES SONT DES CANDIDATS, PAS DES CONSTATS

Ils demandent une relecture page par page. L'outil a trois heures, et il a
déjà produit **quatre familles de fausses alertes**, chacune corrigée :

| ce qui n'allait pas | effet | combien |
|---|---|---|
| noms français absents du vocabulaire | lignes non lues | 200 → 16 |
| « 0,001 » pris pour une valeur, alors qu'il veut dire « jamais sensible » | faux écarts | 15 |
| noms coupés en fin de ligne (« Triméthoprime- ») | **mauvaise molécule** | — |
| « Amoxicilline-acide » reconnu « Amoxicilline » | mauvaise molécule, mauvaise indication | 19 |

La troisième est la plus instructive : « Triméthoprime- » donnait TMP là où le
document parle de SXT. Un nom qui est le **début** d'un autre est désormais
déclaré ambigu et **non lu**, plutôt que deviné — sauf s'il est par ailleurs
un nom complet, comme « Triméthoprime (cystites) ».

Les quarante lignes d'un autre site — cystite, LCR, dépistage — ne sont pas
traitées par cette passe : PhénoBac range ses seuils par site, et comparer un
seuil de cystite au seuil ordinaire fabriquerait des écarts qui n'existent
pas. C'est une dette, elle est écrite.

### Le vocabulaire français est désormais partagé

`outils/agents_fr.py` porte la correspondance « nom du CA-SFM → code » pour
les deux outils qui lisent ce document. Deux listes auraient divergé — c'est
ce qui venait d'arriver à douze fonctions recopiées de `moteur.js` dans la
page. Une molécule hors du panel y vaut `None` : c'est une réponse. Un nom
inconnu est signalé comme un **défaut de l'outil**, jamais comme une absence
dans l'application.

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
