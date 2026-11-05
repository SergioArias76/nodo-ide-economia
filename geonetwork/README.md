# GeoNetwork

Imagen oficial `geonetwork` (4.4.x), con base en PostgreSQL (`geonetwork`) e índice en Elasticsearch.

## Configuración inicial

1. Ingresar a `https://<dominio>/geonetwork/` con `admin` / `admin` y **cambiar la contraseña**.
2. Admin console → Settings:
   - Catalog name: *IDE Ministerio de Economía – Chubut*
   - Host: `<dominio>`, protocolo `https`, puerto `443`
3. Crear grupo `economia` y usuarios editores.
4. Cargar plantillas del **Perfil de Metadatos IDERA** (ISO 19139) y del perfil de servicios OGC.
5. Por cada capa publicada en GeoServer: registro de metadatos con enlace OGC:WMS / OGC:WFS. Las capas de proveedores se cargan con:

   ```bash
   node scripts/cargar-metadatos-geonetwork.mjs   # ISO 19139, perfil IDERA; se puede correr más de una vez
   ```

   Las fichas se arman en el script (títulos, resumen, linaje, licencia, enlaces OGC y vista previa). Cada una tiene un identificador fijo: correrlo de nuevo las actualiza y quedan públicas. Faltan la dirección, el correo y el teléfono del área responsable.

## CSW

Endpoint para harvesting de la IDE provincial / IDERA:

```
https://<dominio>/geonetwork/srv/spa/csw?service=CSW&request=GetCapabilities
```
