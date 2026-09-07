# PhénoBac — passer de la démo au verrou réel

> **Auto-hébergement (VPS OVH) :** ce guide décrit le déploiement sur **Netlify**. Si vous hébergez sur votre propre serveur, suivez plutôt **DEPLOY-VPS.md** — le même code est réutilisé via `server.js`, seul le stockage passe de Netlify Blobs au fichier local.


Ce dossier transforme le freemium « de démonstration » (verrou dans le HTML, contournable) en un verrou **vérifié côté serveur**, avec des fonctions Netlify. Trois fichiers :

- `netlify/functions/verify-license.js` — vérifie une licence signée (public).
- `netlify/functions/issue-license.js` — génère une licence (réservé à vous).
- `netlify/functions/premium-interpret.js` — **verrou dur** : le moteur premium, gardé par licence.
- `netlify/functions/payment-webhook.js` — émission automatique après paiement (webhook du PSP).
- `netlify/functions/claim-license.js` — remet la licence au client via sa référence de paiement.
- `netlify/functions/lib/deliver.js` — envoi de la clé au client par SMS (module partagé).
- `netlify/functions/lib/revocation.js` — liste de révocation (module partagé).
- `netlify/functions/lib/http.js` — CORS verrouillé + authentification admin (module partagé).
- `netlify/functions/revoke-license.js` — révoquer / restaurer / lister (endpoint admin).
- `netlify/functions/stats.js` — agrégats de ventes pour le tableau de bord (endpoint admin).
- `dashboard.html` — tableau de bord des ventes (revenu, licences actives, expirations, révocations).
- `success.html` — page de retour après paiement : affiche la clé et les instructions.
- `phenobac-license.js` — le branchement côté client. **Déjà appliqué** dans
  `phenobac.html` : ce fichier n'est conservé qu'à titre de référence.

**Pour vendre**, la suite pratique est dans **`MISE-EN-VENTE.md`** : brancher le
prestataire de paiement et la passerelle SMS, fixer les tarifs, dérouler la recette.

## L'idée en une image

```
   Client (phenobac.html sur Netlify)
        |  saisit sa clé de licence
        v
   POST /.netlify/functions/verify-license   ---(secret côté serveur)
        |                                          verify(HMAC) + exp
        v
   { valid:true, plan:"premium", exp:... }  --> l'app débloque Premium
```

Vous, de votre côté, après un paiement reçu :

```
   POST /.netlify/functions/issue-license  (Authorization: Bearer ADMIN)
        |  { sub:"labo@client.ml", days:365 }
        v
   { license:"xxxxx.yyyyy" }  --> vous envoyez cette clé au client
```

## Le point honnête : verrou « mou » vs verrou « dur »

Une clé signée empêche de **fabriquer** une fausse licence (le secret reste sur le serveur). Mais tant que la **logique premium** (catégorisation CMI, moteur complet, génération du compte-rendu) vit dans le JavaScript de la page, quelqu'un de technique peut patcher le client pour ignorer la réponse `valid:false`. C'est un verrou **mou** : parfait contre le partage grand public, insuffisant contre un utilisateur déterminé.

Pour un verrou **dur**, il faut que la valeur ne soit jamais livrée sans preuve d'achat :

- **Version gratuite** : moteur limité (E. coli, S. aureus), côté client, hors-ligne.
- **Version premium** : le calcul sensible passe par une fonction serveur qui exige une licence valide. Le raisonnement premium ne quitte jamais le serveur → réellement protégé.

Ce verrou dur est fourni et fonctionnel : **`netlify/functions/premium-interpret.js`**. Le moteur d'interprétation complet (11 espèces, phénotypes, catégorisation CMI) y est porté à l'identique de l'application, précédé d'une vérification de licence :

```
POST /.netlify/functions/premium-interpret
{ license, organism, mode:"sir"|"mic", results|mic, ctx, bpOverride }
   -> licence invalide : 402 Payment Required
   -> licence valide   : { interpretation:{sev,name,mech,alerts,rules,comment}, categories }
```

Côté client, pour les cas premium (espèces verrouillées, mode CMI), remplacez le calcul local par un appel serveur :

```js
async function interpretRemote(payload) {
  let lic = "";
  try { lic = localStorage.getItem("phenobac_license") || ""; } catch (e) {}
  const r = await fetch("/.netlify/functions/premium-interpret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ license: lic, ...payload })
  });
  if (r.status === 402) { openUpgrade("Votre licence n'est plus valide."); return null; }
  const data = await r.json();
  return data.interpretation;   // à afficher tel quel dans le panneau d'interprétation
}
// payload = { organism, mode, results | mic, ctx, bpOverride }
```

