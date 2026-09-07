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
| Envoi de la clé par SMS | fait — **la passerelle reste à brancher** |
| Récupération de la clé sur `success.html` | fait |
| Relances avant expiration | fait — reste à programmer le cron |
| Tableau de bord des ventes | fait |
| API réservée à votre domaine (CORS) | fait — via `SITE_URL` / `ALLOWED_ORIGINS` |

Ce qui suit est donc court, mais **aucune vente n'est possible tant que les points 2 et 3
ne sont pas faits** : sans connecteur de paiement, aucune licence n'est émise.

---

## 2. Brancher le prestataire de paiement (obligatoire)

Choisissez un agrégateur qui couvre Orange Money et Moov Money au Mali (PayDunya,
CinetPay, Sama Money, ou l'API opérateur en direct). Deux fonctions à adapter dans
`netlify/functions/payment-webhook.js` — elles sont isolées et commentées :

**`authenticate(event)`** — prouver que l'appel vient bien du prestataire.
Par défaut, un jeton partagé dans l'en-tête `X-Webhook-Token`, comparé à
`PHENOBAC_WEBHOOK_SECRET`. Si votre prestataire signe le corps (HMAC), vérifiez la
signature ; s'il ne propose rien, rappelez son API pour reconfirmer la transaction —
c'est la méthode la plus sûre, et la seule qui protège d'un faux webhook.

**`parsePayment(body)`** — extraire `status`, `amount`, `ref`, `contact` du format du
prestataire. Faites un premier paiement réel de test, relevez le corps exact reçu, et
calez les noms de champs dessus.

Puis, dans l'espace du prestataire :

- URL de webhook : `https://VOTRE-DOMAINE/.netlify/functions/payment-webhook`
- URL de retour client : `https://VOTRE-DOMAINE/success.html`
  (le prestataire doit y transmettre la référence en `?ref=…`)

### Vérifier sans attendre un vrai paiement

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

---

## 3. Brancher la passerelle SMS (fortement recommandé)

Sans elle, le client doit revenir sur `success.html` avec sa référence : cela marche,
mais chaque friction coûte des ventes. Adaptez `sendSMS()` dans
`netlify/functions/lib/deliver.js` (URL, en-tête d'authentification, format du corps),
puis renseignez `SMS_API_URL`, `SMS_API_KEY`, `SMS_SENDER` dans `.env`.

Avec `SITE_URL` renseigné, le SMS contient un **lien court** vers `success.html?ref=…`
plutôt que la clé complète : un seul segment SMS au lieu de plusieurs.

---

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
