# GeoServer

Imagen oficial `docker.osgeo.org/geoserver`. El data directory vive en el volumen `geoserver_data`.

## Configuración inicial

1. Ingresar a `https://<dominio>/geoserver/` con `GEOSERVER_ADMIN_USER` / `GEOSERVER_ADMIN_PASSWORD`.
2. **Workspace**: `economia`, URI `https://<dominio>/economia`.
3. **Store PostGIS** `ide_proveedores`:
   - host `postgis`, puerto `5432`, base `ide`, esquema `proveedores`
   - usuario `geoserver_ro` (solo lectura)
4. Publicar las vistas (ver [docs/datos-proveedores.md](../docs/datos-proveedores.md)):
   - `v_proveedores_publico` → `economia:proveedores_radicacion`
   - `v_proveedores_por_localidad` → `economia:proveedores_por_localidad`
5. Información del servicio (Contact Information, título, resumen) según *Perfil de Metadatos para Servicios OGC – IDERA*.
6. Habilitar cache de teselas (GeoWebCache) en EPSG:3857 para WMTS.

## Seguridad

- Cambiar la contraseña del usuario `root` del keystore (Security → Passwords).
- Deshabilitar WCS/WPS si no se usan.
- WFS-T (escritura) deshabilitado: la carga se hace por scripts.

## Pendiente

- Versionar estilos SLD en `geoserver/estilos/` y automatizar su carga vía REST API.