Ce qui reste **volontairement** côté client : les libellés d'antibiotiques et la composition des panels (pour dessiner le formulaire de saisie). Ce ne sont pas le cœur de valeur ; le raisonnement, lui, est côté serveur.

Contrepartie : le premium devient **en ligne** (le gratuit reste hors-ligne). À vous de trancher selon vos utilisateurs à Mopti. Voie intermédiaire raisonnable : garder l'affichage client mais faire du serveur la seule source du **raisonnement** des espèces premium et de la **catégorisation CMI**.

## Mise en place (15 min)

1. Placez le dossier `netlify/` à la racine de votre dépôt, à côté de `phenobac.html`.
2. Dans **Netlify > Site settings > Environment variables**, ajoutez :
   - `PHENOBAC_SECRET` : une longue chaîne aléatoire (par ex. `openssl rand -hex 32`).
   - `PHENOBAC_ADMIN_TOKEN` : un autre secret, connu de vous seul.
3. (Optionnel) `netlify.toml` à la racine :
   ```
   [build]
     functions = "netlify/functions"
   ```
4. Déployez. Vos fonctions vivent sur `https://VOTRE-SITE.netlify.app/.netlify/functions/...`.
5. Dans `phenobac.html`, intégrez `phenobac-license.js` : remplacez `let PLAN = loadPlan();` par un appel à `checkLicense()`, et remplacez la fonction `activate()` de démonstration par celle du fichier. Retirez `PRICING.demoCode`.

## Émettre une licence après paiement

```
curl -X POST https://VOTRE-SITE.netlify.app/.netlify/functions/issue-license \
  -H "Authorization: Bearer VOTRE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "sub": "labo-mopti@exemple.ml", "days": 365 }'
```

La `license` renvoyée est la clé à transmettre au client. Il la colle dans « Activer », le client la vérifie, Premium s'active.

## Paiement adapté au Mali (à vérifier selon l'offre du moment)

- **Démarrage pragmatique — activation manuelle.** Le client paie par **mobile money** (Orange Money, Moov Money, Wave), vous envoie la référence de transaction, vous émettez la licence avec `issue-license`. Zéro intégration, idéal pour valider le marché avant d'automatiser.
- **Automatisation ensuite.** Un agrégateur qui expose une API mobile money (selon disponibilité au Mali), ou une passerelle « merchant of record » (type Paddle / LemonSqueezy) pour la carte et l'international. Le webhook de paiement appelle `issue-license` automatiquement.

> Les disponibilités et conditions des prestataires changent : vérifiez l'état actuel avant de choisir.

## Limiter le partage de clés

Une même clé peut être partagée entre plusieurs personnes. Selon vos enjeux :

