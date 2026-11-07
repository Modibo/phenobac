# Le CLSI dans PhénoBac

## État : ossature posée, seuils non transcrits

Le troisième référentiel est **déclaré, câblé et inerte**. Le bouton `CLSI`
existe dans l'interface mais reste masqué (`renderRefToggle()`) tant que les
tables sont vides. Aucun utilisateur ne le voit aujourd'hui, et aucune
interprétation ne passe par lui.

Ce document dit d'où viendront les seuils, ce qui a déjà été établi sur le
document source, et les quatre décisions prises avant d'écrire la première
ligne.

## Le document, et comment on y accède

> **CLSI M100, 36ᵉ édition, 2026** — *Performance Standards for Antimicrobial
> Susceptibility Testing*. Édition courante : la FDA la reconnaît depuis le
> 5 février 2026 et ne reconnaît plus la 35ᵉ.

Le M100 est un document vendu. Mais le CLSI en donne un **accès gratuit, en
lecture seule**, présenté comme un service de santé publique :

> <https://em100.edaptivedocs.net/> — portail « CLSI Micro Free ».
> Accès invité par formulaire (e-mail, pays, type d'utilisateur), sans compte
> ni paiement. Le Mali figure dans la liste des pays.

Le portail donne également le **CLSI M45 Ed3:2016**, qui couvre les bactéries
rares ou exigeantes absentes du M100.

Deux pièges constatés :

- **Le bouton `Submit` du formulaire se replie à 0 × 0 pixel** sous une
  certaine largeur de fenêtre. Les champs se remplissent, rien ne part, et
  aucun message n'explique pourquoi. Il faut une fenêtre large (~1100 px au
  moins) pour que le bouton existe.
- **La session tient dans un cookie `ASP.NET_SessionId` marqué HttpOnly.**
  Il est donc invisible au JavaScript, impossible à passer à `curl` ou à
  `requests`, et aucun script hors navigateur ne peut atteindre les pages.
  C'est la raison d'être de `outils/extraire-clsi.js`, script de console
  plutôt qu'outil en ligne de commande.
- **Cette session ne survit pas à la fermeture du navigateur.** Le cookie
  `GUIDM`, lui, persiste — ce qui donne l'illusion d'être encore connecté
  alors que toute requête repart vers `Login.aspx`. L'accès invité est donc
  à refaire à chaque reprise de travail, à la main.

## Ce que couvre le M100, et ce qu'il ne couvre pas

PhénoBac porte 46 groupes avec au moins un seuil. Leur répartition :

| document | groupes | état |
|---|---|---|
| M100, tables 2A-1 à 2I | 18 | accessible |
| M100, table 2J (anaérobies) | 16 | accessible |
| M45 Ed3:2016 | 12 | accessible, non encore lu |

Soit, en principe, une couverture complète — ce qui n'était pas acquis : le
M45 est un document séparé, et sa présence dans le portail gratuit n'allait
pas de soi.

## Quatre décisions prises

### 1. Le CLSI n'hérite de rien

`REFERENTIELS.clsi.base` vaut `null`, là où `casfm.base` vaut `"eucast"`.
Un couple sans seuil CLSI ne retombe **pas** en silence sur la valeur EUCAST
sous l'étiquette « CLSI » : `getBP` rend `null`, et `_sansCmi` / `_sansDisque`
disent à l'utilisateur qu'il n'y a pas de seuil dans ce référentiel.

### 2. SDD devient une quatrième catégorie

Le CLSI distingue **quatre** catégories là où PhénoBac en connaît trois :
S, **SDD** (*Susceptible-Dose Dependent*, sensible à forte posologie), I, R.
SDD apparaît dans les tables 2A-1, 2A-2, 2C et 2D.

