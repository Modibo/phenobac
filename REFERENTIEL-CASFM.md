# Le CA-SFM dans PhénoBac

## Ce que c'est

Le **CA-SFM** (Comité de l'Antibiogramme de la Société Française de
Microbiologie) a adopté le référentiel EUCAST en 2014 et en reprend chaque
année l'essentiel. Il s'en écarte sur un nombre limité de points, qu'il publie
et justifie dans un document distinct du communiqué annuel :

> « Différences principales entre le CA-SFM et l'EUCAST », version CA-SFM 2026,
> 18 pages — <https://www.sfm-microbiologie.org/wp-content/uploads/2026/09/CASFM2026EUCAST.pdf>
> (téléchargeable gratuitement, sans compte ni formulaire)

PhénoBac ne contient donc **pas** un second jeu complet de concentrations
critiques. Il contient le **delta** : tout couple germe/antibiotique absent des
tables `BP_CASFM*` garde sa valeur EUCAST. C'est la règle du document source, et
c'est ce qui rend l'écart vérifiable plutôt que d'avoir deux référentiels
entiers à maintenir en parallèle.

Le choix se fait dans l'application, encadré « 02 Antibiogramme ». Il est
mémorisé d'une session à l'autre : un laboratoire ne change pas de référentiel
d'un patient au suivant.

## Où le code se trouve

| Quoi | Client `phenobac.html` | Moteur `netlify/functions/premium-interpret.js` |
|---|---|---|
| Registre des référentiels | `REFERENTIELS` | `REFERENTIELS` |
| Seuils déplacés | `BP_CASFM` | idem |
| Seuils du site urinaire | `BP_CASFM_URIN` | idem |
| Seuils du site méningé | `BP_MENINGE_CASFM` | idem |
| Couples couverts par le CA-SFM seul | `CASFM_COUVRE` | idem |
| Molécules ajoutées au panel | `CASFM_PANEL` | — |
| Règles transversales | — | `reglesCasfm()` |
| Lecture interprétative | — | `rendreR()`, moteurs `entero` / `enterobacter` |

Le moteur **fait foi** : c'est lui qui catégorise. Le client n'en tient une
copie que pour l'affichage et l'éditeur de seuils.

Deux garde-fous sont lancés par la CI à chaque push :

```bash
python3 outils/verifier-tables.py      # les deux copies des tables concordent
node outils/essai-referentiel.js       # changer de référentiel change le rendu
```

Sans Node sur la machine, le second tourne aussi sous JavaScriptCore :

```bash
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc outils/essai-referentiel.js
```

## Les différences appliquées

### Seuils déplacés (`BP_CASFM`)

| Couple | EUCAST v16.1 | CA-SFM 2026 | Page | Motif |
|---|---|---|---|---|
| *S. aureus* / vancomycine | S ≤ 2 | **S ≤ 1** | 11 | Les cibles PK/PD ne sont pas atteignables à 2 mg/L, et le risque d'échec y est documenté cliniquement. Ne concerne **pas** les staphylocoques à coagulase négative. |
| Streptocoques A, C, G / pénicilline G | S ≤ 0,03 | **S ≤ 0,06** | 12 | Éviter de catégoriser « R » des souches à 0,06 mg/L, alors que la plupart des automates ne mesurent pas en dessous. |
| *Acinetobacter* / cotrimoxazole | S ≤ 0,5 · R > 0,5 | **S ≤ 0,5 · R > 2** | 6 | Conserver un rendu « sensible à forte posologie » entre 1 et 2 mg/L, faute d'alternatives thérapeutiques dans ce genre. |
| *Corynebacterium* (hors *C. diphtheriae*) / cotrimoxazole | aucun | **S ≤ 2** | 18 | Valeur adaptée du CLSI M45, seuil « R » commun à 2 mg/L. |
| *N. gonorrhoeae* / gentamicine | écartée (« report resistant without prior testing ») | **S ≤ 16** | 14 | La gentamicine est une alternative des recommandations françaises en cas d'allergie ou de résistance à la ceftriaxone. Seuil fondé sur l'ECOFF. |

### Seuils dépendants du site (`BP_CASFM_URIN`, `BP_MENINGE_CASFM`)

