# PhénoBac — de l'application au chiffre d'affaires

Ce document ne répète pas `DEPLOY-VPS.md` (comment mettre en ligne) : il liste ce qui
reste à faire pour **encaisser une première vente**, dans l'ordre, et comment vérifier
que chaque maillon fonctionne avant d'annoncer le produit.

---

## 1. Ce qui est déjà en place

| Maillon | État |
|---|---|
| Licences signées (HMAC-SHA256), expiration, révocation | fait |
| Moteur d'interprétation gardé côté serveur (402 sans licence valide) | fait |
| Activation de la clé dans l'application | fait — vérification serveur, plus de code de démonstration |
| Émission automatique après paiement | fait — **le connecteur du prestataire reste à écrire** |
| Envoi de la clé par SMS | fait — connecteur paramétrable, **passerelle à choisir** |
| Récupération de la clé sur `success.html` | fait |
| Relances avant expiration | fait — reste à programmer le cron |
| Tableau de bord des ventes | fait |
| API réservée à votre domaine (CORS) | fait — via `SITE_URL` / `ALLOWED_ORIGINS` |

Ce qui suit est donc court, mais **aucune vente n'est possible tant que les points 2 et 3
ne sont pas faits** : sans connecteur de paiement, aucune licence n'est émise.

---

## 2. Brancher le prestataire de paiement (obligatoire)

Aucun format n'est codé en dur : le connecteur (`netlify/functions/lib/psp.js`)
se règle par variables d'environnement, sans toucher au code. Un profil
`PSP=<nom>` fournit les valeurs par défaut d'un prestataire donné ; toute
variable `WEBHOOK_*` que vous renseignez l'emporte sur le profil.

### 2.0 PayDunya

Profil livré et testé. Dans `.env` :

```
PSP=paydunya
PAYDUNYA_MASTER_KEY=…      # tableau de bord PayDunya
PAYDUNYA_PRIVATE_KEY=…
PAYDUNYA_TOKEN=…
PAYDUNYA_MODE=test         # puis "live" une fois la recette faite
```

Il n'y a rien d'autre à régler : le profil sait que l'IPN de PayDunya est un
formulaire à clés imbriquées (`data[invoice][token]`, `data[customer][phone]`…)
et où lire chaque champ.

**Pourquoi on ne se fie pas au `hash` de l'IPN.** PayDunya joint à son appel un
`data[hash]` dérivé de votre clé maîtresse. C'est une valeur **fixe** : elle ne
dépend pas du contenu de l'appel, donc quiconque l'observe une fois peut la
rejouer avec un montant ou un statut de son choix. Le profil authentifie donc
autrement : il rappelle PayDunya sur `/checkout-invoice/confirm/{token}` et ne
croit que cette réponse. Conséquence utile au passage — **c'est le montant
confirmé par PayDunya qui décide de la durée**, pas celui annoncé dans l'IPN.
Vérifié : un IPN annonçant 100 FCFA sur une facture réellement payée 48 000
délivre bien 365 jours, et un IPN prétendant un succès sur une facture annulée
n'émet rien.

**À vérifier de votre côté**, sur votre tableau de bord PayDunya et sur le
premier IPN réel — ces valeurs viennent de la documentation du prestataire et
peuvent évoluer :

- l'URL de confirmation et sa base sandbox (`WEBHOOK_CONFIRM_URL` les redéfinit
  sans toucher au code) ;
- le nom exact des champs de l'IPN, si le décodage ne donne rien.

Le § 2.2 ci-dessous montre comment le constater en une minute. Si un champ ne
tombe pas juste, le connecteur ne perd pas le paiement : il le consigne et vous
le signale au tableau de bord.

### 2.1 Si vous changez de prestataire : comment il prouve que l'appel vient de lui

Regardez sa documentation et choisissez `WEBHOOK_AUTH` :

| Le prestataire… | `WEBHOOK_AUTH` | À renseigner |
|---|---|---|
| envoie un jeton fixe dans un en-tête | `token` | `WEBHOOK_AUTH_HEADER`, `PHENOBAC_WEBHOOK_SECRET` |
| signe le corps de la requête (HMAC-SHA256) | `hmac` | `WEBHOOK_AUTH_HEADER`, `WEBHOOK_HMAC_ENCODING`, `WEBHOOK_HMAC_PREFIX`, `PHENOBAC_WEBHOOK_SECRET` |
| ne signe rien, mais expose une API d'état | `confirm` | `WEBHOOK_CONFIRM_URL` (avec `{ref}`), `WEBHOOK_CONFIRM_AUTH` |

