# datos/

Carpeta local para archivos fuente (planillas del Registro, shapefiles, GeoPackage). **No se versiona.**

Proveedores: copiar `QGIS_proveedores_puntos.geojson` en `datos/fuentes/proveedores/` y correr `scripts/cargar-proveedores.sh` (ver docs/datos-proveedores.md).

Otras capas, carga genérica con GDAL:

```bash
ogr2ogr -f PostgreSQL "PG:host=localhost dbname=ide user=ide_admin" \
  datos/fuentes/capa.gpkg -nln staging.capa -lco GEOMETRY_NAME=geom -t_srs EPSG:4326
```