| Couple | EUCAST | CA-SFM | Page | Motif |
|---|---|---|---|---|
| Entérobactéries, *Acinetobacter*, staphylocoques / cotrimoxazole, **infection urinaire sans signe de gravité** | S ≤ 0,5 | **S ≤ 2** | 6 | Le CA-SFM a suivi l'EUCAST en abaissant le seuil pour les infections systémiques, mais l'a refusé dans l'urine : pas de signal d'échec clinique, et des paramètres PK/PD très favorables. |
| *N. meningitidis* / amoxicilline, **méningite** | S ≤ 0,125 · R > 1 | **S ≤ 0,125 · R > 0,125** | 14 | En France, le choix du relais dépend de la CMI d'amoxicilline ; l'EUCAST le fonde sur celle de la pénicilline G. |

Le contexte méningé l'emporte sur le contexte urinaire : un LCR n'est pas une
urine.

### Couples que seul le CA-SFM couvre (`CASFM_COUVRE`)

Ces couples sont marqués « hors EUCAST » dans l'éditeur de seuils — conventions
de laboratoire — et **cessent de l'être** dès lors qu'on travaille en CA-SFM,
qui leur donne des valeurs.

| Groupe | Molécules | Page | Source de la valeur |
|---|---|---|---|
| *Acinetobacter* | pipéracilline-tazobactam, ceftazidime, céfépime | 18 | CLSI M100, adapté |
| *S. maltophilia* | lévofloxacine | 18 | CLSI M100 ; 1 mg/L retenu, l'ECOFF EUCAST à 4 mg/L exposant à des doses toxiques |
| *Corynebacterium* | cotrimoxazole | 18 | CLSI M45 |
| *N. gonorrhoeae* | gentamicine | 14 | ECOFF |
| *E. coli* seulement | céfoxitine | 7 | L'EUCAST la réserve au dépistage des AmpC ; la molécule sert en France d'alternative aux carbapénèmes contre les souches BLSE |

### Lecture interprétative — la différence de fond

C'est ici que les deux référentiels divergent le plus visiblement, et c'est ce
que la section « Lecture interprétative » du compte-rendu donne à voir.

**BLSE et céphalosporinase hyperproduite** (page 8). L'EUCAST indique
explicitement, depuis plusieurs versions, de **ne pas** réinterpréter les
C3G/C4G et l'aztréonam pour ces souches : on rend ce qui a été testé. Le CA-SFM
est revenu en 2024 à la lecture interprétative. PhénoBac applique l'un ou
l'autre selon le référentiel choisi.

**Carbapénémase** (page 8). Le CA-SFM 2026 recommande d'interpréter les
résultats bruts S ou SFP comme **résistants** aux carbapénèmes (ertapénème,
imipénème, méropénème) pour toute souche productrice de carbapénémase, quel que
soit le type d'enzyme et quelles que soient les CMI. L'EUCAST, depuis la version
16.0, se borne à un commentaire « forte posologie et en association ».
La règle ne s'applique dans PhénoBac que si la carbapénémase est déclarée
**confirmée** dans le contexte — une suspicion ne suffit pas.

**OXA-48** (page 8, règle CA-SFM de 2023). Céfotaxime et ceftriaxone sont en
outre rendus résistants.

Trois principes tiennent cette partie :

1. Le résultat brut n'est **jamais** effacé. Le compte-rendu porte la catégorie
   rendue *et* la catégorie lue, avec le motif du report.
2. Un antibiotique **non testé** n'est jamais rendu résistant : on ne conclut
   pas sur une molécule qu'on n'a pas lue.
3. Les associations à inhibiteur (amoxicilline-clavulanate,
   pipéracilline-tazobactam) et le céfépime ne sont pas reportés
   automatiquement : le céfépime s'interprète sur la CMI.

### Règles transversales (`reglesCasfm`)

Elles ne changent aucune catégorie — elles disent ce que le référentiel français
exige en plus.

