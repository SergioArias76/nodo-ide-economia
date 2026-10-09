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

Visor propio en `/visor`, con las herramientas del visor de IDERA (mapa.idera.gob.ar) y la identidad del Gobierno del Chubut. Está centrado en la provincia: las capas nacionales y las agregadas se recortan al límite del Chubut (IGN, con 250 m de margen para no perder domicilios sobre la costa), fuera de él el mapa queda velado, el buscador solo trae localidades chubutenses y la consulta, las tablas y el análisis de esas capas piden los datos únicamente dentro de la provincia. Los proveedores son la excepción: se ven, consultan y analizan en todo el país, porque le proveen al Estado chubutense desde cualquier provincia. El límite se regenera con `node scripts/generar-limite-chubut.mjs`.

- **Capas del nodo**: proveedores del Estado (ícono por domicilio: edificio para persona jurídica, persona para física; con filtros por persona jurídica o física, por localidad y por rubro) y cantidad de proveedores por localidad.
- **Capas nacionales** del catálogo de IDERA agrupadas por tema (escuelas, hospitales, transporte, hidrografía…), con opacidad, leyenda y zoom a la extensión.
- **Mapas base**: OpenStreetMap (por defecto), Argenmap del IGN (normal, gris y oscuro) o sin mapa base.
- **Herramientas**: búsqueda de localidades, consulta de datos con clic, medición de distancias y superficies, dibujo (con exportación a GeoJSON), grilla de coordenadas, mi ubicación, captura PNG e impresión en PDF.
- **Análisis geográfico**, con las funciones y el comportamiento del geoportal estadístico del INDEC:
  - Conteo por área (exacto, lo cuenta el servidor), estadísticas (cuenta, suma, promedio, máximo o mínimo de un campo, en total o sumarizadas por otro campo; los rubros se cuentan uno por uno), área de influencia (comparable con otra capa: por ejemplo, cuántos proveedores del rubro "Cuidador a domicilio" quedan a menos de 1 km de cada edificio de salud y cuál es el más cercano a cada proveedor; con "Disolver áreas de influencia" en la capa de resultado), superposición elemento por elemento (intersección, diferencia, unión), distancias a uno o más destinos (en línea recta o por red vial a pie, en bicicleta o en vehículo, con duración) y geometrías derivadas (centroide, envolvente, centro de masa, punto en el elemento).
  - Área de análisis: extensión del mapa, toda la capa o un área dibujada; se aplica en el servidor (WFS con `INTERSECTS`).
  - Capas de entrada: las encendidas del nodo, con sus filtros (por ejemplo, proveedores de un rubro), las nacionales que publican WFS (42 de 76, como edificios de seguridad, escuelas o salud), archivos, dibujos y resultados anteriores.
  - Panel de datos a la derecha, como el del INDEC: tablas de estadísticas, distancias y atributos de cualquier capa analizable, con columnas ordenables, descarga CSV y clic en la fila para ir al elemento. Las capas de resultado tienen color, tabla de atributos y descarga GeoJSON.
  - Se calcula en el navegador con Turf; la red vial usa el servidor OSRM público de FOSSGIS (routing.openstreetmap.de).
