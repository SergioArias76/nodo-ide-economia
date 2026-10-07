# Lineamientos IDERA aplicados al nodo

Fuente: [IDERA – Construir una IDE](https://www.idera.gob.ar/index.php/implementacion-de-una-ide/construir-una-ide) (consultado oct. 2026).

IDERA organiza la construcción de una IDE en cuatro ejes. Estado en este nodo:

## 1. Decisión política

- Carta de Adhesión a IDERA (modelo disponible en el sitio de IDERA).
- Compromiso institucional con la producción, estandarización y apertura de la información georreferenciada.

| Tarea | Estado |
|---|---|
| Nota de solicitud de servidor a la DGOI | Presentada |
| Carta de Adhesión del Ministerio a IDERA | Pendiente |

## 2. Equipo de gestión IDE

Definir quién coordina y quién produce información geográfica, y las áreas responsables de **producción, recopilación, integración, actualización y publicación**.

| Rol | Responsable |
|---|---|
| Coordinación del nodo | ASIyT – Ministerio de Economía |
| Administración técnica (servidor, servicios) | ASIyT |
| Producción de datos de proveedores | Registro Provincial de Proveedores (a confirmar) |
| Infraestructura (SO, perímetro) | DGOI (a confirmar según respuesta a la nota) |

Referencias IDERA: *Recomendaciones para nodo IDE*, *Contenido recomendado para geoportales*.

## 3. Datos e información geográfica

Datos bajo estándares **OGC** y normas **ISO 19100**. Documentos de referencia IDERA:

- Catálogo de Objetos Geográficos IDERA v2.2 (sept. 2025)
- Descripción de Datos Básicos y Fundamentales v2.1
- Estructura de Base de Datos en PostgreSQL/PostGIS
- Normalización de capas para servicios OGC v1.1
- Recomendaciones para Servicios WMS v1.5
- Simbología de Datos Básicos y Fundamentales

Aplicación en este repo: ver [convenciones.md](convenciones.md). Las capas propias (proveedores) no forman parte de los Datos Básicos y Fundamentales; las capas base (límites, localidades, red vial) se **consumen** de IGN / IDE provincial en lugar de duplicarse.

## 4. Infraestructura tecnológica

| Componente IDERA | Recomendado por IDERA | En este nodo |
|---|---|---|
| Base de datos espacial | PostgreSQL + PostGIS | PostGIS 16 (Docker) |
| Servidor de mapas | GeoServer | GeoServer (Docker oficial) |
| Gestor de metadatos | GeoNetwork | GeoNetwork 4 (Docker oficial) |
| Visor / geoportal | Argenmap (ejemplo) | Portal propio en **Next.js + OpenLayers** |
| Servicios | WMS, WFS, CSW | WMS, WFS, WMTS (GeoWebCache), CSW |

La *Guía de Instalación y Configuración de Nodo IDE v1.3* de IDERA usa CentOS 7 + Tomcat. Aquí se usa Ubuntu 24.04 + Docker (lo solicitado a la DGOI); los componentes son los mismos.

## Metadatos

- **Perfil de Metadatos IDERA** (ISO 19115/19139) para datos.
- **Perfil de Metadatos para Servicios OGC – IDERA v1.0** para servicios.
- *Guía de Buenas Prácticas de Metadatos v1.0*.
- GeoNetwork debe quedar **vinculado con GeoServer** (enlaces a los servicios en cada registro).

## Federación

- Exponer **CSW** de GeoNetwork para harvesting desde la IDE provincial / IDERA.
- Alta en el listado de organismos adheridos.
- Contacto: contacto@idera.gob.ar