| Règle | Page | Contenu |
|---|---|---|
| Formulation « SFP » | 2 | Le CA-SFM demande de **ne plus rapporter la lettre « I »** et de lui préférer « sensible à forte posologie ». PhénoBac garde « I » à la saisie et en interne, et n'écrit « SFP » que sur le rendu. |
| Rifampicine | 5 | Toujours assortie de la mention « à utiliser en association » (hors prophylaxie du méningocoque et d'*Haemophilus*). |
| Masquage du méropénème | 2 | Chez *Pseudomonas*, ne pas rendre le méropénème tant qu'une β-lactamine de spectre plus étroit reste active. |
| Lévofloxacine / *Pseudomonas* | 9 | Forte posologie au minimum ; activité à considérer comme inférieure à celle de la ciprofloxacine. |
| β-lactamase chromogénique | 14, 15 | *N. meningitidis* et *M. catarrhalis* : rechercher la β-lactamase avant de rendre une pénicilline sensible. |
| *S. saprophyticus* | 11 | Un dépistage négatif à l'ampicilline ne suffit pas — vérifier aussi la sensibilité à la méticilline. |
| Anaérobies | 16, 17 | Gélose Brucella (BBA) et non FAA ; amoxicilline testée directement plutôt que déduite de la pénicilline G. Pas de seuils propres à *C. difficile*, dont l'antibiogramme sur selles n'est pas recommandé en France. |
| *Burkholderia cepacia* | 10 | Chapitre et concentrations critiques **supprimés** en 2026 : microdilution en milieu liquide seulement, CMI interprétées face aux valeurs PK/PD. |

## Ce qui n'est pas repris, et pourquoi

Le document source décrit des différences que PhénoBac ne peut pas appliquer
aujourd'hui, faute de porter la molécule ou l'espèce concernée. Elles sont
listées ici pour que l'écart soit connu plutôt que silencieux.

| Différence | Page | Pourquoi elle n'est pas appliquée |
|---|---|---|
| Témocilline (deux seuils, urinaire et autres) | 7 | Molécule absente du panel |
| Céfalexine : ne pas rendre le résultat | 7 | Molécule absente |
| Ticarcilline conservée par le CA-SFM | 4 | Molécule absente |
| Acide nalidixique conservé (dépistage FQ) | 9 | Molécule absente — PhénoBac utilise la péfloxacine |
| Kanamycine conservée (dépistage de l'amikacine) | 11 | Molécule absente |
| Daptomycine / entérocoques : S ≤ 2, ZIT à 4 | 12 | Molécule absente |
| Céfidérocol : méthode et rendu à deux niveaux | 5 | Molécule absente |
| Minocycline / *Acinetobacter* et *S. maltophilia* | 18 | Non testée dans ces panels |
| Rifampicine / anaérobies : 4 mg/L | 17 | Non testée dans ces panels |
| *S. pettenkoferi* : oxacilline à 2 mg/L | 11 | Espèce absente |
| *B. pseudomallei* / doxycycline : seuil unique à 2 mg/L | 10 | Espèce absente |
| Stratégie de dépistage des carbapénémases (logigramme, annexe 6) | 9 | Relève de la paillasse, pas de l'interprétation |
| Zones d'incertitude technique (ZIT) | 11, 12, 13 | PhénoBac ne modélise pas encore les ZIT |
| *H. pylori*, *Campylobacter* : méthodologie du CNR | 15 | Relève de la méthode, pas des seuils |

## Mettre à jour

Le CA-SFM publie une version par an, en général à la rentrée.

1. Récupérer le nouveau document de différences sur la page du groupe
   *Comité de l'Antibiogramme* du site de la SFM. Le lien de téléchargement
   n'est pas exposé sur la fiche boutique : il se trouve sur la page du groupe
   de travail, sous la forme `wp-content/uploads/<année>/<mois>/CASFM<année>EUCAST.pdf`.
2. Comparer, différence par différence, avec les tableaux ci-dessus.
3. Corriger `BP_CASFM*` et `reglesCasfm()` **dans le moteur d'abord**, puis
   recopier dans le client.
4. Mettre à jour `REFERENTIELS.casfm.version` et `.publie` des deux côtés.
5. Relancer `verifier-tables.py` et `essai-referentiel.js`, et compléter ce
   fichier — y compris la liste des différences non reprises.

## Avertissement

PhénoBac n'est pas un dispositif médical de diagnostic in vitro. Le choix du
référentiel et la validation du rendu appartiennent au biologiste. Les valeurs
transcrites ici doivent être confrontées au document officiel avant tout usage
sur des résultats de patients.
