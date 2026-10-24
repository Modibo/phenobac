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
- **empreinte** : bb17d1006bd360e0901bdb4b25800a0d15dfbe7a772824e3d7dcb02ae2d2c5e3
- **date** : 2026-10-24
- **résultat** : 212 seuils confrontés — 212 identiques, 0 différent.

La confrontation porte sur les concentrations critiques de l'EUCAST. Les
seuils méningés (BP_MENINGE) et ceux du CA-SFM ont leurs propres documents et
ne sont pas couverts par cette entrée.

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

Il faut donc le classeur v16.1, obtenu à la main sur le site de l'EUCAST.
Avec lui, l'ajout est mécanique.

Les streptocoques des groupes C et G, eux, ont été ajoutés le même jour **sans
document nouveau** : la table de l'EUCAST s'intitule « Streptococcus groups A,
B, C and G », et PhénoBac la portait déjà sous le nom « strepacg ». Seule
l'espèce manquait.