**Préférez `confirm` dès qu'il est possible.** Dans ce mode, le contenu du
webhook ne fait pas foi : on rappelle le prestataire pour lui demander l'état
réel de la transaction, et c'est le montant qu'il confirme qui décide de la
durée. Un faux webhook, même parfaitement formé, n'émet alors rien.

### 2.2 Calibrer sur un vrai paiement

Ne réglez pas les champs d'après la documentation : elle est souvent en retard
sur ce que le prestataire envoie réellement. Faites un paiement de test du plus
petit montant possible, et lisez ce qui arrive.

```bash
# 1. Allumer la journalisation de calibrage
sed -i 's/^PHENOBAC_WEBHOOK_DEBUG=.*/PHENOBAC_WEBHOOK_DEBUG=1/' .env
docker compose up -d

# 2. Faire le paiement de test, puis lire ce qui a été reçu
docker compose logs --tail=50 | grep phenobac
```

Vous verrez le corps exact et les champs que le connecteur en a tirés :

```
[phenobac] webhook reçu — corps : {"event":"payment.completed","data":{…}}
[phenobac] champs extraits : {"status":"completed","amount":5000,"ref":"TX-8891","contact":"+223…"}
```

Si les quatre champs sont bons, il n'y a rien à faire : les noms usuels ont
suffi. Sinon, désignez-les par un chemin pointé dans `.env` — sans modifier le
code :

```
WEBHOOK_FIELD_STATUS=data.transaction.state
WEBHOOK_FIELD_AMOUNT=data.amount.value
WEBHOOK_FIELD_REF=data.invoice.token
WEBHOOK_FIELD_CONTACT=data.customer.msisdn
```

Si le statut de succès porte un nom inattendu (`OK`, `00`, `VALIDATED`…),
ajoutez-le à `WEBHOOK_SUCCESS_VALUES`.

**Éteignez `PHENOBAC_WEBHOOK_DEBUG` une fois le calibrage fini** : ces journaux
contiennent les coordonnées de vos clients.

### 2.3 Rien n'est perdu pendant le réglage

Un webhook que le connecteur n'arrive pas à décoder n'est pas jeté : il est
conservé, corps compris, et apparaît au tableau de bord dans « Paiements à
traiter » avec le motif *webhook non décodé*. Vous voyez donc immédiatement que
le connecteur est mal réglé, et aucun client n'a payé pour rien — vous émettez
sa licence à la main pendant que vous ajustez.

### 2.4 Déclarer les URL chez le prestataire

- Webhook : `https://VOTRE-DOMAINE/.netlify/functions/payment-webhook`
- Retour client : `https://VOTRE-DOMAINE/success.html`
  (le prestataire doit y transmettre la référence en `?ref=…`)

### 2.5 Vérifier sans attendre un vrai paiement

Avec PayDunya, servez-vous du bac à sable (`PAYDUNYA_MODE=test`) : la facture
est réelle, l'argent ne l'est pas. Avec un prestataire réglé en mode `token` :

```bash
curl -s -X POST https://VOTRE-DOMAINE/.netlify/functions/payment-webhook \
  -H "X-Webhook-Token: VOTRE_PHENOBAC_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"status":"SUCCESS","amount":5000,"reference":"TEST-001","customer":{"phone":"+223XXXXXXXX"}}'
```

Réponse attendue : `{"ok":true,"issued":true,"reference":"TEST-001",…}`, puis

```bash
curl -s "https://VOTRE-DOMAINE/.netlify/functions/claim-license?ref=TEST-001"
```

doit renvoyer la clé. Collez-la dans l'application : Premium doit s'activer.
Pensez ensuite à révoquer cette licence de test (voir § 6).

## 3. Brancher la passerelle SMS (fortement recommandé)

Sans SMS, le client doit revenir sur `success.html` avec sa référence. Cela
marche — mais il ne dispose alors que de 48 heures (§ 7), et chaque friction
coûte des ventes. Avec `SITE_URL` renseigné, le SMS contient un **lien court**
vers `success.html?ref=…` plutôt que la clé entière : un seul segment SMS au
lieu de plusieurs.

Comme pour le paiement, aucun format n'est codé en dur. Deux profils sont
fournis (`SMS_PROFILE=twilio` ou `africastalking`) ; pour toute autre
passerelle, décrivez la forme de son appel :

| La passerelle attend… | Réglage |
|---|---|
| du JSON avec un jeton `Bearer` | valeurs par défaut |
| un formulaire | `SMS_BODY_FORMAT=form` |
| des paramètres d'URL en GET | `SMS_METHOD=GET` |
| une authentification Basic (identifiant + mot de passe) | `SMS_AUTH=basic`, `SMS_API_USER`, `SMS_API_KEY` |
| une clé dans un en-tête à elle | `SMS_AUTH=header`, `SMS_AUTH_HEADER=…` |
| d'autres noms de champs | `SMS_FIELD_TO`, `SMS_FIELD_FROM`, `SMS_FIELD_TEXT` |
| des champs en plus (identifiant de compte…) | `SMS_EXTRA={"username":"votre_compte"}` |

