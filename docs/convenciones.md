# Convenciones de datos y metadatos

## Sistema de referencia

- Almacenamiento: **EPSG:4326** (WGS 84) o **EPSG:5346** (POSGAR 2007 / Argentina faja 4) según el origen; documentar en el metadato.
- Publicación: GeoServer reproyecta a EPSG:3857 / 4326 bajo demanda.

## Nombres

- Tablas y columnas en `snake_case`, sin tildes ni ñ.
- Workspace de GeoServer: `economia`.
- Capas: `economia:<tema>_<detalle>`, p. ej. `economia:proveedores_domicilio`.
- Toda tabla publicada tiene clave primaria y geometría en columna `geom` con índice GIST.

## Metadatos

- Perfil **ISO 19139 / Perfil Argentino de Metadatos (IDERA)** en GeoNetwork.
- Cada capa publicada debe tener su registro de metadatos y el enlace al servicio OGC.
- Campos mínimos: título, resumen, responsable, fecha, SRS, extensión, palabras clave, restricciones de uso, frecuencia de actualización.

## Datos personales

Los datos del Registro de Proveedores pueden incluir información de personas físicas. Antes de publicar:

- Publicar solo atributos de acceso público según normativa vigente (Ley 25.326 y normativa provincial).
- GeoServer (`geoserver_ro`) lee solo vistas de `proveedores`, nunca las tablas: mail y teléfono no salen de la base.
- Para personas físicas, evaluar publicar a nivel de localidad/departamento en lugar de domicilio exacto.
- Mantener versiones internas (completas) y públicas (reducidas) en vistas separadas.
