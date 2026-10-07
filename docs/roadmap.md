# Hoja de ruta

## Fase 0 – Preparación (en curso)
- [x] Nota de solicitud de servidor
- [x] Repositorio y stack Docker Compose base
- [x] Portal Next.js base (inicio, visor, catálogo)
- [ ] Levantar el stack en entorno local y validar
- [ ] Definir subdominio y origen del certificado con la DGOI

## Fase 1 – Infraestructura
- [ ] Recepción del servidor y hardening básico (SSH por clave, ufw, actualizaciones automáticas)
- [ ] Despliegue del stack
- [ ] Backups automáticos y monitoreo básico (healthchecks)

## Fase 2 – Primeras capas
- [x] Modelo de datos `proveedores` y carga de prueba desde el paquete QGIS (SIPPE 07/09/2026)
- [ ] Probar la carga con el stack levantado
- [ ] Integración directa con el Registro (reemplazar el paquete QGIS)
- [ ] Mejorar la geocodificación de Sarmiento, Trevelin, Lago Puelo, Gaiman y Rada Tilly
- [ ] Publicación WMS/WFS de `economia:proveedores_*`
- [ ] Estilos SLD institucionales

## Fase 3 – Catálogo y federación
- [ ] Registros de metadatos en GeoNetwork (perfil IDERA)
- [ ] Alta del nodo ante la IDE provincial e IDERA
- [ ] Harvesting/CSW habilitado

## Fase 4 – Consumo
- [ ] Visor: más capas propias y de referencia (IGN, IDE Chubut), consulta GetFeatureInfo
- [ ] Integración con tableros de gestión del Ministerio