`{sid}` dans `SMS_API_URL` est remplacé par `SMS_API_USER`, pour les passerelles
dont l'identifiant de compte fait partie de l'URL.

### 3.1 Calibrer sans consommer de crédits

Mettez `SMS_DRY_RUN=1` : rien n'est envoyé, mais la requête est construite et
journalisée. Puis servez-vous de l'endpoint de test — il est réservé au jeton
admin :

```bash
curl -s -X POST https://VOTRE-DOMAINE/.netlify/functions/send-test-sms \
  -H "Authorization: Bearer VOTRE_JETON_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"to":"70 00 00 00"}'
```

La réponse montre exactement ce qui part — verbe, URL, champs — et ce que la
passerelle a répondu. Ajustez les `SMS_*` jusqu'à ce que cela corresponde à sa
documentation, puis remettez `SMS_DRY_RUN=0` et refaites l'appel : vous devez
recevoir le SMS.

Les numéros locaux sont acceptés : `70 00 00 00` devient `+22370000000`
(`SMS_COUNTRY_CODE`, défaut `+223`).

### 3.2 Les passerelles qui échouent en répondant « 200 »

Certaines répondent `200 OK` tout en signalant l'échec dans le corps
(« crédit insuffisant »…). Renseignez `SMS_SUCCESS_MATCH` avec un fragment de
texte présent **uniquement** en cas de succès : sans lui, ces envois seraient
comptés comme réussis alors que le client n'a rien reçu.

### 3.3 Un SMS non remis se voit

Le tableau de bord porte une colonne **SMS** sur chaque vente : *remis*,
*pas de n°*, *refusé*, *non configuré*, *injoignable*… Une clé qui n'est jamais
parvenue à son acheteur est un problème commercial, pas un détail technique :
c'est la première colonne à regarder après une vente.

Un échec d'envoi n'empêche jamais l'émission de la licence — le client peut
toujours récupérer sa clé sur `success.html`.

## 4. Fixer les tarifs — à deux endroits, qui doivent concorder

| Où | Quoi |
|---|---|
| `phenobac.html`, objet `PRICING` | ce que le client **voit** (prix mensuel, annuel, lien de paiement) |
| `.env`, `PHENOBAC_PRICE_MAP` | ce que le serveur **accepte**, au format `montant:jours` |

Valeurs livrées : `5000:30,48000:365` — soit 5 000 FCFA/mois et 48 000 FCFA/an,
ce qui correspond à l'affichage de l'application.

> Un montant reçu qui ne figure pas dans le barème **n'émet pas de licence**. Le
> paiement n'est plus perdu pour autant : il apparaît dans « Paiements à traiter » sur
> `dashboard.html`, à régler à la main via `admin.html`. Surveillez cette liste les
> premières semaines : si votre prestataire prélève sa commission avant de vous
> notifier, les montants reçus ne tomberont pas juste, et il faudra ajuster le barème.

`PRICING.buyUrl` (dans `phenobac.html`) accepte le lien de paiement du prestataire :
renseigné, la modale d'achat affiche un bouton direct ; laissé vide, elle se contente
d'expliquer que la clé arrive par SMS.

---

## 5. Mise en ligne

```bash
sudo DOMAIN=phenobac.votre-domaine.ovh LETSENCRYPT_EMAIL=vous@exemple.ml bash install.sh
```

Le script installe Docker, nginx et Let's Encrypt, génère les secrets dans `.env`,
prépare `public/` et démarre le conteneur. Il affiche à la fin votre **jeton admin** :
notez-le, il n'est plus réaffiché.

`admin.html` et `dashboard.html` ne sont **pas** copiés dans `public/` : ouvrez-les
depuis votre machine (double-clic) et pointez-les vers l'URL du site. Ils ne
contiennent aucun secret ; le jeton admin est saisi à l'ouverture.

---

## 6. Recette avant la première vente

À dérouler dans l'ordre, sur le site en ligne :

1. **Le gratuit fonctionne hors licence.** E. coli, mode S/I/R : l'interprétation
   s'affiche. Une espèce Premium : cadenas et modale d'achat.
2. **Le verrou tient.** Videz le `localStorage`, choisissez une espèce Premium :
   l'interprétation doit rester indisponible. Le moteur étant côté serveur, patcher la
   page ne doit rien débloquer.
3. **La CMI est bien Premium.** En gratuit, le mode « CMI 🔒 » ouvre la modale ; même
   forcé, le serveur répond 402.