Elle ne sera **pas** repliée sur le « I » de l'EUCAST. Les deux notions se
ressemblent depuis que l'EUCAST a redéfini I en « sensible à forte exposition »
en 2019, mais le CLSI garde **en plus** un « I » distinct, qui est une zone
tampon technique. Les confondre reviendrait à ranger sous une même étiquette
une conduite thérapeutique et une incertitude de mesure. Et un SDD rendu « S »
sans la forte posologie qui le conditionne est un échec thérapeutique annoncé.

### 3. Les valeurs, pas les commentaires

L'EUCAST et le CA-SFM autorisent la reproduction de leurs tableaux avec
citation. Le M100 est protégé. La ligne tenue :

- entrent dans la base les **critères numériques** — un seuil de 2 mg/L est un
  fait — avec citation de l'édition et du tableau ;
- n'entrent **pas** les commentaires, notes et mise en forme du CLSI, qui sont
  son expression propre. Une conduite qu'ils décrivent est reformulée.

Le JSON produit par `extraire-clsi.js` contient les commentaires : c'est une
copie de travail, elle reste hors du dépôt.

### 4. L'extraction ne devine jamais

`outils/extraire-clsi.js` rend préfixée de ⚠ et porte dans `anomalies` toute
cellule qu'il ne sait pas répartir. **Au dernier passage : 661 lignes,
0 anomalie.**

Les quinze anomalies du premier jet ont été lues à la main, et elles ne
cachaient pas quinze cas particuliers mais **deux défauts de principe de plus**,
tous deux corrigés dans l'outil :

- *le nombre d'agents se comptait sur les mauvaises colonnes.* Il se prenait
  sur toutes les colonnes sauf le nom ; or la 2C porte une colonne
  « Indications » dont le texte se replie. « S. aureus, ⏎ including MRSA »
  faisait deux antibiotiques de la tédizolide. Le compte ne se lit que sur les
  colonnes de valeurs, dont l'en-tête du document donne lui-même le nombre ;
- *les noms liés par « or » se replient aussi.* « Ciprofloxacin or levofloxacin
  ⏎ Moxifloxacin » fait trois agents à trois valeurs distinctes : il faut
  découper sur les deux séparateurs imbriqués, et nettoyer le « or » traînant
  **en sortie**, puisque le repli donne souvent déjà le bon compte et
  court-circuite tout traitement placé plus bas. Sans quoi la céfotaxime
  s'appelle « Cefotaxime or » et reste introuvable.

Six défauts au total, donc, tous du même genre — une forme supposée unique qui
ne l'était pas :

1. La table des seuils choisie « la plus longue » : faux en 2B-3, où le
   tableau *Testing Conditions* est plus long. Elle se choisit sur son en-tête.
2. Les `<br>` perdus par `textContent` : `Cefotaxime or ceftriaxone` donnait
   `≥ 26≥ 23`, deux antibiotiques collés dans une seule valeur.
3. La même marque employée pour les continuations `rowspan` et `colspan` :
   chaque ligne de titre héritait des valeurs de la ligne de données
   précédente. Deux marques distinctes (`⇑`, `⇐`) l'ont réglé.

4. Les valeurs séparées par une **espace** et non par un `<br>` :
   `22-25^ 17-20^` pour ciprofloxacine et lévofloxacine. Lu naïvement, la
   lévofloxacine perdait sa zone intermédiaire. Réparties quand chaque morceau
   ressemble à une valeur, signalées sinon.
5. Les charges de disque empilées : `10 units 10 μg` pour pénicilline et
   ampicilline. On coupe après l'unité, jamais sur les espaces — « 10 units »
   en compterait deux.
6. Les lignes d'espacement du tableau, vides partout sauf la colonne
   « Comments » qu'elles héritent par `rowspan`, ce qui suffisait à les faire
   passer pour des données. On distingue désormais la cellule **absente** du
   tiret : « – » dit que le CLSI ne donne pas de seuil, ce qui est une
   information ; la chaîne vide ne dit rien.

## Faits établis sur le document source

Deux d'entre eux touchent des arbitrages en attente du côté EUCAST :

