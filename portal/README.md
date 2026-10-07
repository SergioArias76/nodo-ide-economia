# Portal / Geoportal

Next.js 16 (App Router) + OpenLayers. Cumple el rol de "visor y geoportal" de la arquitectura IDERA.

| Ruta | Contenido |
|---|---|
| `/` | Presentación del nodo y endpoints de servicios OGC |
| `/visor` | Mapa (base Argenmap IGN + capas WMS del nodo) |
| `/catalogo` | Búsqueda en GeoNetwork (API de búsqueda, del lado del servidor) |

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:3000
```

Sin el stack completo el visor muestra solo el mapa base y el catálogo un aviso de "no disponible". Para ver todo, levantar `docker compose up -d` en la raíz.

Variables de entorno (servidor):

- `GEONETWORK_URL` – URL interna de GeoNetwork (en Compose: `http://geonetwork:8080/geonetwork`).

Las capas del visor se configuran en `src/lib/config.ts`.

> Next.js 16 trae cambios respecto de versiones anteriores: ver `AGENTS.md` y la documentación en `node_modules/next/dist/docs/`.
