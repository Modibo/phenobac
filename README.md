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
outils/classeur.py         lecture d'un .xlsx (partagé par les comparateurs)
outils/pdfpos.py           lecture positionnelle d'un PDF (tableaux du CA-SFM)
outils/comparer-eucast.py  confronte les seuils au tableau EUCAST officiel
outils/comparer-zit.py     confronte les zones d'incertitude technique aux deux sources
outils/verifier-tables.py  concordance des deux copies des tables (lancé par la CI)
outils/verifier-naturelles.py  les résistances naturelles suivent le document EUCAST (idem)
outils/essai-referentiel.js  changer de référentiel change bien le rendu (idem)
outils/essai-debit.js      la limitation de débit se comporte comme annoncé
outils/essai-banque.js     la banque d'entraînement concorde avec le moteur (idem)
outils/essai-glass.js      l'export de surveillance suit le manuel GLASS (idem)
REFERENTIEL-CASFM.md       les différences CA-SFM appliquées, page par page
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

## Référentiels

Deux référentiels sont proposés dans l'application, encadré « Antibiogramme ».
Le choix est mémorisé d'une session à l'autre.

**EUCAST v16.1** — le socle. **CA-SFM 2026** — l'EUCAST assorti des différences
françaises. PhénoBac ne recopie que ces différences : tout couple absent des
tables `BP_CASFM*` garde sa valeur EUCAST. C'est la règle du document source, et
c'est ce qui rend l'écart vérifiable plutôt que d'avoir deux référentiels
entiers à tenir en parallèle.

Le choix n'est pas cosmétique : il déplace des seuils (vancomycine sur
*S. aureus*, pénicilline G sur les streptocoques A/C/G, cotrimoxazole selon le
site) et il change la lecture interprétative — l'EUCAST ne réinterprète plus les
céphalosporines en cas de BLSE, le CA-SFM le fait, et rend les carbapénèmes
résistants dès qu'une carbapénémase est confirmée. Quand une catégorie est ainsi
modifiée, le compte-rendu porte **la catégorie rendue et la catégorie lue**,
avec le motif : on ne masque jamais la mesure.

Les molécules de recours que ces différences mettent en jeu sont au panel :
**témocilline** et **céfidérocol** chez les entérobactéries multirésistantes,
**daptomycine** chez les cocci à Gram positif, **minocycline** chez
*Acinetobacter* et *S. maltophilia*, **moxifloxacine** chez les anaérobies et
les germes respiratoires. Chaque seuil vient d'un référentiel : quand seul le
CA-SFM en fixe un, l'éditeur marque le couple « hors EUCAST » sous l'autre
référentiel.