- **Expiration courte + renouvellement** (déjà géré par `exp`) : une clé partagée finit par expirer.
- **Lier au client** : mettez son e-mail dans `sub` et affichez-le, ce qui décourage le partage.
- **Liaison appareil** : stockez un identifiant d'appareil à la première activation et refusez au-delà de N appareils (nécessite une petite base : Netlify Blobs, Supabase…).
- **Compte + connexion** : la voie la plus robuste (auth Supabase/Firebase, statut d'abonnement en base), à envisager quand le volume le justifie.

## Ce qui reste à faire de votre côté

- Restreindre le CORS de `verify-license.js` à l'origine exacte de votre site (remplacer `"*"`).
- Décider verrou mou (rapide) ou dur (déplacer le moteur premium côté serveur).
- Choisir le canal de paiement et, si automatisé, brancher son webhook sur `issue-license`.

---

## Émission automatique après paiement mobile money

Trois fichiers automatisent la vente de bout en bout, sans intervention manuelle :

- `netlify/functions/payment-webhook.js` — reçoit la notification du prestataire, émet la licence, la stocke.
- `netlify/functions/claim-license.js` — renvoie la licence au client via sa référence de paiement.
- `success.html` — page de retour après paiement : récupère et affiche la clé, avec les instructions d'activation.

### Le flux

```
Client paie (Orange Money / Moov / Wave via un agrégateur)
      |  1. le PSP encaisse
      v
payment-webhook  <-- webhook du PSP (paiement confirmé)
      |  2. authentifie, mappe le montant -> durée, émet la licence
      |  3. stocke la licence sous la référence (Netlify Blobs)
      v
Le client est redirigé vers success.html?ref=REFERENCE
      |  4. la page appelle claim-license?ref=...
      v
La clé s'affiche -> le client la colle dans PhénoBac
```

### Prestataires adaptés au Mali

- **PayDunya** (agrégateur) expose des endpoints dédiés **Orange Money Mali** (`softpay/orange-money-mali`) et **Moov Mali** (`moov-ml`), en XOF, avec webhooks. C'est la voie la plus rapide pour couvrir plusieurs opérateurs via une seule intégration.
- **Orange Money Web Payment / M-Payment** est disponible en direct au Mali (Orange Developer), mais l'onboarding marchand est plus lourd.

Les disponibilités et conditions évoluent : vérifiez l'état actuel et les frais avant de choisir.

### Mise en place

1. Ajoutez la variable d'environnement `PHENOBAC_WEBHOOK_SECRET` (secret partagé avec le PSP pour authentifier ses appels).
2. Dans le tableau de bord du PSP, réglez l'URL de notification sur `.../.netlify/functions/payment-webhook` et l'URL de redirection sur `.../success.html`.
3. `payment-webhook.js` utilise **Netlify Blobs** pour le stockage (`@netlify/blobs`) — disponible d'office dans les fonctions Netlify récentes ; sinon `npm i @netlify/blobs`.
4. Alignez `PRICE_MAP` (montant FCFA → durée) sur vos tarifs.

### Les deux points à ADAPTER au PSP (balisés dans le code)

- **`authenticate(event)`** — comment prouver que l'appel vient bien du PSP. Le modèle fourni compare un jeton d'entête ; certains PSP signent le corps (HMAC), d'autres imposent de reconfirmer la transaction via leur API (le plus sûr).
- **`parsePayment(body)`** — les noms des champs (statut, montant, référence, contact) varient d'un PSP à l'autre ; la fonction gère déjà les formes courantes (`amount`, `reference`/`transaction_id`, `customer.phone`…) et l'enveloppe `data`.

Le webhook est **idempotent** (un rejeu ne réémet pas) et répond toujours 200 sur un paiement traité, pour éviter les relances en boucle du PSP.

### Livraison directe de la clé (SMS)

En plus de la page de succès, la clé est **envoyée au client par SMS** dès l'émission, via le module partagé `netlify/functions/lib/deliver.js` (appelé par le webhook).

- Par défaut le SMS contient un **lien court** vers `success.html?ref=...` (la clé y est déjà stockée) : plus court et moins cher qu'un token complet, qui occuperait plusieurs segments SMS. Sans `SITE_URL`, la clé brute est envoyée.
- Variables d'environnement : `SMS_API_URL`, `SMS_API_KEY`, `SMS_SENDER`, `SITE_URL`.
- Point à **adapter** : la fonction `sendSMS()` utilise un format générique (`POST { to, from, message }` + clé API en entête). Ajustez-la à votre passerelle SMS.
- Sans téléphone (client identifié par e-mail) ou sans passerelle configurée, **aucune erreur bloquante** : le client récupère sa clé sur `success.html`. Le webhook reste idempotent (pas de SMS en double si le PSP rejoue la notification) et trace le résultat de l'envoi (`sms: true/false`).

Pour un envoi par e-mail ou WhatsApp, ajoutez une branche dans `deliver()` sur le même modèle.

---

## Révocation de licences

Une licence signée est valide jusqu'à son expiration. Pour la **bloquer avant** (clé compromise, remboursement, litige), une liste de révocation est consultée à chaque vérification.

- `netlify/functions/lib/revocation.js` — module partagé (liste stockée dans Netlify Blobs).
- `netlify/functions/revoke-license.js` — endpoint admin (jeton requis) : révoquer, restaurer, lister.
- Contrôle branché dans `verify-license.js` **et** `premium-interpret.js` : une licence révoquée renvoie `reason: "revoked"` et perd l'accès Premium.

Chaque licence émise porte désormais un identifiant unique `jti`, ce qui permet deux granularités :

- **Par licence** — vous collez la clé, seule cette licence est bloquée (les autres licences du même client restent valides).
- **Par client** — vous indiquez le `sub`, toutes ses licences sont bloquées d'un coup.

Depuis la **console admin** (`admin.html`, carte 04) : collez une clé ou un identifiant client, un motif optionnel, puis « Révoquer ». La liste des licences révoquées se charge à la demande, avec restauration possible. Chaque licence de l'historique a aussi un bouton « Révoquer » direct.

En ligne de commande :

```
curl -X POST https://VOTRE-SITE.netlify.app/.netlify/functions/revoke-license \
  -H "Authorization: Bearer VOTRE_ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{ "action": "revoke", "sub": "labo@client.ml", "reason": "remboursement" }'
```

> Nuance à connaître : la révocation prend effet à la **prochaine vérification en ligne**. Si vous avez conservé une tolérance hors-ligne côté client (`GRACE_DAYS` dans `phenobac-license.js`), une licence révoquée peut rester active jusqu'à la fin de cette fenêtre. Réduisez la fenêtre si la révocation immédiate est critique.
