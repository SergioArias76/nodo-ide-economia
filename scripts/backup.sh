#!/usr/bin/env bash
# Respaldo de bases y data directories de GeoServer y GeoNetwork.
# Uso: scripts/backup.sh [directorio_destino]   (cron sugerido: 0 2 * * *)
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; source .env; set +a

DESTINO="${1:-/var/backups/nodo-ide}"
FECHA="$(date +%Y%m%d_%H%M)"
RETENCION_DIAS=14
mkdir -p "$DESTINO"

for db in "$IDE_DB" "$GEONETWORK_DB"; do
  docker compose exec -T postgis pg_dump -U "$POSTGRES_USER" -Fc "$db" > "$DESTINO/${db}_${FECHA}.dump"
done

docker compose exec -T geoserver tar czf - -C /opt/geoserver_data . > "$DESTINO/geoserver_data_${FECHA}.tar.gz"
# Incluye config/encryptor.properties: sin esa clave no se descifran las contraseñas guardadas en la base
docker compose exec -T geonetwork tar czf - -C /catalogue-data . > "$DESTINO/geonetwork_data_${FECHA}.tar.gz"

find "$DESTINO" -type f -mtime +"$RETENCION_DIAS" -delete
echo "Backup completo en $DESTINO ($FECHA)"
