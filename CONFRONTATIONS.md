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