S'y ajoutent les **zones d'incertitude technique** (ZIT chez le CA-SFM, ATU chez
l'EUCAST) : quatre couples pour lesquels la valeur mesurée tombe si près du
seuil que la catégorie n'est plus reproductible. PhénoBac les signale — pastille
« ZIT » sur la ligne, alerte dans l'interprétation — et **ne dégrade jamais une
catégorie de lui-même** : l'EUCAST le permet parmi d'autres options, le CA-SFM
l'écarte expressément, et la décision revient au biologiste.

Le détail, différence par différence et avec sa page dans le document officiel,
est dans **[REFERENTIEL-CASFM.md](REFERENTIEL-CASFM.md)** — y compris la liste
des différences que PhénoBac ne reprend pas encore, et pourquoi.

```bash
python3 outils/verifier-tables.py      # les deux copies des tables concordent
node outils/essai-referentiel.js       # le choix du référentiel change le rendu
```

### Concentrations critiques

**EUCAST v16.1, juin 2026 — aligné.** Tous les seuils que le référentiel définit
sont conformes : 0 écart, 0 cas en attente d'arbitrage, contrôlés par
`outils/comparer-eucast.py` contre le classeur officiel.

Les 89 seuils qu'EUCAST **ne définit pas** — *Burkholderia cepacia*, pour lequel
la feuille indique explicitement qu'aucun seuil n'est fixé ; l'oxacilline et la
céfoxitine sur staphylocoque, qui sont des tests de dépistage ; la gentamicine
haut niveau chez l'entérocoque ; les aminopénicillines sur streptocoque A/B/C/G
— sont des **conventions de laboratoire**. Ils restent utilisables, mais
l'éditeur de seuils les marque « hors EUCAST » pour qu'on ne les confonde pas.

Un groupe de seuils correspond à **une espèce ou un genre du tableau officiel**,
jamais à plusieurs : 27 groupes, dont *Salmonella*, les Morganellaceae et
*Serratia* séparés des autres entérobactéries, parce qu'EUCAST leur donne des
seuils propres. Le comparateur refuse de comparer un groupe qui couvrirait
plusieurs feuilles.

Chaque janvier, EUCAST publie une nouvelle version. Pour la répercuter :

```bash
python3 outils/comparer-eucast.py v_17.0_Breakpoint_Tables.xlsx
python3 outils/proposer-scission.py v_17.0_Breakpoint_Tables.xlsx
```

Le premier confronte chaque seuil à la ligne officielle, le second propose les
valeurs d'un groupe à partir de la bonne feuille. Ni l'un ni l'autre ne modifie
quoi que ce soit : les écarts se relisent avant d'être portés.

**Conventions retenues**, à revoir si votre pratique diffère : ligne
**intraveineuse** et infection **systémique** comme référence — un antibiogramme
est rendu sans connaître la voie ni le site ; **hors méningite** et **hors
endocardite** pour le rendu courant, les seuils méningés étant appliqués
automatiquement quand le prélèvement est déclaré LCR.

## Résistances naturelles et contrôle de cohérence

Chaque germe déclare les antibiotiques auxquels il est **naturellement
résistant**, transcrits du document officiel EUCAST *Expected Resistant
Phenotypes* v1.2 (janvier 2023) et restreints aux antibiotiques que PhénoBac
teste. Chaque entrée cite la règle dont elle vient — 2.7 pour *P. aeruginosa*,
4.11 pour *Listeria*, etc. La transcription est conservée dans
`outils/naturelles.py`.

Ces antibiotiques **apparaissent d'eux-mêmes dans la liste de saisie**, sous
« Résistances naturelles attendues », même s'ils ne figurent pas au panel
habituel du germe. C'est la condition du contrôle : un antibiotique qu'on ne
peut pas saisir ne peut pas être contredit. Rendre « sensible » un antibiotique
naturellement inactif déclenche alors une alerte d'incohérence, qui invite à
vérifier l'identification, la saisie, ou les deux.

Le panel effectif est **calculé**, jamais recopié dans les 37 germes : déclarer
une résistance naturelle suffit à la faire apparaître à la saisie.

## Sécurité

Ce que l'installation pose d'elle-même, sans réglage :

- **En-têtes** émis par `server.js` — politique de sécurité du contenu,
  `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
  Ils sont dans l'application et non dans le Caddyfile, qui sert plusieurs
  sites : une erreur d'édition les retirerait à tous.
- **Limitation de débit** par IP : 240 requêtes/minute sur les endpoints
  ouverts, 60 sur les endpoints sensibles et le webhook. Réglable par
  `RATE_LIMIT_PUBLIC` et `RATE_LIMIT_SENSIBLE`. Le dépassement renvoie 429
  avec `Retry-After`.
- **Aucune donnée patient ne quitte le navigateur.** La requête
  d'interprétation ne porte que l'espèce, les résultats, le contexte et le
  référentiel. Le numéro d'échantillon et le nom du valideur restent côté
  client et ne servent qu'au compte-rendu, fabriqué localement.
- `admin.html` et `dashboard.html` ne sont jamais copiés dans `public/`.

Une limite à connaître : les scripts de l'application sont **en ligne dans la
page**, si bien que la politique de sécurité du contenu doit conserver
`script-src 'unsafe-inline'`. Elle n'empêche donc pas une injection de
s'exécuter — ce sont `connect-src 'self'`, `img-src` et `form-action 'none'`
qui la privent de tout canal de sortie. Pour bloquer l'exécution elle-même,
il faudrait extraire les scripts dans un fichier séparé et passer à
`script-src 'self'` : un changement de structure, pas un réglage.

Pour éprouver la limitation en conditions réelles, après déploiement :

```bash
for i in $(seq 1 260); do
  curl -s -o /dev/null -w "%{http_code} " -X POST \
    https://votre-domaine/.netlify/functions/premium-interpret \
    -H 'Content-Type: application/json' \
    -d '{"organism":"ecoli","mode":"sir","results":{"AMX":"R"},"ctx":{}}'
done; echo
```

Les premières réponses sont des `200`, les dernières des `429`.

## Resistance Detective

Un bouton **« Pourquoi ? »** sous le verdict déroule le raisonnement en sept
étapes : ce qui a été mesuré → les seuils appliqués → les résistances
naturelles de l'espèce → les cohérences et les incohérences → le phénotype
compatible → ce qui permettrait de trancher → l'interprétation proposée.

Rien n'y est recalculé : tout vient du moteur, remis dans l'ordre du
raisonnement. **L'ordre est l'explication** — c'est lui qui montre que le
phénotype découle des observations, et non l'inverse.

Une étape n'existait nulle part ailleurs : **les seuils réellement
appliqués**. Quand le laboratoire saisit 10 mm, c'est une règle précise qui en
fait un « R », et cette règle a une charge de disque, une source, une version
et une date :

```
Amoxicilline · 10 mm · S ≥ 14 · R < 14 mm · disque 10 µg · R
Breakpoint tables… v16.1 — publiée le 2026-06-24 · base de connaissances 2026.10
```

En mode S/I/R, le panneau le dit franchement : les catégories ont été saisies
telles qu'elles ont été lues, aucun seuil n'a été appliqué. Montrer un seuil
qui n'a pas servi serait trompeur.

Le raisonnement se **copie en texte**, pour le dossier ou pour un
enseignement.

## Contrôles de cohérence

Quatre niveaux, nommés à l'écran — **information**, **à vérifier**, **alerte
majeure**, **interprétation impossible**. Une alerte sans degré se lit comme
toutes les autres, et l'on finit par n'en lire aucune.

Ce qui est vérifié :

- **un inhibiteur ne peut pas rendre l'association moins active** que la
  molécule seule. Amoxicilline sensible et amoxicilline-clavulanate résistante
  est une impossibilité mécanistique — sauf chez *Enterobacter*, *Klebsiella
  aerogenes*, *Serratia* et *Citrobacter freundii*, où le clavulanate **induit**
  la céphalosporinase. Le même profil y est donc *expliqué*, pas reproché ;
- **céfoxitine et oxacilline en désaccord** : elles dépistent la même
  résistance, la céfoxitine fait référence, et une confirmation s'impose ;
- **plusieurs résistances naturelles contredites** : une seule est une erreur
  de saisie, plusieurs ensemble évoquent une identification erronée.
  L'interprétation est alors déclarée **non sécurisée**, et le bandeau passe
  devant le verdict — § 25 : l'absence de conclusion vaut mieux qu'une
  conclusion fausse.

**Une alerte ne modifie jamais une donnée brute.** La lecture interprétative,
elle, en modifie — mais elle est déclarée, montrée à côté du résultat lu, et
motivée. C'est l'inverse d'un silence. Le banc le vérifie.

Ce qui n'est **pas** fait, et qu'il vaut mieux dire : la pureté de la culture
et la validité du milieu ne se déduisent pas d'un antibiogramme. Les inventer
aurait produit des alertes sans fondement, ce qui apprend aux utilisateurs à
les ignorer — le pire résultat possible pour une alerte.

`outils/essai-coherence.js` éprouve chaque contrôle **dans les deux sens** :
un cas qui doit l'allumer, un cas voisin qui ne doit pas.

## Pourquoi ce phénotype

Le moteur ne rend plus seulement une conclusion : il rend le chemin qui y
mène — **arguments en faveur**, **éléments discordants**, **niveau de
confiance**, et le test qui permettrait de trancher.

Les critères sont énoncés **au point de décision**, dans la branche même qui
les teste. C'est délibéré : une grille écrite à part finirait par décrire
autre chose que ce que le moteur fait, et un raisonnement faux présenté comme
une explication est pire qu'une conclusion sans explication.

Trois niveaux, adossés à ce qu'on a en main :

| | |
|---|---|
| **confirmé** | un test de confirmation figure au dossier et l'appuie |
| **probable** | le profil est complet et rien ne le contredit |
| **possible** | un élément discorde, ou une molécule clé n'a pas été testée |

« Possible » n'est pas un demi-échec : c'est l'état normal d'un antibiogramme
incomplet, et le dire vaut mieux que de conclure quand même. Le niveau figure
aussi **sur le compte rendu**, à côté du verdict, avec ce qu'il faudrait pour
trancher — un phénotype seulement possible ne doit pas se lire comme une
affirmation.

`outils/essai-banque.js` confronte chaque grille aux 55 antibiogrammes de la
banque : un argument qui citerait une catégorie que la souche ne porte pas
fait échouer le banc. Les éléments discordants, eux, sont comptés et affichés
sans être sanctionnés — une BLSE accompagnée d'une imperméabilité atteint la
céfoxitine, et le dire est juste.

Seize phénotypes portent une grille à ce jour. Le banc annonce la couverture
à chaque exécution, et nomme les espèces qui n'en ont pas : elle se complète
sans qu'on ait à s'en souvenir.

## Les règles sont des données

`base-connaissances.js` **fait foi** : 578 règles, une par ligne, chacune
identifiée par cinq coordonnées — référentiel, groupe bactérien, antibiotique,
méthode, site — et portant ce qui en découle : seuils, charge du disque, zone
d'incertitude, molécule témoin, seuil de dépistage, statut officiel ou
conventionnel.

Le moteur n'écrit plus aucun seuil : il reconstruit ses tables depuis cette
base au chargement. **Mettre à jour un référentiel ne demande donc plus de
toucher à l'application.**

Vingt-et-une tables imbriquées se sont réduites à une seule, parce que la
plupart n'étaient pas des règles distinctes mais des *attributs* d'un même
couple : la charge du disque, la zone d'incertitude et le statut « hors
référentiel » accompagnent un seuil, ils ne vivent pas à côté de lui.

Une subtilité qui vaut d'être retenue : **`null` et l'absence ne sont pas la
même chose**. `null` en S signifie qu'aucune catégorie « sensible » n'est
accordée à posologie standard — une décision du comité. L'absence signifie
qu'il n'y a pas de seuil du tout. Les confondre ferait de la ligne de
l'amoxicilline, qui ne porte qu'un renvoi vers le disque d'ampicilline, un
seuil `{S:null, R:null}`, et le renvoi serait perdu.

La page ne redéclare plus rien : elle emprunte au moteur les tables qu'il a
bâties. `ORG` fait exception — la page le construit, mais par **fusion** de ce
que le moteur sait d'une espèce (famille de raisonnement, groupe de seuils,
résistances naturelles) et de ce qu'elle-même en affiche (nom, panel,
questions de contexte). `outils/verifier-tables.py` échoue si la page reprend à
son compte un champ du raisonnement.

**Provenance.** Chaque référentiel porte son document, sa version et sa date de
publication ; la base porte la sienne (`BASE_VERSION`). `PhenoBacMoteur.regleDe()`
retrouve la règle employée par ses coordonnées — c'est elle que l'interface
citera pour répondre à « pourquoi ? ».

## Où vit le raisonnement

`moteur.js` porte l'intégralité du raisonnement phénotypique, et **rien
d'autre** : ni licence, ni réseau, ni secret, ni écriture. Il est chargé par
les deux côtés.

| | charge | rôle |
|---|---|---|
| `phenobac.html` | `<script>` base puis moteur | interprète **sur le poste**, sans réseau |
| `netlify/functions/premium-interpret.js` | `require("../../moteur")` | expose le même calcul en API |

L'ordre compte : le moteur reconstruit ses tables depuis la base au
chargement, et la page emprunte ensuite ces tables au moteur.

Il n'existe donc qu'un exemplaire du raisonnement, et les deux chemins ne
peuvent pas diverger. La fonction serveur est passée de 1 934 à 95 lignes et
ne contient plus aucune règle d'interprétation.

**Pourquoi le moteur a quitté le serveur.** Il y était tenu par un « verrou
dur » : hors du navigateur, on ne pouvait pas l'extraire sans licence. C'était
cohérent tant que PhénoBac était payant. Il ne l'est plus, et le verrou ne
protégeait donc plus rien — il continuait en revanche d'empêcher un
laboratoire sans connexion stable d'interpréter son antibiogramme, c'est-à-dire
exactement ce que l'application existe pour faire.

**Cloisonnement.** `moteur.js` est enfermé dans sa propre fonction et n'expose
que `PhenoBacMoteur`. Ce n'est pas une précaution de principe : la page et le
moteur déclarent 44 noms identiques, et deux `const has` au même niveau font
échouer le script **entier** de la page. `outils/verifier-tables.py` échoue si
ce cloisonnement disparaît.

**Déploiement.** `moteur.js` doit être copié à deux endroits — à la racine pour
`require`, et dans `public/` pour le navigateur. `install-caddy.sh` et le
`Dockerfile` s'en chargent ; le service worker le met en cache, sans quoi
l'application s'ouvrirait hors ligne sans pouvoir interpréter.

## Surveillance de la résistance (GLASS)

Le moteur d'interprétation **n'enregistre rien**. Le seul chemin par lequel un
résultat est conservé est un **versement volontaire** : un bouton sous le
commentaire, qui ouvre une fiche montrant ce qui partira avant de l'envoyer.

Ce qui est transmis : espèce, antibiogramme, prélèvement, phénotype, code du
laboratoire, date, et un **compteur patient anonyme** que le laboratoire
choisit — il ne sert qu'à la déduplication que l'OMS impose. Le numéro
d'échantillon du compte rendu et le nom du valideur ne quittent jamais le
navigateur.

L'export suit le **manuel GLASS-AMR de l'OMS**, jeu de variables individuelles
(annexes 3 à 5). Trois conséquences à connaître :

- GLASS ne surveille que **onze germes prioritaires** sur les trente-sept que
  PhénoBac interprète, et **quatre sites** sur sept. Les autres isolats sont
  conservés dans le registre local mais écartés de l'export : un fichier
  portant un code hors liste serait rejeté.
- La liste d'antibiotiques est également fermée. Vancomycine, clindamycine,
  linézolide et doxycycline n'en font pas partie.
- Deux variables — **ESBL** et **ResultCarbapenemases** — demandent
  précisément ce que le moteur détermine. Là où la plupart des laboratoires
  déclarent « inconnu », PhénoBac répond. C'est le seul endroit où
  l'application apporte à la surveillance autre chose qu'une transcription.

La déduplication suit la règle du manuel : **premier isolat** par patient, par
espèce, par site et par année. Sans elle, un patient prélevé chaque semaine
pèserait dix fois dans les taux et les fausserait vers le haut.

Export, réservé au jeton d'administration :

```bash
curl -s -X POST https://votre-domaine/.netlify/functions/surveillance \
  -H "Authorization: Bearer $PHENOBAC_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"exporter"}' -o phenobac-glass.csv
```

`{"action":"compter"}` donne les effectifs sans produire le fichier.

### Période de collecte

Un registre garde tout ce qu'on lui a versé, **essais de mise en route
compris**. Deux dates facultatives restreignent l'export à la période où la
collecte réelle a commencé :

```bash
curl -s -X POST https://votre-domaine/.netlify/functions/surveillance \
  -H "Authorization: Bearer $PHENOBAC_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"exporter","depuis":"2026-10-01"}' -o phenobac-glass.csv
```

`depuis` et `jusqu_a` s'écrivent en **AAAA-MM-JJ**, bornes incluses, et
fonctionnent aussi avec `compter` — lequel renvoie alors `totalRegistre` à
côté de `total`, pour qu'on voie ce que le filtre écarte au lieu de le croire
sans effet. Une date d'un autre format est **refusée** (400) : un filtre
silencieusement inopérant exporterait précisément ce qu'on cherchait à
écarter, et l'erreur ne se verrait qu'après transmission à l'OMS.

Le filtre s'applique **avant** la déduplication, et l'ordre n'est pas
indifférent : un isolat écarté parce qu'il précède la période ne doit plus
masquer celui du même patient à l'intérieur. Dans l'ordre inverse, exclure un
essai reviendrait à exclure aussi le vrai isolat qui le suit —
`outils/essai-glass.js` contrôle ce point précis.

Le nom du fichier porte la période, pour que deux exports côte à côte se
distinguent sans qu'on ait à les ouvrir.

## Avertissement d'usage

PhénoBac propose une interprétation d'orientation fondée sur les phénotypes
usuels. La validation biologique reste sous la responsabilité du biologiste, et
la version du référentiel suivi doit être affichée aux utilisateurs.
