# Déployer PhénoBac depuis votre téléphone

Objectif : tout gérer sans ordinateur. La **première installation** se fait via une app SSH (une seule fois). Ensuite, chaque mise à jour se déclenche **d'un bouton** depuis GitHub.

---

## Ce qu'il vous faut (une fois)

- Une **app SSH** : Termius ou Blink (iPhone), Termius / JuiceSSH / Termux (Android).
- Les **accès de votre VPS OVH** : l'adresse IP et l'utilisateur (souvent `root` ou `ubuntu`) avec son mot de passe, fournis par OVH.
- Votre **dépôt GitHub privé** contenant les fichiers du projet (le contenu du dossier de sortie).

---

## Étape 1 — Première installation (app SSH, une seule fois)

1. **Connectez-vous au VPS** dans l'app SSH : adresse IP, utilisateur, mot de passe OVH.

2. **Récupérez le code.** Pour un dépôt privé, créez d'abord un jeton GitHub depuis le navigateur du téléphone :
   github.com → votre photo → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → accès **lecture** au dépôt. Copiez le jeton, puis dans l'app SSH :

   ```bash
   sudo apt-get update && sudo apt-get install -y git
   sudo git clone https://VOTRE_JETON@github.com/UTILISATEUR/DEPOT.git /opt/phenobac
   ```

3. **Lancez l'installation tout-en-un :**

   ```bash
   cd /opt/phenobac
   sudo DOMAIN=phenobac.votredomaine.ovh LETSENCRYPT_EMAIL=vous@mail.com bash install.sh
   ```

   Le script installe Docker, nginx et le HTTPS, génère les secrets, prépare les fichiers publics (PWA comprise) et démarre l'application. **À la fin, il affiche votre jeton admin et l'URL — notez-les.**

4. **Vérifiez :** ouvrez `https://phenobac.votredomaine.ovh` dans le navigateur du téléphone. L'app doit répondre.

> Le jeton GitHub n'est utile que pour ce premier clone : les mises à jour suivantes ne passent plus par git sur le VPS (voir étape 2). Vous pouvez le révoquer ensuite.

---

## Étape 2 — Activer le déploiement automatique (une seule fois)

**a) Créez une clé de déploiement** (app SSH, sur le VPS) :

```bash
ssh-keygen -t ed25519 -f ~/deploy_key -N ""
cat ~/deploy_key.pub >> ~/.ssh/authorized_keys
cat ~/deploy_key          # affiche la clé PRIVÉE — sélectionnez tout et copiez
```

**b) Enregistrez les secrets** (navigateur mobile) :
github.com → votre dépôt → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Créez :

- `SSH_HOST` = l'IP de votre VPS
- `SSH_USER` = votre utilisateur (`root` ou autre)
- `SSH_KEY` = collez la **clé privée** copiée à l'étape (a)
- `SSH_PORT` = seulement si différent de 22

**c) Si vous n'êtes pas `root`,** autorisez Docker pour votre utilisateur (app SSH) :

```bash
sudo usermod -aG docker $USER   # puis reconnectez-vous
```

---

## Au quotidien — 100 % téléphone, sans terminal

- **Redéployer / relancer** : github.com → dépôt → onglet **Actions** → « Déploiement PhénoBac » → **Run workflow**. GitHub teste, reconstruit et redéploie sur le VPS.
- **Modifier un texte, un prix…** : github.com → ouvrez le fichier → crayon ✏️ → modifiez → **Commit** sur `main`. Le déploiement démarre automatiquement.
- **Suivre ou dépanner** (app SSH) : voir le mémo ci-dessous.

---

## Mémo commandes VPS (app SSH)

```bash
cd /opt/phenobac
docker compose ps            # état du conteneur
docker compose logs -f       # journaux en direct (Ctrl-C pour quitter)
docker compose restart       # redémarrer
docker compose up -d --build # reconstruire après une modif manuelle
curl http://127.0.0.1:8080/healthz   # test de santé local
```

Sauvegarde des données (licences + révocations) :

```bash
docker run --rm -v phenobac-data:/data -v $PWD:/backup alpine \
  tar czf /backup/phenobac-data.tgz -C /data .
```

---

## Astuce

Installez la **PWA** sur votre écran d'accueil (Partager → « Sur l'écran d'accueil ») pour surveiller l'app comme une application, et gardez l'onglet **Actions** de GitHub en favori : le déploiement tient alors dans un seul geste.
