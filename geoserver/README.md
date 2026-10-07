# GeoServer

Imagen oficial `docker.osgeo.org/geoserver`. El data directory vive en el volumen `geoserver_data`.

## Configuración inicial

`scripts/publicar-geoserver.sh` hace los pasos 2 a 4 vía REST y carga los estilos SLD de `estilos/` (uno por capa, con el mismo nombre). Los pasos manuales quedan como referencia.

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

## Estilos

- `proveedores_por_localidad`: círculos de área proporcional a la cantidad (diámetro 5 + √n), etiquetas de localidades con 200 o más proveedores siempre y del resto por debajo de 1:2.500.000.
- `proveedores_radicacion`: un punto por proveedor, solo por debajo de 1:1.500.000 (a escala provincial lo resume la capa por localidad).