- **_Burkholderia cepacia_ : le CLSI a retiré tous ses seuils**, CMI et
  diamètres. Motif donné : ses deux méthodes de référence, microdilution en
  bouillon et dilution en gélose, ne concordent pas — constat appuyé par des
  données de l'EUCAST et une étude brésilienne. Le CLSI suggère de porter au
  compte rendu que l'antibiogramme n'est pas réalisé en routine pour ce
  complexe. Dans le référentiel CLSI, `burk` n'aura donc **aucun** seuil, et
  PhénoBac devra le dire au lieu d'afficher un vide.
- **_Stenotrophomonas maltophilia_ : la ceftazidime a disparu** de la table
  2B-4. La FDA a suivi en mai 2024.

Quatre autres commandent la transcription :

- **L'amoxicilline n'est pas testée** chez les entérobactéries : le CLSI la
  fait prédire par l'ampicilline. `CAT_DEDUITE` est le mécanisme prévu.
- **La témocilline n'existe nulle part** dans le M100.
- **Le pneumocoque a quatre pénicillines** distinctes (parentérale méningée,
  parentérale non méningée, orale V) — ce que les tables par site de PhénoBac
  savent déjà représenter.
- **La teicoplanine est marquée « Inv. »**, investigationnelle. À ne pas rendre
  comme un seuil de routine.

## Ce qui reste à faire

1. ~~Lire à la main les 15 lignes signalées (2C, 2D).~~ **Fait** : elles ont
   livré deux défauts de principe de plus, et l'extraction est à zéro anomalie.
2. ~~Établir la correspondance entre les codes d'antibiotiques de PhénoBac et
   les noms du CLSI.~~ **Fait** : `outils/noms-clsi.py`. Les 47 codes ont un
   sort décidé et écrit, et l'outil sort en erreur s'il en reste un sans.
3. ~~Lire la **série des tables 3** — dépistages et lectures indirectes.~~
   **Fait** : `outils/extraire-clsi-tests.js`, 8 tables, 23 colonnes de test,
   zéro anomalie. Ce qu'elle apporte et ce qui manque à PhénoBac est en bas
   de ce document.
4. Lire la **série des tables 1**, qui donne les panels à tester et à rendre
   par groupe. Sondée : des tables à quatre colonnes par rangs de
   prescription. Demande son propre lecteur.
5. Porter SDD dans le moteur, l'interface et les deux catalogues de langue.
6. Transcrire, table par table, avec un `comparer-clsi.py` qui confronte la
   base au JSON extrait — comme `comparer-eucast.py` le fait pour le classeur.
7. Lire le M45 pour les 12 groupes restants. Sondé : une grille de seuils
   précédée d'une colonne « Antimicrobial Class ». Troisième forme, troisième
   lecteur.

## Les seuils ne sont pas tout le M100

En cherchant où le CLSI loge le **haut niveau de gentamicine** — code `HLG` de
PhénoBac, introuvable dans les seize tables de seuils — une série entière est
apparue. Les tables 3 décrivent des **tests**, et elles recouvrent exactement
les conventions `dep` et `temoin` de la base :

| table | ce qu'elle décrit | ce qu'elle touche dans PhénoBac |
|---|---|---|
| 3A | BLSE chez *K. pneumoniae*, *K. oxytoca*, *E. coli*, *P. mirabilis* | lecture interprétative des entérobactéries |
| 3E | résistance à la colistine | `COL` |
| 3G | production de β-lactamase chez *Staphylococcus* | la pénicillinase du staphylocoque |
| 3H | gélose salée à l'oxacilline | `dep` |
| 3I | gélose vancomycine | `dep` |
| 3J | **clindamycine inductible** (test D) | `temoin` |
| 3K | haut niveau de mupirocine | — |
| 3L | **haut niveau d'aminosides** chez l'entérocoque | `HLG` |

Et la **série des tables 1** donne, groupe par groupe, les molécules à tester
et à rendre : l'équivalent du panel de PhénoBac.

