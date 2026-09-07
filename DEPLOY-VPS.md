# Déployer PhénoBac sur votre VPS OVH

Vous hébergez tout vous-même : un serveur Node (Express) sert les pages et l'API, derrière nginx en HTTPS. Aucune dépendance à Netlify. Le stockage est un simple fichier local.

Ce guide suppose un VPS **Ubuntu / Debian** et un domaine géré chez OVH.

## Arborescence à déposer sur le VPS

```
/opt/phenobac/
├── server.js
├── package.json
├── .env                      (créé à partir de .env.example — NE PAS versionner)
├── netlify/functions/        (toutes les fonctions + lib/, réutilisées telles quelles)
└── public/
    ├── phenobac.html         (l'application)
    ├── manifest.webmanifest  (PWA — installable)
    ├── service-worker.js     (PWA — coquille hors-ligne)
    ├── icon-192.png / icon-512.png / icon-maskable-512.png / apple-touch-icon.png
    └── success.html          (page de retour après paiement)
```

`admin.html` reste **en dehors de public/** (voir « Protéger l'admin »).

## 1. Pointer le domaine vers le VPS

Dans l'espace OVH (zone DNS de votre domaine), créez un enregistrement **A** vers l'IP de votre VPS (et un `AAAA` si IPv6). Attendez la propagation.

## 2. Déploiement Docker (une commande) — recommandé

Cette voie remplace les étapes 3 à 6 (installation de Node, de l'app, secrets, systemd). Il vous faut Docker et le plugin Compose sur le VPS.

Préparez `public/` (obligatoire pour l'image) et les secrets :

```bash
cd /opt/phenobac
mkdir -p public
cp phenobac.html success.html public/       # admin.html reste HORS de public/
cp manifest.webmanifest service-worker.js public/
cp icon-192.png icon-512.png icon-maskable-512.png apple-touch-icon.png public/

cp .env.example .env
openssl rand -hex 32   # -> PHENOBAC_SECRET
openssl rand -hex 32   # -> PHENOBAC_ADMIN_TOKEN
# éditez .env : secrets, PHENOBAC_WEBHOOK_SECRET, SITE_URL=https://votre-domaine.ovh, SMS si besoin
```

Construisez et lancez :

```bash
docker compose up -d --build
docker compose ps                    # "running (healthy)"
curl http://127.0.0.1:8080/healthz   # {"ok":true}
```

Le conteneur lit les secrets depuis `.env` (jamais inscrits dans l'image), stocke licences et révocations dans le volume nommé `phenobac-data` (persistant entre redémarrages et reconstructions), et ne publie son port que sur `127.0.0.1:8080` — **nginx** (étape 7) fait la façade HTTPS.

Exploitation :
- **Logs** : `docker compose logs -f`
- **Mise à jour** : remplacez les fichiers puis `docker compose up -d --build`
- **Sauvegarde** : `docker run --rm -v phenobac-data:/data -v $PWD:/backup alpine tar czf /backup/phenobac-data.tgz -C /data .`

Passez ensuite directement à l'étape 7 (nginx + HTTPS).

---

## 3. Installer Node.js (≥ 18) — voie manuelle (sans Docker)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## 4. Installer l'application

```bash
sudo mkdir -p /opt/phenobac && sudo chown $USER /opt/phenobac
# ... copiez les fichiers dans /opt/phenobac ...
cd /opt/phenobac
npm install --omit=dev

# dossier de données (licences émises, révocations) — hors du dépôt, à sauvegarder
sudo mkdir -p /var/lib/phenobac && sudo chown $USER /var/lib/phenobac
```

## 5. Configurer les secrets

```bash
cp .env.example .env
# générez deux secrets solides :
openssl rand -hex 32   # -> PHENOBAC_SECRET
openssl rand -hex 32   # -> PHENOBAC_ADMIN_TOKEN
```

Éditez `.env` : `PHENOBAC_SECRET`, `PHENOBAC_ADMIN_TOKEN`, `PHENOBAC_WEBHOOK_SECRET`, `STORE_BACKEND=file`, `DATA_DIR=/var/lib/phenobac`, `SITE_URL=https://votre-domaine.ovh`, et la passerelle SMS si vous l'utilisez.

## 6. Lancer en service permanent (systemd)

Créez `/etc/systemd/system/phenobac.service` :

```ini
[Unit]
Description=PhenoBac
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/phenobac
ExecStart=/usr/bin/node server.js
Restart=always
User=www-data
EnvironmentFile=/opt/phenobac/.env

[Install]
WantedBy=multi-user.target
```

Donnez au service l'accès au dossier de données, puis démarrez :

```bash
sudo chown -R www-data /var/lib/phenobac /opt/phenobac
sudo systemctl daemon-reload
sudo systemctl enable --now phenobac
sudo systemctl status phenobac       # doit être "active (running)"
curl http://localhost:8080/healthz   # {"ok":true}
```

## 7. nginx en façade + HTTPS

```bash
sudo apt-get install -y nginx
```

Créez `/etc/nginx/sites-available/phenobac` :

```nginx
server {
    server_name votre-domaine.ovh;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/phenobac /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# certificat Let's Encrypt (gratuit, renouvellement auto)
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d votre-domaine.ovh
```

Votre application est en ligne sur `https://votre-domaine.ovh`.

## 8. Brancher le paiement

Dans le tableau de bord de votre prestataire (PayDunya, Orange Money…) :
- URL de notification (webhook) : `https://votre-domaine.ovh/.netlify/functions/payment-webhook`
- URL de redirection après paiement : `https://votre-domaine.ovh/success.html`
- Réglez `PHENOBAC_WEBHOOK_SECRET` côté PSP et adaptez `authenticate()`/`parsePayment()` à son format.

> Astuce : les chemins `/api/<fonction>` sont des alias équivalents à `/.netlify/functions/<fonction>` si vous préférez des URL plus propres.

## 9. Protéger l'admin

`admin.html` **et** `dashboard.html` fabriquent des licences / exposent vos ventes via votre jeton : ne les exposez pas publiquement.
- Le plus simple : gardez-le **sur votre machine** (ouvrez le fichier localement) et renseignez l'URL de votre site dans le champ « URL du site ».
- Sinon, servez-le derrière une authentification nginx :

```bash
sudo apt-get install -y apache2-utils
sudo htpasswd -c /etc/nginx/.phenobac-admin votrelogin
```
```nginx
location = /admin.html {
    auth_basic "Admin PhenoBac";
    auth_basic_user_file /etc/nginx/.phenobac-admin;
    root /opt/phenobac/private;   # placez admin.html ici
}
```

## Automatisation

**Installation en un script.** Au lieu des étapes 2 à 8, depuis le dossier de l'app sur le VPS :

```bash
sudo bash install.sh
# ou sans questions :
sudo DOMAIN=phenobac.mondomaine.ovh LETSENCRYPT_EMAIL=vous@mail.com bash install.sh
```

Le script installe Docker + nginx + certbot, génère les secrets (`.env`) s'ils n'existent pas, construit et démarre le conteneur, configure nginx et le HTTPS, puis affiche votre jeton admin et les URL du webhook. Idempotent : relançable sans risque (il ne réécrit pas un `.env` existant).

**Déploiement continu (GitHub Actions).** Le workflow `.github/workflows/deploy.yml` vérifie la syntaxe puis, à chaque push sur `main`, synchronise le code sur le VPS et reconstruit le conteneur (`.env` et données préservés). Faites une première installation manuelle (ci-dessus), puis renseignez ces secrets dans le dépôt GitHub (Settings → Secrets and variables → Actions) :

- `SSH_HOST` — IP ou domaine du VPS
- `SSH_USER` — utilisateur de déploiement (membre du groupe `docker`, propriétaire de `/opt/phenobac`)
- `SSH_KEY` — clé privée SSH de déploiement (la clé publique est ajoutée à `~/.ssh/authorized_keys` sur le VPS)
- `SSH_PORT` — optionnel (22 par défaut)

Générez une clé dédiée : `ssh-keygen -t ed25519 -f deploy_key -N ""`, ajoutez `deploy_key.pub` au VPS et `deploy_key` comme secret `SSH_KEY`.

## Exploitation

- **Relances automatiques avant expiration.** La fonction `send-reminders` envoie un SMS de renouvellement aux licences expirant sous `REMINDER_DAYS` jours (défaut 5), **une seule fois** par licence. Programmez un appel quotidien depuis le cron de l'hôte :

  ```bash
  # crontab -e  (secret = PHENOBAC_CRON_SECRET de votre .env)
  0 8 * * * curl -fsS -X POST -H "X-Cron-Secret: VOTRE_SECRET_CRON" \
    https://votre-domaine.ovh/.netlify/functions/send-reminders >/dev/null 2>&1
  ```

  L'appel scanne les licences, écarte celles hors fenêtre, expirées, déjà relancées ou révoquées, envoie le SMS aux autres et les marque comme relancées. Sur Netlify, utilisez plutôt une fonction planifiée (`schedule = "0 8 * * *"` dans `netlify.toml`).

- **Logs** : `journalctl -u phenobac -f`
- **Mise à jour** : remplacez les fichiers, `npm install --omit=dev`, `sudo systemctl restart phenobac`
- **Sauvegarde** : sauvegardez `/var/lib/phenobac` (licences émises et révocations) et votre `.env`.
- **Montée en charge** : le stockage fichier suffit largement à ce volume ; si un jour nécessaire, `lib/store.js` peut être basculé vers une vraie base sans toucher au reste.

## Ce qui ne change pas

Les pages `phenobac.html`, `success.html` et `admin.html` appellent l'API en **même origine** (`API_BASE` vide) : servies depuis votre domaine, elles fonctionnent sans modification. Tout le code des fonctions est réutilisé à l'identique — seul le stockage passe de Netlify Blobs au fichier local, via `lib/store.js`.
