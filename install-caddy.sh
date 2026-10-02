#!/usr/bin/env bash
# install-caddy.sh — installer PhénoBac sur un serveur qui sert DÉJÀ un site.
#
# Contrairement à install.sh, ce script ne touche ni à nginx, ni à Caddy, ni aux
# certificats, ni au DNS. Il se contente de faire tourner PhénoBac en conteneur,
# écoutant sur la loopback. C'est votre serveur web de façade déjà en place qui
# l'exposera, quand vous aurez un domaine.
#
# Rien de ce qui tourne sur la machine n'est modifié. Aucun port public n'est
# ouvert. Le script est idempotent : relancez-le sans crainte.
#
# Usage :  bash install-caddy.sh
#          HOST_PORT=8090 bash install-caddy.sh    # pour imposer un port

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

log(){ printf "\033[1;36m==>\033[0m %s\n" "$*"; }
avert(){ printf "\033[1;33mAttention:\033[0m %s\n" "$*"; }
err(){ printf "\033[1;31mErreur:\033[0m %s\n" "$*" >&2; exit 1; }

[ -f server.js ] && [ -f docker-compose.yml ] || err "Lancez ce script depuis le dossier de l'application."
[ -f phenobac.html ] || err "phenobac.html introuvable dans $APP_DIR."

# --- Docker ---------------------------------------------------------------
command -v docker >/dev/null 2>&1 || err "Docker n'est pas installé. Installez-le, puis relancez :  curl -fsSL https://get.docker.com | sudo sh"
docker compose version >/dev/null 2>&1 || err "Le plugin 'docker compose' est manquant (paquet docker-compose-plugin)."
docker info >/dev/null 2>&1 || err "Le démon Docker ne répond pas. Démarrez-le (sudo systemctl start docker), ou ajoutez-vous au groupe 'docker'."

# --- Choix d'un port libre sur la loopback --------------------------------
port_occupe(){
  if command -v ss >/dev/null 2>&1; then ss -ltnH 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1\$"
  elif command -v lsof >/dev/null 2>&1; then lsof -iTCP:"$1" -sTCP:LISTEN -n -P >/dev/null 2>&1
  else return 1; fi
}

PORT="${HOST_PORT:-}"
if [ -z "$PORT" ] && [ -f .env ]; then
  PORT="$(sed -n 's/^HOST_PORT=//p' .env | tail -1)"
fi
if [ -z "$PORT" ]; then
  PORT=8080
  while port_occupe "$PORT" && [ "$PORT" -lt 8130 ]; do
    avert "le port $PORT est déjà pris sur cette machine — j'essaie le suivant"
    PORT=$((PORT+1))
  done
fi
log "PhénoBac écoutera sur 127.0.0.1:$PORT (loopback uniquement)."

# --- Fichiers publics -----------------------------------------------------
# admin.html et dashboard.html restent DÉLIBÉRÉMENT hors de public/ :
# ils ne doivent pas être servis par le serveur web.
log "Préparation de public/…"
mkdir -p public
cp -f phenobac.html public/
# Le moteur d'interprétation est servi au navigateur : sans lui, la page se
# charge et n'interprète rien.
cp -f moteur.js public/
[ -f success.html ] && cp -f success.html public/ || true
cp -f manifest.webmanifest service-worker.js public/ 2>/dev/null || true
cp -f icon-192.png icon-512.png icon-maskable-512.png apple-touch-icon.png public/ 2>/dev/null || true

# --- Secrets --------------------------------------------------------------
if [ ! -f .env ]; then
  command -v openssl >/dev/null 2>&1 || err "openssl est requis pour engendrer les secrets."
  log "Génération des secrets (.env)…"
  cat > .env <<FIN
PHENOBAC_SECRET=$(openssl rand -hex 32)
PHENOBAC_ADMIN_TOKEN=$(openssl rand -hex 32)
PHENOBAC_WEBHOOK_SECRET=$(openssl rand -hex 24)
STORE_BACKEND=file
DATA_DIR=/data
PORT=8080
HOST_PORT=$PORT

