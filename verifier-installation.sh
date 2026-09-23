#!/usr/bin/env bash
# verifier-installation.sh — déroule la recette du § 6 de MISE-EN-VENTE.md
# sur l'installation locale, et dit ce qui va et ce qui ne va pas.
#
# À lancer SUR LE SERVEUR, depuis le dossier de l'application :
#     bash verifier-installation.sh
#
# Ne modifie aucun réglage. Émet une licence d'essai (« verification-installation »,
# 0 FCFA) pour prouver que la chaîne fonctionne, puis la révoque : elle
# apparaîtra une fois au tableau de bord, révoquée. C'est normal.
#
# Aucun secret n'est affiché.

set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ -f .env ] || { echo "Erreur : .env introuvable. Lancez d'abord install-caddy.sh (ou install.sh)."; exit 1; }
PORT="$(sed -n 's/^HOST_PORT=//p' .env | tail -1)"; PORT="${PORT:-8080}"
ADMIN="$(sed -n 's/^PHENOBAC_ADMIN_TOKEN=//p' .env | tail -1)"
SITE="$(sed -n 's/^SITE_URL=//p' .env | tail -1)"
PSP="$(sed -n 's/^PSP=//p' .env | tail -1)"
BASE="http://127.0.0.1:$PORT"
FN="$BASE/.netlify/functions"

OK=0; KO=0; AVERT=0
vert(){ printf "  \033[1;32m✓\033[0m %-46s %s\n" "$1" "${2:-}"; OK=$((OK+1)); }
rouge(){ printf "  \033[1;31m✗\033[0m %-46s %s\n" "$1" "${2:-}"; KO=$((KO+1)); }
jaune(){ printf "  \033[1;33m!\033[0m %-46s %s\n" "$1" "${2:-}"; AVERT=$((AVERT+1)); }
titre(){ printf "\n\033[1m%s\033[0m\n" "$1"; }

code(){ curl -s -o /dev/null -m 15 -w '%{http_code}' "$@" 2>/dev/null; }
post(){ curl -s -m 15 -X POST "$1" -H 'Content-Type: application/json' -d "$2" 2>/dev/null; }
attendu(){ # libellé, obtenu, attendu
  # Garde-fou : si une substitution mal quotée éclate en plusieurs mots, on
  # recevrait plus de trois arguments et la comparaison deviendrait fortuite.
  # Mieux vaut un test en erreur qu'un test qui passe pour de mauvaises raisons.
  if [ "$#" -ne 3 ]; then rouge "${1:-test}" "test malformé ($# arguments : $*)"; return; fi
  # Quand on attend un code HTTP (trois chiffres), la valeur obtenue doit en
  # être un elle aussi. Autrement dit : "400 400 400" ou "" trahissent un test
  # cassé, pas un service en faute.
  case "$3" in
    [0-9][0-9][0-9])
      case "$2" in
        [0-9][0-9][0-9]) : ;;
        *) rouge "$1" "réponse inattendue : '$2'"; return ;;
      esac ;;
  esac
  [ "$2" = "$3" ] && vert "$1" "$2" || rouge "$1" "obtenu $2, attendu $3"
}

echo "PhénoBac — vérification de l'installation (port $PORT)"

titre "1. Le service répond"
attendu "sonde de santé" "$(code $BASE/healthz)" "200"
attendu "application servie" "$(code $BASE/)" "200"

titre "2. Les en-têtes de sécurité sont posés"
# Ils sont émis par l'application, non par le Caddyfile : celui-ci sert
# plusieurs sites, et une erreur d'édition les mettrait tous à terre.
ENTETES="$(curl -sI --max-time 8 "$BASE/" | tr -d '\r')"
entete(){ printf "%s" "$ENTETES" | grep -qi "^$1:" && vert "$2" "$(printf "%s" "$ENTETES" | grep -i "^$1:" | cut -c1-58)" || rouge "$2" "en-tête absent"; }
entete "content-security-policy" "politique de sécurité du contenu"
entete "x-frame-options"         "mise en cadre refusée"
entete "x-content-type-options"  "reniflage de type refusé"
entete "referrer-policy"         "politique de référent"
entete "permissions-policy"      "permissions du navigateur closes"
# Une politique qui laisserait sortir vers n'importe quel hôte ne servirait
# à rien : c'est connect-src qui borne l'exfiltration.
printf "%s" "$ENTETES" | grep -qi "connect-src 'self'" \
  && vert "aucune sortie vers un autre hôte" "connect-src 'self'" \
  || rouge "aucune sortie vers un autre hôte" "connect-src absent ou permissif"

