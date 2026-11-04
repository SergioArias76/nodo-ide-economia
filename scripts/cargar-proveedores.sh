#!/usr/bin/env bash
# Carga la capa de proveedores del paquete QGIS en PostGIS.
# Uso: scripts/cargar-proveedores.sh [ruta_geojson]
#   por defecto: datos/fuentes/proveedores/QGIS_proveedores_puntos.geojson
# Requiere el stack levantado (docker compose up -d). GDAL corre en un contenedor temporal.
set -euo pipefail
export MSYS_NO_PATHCONV=1  # Git Bash (Windows): que no convierta las rutas del contenedor

cd "$(dirname "$0")/.."
set -a; source .env; set +a

GEOJSON="${1:-datos/fuentes/proveedores/QGIS_proveedores_puntos.geojson}"
GDAL_IMAGE="${GDAL_IMAGE:-ghcr.io/osgeo/gdal:ubuntu-small-latest}"
RED="$(docker compose ps -q postgis | xargs docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}')"

[ -f "$GEOJSON" ] || { echo "No existe $GEOJSON" >&2; exit 1; }
DIR="$(cd "$(dirname "$GEOJSON")" && (pwd -W 2>/dev/null || pwd))"  # pwd -W: ruta C:/... en Git Bash
ARCHIVO="$(basename "$GEOJSON")"

echo "1/3 GeoJSON → staging.proveedores_qgis"
docker run --rm --network "$RED" -v "$DIR":/fuente:ro -e PGPASSWORD="$IDE_ADMIN_PASSWORD" "$GDAL_IMAGE" \
  ogr2ogr -f PostgreSQL "PG:host=postgis dbname=$IDE_DB user=ide_admin" "/fuente/$ARCHIVO" \
    -nln staging.proveedores_qgis -overwrite \
    -lco GEOMETRY_NAME=geom -lco FID=fid -nlt POINT -t_srs EPSG:4326

echo "2/3 staging → proveedores"
docker compose exec -T postgis psql -U ide_admin -d "$IDE_DB" -v fuente="$ARCHIVO" \
  < postgis/etl/proveedores_desde_staging.sql

# Los proveedores de la API del Registro son más recientes que el padrón: se vuelven a aplicar encima
# (scripts/importar-api-proveedores.mjs los guarda en proveedores.api_proveedor)
HAY_API="$(docker compose exec -T postgis psql -U ide_admin -d "$IDE_DB" -Atc "SELECT to_regclass('proveedores.api_proveedor') IS NOT NULL")"
if [ "$HAY_API" = "t" ]; then
  echo "3/3 proveedores de la API del Registro → proveedores"
  docker compose exec -T postgis psql -U ide_admin -d "$IDE_DB" < postgis/etl/proveedores_desde_api.sql
fi
