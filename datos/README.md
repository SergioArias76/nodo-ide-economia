# datos/

Carpeta local para archivos fuente (planillas del Registro, shapefiles, GeoPackage). **No se versiona.**

Carga a PostGIS (ejemplo con GDAL):

```bash
ogr2ogr -f PostgreSQL "PG:host=localhost dbname=ide user=ide_admin" \
  datos/fuentes/capa.gpkg -nln staging.capa -lco GEOMETRY_NAME=geom -t_srs EPSG:4326
```
