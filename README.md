# PhénoBac

Lecture interprétative de l'antibiogramme. Application web installable (PWA),
utilisable hors-ligne pour les germes courants, avec un moteur d'interprétation
expert couvrant 37 espèces réservé aux licences payantes.

Le raisonnement expert — détection des phénotypes de résistance, catégorisation
des CMI, commentaire de compte-rendu — vit **côté serveur** et n'est rendu qu'à
une licence valide. Patcher la page ne débloque rien.

## Par où commencer

| Vous voulez… | Lisez |
|---|---|
| mettre le service en ligne sur votre VPS | **[DEPLOY-VPS.md](DEPLOY-VPS.md)** |
| encaisser vos premières ventes | **[MISE-EN-VENTE.md](MISE-EN-VENTE.md)** |
| comprendre le mécanisme des licences | **[PHENOBAC-BACKEND.md](PHENOBAC-BACKEND.md)** |
| diffuser l'application sur mobile | **[MOBILE-DEPLOY.md](MOBILE-DEPLOY.md)** |

Sur un VPS **vierge**, où PhénoBac sera le seul service :

```bash
sudo DOMAIN=phenobac.votre-domaine.ovh LETSENCRYPT_EMAIL=vous@exemple.ml bash install.sh
```

Docker, nginx et Let's Encrypt sont installés, les secrets tirés au sort,
`public/` préparé et le service démarré. Le jeton d'administration s'affiche à
la fin : notez-le, il n'est plus réaffiché.

Sur un serveur qui **sert déjà un site** (nginx ou Caddy) :

```bash
bash install-caddy.sh
```

Aucun serveur web, certificat ni DNS n'est touché : PhénoBac tourne en conteneur
sur la loopback, et votre façade existante l'exposera quand vous aurez un
sous-domaine. Voir [DEPLOY-VPS.md § 0](DEPLOY-VPS.md).

## Ce que contient le dépôt

```
server.js                  serveur Express (adapte les handlers Netlify)
netlify/functions/         les huit points d'entrée de l'API
  verify-license.js          vérifie une licence signée              (public)
  premium-interpret.js       le moteur d'interprétation              (licence requise)
  issue-license.js           émet une licence                        (jeton admin)
  revoke-license.js          révoque / restaure / liste              (jeton admin)
  stats.js                   agrégats de ventes                      (jeton admin)
  payment-webhook.js         émission automatique après paiement     (secret partagé)
  claim-license.js           remise de la clé au client              (référence de paiement)
  send-reminders.js          relances avant expiration               (secret de cron)
  send-test-sms.js           SMS de test, pour calibrer              (jeton admin)
  lib/                       store, envoi SMS, révocation, CORS + auth
phenobac.html              l'application
success.html               page de retour après paiement
admin.html                 émission et révocation des licences   — à garder hors ligne
dashboard.html             tableau de bord des ventes            — à garder hors ligne
install.sh                 installation complète, VPS vierge (Docker+nginx+TLS)
install-caddy.sh           installation en cohabitation, sans toucher à la façade
verifier-installation.sh   recette automatique, à lancer après installation
sauvegarder.sh             sauvegarde vérifiée du volume et du .env
outils/comparer-eucast.py  confronte les seuils au tableau EUCAST officiel
outils/verifier-tables.py  concordance des deux tables de seuils (lancé par la CI)
deploy/Caddyfile.phenobac  bloc à ajouter à un Caddyfile existant
Dockerfile / docker-compose.yml
.github/workflows/deploy.yml   vérification de syntaxe puis déploiement SSH
```

`admin.html` et `dashboard.html` ne sont **jamais** copiés dans `public/` :
ouvrez-les depuis votre poste et pointez-les vers l'URL du site. Ils ne
contiennent aucun secret, le jeton admin est saisi à l'ouverture.

Ces deux pages appellent des points d'entrée ouverts à toutes les origines, pour
qu'elles fonctionnent depuis un simple fichier local. Ce n'est pas un
relâchement : ils exigent le jeton d'administration dans un en-tête, jamais un
cookie, et répondent 401 sans lui quelle que soit l'origine. Les points d'entrée
qui portent la valeur — moteur d'interprétation, vérification de licence —
restent réservés à `SITE_URL`.

## Modèle

