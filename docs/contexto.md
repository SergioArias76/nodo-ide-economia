# Contexto y solicitud de servidor

Resumen de la nota de solicitud de infraestructura dirigida a la Dirección General de Organización e Implementación (Subsecretaría de Innovación y Mejora de Procesos, Secretaría General de Gobierno), septiembre 2026.

- **Firma:** Jefe de Área de Sistemas de Información y Transparencia – Ministerio de Economía
- **Estado:** nota presentada, pendiente de número y respuesta.

## Fundamento

El Ministerio administra información territorial sin plataforma propia de publicación: en particular, **domicilios y radicación de proveedores y contratistas inscriptos en el Registro Provincial**. Hoy está en planillas y sistemas transaccionales que no exponen servicios geográficos, lo que impide:

- la consulta espacial,
- el cruce con capas de otros organismos,
- la publicación bajo estándares abiertos.

Un nodo propio permite:

- publicar servicios OGC (WMS, WFS, WMTS) con metadatos normalizados;
- evitar la duplicación de capas base;
- sostener los tableros de gestión del Ministerio sobre servicios propios;
- aportar capas a la IDE provincial e IDERA **sin transferir la custodia** de los datos.

## Infraestructura solicitada

| Ítem | Requerimiento |
|---|---|
| Modalidad | Servidor virtual |
| Procesamiento | 2 vCPU |
| Memoria | 8 GB RAM |
| Almacenamiento | 100 GB (ampliable) |
| Sistema operativo | Ubuntu Server 24.04 LTS |
| Despliegue | Docker / Docker Compose |
| Publicación | Subdominio bajo `chubut.gob.ar`, TLS, puertos 80/443 |
| Acceso | Credenciales de administración + SSH para el personal del Área |
| Resguardo | Backups periódicos y snapshots previos a actualizaciones |
| Disponibilidad | Monitoreo y ventana de mantenimiento acordada |

El dimensionamiento toma como referencia la **Plataforma de Proveedores del Estado**, que opera en producción sobre un servidor equivalente. Al ser infraestructura virtualizada, cómputo y almacenamiento pueden ampliarse luego sobre métricas reales.

## Pendientes con la DGOI

- [ ] Número de nota y fecha de presentación
- [ ] Asignación del servidor (IP, credenciales, acceso SSH)
- [ ] Subdominio definitivo (propuesta: `ide-economia.chubut.gob.ar`)
- [ ] Certificado TLS (wildcard provincial o Let's Encrypt)
- [ ] Esquema de responsabilidades: SO, seguridad perimetral, aplicación
- [ ] Política de backups/snapshots y ventana de mantenimiento
