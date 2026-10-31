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
- **empreinte** : 39bb978582383749a51dc09be7c2a8cf99e161f9fa36150e1f4cb57efafc652e
- **date** : 2026-10-25, empreinte reprise le 2026-10-31
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
- **empreinte** : 728e9d87927ddfd7589fa08d7c7ed5a55650f9b8b9275586c383701e13cda609
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
- **empreinte** : 49702c4f2256e896d9996fa5e7cf5b323872d474dea2afee643d6509f4b13be5
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
- **tables** : BP_CASFM
- **empreinte** : 4b1aa01db3ad3d242c231d408ccc965f38617a6c38971762f88f77d1c81417d5
- **date** : 2026-10-31, le communiqué sous les yeux
- **résultat** : **264 couples confrontés, 250 où les deux comités disent la
  même chose, ZÉRO écart restant.** Les 14 derniers ont été portés ce jour
  dans le delta — 10 concentrations critiques et 4 diamètres, relus un à un
  sur le texte positionné de leur page. Zéro nom que l'outil ne sait pas lire.
  Restent, hors comparaison et par décision de modèle : 9 couples à plusieurs
  lignes, 6 dépendant de la voie d'administration, 1 colonne S portant le mot
  « Note » (p72, pénicilline G des staphylocoques), et 49 lignes d'autres
  sites (cystite, LCR, dépistage) qui n'ont pas encore eu leur passe.
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