titre "3. La limitation de débit est active"
# On ne sature pas le quota ici : la recette a d'autres contrôles à passer.
# L'en-tête de décompte suffit à prouver que le limiteur est branché.
REST="$(curl -si --max-time 8 -X POST "$FN/premium-interpret" -H 'Content-Type: application/json' \
  -d '{"organism":"ecoli","mode":"sir","results":{"AMX":"R"},"ctx":{}}' | tr -d '\r' | sed -n 's/^[Rr]ate[Ll]imit-[Rr]emaining: //p')"
[ -n "$REST" ] && vert "quota décompté par IP" "$REST requêtes restantes cette minute" \
               || rouge "quota décompté par IP" "en-tête RateLimit-Remaining absent"

titre "4. Rien de sensible n'est servi"
for f in admin.html dashboard.html .env server.js package.json; do
  attendu "$f absent du web" "$(code $BASE/$f)" "404"
done

titre "5. Tout est gratuit et ouvert"
# PhénoBac est gratuit : aucune fonction n'est verrouillée. Ces contrôles
# vérifiaient l'inverse à l'époque du modèle payant.
attendu "E. coli en S/I/R, sans licence" \
  "$(code -X POST $FN/premium-interpret -H 'Content-Type: application/json' -d '{"organism":"ecoli","mode":"sir","results":{"AMX":"R"},"ctx":{}}')" "200"
attendu "E. coli en CMI, sans licence" \
  "$(code -X POST $FN/premium-interpret -H 'Content-Type: application/json' -d '{"organism":"ecoli","mode":"mic","mic":{"AMX":"32"},"ctx":{}}')" "200"
attendu "P. aeruginosa, sans licence" \
  "$(code -X POST $FN/premium-interpret -H 'Content-Type: application/json' -d '{"organism":"paeru","mode":"sir","results":{"CAZ":"R"},"ctx":{}}')" "200"
attendu "S. epidermidis en CMI, sans licence" \
  "$(code -X POST $FN/premium-interpret -H 'Content-Type: application/json' -d '{"organism":"sepidermidis","mode":"mic","mic":{"VA":"4"},"ctx":{}}')" "200"
attendu "ancienne clé de démonstration refusée" \
  "$(post $FN/verify-license '{"license":"PHENO-PRO-2026"}' | grep -c '"valid":false')" "1"

titre "6. Les deux référentiels sont servis, et ils ne rendent pas la même chose"
# Deux référentiels qui produiraient le même résultat seraient un mensonge
# d'interface. On prend le cas le plus net : vancomycine à 2 mg/L sur
# S. aureus — sensible pour l'EUCAST, résistante pour le CA-SFM (p. 11).
attendu "S. aureus, vancomycine 2 mg/L, EUCAST → S" \
  "$(post $FN/premium-interpret '{"organism":"saureus","mode":"mic","mic":{"VA":"2"},"ctx":{},"ref":"eucast"}' | grep -c '"VA":"S"')" "1"
attendu "S. aureus, vancomycine 2 mg/L, CA-SFM → R" \
  "$(post $FN/premium-interpret '{"organism":"saureus","mode":"mic","mic":{"VA":"2"},"ctx":{},"ref":"casfm"}' | grep -c '"VA":"R"')" "1"
# Et la lecture interprétative : une carbapénémase confirmée fait rendre les
# carbapénèmes résistants en CA-SFM, jamais en EUCAST (p. 8).
attendu "carbapénémase confirmée, CA-SFM → imipénème reporté en R" \
  "$(post $FN/premium-interpret '{"organism":"kpneu","mode":"sir","results":{"CTX":"R","ETP":"R","IPM":"S"},"ctx":{"carba":"Oui — autre enzyme"},"ref":"casfm"}' | grep -c '"abx":"IPM"')" "1"
attendu "carbapénémase confirmée, EUCAST → aucun report" \
  "$(post $FN/premium-interpret '{"organism":"kpneu","mode":"sir","results":{"CTX":"R","ETP":"R","IPM":"S"},"ctx":{"carba":"Oui — autre enzyme"},"ref":"eucast"}' | grep -c '"abx":"IPM"')" "0"
# Zones d'incertitude technique : la vancomycine à 2 mg/L sur S. aureus est en
# ZIT pour le CA-SFM (qui a descendu le seuil à 1 mg/L), pas pour l'EUCAST.
attendu "S. aureus, vancomycine 2 mg/L, CA-SFM → signalée en ZIT" \
  "$(post $FN/premium-interpret '{"organism":"saureus","mode":"mic","mic":{"VA":"2"},"ctx":{},"ref":"casfm"}' | grep -c '"zit"')" "1"
attendu "S. aureus, vancomycine 2 mg/L, EUCAST → pas de ZIT" \
  "$(post $FN/premium-interpret '{"organism":"saureus","mode":"mic","mic":{"VA":"2"},"ctx":{},"ref":"eucast"}' | grep -c '"zit"')" "0"
