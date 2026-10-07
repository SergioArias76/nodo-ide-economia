# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Personal del Ministerio de Economía del Chubut**: equipos técnicos que analizan proveedores del Estado, economía regional y planificación.
- **Empresas y proveedores**: consultan dónde están otros proveedores, sus rubros y oportunidades.
- **Ciudadanía en general**: consulta datos públicos del Estado provincial.
- **Otros organismos e IDEs** (áreas provinciales, municipios, IDERA): técnicos SIG que consumen los servicios OGC del nodo.

Se usa por igual en escritorio (oficina, sesiones de análisis) y en celular (consultas rápidas en territorio).

## Product Purpose

Nodo de la Infraestructura de Datos Espaciales (IDE) del Ministerio de Economía de la Provincia del Chubut, a cargo del Área de Sistemas de Información y Transparencia (ASIyT). Publica la información geográfica del Ministerio con servicios estándar OGC (WMS, WFS, WMTS, CSW), documentada con metadatos según el perfil IDERA, y la muestra en un portal con visor de mapas y catálogo. Éxito: que cualquiera de los usuarios encuentre y entienda un dato territorial del Ministerio sin ayuda, y que el nodo se integre a IDERA.

## Positioning

Es la fuente oficial de los datos geográficos del Ministerio de Economía del Chubut (hoy, el Sistema Provincial de Proveedores del Estado, SIPPE), combinados en un mismo visor con las capas nacionales del catálogo IDERA (educación, salud, transporte, límites, ambiente).

## Operating Context

- Portal Next.js con visor OpenLayers (`/visor`), catálogo (`/catalogo`) e inicio; GeoServer, GeoNetwork y PostGIS detrás de Nginx, en una VM provincial (DGOI).
- El visor debe ofrecer las mismas funciones que el visor de IDERA (mapa.idera.gob.ar): capas por tema, mapas base, agregar capas WMS y archivos, consulta por clic, medir, dibujar, imprimir, captura, ubicación, grilla, vista compartible por URL.
- Mapa base inicial OpenStreetMap; Argenmap (IGN) disponible.

## Capabilities and Constraints

- Datos de proveedores públicos (confirmado por el área): se publican entidad, CUIT, domicilio, rubros y localidad de personas jurídicas; conteos por localidad de todos los proveedores.
- Capas nacionales vía WMS de terceros: algunas no permiten CORS (no exportables) y su disponibilidad depende de cada organismo.
- Idioma: español rioplatense (voseo).

## Brand Commitments

Identidad visual del Gobierno del Chubut y del Ministerio de Economía (archivos entregados por el área, fuera del repositorio: `Downloads/drive-download-20261007T190840Z-1-001`):

- Isotipo de la provincia con forma del mapa del Chubut en franjas: `#FFC815`, `#FFB109`, `#FF8540`, `#FF682C`, `#5894A7`, `#21708C`. Versiones color, escala de grises y pluma, para fondo claro (`_b`) y oscuro (`_n`).
- Logotipo "Ministerio de Economía · Gobierno del Chubut" en Rubik (Medium/SemiBold) junto al isotipo.
- Tipografía institucional para texto: Public Sans.
- Favicons oficiales y biblioteca de íconos provincial por tema (Salud, Educación, Energía, Transporte, Seguridad, etc.).

## Evidence on Hand

- 12.435 proveedores del SIPPE (07/09/2026), 3.786 personas jurídicas publicadas, 254 localidades.
- Catálogo IDERA: 76 capas nacionales en 10 temas (`portal/src/lib/capas-idera.json`).
- No hay testimonios, métricas de uso ni casos publicados: no inventarlos.

## Product Principles

1. Dato oficial primero: cada capa dice de dónde viene y qué representa.
2. Familiar para quien usa visores de IDE: las herramientas están donde un usuario de IDERA las busca.
3. Igual de útil en el celular que en el escritorio.
4. Accesible y en lenguaje claro para la ciudadanía, sin perder precisión técnica.

## Accessibility & Inclusion

Sitio público del Estado: contraste suficiente, uso completo con teclado, preferencias de texto grande, alto contraste y movimiento reducido (ya implementadas en el visor).
