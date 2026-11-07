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
cellule qu'il ne sait pas répartir. Au dernier passage : **674 lignes,
15 anomalies**, toutes dans les tables 2C et 2D, c'est-à-dire le bloc
oxacilline/céfoxitine des staphylocoques et le couple pénicilline/ampicilline
des entérocoques. Celles-là se lisent à la main.

Trois défauts de lecture ont été trouvés et corrigés en chemin, tous du même
genre — une forme supposée unique qui ne l'était pas :

1. La table des seuils choisie « la plus longue » : faux en 2B-3, où le
   tableau *Testing Conditions* est plus long. Elle se choisit sur son en-tête.
2. Les `<br>` perdus par `textContent` : `Cefotaxime or ceftriaxone` donnait
   `≥ 26≥ 23`, deux antibiotiques collés dans une seule valeur.
3. La même marque employée pour les continuations `rowspan` et `colspan` :
   chaque ligne de titre héritait des valeurs de la ligne de données
   précédente. Deux marques distinctes (`⇑`, `⇐`) l'ont réglé.

Un quatrième reste à surveiller : les valeurs séparées par une **espace** et
non par un `<br>` (`22-25^ 17-20^` pour ciprofloxacine et lévofloxacine).
Elles sont réparties quand chaque morceau ressemble à une valeur, signalées
sinon.

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

1. Lire à la main les 15 lignes signalées (2C, 2D).
2. Établir la correspondance entre les 41 codes d'antibiotiques de PhénoBac et
   les noms du CLSI.
3. Porter SDD dans le moteur, l'interface et les deux catalogues de langue.
4. Transcrire, table par table, avec un `comparer-clsi.py` qui confronte la
   base au JSON extrait — comme `comparer-eucast.py` le fait pour le classeur.
5. Lire le M45 pour les 12 groupes restants.

Rien de tout cela n'est entamé. La première ligne de seuil CLSI ne sera écrite
qu'une fois les points 1 et 2 clos.