# La ZIT ne dégrade jamais la catégorie : elle reste celle que les seuils donnent.
attendu "la catégorie en ZIT n'est pas dégradée" \
  "$(post $FN/premium-interpret '{"organism":"ecoli","mode":"mic","mic":{"TZP":"16"},"ctx":{},"ref":"casfm"}' | grep -c '"TZP":"R"')" "1"

# Un référentiel inconnu ne doit pas faire tomber le moteur : il retombe sur
# l'EUCAST, qui est le socle commun.
attendu "référentiel inconnu → repli sur EUCAST" \
  "$(post $FN/premium-interpret '{"organism":"saureus","mode":"mic","mic":{"VA":"2"},"ctx":{},"ref":"n-importe-quoi"}' | grep -c '"VA":"S"')" "1"

titre "7. La surveillance : versement ouvert, export protégé"
# L'interprétation n'enregistre rien ; le versement est le seul chemin par
# lequel un résultat est conservé, et il demande un geste délibéré.
attendu "versement d'un isolat accepté" \
  "$(code -X POST $FN/surveillance -H 'Content-Type: application/json' -d '{"action":"verser","isolat":{"organism":"ecoli","prelevement":"Hémoculture","resultats":{"AMX":"R","CTX":"R"},"laboratoire":"VERIF","date":"2026-01-01","patient":"RECETTE"}}')" "200"
attendu "versement sans code de laboratoire refusé" \
  "$(code -X POST $FN/surveillance -H 'Content-Type: application/json' -d '{"action":"verser","isolat":{"organism":"ecoli","resultats":{"AMX":"R"},"date":"2026-01-01"}}')" "400"
attendu "catégorie invalide refusée" \
  "$(code -X POST $FN/surveillance -H 'Content-Type: application/json' -d '{"action":"verser","isolat":{"organism":"ecoli","resultats":{"AMX":"OUI"},"laboratoire":"VERIF","date":"2026-01-01"}}')" "400"
attendu "export sans jeton refusé" \
  "$(code -X POST $FN/surveillance -H 'Content-Type: application/json' -d '{"action":"exporter"}')" "401"
if [ -n "$ADMIN" ]; then
  printf "%s" "$(curl -s --max-time 10 -X POST "$FN/surveillance" -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"action":"exporter"}')" \
    | head -1 | grep -q "RecordId;RecordType" \
    && vert "export au format GLASS" "colonnes conformes au manuel" \
    || rouge "export au format GLASS" "colonnes inattendues"
else
  jaune "export GLASS non contrôlé" "PHENOBAC_ADMIN_TOKEN absent du .env"
fi

titre "8. Les accès d'administration sont fermés"
attendu "issue-license sans jeton" "$(code -X POST $FN/issue-license -H 'Content-Type: application/json' -d '{"sub":"x","days":1}')" "401"
attendu "stats sans jeton" "$(code -X POST $FN/stats -H 'Content-Type: application/json' -d '{}')" "401"
attendu "revoke-license sans jeton" "$(code -X POST $FN/revoke-license -H 'Content-Type: application/json' -d '{"action":"list"}')" "401"
attendu "send-test-sms sans jeton" "$(code -X POST $FN/send-test-sms -H 'Content-Type: application/json' -d '{"to":"+22370000000"}')" "401"
attendu "relances sans secret de cron" "$(code -X POST $FN/send-reminders -H 'Content-Type: application/json' -d '{"next_run":1}')" "401"
attendu "webhook sans authentification" "$(code -X POST $FN/payment-webhook -H 'Content-Type: application/json' -d '{"status":"SUCCESS","amount":5000,"reference":"VERIF"}')" "401"

titre "9. La chaîne de licence (conservée, mais ne conditionne plus l'accès)"
REP="$(curl -s -m 15 -X POST "$FN/issue-license" -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
       -d '{"sub":"verification-installation","days":1,"amount":0}' 2>/dev/null)"
