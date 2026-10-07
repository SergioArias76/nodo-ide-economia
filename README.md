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

## Estructura del repositorio

```
docs/            Documentación: contexto, arquitectura, despliegue, roadmap, convenciones
nginx/           Plantilla de proxy inverso y certificados (no versionados)
postgis/initdb/  Scripts de inicialización de la base (esquemas, roles, BD de GeoNetwork)
geoserver/       Notas y configuración de GeoServer
geonetwork/      Notas y configuración del catálogo
portal/          Geoportal Next.js (inicio, visor, catálogo)
scripts/         Respaldo, carga de datos y utilidades
datos/           Datos de trabajo locales (no versionados)
```

## Documentación

- [Contexto y solicitud de servidor](docs/contexto.md)
- [Lineamientos IDERA aplicados](docs/idera.md)
- [Arquitectura](docs/arquitectura.md)
- [Prueba local (Windows)](docs/prueba-local.md)
- [Despliegue](docs/despliegue.md)
- [Convenciones de datos y metadatos](docs/convenciones.md)
- [Datos de prueba: proveedores](docs/datos-proveedores.md)
- [Hoja de ruta](docs/roadmap.md)
