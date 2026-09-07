#!/usr/bin/env bash
# install.sh — installation complète de PhénoBac sur un VPS Ubuntu/Debian.
# Docker + nginx + Let's Encrypt + secrets + démarrage. Idempotent.
#
# Usage :  sudo bash install.sh
#   ou en non-interactif :  sudo DOMAIN=phenobac.mondomaine.ovh LETSENCRYPT_EMAIL=vous@mail.com bash install.sh
#
# À lancer depuis le dossier de l'app (server.js, docker-compose.yml, phenobac.html…).

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOMAIN="${DOMAIN:-}"
EMAIL="${LETSENCRYPT_EMAIL:-}"

log(){ printf "\033[1;36m==>\033[0m %s\n" "$*"; }
err(){ printf "\033[1;31mErreur:\033[0m %s\n" "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || err "Lancez ce script avec sudo (droits root requis)."

cd "$APP_DIR"
[ -f server.js ] && [ -f docker-compose.yml ] || err "Lancez ce script depuis le dossier de l'app (server.js et docker-compose.yml attendus)."
[ -f phenobac.html ] || err "phenobac.html introuvable dans $APP_DIR."

[ -n "$DOMAIN" ] || read -rp "Domaine (ex. phenobac.mondomaine.ovh) : " DOMAIN
[ -n "$DOMAIN" ] || err "Domaine requis."
[ -n "$EMAIL" ]  || read -rp "E-mail pour Let's Encrypt : " EMAIL
[ -n "$EMAIL" ]  || err "E-mail requis."

# --- Docker ---
if ! command -v docker >/dev/null 2>&1; then
  log "Installation de Docker…"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || err "Plugin 'docker compose' manquant (installez docker-compose-plugin)."

# --- nginx + certbot ---
log "Installation de nginx et certbot…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx openssl

# --- fichiers publics ---
log "Préparation de public/ (admin.html reste hors de public/)…"
mkdir -p public
cp -f phenobac.html public/
[ -f success.html ] && cp -f success.html public/ || true
# PWA : manifeste, service worker et icônes
cp -f manifest.webmanifest service-worker.js public/ 2>/dev/null || true
cp -f icon-192.png icon-512.png icon-maskable-512.png apple-touch-icon.png public/ 2>/dev/null || true

# --- secrets (.env) ---
if [ ! -f .env ]; then
  log "Génération des secrets (.env)…"
  cat > .env <<EOF
PHENOBAC_SECRET=$(openssl rand -hex 32)
PHENOBAC_ADMIN_TOKEN=$(openssl rand -hex 32)
PHENOBAC_WEBHOOK_SECRET=$(openssl rand -hex 24)
STORE_BACKEND=file
DATA_DIR=/data
SITE_URL=https://$DOMAIN
# Origines autorisées à appeler l'API (vide = repli sur SITE_URL).
ALLOWED_ORIGINS=https://$DOMAIN
# Barème "montant_FCFA:jours". Doit correspondre aux tarifs affichés dans l'app.
PHENOBAC_PRICE_MAP=5000:30,48000:365
# Fenêtre de récupération de la clé par référence de paiement (heures).
CLAIM_WINDOW_HOURS=48
# Connecteur du prestataire de paiement (voir lib/psp.js et MISE-EN-VENTE.md).
WEBHOOK_AUTH=token
WEBHOOK_AUTH_HEADER=x-webhook-token
PHENOBAC_WEBHOOK_DEBUG=0
SMS_API_URL=
SMS_API_KEY=
SMS_SENDER=PhenoBac
PORT=8080
EOF
  chmod 600 .env
else
  log ".env déjà présent — conservé (secrets inchangés)."
fi

# --- build & run ---
log "Construction et démarrage du conteneur…"
docker compose up -d --build

# --- nginx (façade) ---
log "Configuration de nginx pour $DOMAIN…"
cat > /etc/nginx/sites-available/phenobac <<EOF
server {
    server_name $DOMAIN;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
ln -sf /etc/nginx/sites-available/phenobac /etc/nginx/sites-enabled/phenobac
nginx -t && systemctl reload nginx

# --- HTTPS (Let's Encrypt) ---
log "Obtention du certificat HTTPS…"
if ! certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect; then
  log "certbot n'a pas abouti (DNS pas encore propagé ?). Réessayez plus tard : certbot --nginx -d $DOMAIN"
fi

# --- attente santé ---
sleep 2
if curl -fsS "http://127.0.0.1:8080/healthz" >/dev/null 2>&1; then
  HEALTH="OK"
else
  HEALTH="à vérifier (docker compose logs -f)"
fi

ADMIN_TOKEN="$(grep '^PHENOBAC_ADMIN_TOKEN=' .env | cut -d= -f2-)"

printf "\n\033[1;32m======== PhénoBac installé ========\033[0m\n"
cat <<EOF
  Application     : https://$DOMAIN
  Santé (local)   : $HEALTH
  Jeton admin     : $ADMIN_TOKEN
    -> à saisir dans admin.html (gardez ce fichier hors du serveur)

  Webhook PSP     : https://$DOMAIN/.netlify/functions/payment-webhook
  Redirection PSP : https://$DOMAIN/success.html

  Logs        : docker compose logs -f
  Mise à jour : docker compose up -d --build
  Données     : volume 'phenobac-data' (licences + révocations) — à sauvegarder
===================================
EOF

