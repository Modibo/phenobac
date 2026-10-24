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
- **empreinte** : b392ac453e476efb02dc0e48beb4eb05bffa8e663af3a040276822c350dc441a
- **date** : 2026-10-24
- **résultat** : 218 seuils confrontés — **218 identiques, 0 différent**, 91 non comparés.

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

## comparer-zit.py — zones d'incertitude technique

- **document** : EUCAST v16.1 (classeur xlsx) ET CA-SFM 2026 V1.0 (pdf)
- **tables** : ZIT, ZIT_CASFM
- **empreinte** : (jamais confrontée depuis l'ouverture de ce registre)
- **date** : —
- **résultat** : à confronter

L'outil existe et fonctionne ; il n'a simplement pas encore été passé avec les
deux documents depuis que ce registre existe. C'est une dette, elle est écrite,
et la chaîne la rappelle à chaque livraison sans bloquer : bloquer sur un
document que personne n'a sous la main n'aiderait personne.

---

## Ce que l'absence de document bloque

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