- **Capas nacionales copiadas al nodo**: las 42 que publican WFS se copian recortadas al Chubut con su estilo original (Preparando el esquema "nacional" y el workspace "nacional"…
  ✓ Planta potabilizadora de agua: 4 elementos, estilo de origen (3 íconos) (1 s)
  ✓ Área de fabricación y procesamiento: 8 elementos, estilo de origen (1 s)
  ✓ Asentamientos Humanos de la República Argentina (BAHRA): 292 elementos, estilo de origen (1 íconos) (1 s)
  ✓ Edificio de salud: 102 elementos, estilo de origen (4 íconos) (1 s)
  ✓ Planta urbana: 67 elementos, estilo de origen (1 s)
  ✓ Establecimiento educativo: 857 elementos, estilo de origen (1 íconos) (1 s)
  ✓ Institución universitaria: 35 elementos, estilo de origen (1 s)
  ✓ Estación de ómnibus: 10 elementos, estilo de origen (1 s)
  ✓ Red vial (Rutas Provinciales): 569 elementos, estilo de origen (3 s)
  ✓ Isla: 77 elementos, estilo de origen (9 s)
  ✓ Corriente de agua líneas perenne: 1622 elementos, estilo de origen (5 s)
  ✓ Corriente de agua líneas intermitente: 5441 elementos, estilo de origen (9 s)
  ✓ Espejo de agua: 1076 elementos, estilo de origen (3 s)
  ✓ Corriente de agua áreas: 15 elementos, estilo de origen (1 s)
  ✓ Dique: 1 elementos, estilo de origen (1 s)
  ✓ Curva batimétrica: 481 elementos, estilo de origen (3 s)
  ✓ Cerro: 494 elementos, estilo de origen (3 íconos) (1 s)
  ✓ Área marina protegida: 0 elementos, estilo de origen (1 s)
  ✓ Ordenamiento Territorial de Bosques Nativos: 7 elementos, estilo de origen (241 s)
  ✓ Glaciar (continental): 1496 elementos, estilo de origen (4 s)
  ✓ Tierras áridas: 1046 elementos, estilo de origen (2 s)
  ✓ Áreas protegidas Nacionales: 3 elementos, estilo de origen (1 s)
  ✓ Reservas de Biosfera: 3 elementos, estilo de origen (1 s)
  ✓ Sitios RAMSAR: 1 elementos, estilo de origen (1 s)
  ✓ Departamento: 23 elementos, estilo de origen (13 s)
  ✓ Límite interdepartamental o de partido: 42 elementos, estilo de origen (2 s)
  ✓ Límite internacional: 3 elementos, estilo de origen (1 s)
  ✓ Límite interprovincial: 2 elementos, estilo de origen (1 s)
  ✓ País: 1 elementos, estilo de origen (54 s)
  ✓ Provincia: 3 elementos, estilo de origen (7 s)
  ✓ Red altimétrica: 1194 elementos, estilo de origen (1 íconos) (2 s)
  ✓ Red geocéntrica: 503 elementos, estilo de origen (1 íconos) (1 s)
  ✓ Red gravimétrica: 1012 elementos, estilo de origen (1 íconos) (2 s)
  ✓ Red RAMSAC: 4 elementos, estilo de origen (1 íconos) (1 s)
  ✓ Límites de espacios marítimos: 6 elementos, estilo de origen (3 s)
  ✓ Gobierno Local: 47 elementos, estilo de origen (2 íconos) (1 s)
  ✓ Paso fronterizo: 10 elementos, estilo de origen (3 íconos) (1 s)
  ✓ Línea de costa: 83 elementos, estilo de origen (5 s)
  ✓ Edificio de seguridad: 108 elementos, estilo de origen (3 íconos) (1 s)
  ✓ Cuartel de bomberos: 28 elementos, estilo de origen (3 íconos) (1 s)
  ✓ Área de vegetación natural arbórea cerrada: 2556 elementos, estilo de origen (36 s)
  ✓ Estación meteorológica: 3 elementos, estilo de origen (1 s)
Listo: 42 de 42 capas en el nodo., semanal) y el visor las sirve desde el nodo, sin depender de que el servicio de origen responda; las demás se piden al organismo.
- **Agregar capas** de otros servicios WMS o de archivos GeoJSON, KML, GPX y Shapefile.
- **Accesibilidad**: modo claro u oscuro (a elección o según el sistema), texto grande, alto contraste, movimiento reducido y uso completo con teclado.
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
| `generar-limite-chubut.mjs` | Regenera el límite del Chubut que recorta y filtra las capas del visor |
| `importar-capas-nacionales.mjs` | Copia al nodo (esquema y workspace `nacional`) las capas nacionales con WFS recortadas al Chubut, con el estilo de origen; programarlo semanal |
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
