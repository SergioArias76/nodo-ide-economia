# Datos de prueba: proveedores (paquete QGIS)

Fuente: paquete `QGIS_Proveedores_Chubut_09-09-2026`, generado a partir del padrón SIPPE del 07/09/2026. Se usa como **dato de prueba** del nodo hasta tener una integración directa con el Registro.

El archivo no se versiona: va en `datos/fuentes/proveedores/QGIS_proveedores_puntos.geojson`.

## Contenido

- 12.435 puntos, uno por proveedor, en EPSG:4326, con los rubros agrupados en el campo `rubros` (separados por ` | `).
- Personas humanas (CUIT 20/23/24/27): ~8.400. Personas jurídicas (CUIT 30/33): ~4.000. Hay 6 registros sin CUIT.
- Incluye **CUIT, mail y teléfono**: son datos personales en el caso de personas humanas.

## Precisión de la ubicación

| `precision` | Puntos | Significado |
|---|---|---|
| `calle_altura` | 5.637 | Domicilio exacto |
| `calle_altura_interpolada` | 1.617 | Sobre la calle, altura aproximada |
| `calle_altura_sin_validar` | 287 | Calle correcta, altura estimada |
| `calle_sin_altura` | 365 | Calle, sin número |
| `localidad` | 4.214 | Centro de la localidad |
| `provincia` | 315 | Centro de la provincia (no sirve para mapear) |

Las tres primeras (7.541, un 61%) están en el domicilio real. Localidades sin resolver todavía: Sarmiento, Trevelin, Lago Puelo, Gaiman y Rada Tilly (903 proveedores en total). El departamento se obtuvo con la API Georef (INDEC).

## Carga

```bash
docker compose up -d
scripts/cargar-proveedores.sh
```

1. `ogr2ogr` (contenedor GDAL temporal) carga el GeoJSON en `staging.proveedores_qgis`.
2. [`postgis/etl/proveedores_desde_staging.sql`](../postgis/etl/proveedores_desde_staging.sql) reemplaza el contenido de `proveedores.proveedor`, `proveedor_rubro` y `domicilio` en una transacción.

## Qué se publica

GeoServer solo tiene permiso sobre dos vistas:

| Vista | Capa sugerida | Contenido |
|---|---|---|
| `v_proveedores_publico` | `economia:proveedores_radicacion` | Personas jurídicas con domicilio (calle y altura), sin mail ni teléfono, sin puntos de precisión `provincia` |
| `v_proveedores_por_localidad` | `economia:proveedores_por_localidad` | Cantidad de proveedores (todos) por localidad |

Las tablas completas, con los datos personales, quedan dentro de la base y solo las lee `ide_admin`.