4. **Une clé valide active Premium.** Émettez-en une (§ ci-dessous), collez-la.
5. **Une clé expirée est refusée.** Émettez `{"days":1}`, attendez, ou testez avec une
   clé bricolée : le message doit dire « Licence expirée ».
6. **La révocation coupe l'accès.** Révoquez la clé, rechargez : retour en gratuit.
7. **Le hors-ligne tient 7 jours.** Coupez le réseau : Premium reste actif si une
   vérification a réussi récemment (`GRACE_DAYS` dans `phenobac.html`), puis retombe.
8. **Le tableau de bord affiche la vente.** Ouvrez `dashboard.html` avec le jeton admin.

**Émettre une licence à la main** (c'est aussi ce que vous ferez pour un client qui
paie en espèces, ou pour une démonstration) :

```bash
curl -s -X POST https://VOTRE-DOMAINE/.netlify/functions/issue-license \
  -H "Authorization: Bearer VOTRE_JETON_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"sub":"labo-mopti@exemple.ml","days":365,"amount":48000}'
```

`amount` ne sert qu'à la comptabilité du tableau de bord — renseignez-le, sinon la
vente apparaîtra à 0 FCFA.

**Révoquer** (clé compromise, remboursement, licence de test) :

```bash
curl -s -X POST https://VOTRE-DOMAINE/.netlify/functions/revoke-license \
  -H "Authorization: Bearer VOTRE_JETON_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"action":"revoke","token":"LA_CLE_COMPLETE","reason":"test"}'
```

---

## 7. Exploitation courante

**Relances avant expiration.** Programmez un appel quotidien (crontab de l'hôte) :

```
17 8 * * * curl -fsS -X POST https://VOTRE-DOMAINE/.netlify/functions/send-reminders -H "X-Cron-Secret: VOTRE_JETON_ADMIN" >/dev/null
```

Chaque licence n'est relancée qu'une fois (marqueur `reminded`). Fenêtre par défaut :
5 jours avant l'échéance (`REMINDER_DAYS`).

**« Je n'arrive plus à récupérer ma clé ».** La page `success.html` ne rend la clé
que dans les 48 heures suivant l'encaissement (`CLAIM_WINDOW_HOURS`) : passé ce
délai, la référence de paiement ne suffit plus. C'est voulu — une référence de
paiement se devine parfois. La licence du client, elle, reste valide : renvoyez-lui
la clé depuis `dashboard.html` (colonne « Ventes récentes »), ou réémettez-en une
avec `issue-license` en reprenant la durée restante.

**Sauvegarde.** Tout tient dans le volume Docker `phenobac-data` : licences et
révocations. Sans lui, vos clients gardent leurs clés (elles restent valides) mais vous
perdez la comptabilité et la capacité de révoquer.

```bash
docker run --rm -v phenobac-data:/data -v "$PWD":/sauvegarde alpine \
  tar czf /sauvegarde/phenobac-$(date +%F).tar.gz -C /data .
```

**Ne changez jamais `PHENOBAC_SECRET`** une fois des licences vendues : cela invalide
toutes les clés en circulation, d'un coup.

---

## 8. Ce qui n'est pas du code, et qu'il faut trancher avant de vendre

Ces points ne bloquent aucune ligne de programme, mais bloquent une vente propre :

- **Statut du produit.** PhénoBac interprète des antibiogrammes : c'est une aide à la
  décision biologique. Écrivez noir sur blanc, dans l'application et dans vos
  conditions de vente, que l'interprétation reste sous la responsabilité du biologiste,
  et vérifiez ce que la réglementation malienne et les référentiels que vous suivez
  (CASFM / EUCAST) imposent en matière de version et de traçabilité.
- **Version des référentiels.** Affichez la version du référentiel utilisée et sa date.
  C'est la première question que posera un laboratoire, et c'est aussi votre argument
  d'abonnement : les tables changent chaque année.
- **Conditions générales de vente et facture.** Durée, renouvellement, remboursement,
  nombre de postes couverts par une clé. La clé est aujourd'hui liée à un `sub` (e-mail
  ou téléphone), pas à un appareil : rien n'empêche techniquement un laboratoire de
  l'utiliser sur plusieurs postes. Décidez si c'est un défaut à corriger ou une
  souplesse à assumer — et dites-le dans vos CGV.
- **Données personnelles.** L'application n'envoie au serveur que l'espèce et les
  résultats d'antibiogramme : aucune donnée nominative de patient ne sort du poste.
  C'est un argument de vente, dites-le. En revanche vous conservez, côté serveur, le
  téléphone ou l'e-mail de vos clients : prévoyez une mention et une durée de
  conservation.
