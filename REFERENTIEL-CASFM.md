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
| Zones d'incertitude technique | `ZIT`, `ZIT_CASFM` | idem, + `zitPour()` / `enZit()` |
| Règles transversales | — | `reglesCasfm()` |
| Lecture interprétative | — | `rendreR()`, moteurs `entero` / `enterobacter` |

Le moteur **fait foi** : c'est lui qui catégorise. Le client n'en tient une
copie que pour l'affichage et l'éditeur de seuils.

Deux garde-fous sont lancés par la CI à chaque push :

```bash
python3 outils/verifier-tables.py      # les deux copies des tables concordent
node outils/essai-referentiel.js       # changer de référentiel change le rendu
```

Et, à la main, quand un nouveau millésime paraît :

```bash
python3 outils/comparer-eucast.py v_16.1_Breakpoint_Tables.xlsx   # les seuils
python3 outils/comparer-zit.py    v_16.1_Breakpoint_Tables.xlsx CASFM2026_V1.0-SEPTEMBRE-2026.pdf
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
| *Corynebacterium* (hors *C. diphtheriae*) / cotrimoxazole | aucun | **S ≤ 1 · R > 2** | 101 | Valeur adaptée du CLSI M45. Le document des *différences* (p. 18) n'annonce que le seuil « R », « commun à 2 mg/L » ; le tableau du communiqué complet donne les deux. PhénoBac avait d'abord retenu 2 des deux côtés, ce qui rendait « sensible » une souche à 2 mg/L que le CA-SFM classe intermédiaire. |
| Staphylocoques / cotrimoxazole | S ≤ 0,5 · R > 0,5 | **S ≤ 0,5 · R > 2** | 78 | Bande intermédiaire là où l'EUCAST n'en a pas. Sans cette ligne, une souche à 2 mg/L était rendue résistante sous un référentiel qui la dit intermédiaire. |
| *N. gonorrhoeae* / gentamicine | écartée (« report resistant without prior testing ») | **S ≤ 16** | 14 | La gentamicine est une alternative des recommandations françaises en cas d'allergie ou de résistance à la ceftriaxone. Seuil fondé sur l'ECOFF. |

### Seuils dépendants du site (`BP_CASFM_URIN`, `BP_MENINGE_CASFM`)

| Couple | EUCAST | CA-SFM | Page | Motif |
|---|---|---|---|---|
| Entérobactéries, *Acinetobacter*, staphylocoques / cotrimoxazole, **infection urinaire sans signe de gravité** | S ≤ 0,5 | **S ≤ 2** | 6 | Le CA-SFM a suivi l'EUCAST en abaissant le seuil pour les infections systémiques, mais l'a refusé dans l'urine : pas de signal d'échec clinique, et des paramètres PK/PD très favorables. |
| Entérobactéries / témocilline, **infection urinaire sans signe de gravité** | un seul seuil (S ≤ 0,001 · R > 16) | **S ≤ 8 · R > 16** | 7 | L'EUCAST ne fait figurer qu'une valeur critique, séparant « sensible à forte posologie » de « résistant » ; la posologie standard n'est autorisée que dans le tableau des posologies. Le CA-SFM donne deux seuils et l'autorise donc explicitement. Les deux comités restreignent la molécule à *E. coli*, *Klebsiella* spp. (sauf *K. aerogenes*) et *P. mirabilis*. |
| *N. meningitidis* / amoxicilline, **méningite** | S ≤ 0,125 · R > 1 | **S ≤ 0,125 · R > 0,125** | 14 | En France, le choix du relais dépend de la CMI d'amoxicilline ; l'EUCAST le fonde sur celle de la pénicilline G. |

Le contexte méningé l'emporte sur le contexte urinaire : un LCR n'est pas une
urine.

### Couples que seul le CA-SFM couvre (`CASFM_COUVRE`)

Ces couples sont marqués « hors EUCAST » dans l'éditeur de seuils — conventions
de laboratoire — et **cessent de l'être** dès lors qu'on travaille en CA-SFM,
qui leur donne des valeurs.

| Groupe | Molécules | Page | Source de la valeur |
|---|---|---|---|
| *Acinetobacter* | pipéracilline-tazobactam, ceftazidime, céfépime, minocycline | 18 | CLSI M100, adapté ; pour la minocycline le seuil « R » est celui de l'ECOFF (2 mg/L) |
| *S. maltophilia* | lévofloxacine, minocycline | 18 | CLSI M100 ; 1 mg/L retenu pour la lévofloxacine, l'ECOFF EUCAST à 4 mg/L exposant à des doses toxiques |
| *Acinetobacter*, *S. maltophilia* | céfidérocol | 5 | L'EUCAST refuse d'y voir de vraies valeurs critiques cliniques et stratifie en trois niveaux de probabilité ; le CA-SFM s'en tient à deux — « utilisation possible » ou « déconseillée » — sur la valeur PK/PD de 2 mg/L |
| Entérocoques | daptomycine | 12 | L'EUCAST la note « IE » ; le CA-SFM retient 2 mg/L, la posologie française étant de 8 à 12 mg/kg/j |
| Anaérobies | moxifloxacine | 17 | Aucune recommandation EUCAST ; le CA-SFM retient 2 mg/L pour l'ensemble des bactéries anaérobies |
| *Corynebacterium* | cotrimoxazole | 18 | CLSI M45 |
| *N. gonorrhoeae* | gentamicine | 14 | ECOFF |
| *E. coli* seulement | céfoxitine | 7 | L'EUCAST la réserve au dépistage des AmpC ; la molécule sert en France d'alternative aux carbapénèmes contre les souches BLSE |

### Diamètres critiques (`DZ_CASFM`, `DZ_CASFM_URIN`, `DISQUE_CASFM`)

Même principe que pour les CMI : seules les **différences** sont enregistrées.
Tout couple absent de ces tables garde son diamètre EUCAST. Les pages citées
sont celles du **communiqué complet**, chapitre 5 ; `outils/lire-casfm.py`
permet d'y retourner ligne par ligne.

| Couple | EUCAST v16.1 | CA-SFM 2026 | Page | Ce qui change en pratique |
|---|---|---|---|---|
| Entérobactéries / **amoxicilline** | pas de disque propre : lire celui de l'ampicilline (10 µg, S ≥ 14) | **disque 20 µg, S ≥ 19 · R < 19** | 49 | Le disque n'est pas le même. Une zone de 16 mm est sensible à l'EUCAST, résistante au CA-SFM — et mesurer sur 20 µg en lisant un seuil établi pour 10 serait une faute silencieuse. |
| *E. coli* / céfoxitine | aucun | **disque 30 µg, S ≥ 18 · R < 18** | 50 | Le CA-SFM ne chiffre ce couple que pour *E. coli* ; PhénoBac refuse de l'appliquer à *Klebsiella*. |
| *Acinetobacter* / ceftazidime, céfépime, minocycline | aucun | **pas de catégorie S · R < 18** | 64-65 | Trois molécules qui ne pouvaient pas être rendues au disque le deviennent. |
| *Acinetobacter* / pipéracilline-tazobactam | aucun | **disque 100-10 µg, pas de catégorie S · R < 21** | 63 | La charge n'est pas celle des autres genres (30-6 µg). |
| *Acinetobacter* / cotrimoxazole | S ≥ 16 · R < 16 | **S ≥ 16 · R < 14** | 64 | Bande intermédiaire, cohérente avec l'écart de CMI. |
| *S. maltophilia* / minocycline | aucun | **pas de catégorie S · R < 21** | 67 | |
| *Corynebacterium* / cotrimoxazole | aucun | **S ≥ 19 · R < 16** | 101 | |
| Staphylocoques / cotrimoxazole | S ≥ 24 · R < 24 | **S ≥ 24 · R < 19** | 78 | |
| Anaérobies / moxifloxacine | aucun | **disque 5 µg, S ≥ 21 · R < 21, ZIT 18-20 mm** | 127 | Seule ZIT au disque propre au CA-SFM. |

Site du prélèvement (`DZ_CASFM_URIN`), infection urinaire sans signe de gravité :

| Couple | CA-SFM | Page |
|---|---|---|
| Entérobactéries / cotrimoxazole | S ≥ 14 · R < 14 (au lieu de 15/15) | 55 |
| Entérobactéries / témocilline | S ≥ 20 · R < 17 (au lieu de « pas de catégorie S ») | 48 |
| Staphylocoques / cotrimoxazole | S ≥ 19 · R < 19 | 78 |
| *Acinetobacter* / cotrimoxazole | S ≥ 14 · R < 14 | 64 |

#### Un dépistage n'est pas une catégorisation (`DEPISTAGE_CASFM`)

Pour les **streptocoques A, C et G**, le CA-SFM écrit (p. 90) que le disque de
pénicilline G « permet uniquement la détection des souches sensibles
(diamètre ≥ 23 mm) : si le diamètre est < 23 mm, utiliser une méthode » de
CMI. L'EUCAST, lui, tranche des deux côtés au même seuil.

PhénoBac suit donc le CA-SFM : au-dessus de 23 mm il rend « sensible », en
dessous il **ne rend rien** et réclame une CMI. La raison est clinique et non
formelle — la résistance aux β-lactamines est exceptionnelle dans ce groupe,
un petit diamètre y est d'abord un problème technique, et rendre « R » ferait
perdre au malade son traitement de référence sur une mesure douteuse.

#### Ce que le CA-SFM ne permet pas non plus au disque

Vérifié dans le communiqué, et identique à l'EUCAST : la **vancomycine** sur
staphylocoque (p. 76, microdilution obligatoire), la **daptomycine** sur
entérocoque (p. 84), le **céfidérocol** et la **lévofloxacine** sur
*S. maltophilia* (p. 66-67), l'**amoxicilline** chez les anaérobies (p. 126)
et l'ensemble des β-lactamines chez le **méningocoque** (p. 110) portent la
mention « Note » en face des colonnes de diamètres. Le refus de PhénoBac y
vaut donc sous les deux référentiels.

### Contrôle de qualité au disque (`CQ`)

Traduire un diamètre en catégorie ne vaut que si le diamètre est juste. Un lot
de disques altéré, une gélose trop épaisse, un inoculum trop dense déplacent
**toutes** les zones ensemble : les catégories restent plausibles, et elles
sont fausses. La souche de référence est le seul garde-fou, et c'est pourquoi
cette table accompagne la saisie en millimètres plutôt que de l'attendre.

95 cibles sur sept souches, reprises du **chapitre 1.4** du communiqué :
*E. coli* ATCC 25922, *P. aeruginosa* ATCC 27853, *S. aureus* ATCC 29213,
*E. faecalis* ATCC 29212, *S. pneumoniae* ATCC 49619, *H. influenzae*
ATCC 49766 et *C. jejuni* ATCC 33560. Les souches des points 1.4.10 et
suivants ne sont pas reprises : elles contrôlent la **détection d'un
mécanisme** de résistance, ce qui est un autre exercice.

`outils/verifier-cq.py` en contrôle trois choses, dont deux sans le PDF :

1. la table du client est identique à ce que `extraire-cq.py` relit du
   communiqué ;
2. chaque **charge de disque** annoncée au contrôle de qualité est celle des
   tables de seuils, extraites d'une tout autre source — le classeur de
   l'EUCAST. **69 charges concordent** entre deux documents indépendants ;
   c'est la meilleure preuve de lecture correcte dont on dispose ici ;
3. toute molécule catégorisable au disque devrait être contrôlable. Quatre
   couples ne le sont pas, chacun vérifié dans le document :

| Couple | Pourquoi |
|---|---|
| *P. aeruginosa* / ceftazidime, pipéracilline-tazobactam | le communiqué ne donne que la CMI ; pas de colonnes de diamètre |
| *E. faecalis* / pipéracilline-tazobactam | absent de la table |
| *S. pneumoniae* / cotrimoxazole | colonnes arrivées dans le désordre à l'extraction (« 22-26 18 » au lieu de « 22 18-26 ») — un trou signalé vaut mieux qu'une cible devinée |

#### Détection de dérive

Un registre qui enregistre sans prévenir ne sert qu'après coup. Une mesure peut
rester **dans** les limites et dériver quand même : sept contrôles successifs
qui s'éloignent de la cible annoncent le lot de disques qui faiblit, des
semaines avant la première non-conformité.

Deux règles, et seulement deux — celles de Westgard qui **ne dépendent pas de
l'écart-type**, puisqu'elles comparent des rangs et non des distances :

| | |
|---|---|
| **décalage** | dix mesures consécutives du même côté de la cible |
| **tendance** | sept mesures consécutives qui montent, ou qui descendent |

Les règles en multiples d'écart-type (1-3s, 2-2s…) ne sont pas reprises : les
transposer à un intervalle de ± 3 mm demanderait de supposer une distribution
qu'on n'a pas mesurée, et une alerte fondée sur une supposition apprend à
ignorer les alertes.

**Un changement de lot coupe la série.** Un nouveau lot de disques est un autre
système : y chercher la continuité du précédent produirait des dérives
imaginaires et masquerait les vraies. Le trait vertical sur la carte marque le
changement — sans lui, on chercherait une cause là où il n'y en a pas.

La **carte de Levey-Jennings** rend tout cela visible : cible en trait plein,
limites acceptables en pointillé, un point par contrôle. Une suite de nombres
ne montre pas une dérive ; un tracé, si.

#### Le registre

Un contrôle qui ne laisse pas de trace ne sert qu'une fois. Chaque contrôle
enregistré porte la **date**, la souche, le **lot de disques**, qui a lu,
chaque mesure avec sa cible et son verdict — et, quand une valeur sort des
limites, la **conduite tenue**. L'application refuse d'enregistrer un écart
sans conduite tenue : un écart constaté sans suite ne vaut pas mieux que pas
de contrôle.

Le registre vit dans le **navigateur** (`localStorage`, clé `phenobac.cq`,
400 contrôles au plus). Ce choix mérite d'être énoncé franchement : il
n'exige ni compte ni réseau, et rien ne quitte le poste — mais le stockage
d'un navigateur **n'est pas une archive**. Vider le cache l'efface, un autre
poste ne le voit pas. L'**export CSV** est le document à conserver, et
l'interface le répète à chaque enregistrement plutôt que de le laisser
découvrir.

Le CSV porte une ligne par **mesure** — c'est le grain auquel on relit un
registre quand on cherche quelle molécule a dérivé, et quand : `Date`,
`Horodatage`, `Souche`, `Référence`, `LotDisques`, `Opérateur`,
`Antibiotique`, `Code`, `ChargeDisque`, `MesureMm`, `CibleMm`, `MinMm`,
`MaxMm`, `Verdict`, `ConduiteTenue`. Point-virgule et BOM, comme l'export
GLASS : les tableurs francophones l'ouvrent sans assistant d'importation.

C'est ce troisième contrôle qui a rattrapé la gentamicine et le méropénème,
tombés de la table parce que le PDF coupe parfois un intervalle au milieu
(« 22- 23 ») : rien d'autre ne l'aurait signalé.

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
| Céfidérocol | 5 | Chez les entérobactéries, à tester uniquement par microdilution en milieu liquide : la corrélation diamètre/CMI fait défaut sur les souches multirésistantes, celles où le test est utile. Chez *Acinetobacter* et *S. maltophilia*, le rendu est à deux niveaux plutôt qu'une catégorisation clinique. |
| *Burkholderia cepacia* | 10 | Chapitre et concentrations critiques **supprimés** en 2026 : microdilution en milieu liquide seulement, CMI interprétées face aux valeurs PK/PD. |

## Zones d'incertitude technique (ZIT / ATU)

Toute mesure varie. Pour quelques couples germe-antibiotique, la valeur tombe
si près du seuil que la catégorisation n'est plus reproductible : une CMI de
1 mg/L doit être tenue pour comprise entre 0,5 et 2 mg/L. Les deux comités
signalent ces valeurs — l'EUCAST sous le nom d'**ATU** (*area of technical
uncertainty*), le CA-SFM sous celui de **ZIT**.

**Ce n'est pas une catégorie clinique de plus.** C'est un avertissement sur la
fiabilité de la catégorie rendue. PhénoBac l'affiche, et ne touche à rien.

### Les valeurs appliquées

La ZIT est « une valeur de CMI définie, une seule dilution sauf exception » :
on compare donc à une valeur, pas à un intervalle.

| Couple | ZIT | EUCAST | CA-SFM | Source |
|---|---|---|---|---|
| Entérobactéries / pipéracilline-tazobactam | 16 mg/L | ATU 16 | ZIT 16 | EUCAST v16.1, feuille *Enterobacterales* ; CA-SFM 2026 p. 48 |
| Entérobactéries / ciprofloxacine | 0,5 mg/L | ATU 0,5 | ZIT 0,5 | idem ; CA-SFM 2026 p. 52 |
| *Pseudomonas* / colistine | 4 mg/L | — | ZIT 4 | CA-SFM 2026, chapitre 5.2 |
| *S. aureus* / vancomycine | 2 mg/L | — | ZIT 2 | CA-SFM 2026, chapitre 5.5 |
| Entérocoques / daptomycine | 4 mg/L | — | ZIT 4 | CA-SFM 2026, chapitre 5.6. Le seuil de 2 mg/L coupe partiellement la population sauvage (ECOFF 4 chez *E. faecalis*, 8 chez *E. faecium*) et les objectifs PK/PD sont inatteignables au-delà de 4 mg/L |

Trois restrictions, lues dans les documents :

- **Salmonella est exclu** de la ZIT de la ciprofloxacine. Le tableau des
  fluoroquinolones du CA-SFM est intitulé « Enterobacterales (à l'exception du
  genre *Salmonella*) », et l'EUCAST donne au genre sa propre ligne, sans ATU.
  La ZIT de la pipéracilline-tazobactam, elle, s'y applique.
- **Le contexte méningé** relève d'une ligne distincte — « Ciprofloxacine
  (méningites) » — qu'aucun des deux comités n'assortit d'une ZIT.
- **Les staphylocoques à coagulase négative** ne sont pas concernés par la ZIT
  de la vancomycine : la ligne « Vancomycine, SCN » n'en porte pas. Cette ZIT
  accompagne l'abaissement du seuil à 1 mg/L, qui ne vaut que pour *S. aureus*.

Enfin, la ZIT publiée se rapporte aux **seuils publiés**. Dès que le biologiste
saisit les siens dans « Concentrations critiques », PhénoBac cesse de
l'afficher : elle ne s'y rapporte plus.

### Pourquoi si peu de valeurs

La grande majorité des ZIT portent sur les **diamètres d'inhibition**, pas sur
les CMI. PhénoBac ne travaille pas sur les diamètres : elles ne le concernent
pas — et le CA-SFM précise que, dans ce cas, déterminer la CMI lève
l'incertitude. Restent six ATU en CMI dans tout l'EUCAST v16.1 et dix ZIT en
CMI dans tout le CA-SFM 2026, dont une partie seulement porte sur des molécules
et des espèces que PhénoBac couvre. Les autres concernent la ceftaroline, le
ceftobiprole, la daptomycine, le céfuroxime iv et le complexe *Mycobacterium
abscessus*.

### La conduite à tenir, et la différence entre les deux comités

L'EUCAST énumère cinq options : répéter le test, recourir à un test alternatif,
**dégrader la catégorie**, inclure l'incertitude dans le compte rendu, ou ne pas
rendre le résultat.

Le CA-SFM reprend ces options **sauf une** : il écarte expressément la
dégradation systématique dans la catégorie immédiatement inférieure, au motif
que la pratique tendrait à se généraliser dans certains laboratoires et
fausserait la surveillance épidémiologique de la résistance. Il ajoute qu'« il
est préférable de signaler que le résultat se situe en zone d'incertitude
technique plutôt que d'occulter le résultat ».

**PhénoBac ne dégrade jamais une catégorie de lui-même**, sous aucun des deux
référentiels. Il signale, rappelle les options — formulées selon le référentiel
actif — et laisse la décision au biologiste, qui seul connaît la nature du
prélèvement, la gravité de l'infection et les alternatives disponibles.

### Vérifier les valeurs

```bash
python3 outils/comparer-zit.py v_16.1_Breakpoint_Tables.xlsx CASFM2026_V1.0-SEPTEMBRE-2026.pdf
```

L'outil lit la colonne « ATU » du classeur EUCAST et la colonne « ZIT » des
tableaux du CA-SFM, et les confronte à ce que l'application applique. Il ne
modifie rien.

## Ce qui n'est pas repris, et pourquoi

Le document source décrit des différences que PhénoBac ne peut pas appliquer
aujourd'hui, faute de porter la molécule ou l'espèce concernée. Elles sont
listées ici pour que l'écart soit connu plutôt que silencieux.

| Différence | Page | Pourquoi elle n'est pas appliquée |
|---|---|---|
| Céfalexine : ne pas rendre le résultat | 7 | Molécule absente |
| Ticarcilline conservée par le CA-SFM | 4 | Molécule absente |
| Acide nalidixique conservé (dépistage FQ) | 9 | Molécule absente — PhénoBac utilise la péfloxacine |
| Kanamycine conservée (dépistage de l'amikacine) | 11 | Molécule absente |
| Rifampicine / anaérobies : 4 mg/L | 17 | Non testée dans ces panels |
| *S. pettenkoferi* : oxacilline à 2 mg/L | 11 | Espèce absente |
| *B. pseudomallei* / doxycycline : seuil unique à 2 mg/L | 10 | Espèce absente |
| Stratégie de dépistage des carbapénémases (logigramme, annexe 6) | 9 | Relève de la paillasse, pas de l'interprétation |
| *H. pylori*, *Campylobacter* : méthodologie du CNR | 15 | Relève de la méthode, pas des seuils |

## Mettre à jour

Le CA-SFM publie une version par an, en général à la rentrée.

1. Récupérer **deux** documents sur le site de la SFM. Le lien n'est exposé ni
   sur la fiche boutique ni dans la page du groupe pour le second :
   - le document des différences,
     `wp-content/uploads/<année>/<mois>/CASFM<année>EUCAST.pdf`, listé sur la
     page du groupe *Comité de l'Antibiogramme* ;
   - le communiqué complet, qui porte les tableaux et donc les ZIT,
     `wp-content/uploads/<année>/<mois>/CASFM<année>_V1.0-<MOIS>-<année>.pdf`
     (pour 2026 : `.../2026/09/CASFM2026_V1.0-SEPTEMBRE-2026.pdf`).
2. Comparer, différence par différence, avec les tableaux ci-dessus.
3. Corriger `BP_CASFM*` et `reglesCasfm()` **dans le moteur d'abord**, puis
   recopier dans le client.
4. Mettre à jour `REFERENTIELS.casfm.version` et `.publie` des deux côtés.
5. Passer les ZIT au crible de `comparer-zit.py`, qui lit les deux sources.
6. Relancer `verifier-tables.py` et `essai-referentiel.js`, et compléter ce
   fichier — y compris la liste des différences non reprises.

## Avertissement

PhénoBac n'est pas un dispositif médical de diagnostic in vitro. Le choix du
référentiel et la validation du rendu appartiennent au biologiste. Les valeurs
transcrites ici doivent être confrontées au document officiel avant tout usage
sur des résultats de patients.
