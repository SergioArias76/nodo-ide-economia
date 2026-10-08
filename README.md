# Nodo IDE – Ministerio de Economía (Chubut)

Nodo de **Infraestructura de Datos Espaciales** del Ministerio de Economía de la Provincia del Chubut, a cargo del Área de Sistemas de Información y Transparencia (ASIyT).

Objetivo: publicar la información con componente territorial del Ministerio mediante servicios OGC estándar (WMS, WFS, WMTS), documentados con metadatos compatibles con **IDERA**, y en condiciones de federarse con la IDE provincial sin transferir la custodia de los datos.

## Componentes

| Servicio | Tecnología | Ruta pública |
|---|---|---|
| Base de datos geoespacial | PostgreSQL 16 + PostGIS | (interna) |
| Servidor de mapas | GeoServer | `/geoserver/` |
| Catálogo de metadatos | GeoNetwork 4 (+ Elasticsearch) | `/geonetwork/` |
| Geoportal y visor | Next.js + OpenLayers | `/` |
| Proxy inverso + TLS | Nginx | puertos 80/443 |

Detalle en [docs/arquitectura.md](docs/arquitectura.md).

## Puesta en marcha (desarrollo local)

Requisitos: Docker y Docker Compose v2.

```bash
cp .env.example .env              # editar contraseñas y dominio
./scripts/generar-cert-dev.sh     # certificado autofirmado para pruebas
docker compose up -d
docker compose ps
```

Luego:

- Visor: https://localhost/
- GeoServer: https://localhost/geoserver/
- GeoNetwork: https://localhost/geonetwork/

> En producción el certificado lo provee el dominio `*.chubut.gob.ar` (ver [docs/despliegue.md](docs/despliegue.md)).

Con el stack levantado, cargar y publicar los datos (paso a paso en [docs/prueba-local.md](docs/prueba-local.md)):

```bash
bash scripts/cargar-proveedores.sh              # padrón de proveedores → PostGIS
node scripts/geocodificar-domicilios.mjs --aplicar   # opcional: mejora las ubicaciones
bash scripts/publicar-geoserver.sh              # capas, estilos y seguridad de GeoServer
bash scripts/configurar-geonetwork.sh           # contraseña de admin de GeoNetwork
```

## Visor

Visor propio en `/visor`, con las herramientas del visor de IDERA (mapa.idera.gob.ar) y la identidad del Gobierno del Chubut:

- **Capas del nodo**: proveedores del Estado (ícono por domicilio: edificio para persona jurídica, persona para física; con filtros por persona jurídica o física y por localidad) y cantidad de proveedores por localidad.
- **Capas nacionales** del catálogo de IDERA agrupadas por tema (escuelas, hospitales, transporte, hidrografía…), con opacidad, leyenda y zoom a la extensión.
- **Mapas base**: OpenStreetMap (por defecto), Argenmap del IGN (normal, gris y oscuro) o sin mapa base.
- **Herramientas**: búsqueda de localidades, consulta de datos con clic, medición de distancias y superficies, dibujo (con exportación a GeoJSON), grilla de coordenadas, mi ubicación, captura PNG e impresión en PDF.
- **Agregar capas** de otros servicios WMS o de archivos GeoJSON, KML, GPX y Shapefile.
- **Accesibilidad**: tema claro y oscuro, texto grande, alto contraste, movimiento reducido y uso completo con teclado.
- El estado del mapa (zoom, centro, base, capas y filtros) queda en la URL, así se puede compartir.

Diseño: [PRODUCT.md](PRODUCT.md) y [DESIGN.md](DESIGN.md). El catálogo de IDERA se regenera con `node scripts/actualizar-capas-idera.mjs`.

## Estructura del repositorio

```
docs/            Documentación: contexto, arquitectura, despliegue, roadmap, convenciones, datos y API
nginx/           Plantilla de proxy inverso y certificados (no versionados)
postgis/initdb/  Inicialización de la base (esquemas, roles, vistas públicas, BD de GeoNetwork)
postgis/etl/     Pasaje de los datos cargados (staging) al modelo
geoserver/       Notas de GeoServer y estilos SLD (geoserver/estilos/)
geonetwork/      Notas y configuración del catálogo
portal/          Geoportal Next.js (inicio, visor, catálogo); marca en portal/public/marca/
scripts/         Carga, geocodificación, publicación, respaldo y utilidades
datos/           Datos de trabajo locales y cachés de geocodificación (no versionados)
```

| Script | Qué hace |
|---|---|
| `generar-cert-dev.sh` | Certificado autofirmado para `https://localhost` |
| `cargar-proveedores.sh` | Carga el padrón de proveedores en PostGIS y reaplica las correcciones de ubicación |
| `geocodificar-domicilios.mjs` | Vuelve a ubicar domicilios por calle y altura (Georef y OpenStreetMap) |
| `publicar-geoserver.sh` | Workspace, store, capas, estilos y ajustes de seguridad de GeoServer |
| `configurar-geonetwork.sh` | Reemplaza la contraseña de fábrica de GeoNetwork |
| `actualizar-capas-idera.mjs` | Regenera el catálogo de capas nacionales del visor |
| `backup.sh` | Respaldo de la base y de los datos de GeoServer y GeoNetwork |

## Documentación

- [Contexto y solicitud de servidor](docs/contexto.md)
- [Lineamientos IDERA aplicados](docs/idera.md)
- [Arquitectura](docs/arquitectura.md)
- [Prueba local (Windows)](docs/prueba-local.md)
- [Despliegue](docs/despliegue.md)
- [Convenciones de datos y metadatos](docs/convenciones.md)
- [Datos de prueba: proveedores](docs/datos-proveedores.md)
- [API de proveedores (propuesta)](docs/api-proveedores.md)
- [Hoja de ruta](docs/roadmap.md)
