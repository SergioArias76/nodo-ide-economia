# Hoja de ruta

## Fase 0 – Preparación (en curso)
- [x] Nota de solicitud de servidor
- [x] Repositorio y stack Docker Compose base
- [x] Portal Next.js base (inicio, visor, catálogo)
- [x] Levantar el stack en entorno local y validar (Windows + Docker, ver prueba-local.md)
- [ ] Definir subdominio y origen del certificado con la DGOI

## Fase 1 – Infraestructura
- [ ] Recepción del servidor y hardening básico (SSH por clave, ufw, actualizaciones automáticas)
- [ ] Despliegue del stack
- [ ] Backups automáticos y monitoreo básico (healthchecks)

## Fase 2 – Primeras capas
- [x] Modelo de datos `proveedores` y carga de prueba desde el paquete QGIS (SIPPE 07/09/2026)
- [x] Probar la carga con el stack levantado
- [ ] Integración directa con el Registro (reemplazar el paquete QGIS): API propuesta en api-proveedores.md; falta el importador del reporte Excel del SIAFyC
- [x] Mejorar la geocodificación (regeocodificación con Georef y OpenStreetMap: 1.578 personas humanas mejor ubicadas)
- [ ] Corregir a mano los 1.805 domicilios que no se pudieron ubicar (barrios, chacras, rutas)
- [x] Publicación WMS/WFS de `economia:proveedores_*` (WFS en nivel BASIC, sin transacciones)
- [x] Estilos SLD institucionales

## Fase 3 – Catálogo y federación
- [ ] Registros de metadatos en GeoNetwork (perfil IDERA)
- [ ] Alta del nodo ante la IDE provincial e IDERA
- [ ] Harvesting/CSW habilitado

## Fase 4 – Consumo
- [x] Visor con las herramientas del de IDERA, capas nacionales por tema, consulta GetFeatureInfo e identidad provincial
- [ ] Visor: capas de la IDE Chubut y búsqueda de proveedores por nombre, CUIT o rubro
- [ ] Integración con tableros de gestión del Ministerio