# À renseigner quand le domaine existera : sans SITE_URL, l'API reste ouverte
# à toutes les origines et les SMS ne contiennent pas de lien court.
SITE_URL=
ALLOWED_ORIGINS=

PHENOBAC_PRICE_MAP=5000:30,48000:365
CLAIM_WINDOW_HOURS=48

# Paiement — PayDunya. Commencez en mode test.
PSP=paydunya
PAYDUNYA_MASTER_KEY=
PAYDUNYA_PRIVATE_KEY=
PAYDUNYA_TOKEN=
PAYDUNYA_MODE=test
PHENOBAC_WEBHOOK_DEBUG=0

# SMS — à choisir. SMS_DRY_RUN=1 permet de calibrer sans consommer de crédits.
SMS_PROFILE=generic
SMS_API_URL=
SMS_API_KEY=
SMS_API_USER=
SMS_SENDER=PhenoBac
SMS_COUNTRY_CODE=+223
SMS_DRY_RUN=0
FIN
  chmod 600 .env
else
  log ".env déjà présent — conservé (secrets inchangés)."
  # Aligner HOST_PORT sans toucher au reste.
  if grep -q '^HOST_PORT=' .env; then
    sed -i.bak "s/^HOST_PORT=.*/HOST_PORT=$PORT/" .env && rm -f .env.bak
  else
    printf 'HOST_PORT=%s\n' "$PORT" >> .env
  fi
fi

# --- Démarrage ------------------------------------------------------------
# Si PROXY_NETWORK est renseigné, le conteneur doit rester sur le réseau du
# serveur de façade : la surcouche est indispensable. L'oublier sort PhénoBac
# de ce réseau et le site répond 502.
COMPOSE=(docker compose -f docker-compose.yml)
if grep -q '^PROXY_NETWORK=.\+' .env 2>/dev/null; then
  COMPOSE+=(-f docker-compose.caddy.yml)
  log "Réseau de façade détecté : la surcouche docker-compose.caddy.yml est utilisée."
fi

log "Construction et démarrage du conteneur…"
"${COMPOSE[@]}" up -d --build

log "Attente de la sonde de santé…"
SANTE="à vérifier"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then SANTE="OK"; break; fi
  sleep 2
done

ADMIN="$(sed -n 's/^PHENOBAC_ADMIN_TOKEN=//p' .env | tail -1)"

printf "\n\033[1;32m======== PhénoBac est en service ========\033[0m\n"
cat <<FIN
  Écoute        : http://127.0.0.1:$PORT   (loopback — rien n'est public)
  Santé         : $SANTE
  Jeton admin   : $ADMIN
    -> à saisir dans admin.html et dashboard.html, gardés hors du serveur

  RIEN N'EST ENCORE ACCESSIBLE DE L'EXTÉRIEUR. C'est voulu : aucun domaine
  n'est configuré, et votre site existant n'a pas été touché.

  Pour y jeter un œil depuis votre poste, sans rien exposer, ouvrez un tunnel :
      ssh -L $PORT:127.0.0.1:$PORT VOTRE_COMPTE@VOTRE_SERVEUR
  puis http://127.0.0.1:$PORT dans votre navigateur.

  QUAND VOUS AUREZ UN DOMAINE :
   1. Créez un enregistrement DNS A vers l'adresse de ce serveur.
   2. Ajoutez à votre Caddyfile le bloc de deploy/Caddyfile.phenobac
      (sous-domaine et port $PORT à ajuster), puis :
          sudo caddy validate --config /etc/caddy/Caddyfile
          sudo systemctl reload caddy
   3. Renseignez SITE_URL et ALLOWED_ORIGINS dans .env, puis :
          docker compose up -d
      Tant que SITE_URL est vide, l'API accepte toutes les origines.

  Logs        : docker compose logs -f
  Mise à jour : git pull && bash install-caddy.sh
                (le script recopie public/ et reprend la surcouche réseau ;
                 un simple « docker compose up --build » ne ferait ni l'un
                 ni l'autre)
  Données     : volume Docker (licences + révocations) — à sauvegarder
FIN
