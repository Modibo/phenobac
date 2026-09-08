#!/usr/bin/env bash
# sauvegarder.sh — sauvegarde de ce qui ne se reconstitue pas.
#
# Deux choses, et la seconde est la plus critique :
#
#   1. Le volume de données : licences émises, révocations. Sans lui, vos clients
#      gardent leurs clés (elles restent valides) mais vous perdez la
#      comptabilité et la capacité de révoquer.
#
#   2. Le fichier .env, qui contient PHENOBAC_SECRET. Perdre ce secret invalide
#      d'un coup TOUTES les licences vendues, y compris celles déjà en service :
#      aucune ne pourra plus être vérifiée. C'est le seul élément véritablement
#      irremplaçable de l'installation.
#
# L'archive contient donc des secrets : elle est créée en 600, et ne doit pas
# être déposée sur un partage ouvert.
#
# Usage :  bash sauvegarder.sh [dossier_de_destination]
#          RETENTION=30 bash sauvegarder.sh /var/backups/phenobac

set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DEST="${1:-${BACKUP_DIR:-/var/backups/phenobac}}"
RETENTION="${RETENTION:-14}"          # nombre d'archives conservées

log(){ printf "\033[1;36m==>\033[0m %s\n" "$*"; }
err(){ printf "\033[1;31mErreur:\033[0m %s\n" "$*" >&2; exit 1; }

[ -f .env ] || err ".env introuvable — lancez ce script depuis le dossier de l'application."
command -v docker >/dev/null 2>&1 || err "docker est requis."

# Nom du volume, tel que Compose le nomme réellement (préfixe du projet).
VOL="$(docker compose ps -q phenobac 2>/dev/null | head -1 | xargs -r docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' 2>/dev/null)"
[ -n "$VOL" ] || err "volume de données introuvable — le conteneur tourne-t-il ?"

mkdir -p "$DEST"; chmod 700 "$DEST"
HORO="$(date +%Y%m%d-%H%M%S)"
ARCH="$DEST/phenobac-$HORO.tar.gz"

log "Volume : $VOL"
log "Archive : $ARCH"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/donnees"

# Données du volume, lues par un conteneur jetable.
docker run --rm -v "$VOL":/data:ro -v "$TMP/donnees":/sortie alpine \
  sh -c 'cp -a /data/. /sortie/ 2>/dev/null || true'

cp -a .env "$TMP/.env"

tar czf "$ARCH" -C "$TMP" .env donnees
chmod 600 "$ARCH"

# Contrôle : une archive illisible ne vaut rien, et on ne s'en aperçoit
# qu'au moment de la restauration, c'est-à-dire trop tard.
tar tzf "$ARCH" >/dev/null 2>&1 || err "l'archive produite est illisible."
TAILLE="$(wc -c < "$ARCH" | tr -d ' ')"
NB="$(tar tzf "$ARCH" | wc -l | tr -d ' ')"
log "Vérifiée : $NB entrées, $TAILLE octets."

# Rotation
CIBLES="$(ls -1t "$DEST"/phenobac-*.tar.gz 2>/dev/null | tail -n +$((RETENTION+1)) || true)"
if [ -n "$CIBLES" ]; then
  echo "$CIBLES" | xargs -r rm -f
  log "Archives au-delà de $RETENTION conservées : supprimées."
fi

log "Terminé. $(ls -1 "$DEST"/phenobac-*.tar.gz 2>/dev/null | wc -l | tr -d ' ') archive(s) dans $DEST."
echo
echo "Pour restaurer (à froid, service arrêté) :"
echo "  tar xzf $ARCH -C /tmp/restauration"
echo "  cp /tmp/restauration/.env /opt/phenobac/.env"
echo "  docker run --rm -v \$VOLUME:/data -v /tmp/restauration/donnees:/src alpine cp -a /src/. /data/"