LIC="$(printf '%s' "$REP" | sed -n 's/.*"license":"\([^"]*\)".*/\1/p')"
JTI="$(printf '%s' "$REP" | sed -n 's/.*"jti":"\([^"]*\)".*/\1/p')"

if [ -z "$LIC" ]; then
  rouge "émission d'une licence" "échec — le jeton admin du .env est-il bien celui en service ?"
else
  vert "émission d'une licence" "ok"

  # Les charges utiles sont construites ICI, dans des variables. Ne les
  # réinsérez jamais directement dans une substitution de commande imbriquée :
  # les guillemets internes y sont consommés par le contexte externe, bash
  # applique l'expansion d'accolades au JSON et curl reçoit plusieurs URL.
  P_VERIF="{\"license\":\"$LIC\"}"
  P_PAERU="{\"license\":\"$LIC\",\"organism\":\"paeru\",\"mode\":\"sir\",\"results\":{\"CAZ\":\"R\"},\"ctx\":{}}"
  P_CMI="{\"license\":\"$LIC\",\"organism\":\"ecoli\",\"mode\":\"mic\",\"mic\":{\"AMX\":\"32\"},\"ctx\":{}}"
  P_REVOQ="{\"action\":\"revoke\",\"jti\":\"$JTI\",\"reason\":\"verification installation\"}"

  NB_VALIDE="$(post "$FN/verify-license" "$P_VERIF" | grep -c '"valid":true')"
  attendu "licence reconnue valide" "$NB_VALIDE" "1"

  C_PAERU="$(code -X POST "$FN/premium-interpret" -H 'Content-Type: application/json' -d "$P_PAERU")"
  attendu "elle débloque P. aeruginosa" "$C_PAERU" "200"

  C_CMI="$(code -X POST "$FN/premium-interpret" -H 'Content-Type: application/json' -d "$P_CMI")"
  attendu "elle débloque la saisie CMI" "$C_CMI" "200"

  curl -s -m 15 -o /dev/null -X POST "$FN/revoke-license" -H "Authorization: Bearer $ADMIN" \
       -H 'Content-Type: application/json' -d "$P_REVOQ" 2>/dev/null

  # L'application étant gratuite, une licence révoquée ne ferme plus rien —
  # on vérifie que la révocation reste enregistrée, pas qu'elle bloque l'accès.
  attendu "licence révoquée : verify la refuse" \
    "$(post "$FN/verify-license" "$P_VERIF" | grep -c '"reason":"revoked"')" "1"

  C_STATS="$(code -X POST "$FN/stats" -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{}')"
  attendu "tableau de bord accessible avec le jeton" "$C_STATS" "200"
fi

titre "10. Exposition et cohabitation"
if command -v ss >/dev/null 2>&1; then
  if ss -ltnH 2>/dev/null | awk '{print $4}' | grep -qE "^(0\.0\.0\.0|\[?::\]?):$PORT$"; then
    rouge "écoute limitée à la loopback" "le port $PORT est ouvert sur toutes les interfaces"
  else
    vert "écoute limitée à la loopback" "rien n'est exposé directement"
  fi
fi
# Le serveur de façade peut être un service système OU un conteneur : ne
# chercher que dans systemd donne une fausse alerte là où Caddy tourne dans
# Docker, ce qui est le cas dès qu'il sert déjà d'autres applications.
FACADE=""
if systemctl is-active --quiet caddy 2>/dev/null; then FACADE="caddy (service système)"
elif systemctl is-active --quiet nginx 2>/dev/null; then FACADE="nginx (service système)"
elif command -v docker >/dev/null 2>&1; then
  FACADE="$(docker ps --format '{{.Names}} {{.Image}} {{.Ports}}' 2>/dev/null \
            | awk '/caddy|nginx|traefik/ && /:80->|:443->/ {print $1" (conteneur)"; exit}')"
fi
if [ -n "$FACADE" ]; then
  vert "le serveur web de façade tourne toujours" "$FACADE"
else
  jaune "aucun serveur web de façade détecté" "normal si PhénoBac est seul sur la machine"
fi

titre "11. Ce qui reste à régler avant d'ouvrir au public"
[ -n "$SITE" ] && vert "SITE_URL renseigné" "$SITE" \
  || jaune "SITE_URL vide" "l'API accepte TOUTES les origines — à renseigner avant d'exposer"

# PhénoBac est gratuit : paiement et passerelle SMS ne sont plus nécessaires.
# On ne les signale que s'ils sont configurés à moitié, ce qui trahirait un
# reste de l'ancien modèle plutôt qu'une intention.
PAYK="$(sed -n 's/^PAYDUNYA_MASTER_KEY=//p' .env | tail -1)"
SMSU="$(sed -n 's/^SMS_API_URL=//p' .env | tail -1)"
SMSK="$(sed -n 's/^SMS_API_KEY=//p' .env | tail -1)"
[ -n "$PAYK" ] && jaune "clés PayDunya renseignées" "sans objet : l'application est gratuite"
if { [ -n "$SMSU" ] && [ -z "$SMSK" ]; } || { [ -z "$SMSU" ] && [ -n "$SMSK" ]; }; then
  jaune "passerelle SMS à moitié configurée" "renseignez SMS_API_URL et SMS_API_KEY, ou laissez les deux vides"
fi

printf "\n\033[1mRésultat : %d conformes, %d écarts, %d points d'attention\033[0m\n" "$OK" "$KO" "$AVERT"
[ "$KO" -eq 0 ] && echo "L'installation est saine. Les points d'attention sont des réglages qui vous appartiennent." \
                || echo "Des écarts demandent correction avant toute mise en service."
exit $(( KO > 0 ? 1 : 0 ))
