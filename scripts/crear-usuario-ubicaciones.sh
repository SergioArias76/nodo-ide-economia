#!/usr/bin/env bash
# Crea (o actualiza) en una base existente el usuario de la pantalla de ubicación manual, con la
# contraseña UBICACIONES_DB_PASSWORD del .env. En una base nueva lo crea postgis/initdb/30-ubicaciones.sh.
# Uso: scripts/crear-usuario-ubicaciones.sh   (con el stack levantado)
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; source .env; set +a
[ -n "${UBICACIONES_DB_PASSWORD:-}" ] || { echo "Falta UBICACIONES_DB_PASSWORD en .env" >&2; exit 1; }

# MSYS_NO_PATHCONV: en Git Bash (Windows) la ruta del contenedor no se convierte en una de Windows
MSYS_NO_PATHCONV=1 docker compose exec -T -e UBICACIONES_DB_PASSWORD="$UBICACIONES_DB_PASSWORD" postgis \
  bash /docker-entrypoint-initdb.d/30-ubicaciones.sh
echo "Usuario ide_ubicaciones listo"
