# Arquitectura

```
                Internet / Red provincial
                          │  80/443
                    ┌─────▼─────┐
                    │   Nginx   │  TLS, proxy inverso ── / ──▶ Portal Next.js
                    └─┬───────┬─┘                         (geoportal, visor, catálogo)
          /geoserver/ │       │ /geonetwork/
              ┌───────▼──┐  ┌─▼───────────┐     ┌───────────────┐
              │GeoServer │  │ GeoNetwork  │────▶│ Elasticsearch │
              └────┬─────┘  └──────┬──────┘     └───────────────┘
                   │               │
              ┌────▼───────────────▼────┐
              │ PostgreSQL + PostGIS     │
              │  · BD ide (capas)        │
              │  · BD geonetwork         │
              └──────────────────────────┘
```

Todos los servicios corren en Docker Compose sobre una red interna. Solo Nginx expone puertos al exterior.

## Bases de datos

**`ide`** – datos geográficos publicados por GeoServer. Esquemas:

| Esquema | Contenido |
|---|---|
| `proveedores` | Proveedores y contratistas del Registro Provincial (domicilio, radicación) |
| `base` | Capas de referencia propias (si no se consumen de servicios externos) |
| `staging` | Área de carga y transformación; no se publica |

Roles:

- `ide_admin` – dueño de los esquemas, usado por los procesos de carga.
- `geoserver_ro` – solo lectura, usado por GeoServer.

**`geonetwork`** – base interna del catálogo.

## Presupuesto de memoria (8 GB)

| Servicio | Límite aprox. |
|---|---|
| PostgreSQL/PostGIS | 1,5 GB |
| GeoServer (JVM `-Xmx2g`) | 2,5 GB |
| GeoNetwork (JVM `-Xmx1g`) | 1,5 GB |
| Elasticsearch (`-Xmx512m`) | 1 GB |
| Portal Next.js | 0,5 GB |
| Nginx + SO | ~0,5 GB |

Es justo para 8 GB. Elasticsearch es el componente más prescindible: si la memoria aprieta, se puede bajar el heap o evaluar ampliar a 12 GB con métricas reales (prevista en la nota).

## Decisiones

- **Docker Compose** en un único host (lo solicitado). Sin orquestador.
- **Proxy inverso por rutas** bajo un único subdominio, para simplificar TLS y CORS.
- **GeoServer lee con usuario de solo lectura**; la escritura pasa por scripts de carga versionados.
- **Geoportal en Next.js** (no Argenmap): portal institucional, visor OpenLayers y buscador sobre la API de GeoNetwork en un solo proyecto mantenible por el Área. GeoServer y GeoNetwork siguen siendo el núcleo IDERA.
- **Datos fuente fuera del repo** (`datos/` está ignorado): el repo contiene código y configuración, no datos.