Leur forme n'est pas une grille de seuils. `extraire-clsi.js` ne les lit pas,
et c'est pourquoi il les **déclare** dans `TABLES_NON_LUES` : laissées hors de
toute liste, elles auraient été une omission silencieuse ; passées à `lire()`,
elles seraient rendues « vides », ce qui serait un mensonge.

## La série 3 est lue — `extraire-clsi-tests.js`

Les huit tables sont lues, **zéro anomalie**, 23 colonnes de test.

Leur grille est **transposée** : une ligne par critère (milieu, concentration,
inoculum, incubation, lecture, contrôle de qualité), une colonne par variante
de test. C'est toute la raison d'un second lecteur ; `choisir()`, qui cherche
un en-tête « Antimicrobial Agent », ne trouve rien ici.

### Combien une table a-t-elle de colonnes ? La question n'est pas triviale

Compter les colonnes physiques se trompe **dans les deux sens** :

- en **3A**, une colonne de test en occupe deux, parce que sa cellule de
  lecture est un couple « Cefpodoxime zone | ≤ 17 mm » — six colonnes
  physiques, quatre tests ;
- en **3J**, « Disk Diffusion (D-zone test) » couvre deux colonnes, que la
  ligne « Organism group » sépare ensuite en staphylocoques et streptocoques
  — deux méthodes, mais bien quatre tests.

Les colonnes logiques sont donc la **partition la plus fine induite par les
lignes d'en-tête** — ligne 0, « Test method », « Organism group ». Cette
partition se lit dans le document : chaque début de cellule, à n'importe
laquelle de ces lignes, est une frontière. Un premier jet prenait le compte
de la seule ligne 0 et rendait « Criteria for Performance of ESBL Test » deux
fois de suite comme s'il s'agissait de deux tests.

### Deux défauts de lecture, et ce qu'ils enseignent

**Un exposant ne porte pas une seule chose.** « ATCC®d » contient la marque
déposée, qui appartient au nom de la souche, et la lettre d'appel de note,
qui n'y appartient pas. Traiter l'exposant comme un bloc faisait refuser
« ® » et produisait **soixante-dix fausses anomalies** — ce qui revient à
n'en signaler aucune, puisque plus personne ne lit la liste. On sépare : la
marque reste dans le texte, l'appel part dans les notes, et seul un reste
inclassable est signalé.

**Un critère peut s'étendre sur onze lignes.** En 3A, « Results » porte un
`rowspan` de onze. En faire onze critères « Results » séparés aurait détruit
la liste qu'ils forment — les cinq seuils de zone pour *K. pneumoniae*,
*K. oxytoca* et *E. coli*, puis les trois pour *P. mirabilis*.

### Ce que la série 3 apporte à PhénoBac, et qui lui manque

| ce que dit le CLSI | ce que PhénoBac tient |
|---|---|
| HLG **par disque** : gentamicine 120 µg — 6 mm = R, 7-9 mm = **non concluant**, ≥ 10 mm = S | aucune méthode par disque pour `HLG` |
| HLG **par CMI** : R > 500 µg/mL | une ligne EUCAST, CMI 128 mg/L |
| **HLS** — streptomycine haut niveau : disque 300 µg (mêmes bornes de zone), CMI R > 1000 µg/mL en bouillon, > 2000 µg/mL en gélose | **rien** |
| test D : disques érythromycine 15 µg et clindamycine 2 µg, écartés de **15-26 mm** (staphylocoques) ou **12 mm** (pneumocoque et streptocoques β-hémolytiques) | convention `temoin`, sans l'écartement |
| gélose salée oxacilline : MHA + 4 % NaCl, oxacilline 6 µg/mL, 24 h, lecture en lumière transmise | convention `dep` |
| gélose vancomycine : BHI + 6 µg/mL, 24 h — et la lecture **diffère selon l'espèce** : chez *S. aureus* « sensibilité diminuée présumée », chez l'entérocoque « résistance présumée » | convention `dep` |
| haut niveau de mupirocine : disque 200 µg, **absence de zone** = résistance | — |

