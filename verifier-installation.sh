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

titre "2. Rien de sensible n'est servi"
for f in admin.html dashboard.html .env server.js package.json; do
  attendu "$f absent du web" "$(code $BASE/$f)" "404"
done

titre "3. Le gratuit fonctionne, le payant est verrouillé"
attendu "E. coli en S/I/R, sans licence" \
  "$(code -X POST $FN/premium-interpret -H 'Content-Type: application/json' -d '{"organism":"ecoli","mode":"sir","results":{"AMX":"R"},"ctx":{}}')" "200"
attendu "E. coli en CMI, sans licence" \
  "$(code -X POST $FN/premium-interpret -H 'Content-Type: application/json' -d '{"organism":"ecoli","mode":"mic","mic":{"AMX":"32"},"ctx":{}}')" "402"
attendu "P. aeruginosa, sans licence" \
  "$(code -X POST $FN/premium-interpret -H 'Content-Type: application/json' -d '{"organism":"paeru","mode":"sir","results":{"CAZ":"R"},"ctx":{}}')" "402"
attendu "ancienne clé de démonstration refusée" \
  "$(post $FN/verify-license '{"license":"PHENO-PRO-2026"}' | grep -c '"valid":false')" "1"

titre "4. Les accès d'administration sont fermés"
attendu "issue-license sans jeton" "$(code -X POST $FN/issue-license -H 'Content-Type: application/json' -d '{"sub":"x","days":1}')" "401"
attendu "stats sans jeton" "$(code -X POST $FN/stats -H 'Content-Type: application/json' -d '{}')" "401"
attendu "revoke-license sans jeton" "$(code -X POST $FN/revoke-license -H 'Content-Type: application/json' -d '{"action":"list"}')" "401"
attendu "send-test-sms sans jeton" "$(code -X POST $FN/send-test-sms -H 'Content-Type: application/json' -d '{"to":"+22370000000"}')" "401"
attendu "relances sans secret de cron" "$(code -X POST $FN/send-reminders -H 'Content-Type: application/json' -d '{"next_run":1}')" "401"
attendu "webhook sans authentification" "$(code -X POST $FN/payment-webhook -H 'Content-Type: application/json' -d '{"status":"SUCCESS","amount":5000,"reference":"VERIF"}')" "401"

titre "5. La chaîne de licence, de bout en bout"
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

  C_REVOQ="$(code -X POST "$FN/premium-interpret" -H 'Content-Type: application/json' -d "$P_PAERU")"
  attendu "révoquée, elle ne débloque plus rien" "$C_REVOQ" "402"

  C_STATS="$(code -X POST "$FN/stats" -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{}')"
  attendu "tableau de bord accessible avec le jeton" "$C_STATS" "200"
fi

titre "6. Exposition et cohabitation"
if command -v ss >/dev/null 2>&1; then
  if ss -ltnH 2>/dev/null | awk '{print $4}' | grep -qE "^(0\.0\.0\.0|\[?::\]?):$PORT$"; then
    rouge "écoute limitée à la loopback" "le port $PORT est ouvert sur toutes les interfaces"
  else
    vert "écoute limitée à la loopback" "rien n'est exposé directement"
  fi
fi
if systemctl is-active --quiet caddy 2>/dev/null; then
  vert "le serveur web existant tourne toujours" "caddy actif"
elif systemctl is-active --quiet nginx 2>/dev/null; then
  vert "le serveur web existant tourne toujours" "nginx actif"
else
  jaune "serveur web de façade" "ni caddy ni nginx actif — normal si PhénoBac est seul"
fi

titre "7. Ce qui reste à régler avant d'ouvrir au public"
[ -n "$SITE" ] && vert "SITE_URL renseigné" "$SITE" \
  || jaune "SITE_URL vide" "l'API accepte TOUTES les origines — à renseigner avant d'exposer"
if [ "$PSP" = "paydunya" ] && [ -z "$(sed -n 's/^PAYDUNYA_MASTER_KEY=//p' .env | tail -1)" ]; then
  jaune "clés PayDunya absentes" "aucune licence ne s'émettra automatiquement"
fi
[ -z "$(sed -n 's/^SMS_API_URL=//p' .env | tail -1)" ] && \
  jaune "passerelle SMS non configurée" "les clés ne partiront pas par SMS"

printf "\n\033[1mRésultat : %d conformes, %d écarts, %d points d'attention\033[0m\n" "$OK" "$KO" "$AVERT"
[ "$KO" -eq 0 ] && echo "L'installation est saine. Les points d'attention sont des réglages qui vous appartiennent." \
                || echo "Des écarts demandent correction avant toute mise en service."
exit $(( KO > 0 ? 1 : 0 ))
