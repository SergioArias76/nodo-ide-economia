#!/usr/bin/env bash
# Configura GeoNetwork vía API: reemplaza la contraseña de fábrica del usuario admin.
# Se puede correr más de una vez.
# Uso: scripts/configurar-geonetwork.sh   (requiere el stack levantado)
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; source .env; set +a

API="${GEONETWORK_API:-https://$DOMINIO/geonetwork/srv/api}"
INSEGURO=(); [ "$DOMINIO" = localhost ] && INSEGURO=(-k)  # certificado autofirmado en dev
COOKIES="$(mktemp)"; trap 'rm -f "$COOKIES"' EXIT

# GeoNetwork exige en cada escritura el token XSRF que entrega en una cookie
curl -s "${INSEGURO[@]}" -c "$COOKIES" -o /dev/null "$API/me"
XSRF="$(awk '$6 == "XSRF-TOKEN" {print $7}' "$COOKIES")"

# api USUARIO:CLAVE MÉTODO RUTA [curl args...] → imprime el código HTTP
api() {
  local credenciales=$1 metodo=$2 ruta=$3; shift 3
  curl -s "${INSEGURO[@]}" -u "$credenciales" -b "$COOKIES" -H "X-XSRF-TOKEN: $XSRF" -H 'Accept: application/json' \
    -o /dev/null -w '%{http_code}' -X "$metodo" "$API$ruta" "$@"
}
ok() { case "$2" in 2??) echo "  ✓ $1";; *) echo "  ✗ $1 (HTTP $2)" >&2; exit 1;; esac; }

echo "Usuario admin"
if [ "$(api "admin:$GEONETWORK_ADMIN_PASSWORD" GET /me)" = 200 ]; then
  echo "  ✓ ya usa la contraseña del .env"
elif [ "$(api admin:admin GET /me)" = 200 ]; then
  # Es el mismo pedido que hace la consola de administración ("Reiniciar contraseña").
  # Por stdin: en Git Bash los argumentos de curl pierden los caracteres no ASCII
  ok "contraseña de fábrica reemplazada" "$(printf '{"passwordOld":"admin","password":"%s","password2":"%s"}'     "$GEONETWORK_ADMIN_PASSWORD" "$GEONETWORK_ADMIN_PASSWORD" |
    api admin:admin POST /users/1/actions/forget-password -H 'Content-Type: application/json' --data-binary @-)"
  ok "ingreso con la contraseña nueva" "$(api "admin:$GEONETWORK_ADMIN_PASSWORD" GET /me)"
else
  echo "  ✗ admin no acepta ni la contraseña del .env ni la de fábrica" >&2
  exit 1
fi