La catégorie **« non concluant »** du HLG par disque (7-9 mm) n'a pas
d'équivalent dans le moteur, qui ne connaît que S, I et R — et bientôt SDD.
Elle n'est pas un SDD : elle ne dit pas qu'une dose plus forte marcherait,
elle dit que **le test n'a pas tranché** et qu'il faut une CMI.

**Aucune de ces lignes n'a été portée dans la base.** Ce sont des décisions de
biologiste : ajouter `HLS`, ouvrir une méthode par disque pour `HLG`, décider
du sort du « non concluant ». Le présent document les expose, il ne les prend
pas.

### Série 1 et M45 : joignables, non lus

Sondés pendant la même session : la série 1 est faite de tables à quatre
colonnes par rangs de prescription (« Tier 1… »), et le **M45 Ed3:2016** est
une **troisième** forme — une grille de seuils, mais précédée d'une colonne
« Antimicrobial Class » qui décalerait d'un cran le calcul de `dCat` dans
`extraire-clsi.js`. Les lire demande, chacun, son lecteur.

## La correspondance des noms

`outils/noms-clsi.py` la tient, et sort en erreur s'il reste un code sans
sort décidé. Les 156 lignes nommées par les seize tables ne sont pas
156 molécules : ce sont les mêmes, avec la casse, l'astérisque, `(U)a`,
`(Inv.)`, et les qualificatifs de site et de voie — lesquels portent
exactement ce que les colonnes `site`, `conv` et `temoin` de PhénoBac portent
déjà. Les écraser au nettoyage reviendrait à transcrire la céfuroxime orale à
la place de la parentérale.

Deux codes n'ont pas de ligne dans les tables de seuils, et chacun porte sa
raison : **`HLG`** vit en table 3L, et **`TEM`**, la témocilline, n'apparaît
nulle part dans le M100.

La première ligne de seuil CLSI ne sera écrite qu'une fois le point 3 clos.

## Ce que la lecture à la main a appris sur les staphylocoques

Le CLSI découpe l'oxacilline par espèce, et ce découpage **ne recouvre pas**
celui de PhénoBac. Là où PhénoBac a un groupe `scn` unique, le CLSI en a trois,
et *S. lugdunensis* n'est pas là où on l'attendrait :

| portée CLSI | disque | diamètre | CMI |
|---|---|---|---|
| *S. aureus* **et *S. lugdunensis*** | céfoxitine 30 µg | S ≥ 22 / R ≤ 21 | oxacilline S ≤ 2 / R ≥ 4 |
| *S. epidermidis* | oxacilline 1 µg | S ≥ 18 / R ≤ 17 | oxacilline S ≤ 0,5 / R ≥ 1 |
| *S. epidermidis* | céfoxitine 30 µg | S ≥ 25 / R ≤ 24 | — |
| autres *Staphylococcus* spp. | céfoxitine 30 µg | S ≥ 25 / R ≤ 24 | oxacilline S ≤ 0,5 / R ≥ 1 |

*S. lugdunensis* est donc traité comme *S. aureus*, et *S. saprophyticus* tombe
dans « autres ». PhénoBac porte déjà une exception EUCAST sur `scn` visant
`ssaprophyticus` et `slugdunensis` ensemble : sous le CLSI, **ces deux espèces
se séparent**. Le mécanisme `SEUIL_ESPECE` existe et sait le représenter.

La vancomycine se partage de même, en deux portées seulement : *S. aureus*
(S ≤ 2 / I 4-8 / R ≥ 16) et **SOSA**, *Staphylococcus species other than
S. aureus* (S ≤ 4 / I 8-16 / R ≥ 32).

Et le premier SDD concret est là : la **ceftaroline** sur *S. aureus*, S ≤ 1,
**SDD 2-4**, R ≥ 8 — avec son équivalent en diamètre, S ≥ 25, SDD 20-24,
R ≤ 19.