| | Gratuit | Premium |
|---|---|---|
| Identification biochimique, 37 espèces | oui, hors-ligne | oui |
| Interprétation experte | E. coli, S. aureus | 37 espèces |
| Saisie par CMI et seuils paramétrables | non | oui |
| Export PDF, banque d'entraînement extensible | non | oui |

Tarifs par défaut : 5 000 FCFA / mois, 48 000 FCFA / an. Ils s'affichent depuis
`PRICING` dans `phenobac.html` et sont acceptés par le serveur via
`PHENOBAC_PRICE_MAP` — les deux doivent concorder, voir MISE-EN-VENTE.md.

## Configuration

Toute la configuration passe par `.env` — partez de [`.env.example`](.env.example).
Deux avertissements :

- **Ne changez jamais `PHENOBAC_SECRET`** une fois des licences vendues : toutes
  les clés en circulation deviennent invalides d'un coup.
- **Sauvegardez le volume `phenobac-data`.** Il contient les licences émises et
  les révocations. Sans lui vos clients gardent leurs clés, mais vous perdez la
  comptabilité et la capacité de révoquer.

## Référentiel des concentrations critiques

La version déclarée figure dans la constante `REFERENTIEL` (identique dans
`phenobac.html` et `premium-interpret.js`), s'affiche dans l'éditeur de seuils
et **sur le compte-rendu**. Son champ `etat` dit la vérité sur ces seuils :
`a_valider` tant qu'ils n'ont pas été confrontés au tableau officiel, `valide`
ensuite. Ne le passez à `valide` qu'après confrontation réelle.

Chaque janvier, EUCAST publie une nouvelle version. Pour la répercuter :

```bash
python3 outils/comparer-eucast.py v_16.1_Breakpoint_Tables.xlsx
```

Le rapport confronte chaque seuil de l'application à la ligne officielle. Il ne
modifie rien : les écarts et les cas à arbitrer (un même antibiotique a
plusieurs lignes selon la voie et l'indication) relèvent du biologiste.

Deux conventions retenues, à revoir si votre pratique diffère :

- **Voie d'administration** : la ligne **intraveineuse** sert de référence. Un
  antibiogramme est rendu sans connaître la voie qui sera prescrite, et c'est la
  ligne générale du tableau. Les lignes orales, notamment « uncomplicated UTI »,
  supposent une indication que le laboratoire ne connaît pas.
- **Prélèvement méningé** : traité à part, par la table `BP_MENINGE` et la
  question posée à la saisie — les deux jeux coexistent au lieu qu'on choisisse.

**Un groupe de seuils = une espèce (ou un genre) du tableau EUCAST.** Les
groupes larges d'origine ont été scindés : `staph` en *S. aureus* et
coagulase-négative ; `strep` en groupes A/C/G, groupe B et viridans ; `fastid`
en *H. influenzae*, *N. meningitidis*, *N. gonorrhoeae* et *M. catarrhalis* ;
`grampos` en *Listeria* et *Corynebacterium* ; `curved` en *Campylobacter* et
*Vibrio* ; `nonferm` en *S. maltophilia* et *B. cepacia* ; `anaerobe` en
*B. fragilis*, *C. perfringens* et *C. difficile*. Vingt-trois groupes, chacun
tiré d'une seule feuille officielle.

`outils/comparer-eucast.py` **refuse** de comparer un groupe qui couvrirait
plusieurs feuilles. Ce garde-fou n'est pas théorique : comparer l'ancien
`grampos` (Listeria, Corynebacterium) à la feuille des streptocoques avait
produit trois seuils faux.

**Seuils sans équivalent officiel.** EUCAST ne fixe aucun seuil pour certaines
associations : *Burkholderia cepacia* (la feuille l'indique explicitement),
l'oxacilline et la céfoxitine sur staphylocoque (tests de dépistage), la
gentamicine haut niveau chez l'entérocoque, les aminopénicillines sur
streptocoque A/B/C/G. Les valeurs employées par PhénoBac y sont des conventions
de laboratoire, pas des seuils EUCAST, et le rapport de confrontation les
signale comme telles.

## Avertissement d'usage

PhénoBac propose une interprétation d'orientation fondée sur les phénotypes
usuels. La validation biologique reste sous la responsabilité du biologiste, et
la version du référentiel suivi doit être affichée aux utilisateurs.
