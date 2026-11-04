# API de proveedores (propuesta)

Contrato que la plataforma de proveedores debería exponer para que el nodo IDE actualice el mapa de proveedores del Estado provincial. Hasta que exista la API, el nodo lee el reporte Excel del SIAFyC y lo convierte a este mismo formato (ver [Transición desde el reporte Excel](#transición-desde-el-reporte-excel)).

El nodo **solo lee**: nunca escribe en la plataforma.

## Consulta

```
GET /api/proveedores?modificados_desde=2026-10-01T00:00:00Z&pagina=1&por_pagina=500
Authorization: Bearer <token>
Accept: application/json
```

| Parámetro | Obligatorio | Descripción |
|---|---|---|
| `modificados_desde` | No | Fecha y hora ISO 8601 (UTC). Devuelve solo los proveedores creados o modificados desde ese momento, **incluidas las bajas**. Sin el parámetro devuelve el padrón completo. |
| `pagina` | No | Número de página, desde 1. Por defecto 1. |
| `por_pagina` | No | Hasta 1000. Por defecto 500. |

**Autenticación:** token de solo lectura emitido para el nodo IDE (`Authorization: Bearer`). La consulta es de servidor a servidor, así que no hace falta habilitar CORS.

## Respuesta

```json
{
  "total": 12435,
  "pagina": 1,
  "por_pagina": 500,
  "generado": "2026-10-07T18:30:00Z",
  "proveedores": [
    {
      "cuit": "30710483104",
      "nro_inscripcion": "60538",
      "razon_social": "ANTONIO F. VICTORINO Y ANTONIO F. EDUARDO S.DE H.",
      "estado": "activo",
      "fecha_alta": "2019-03-12",
      "fecha_modificacion": "2026-09-30T14:02:11Z",
      "domicilio": {
        "tipo": "legal",
        "calle": "Francisco Segui",
        "calle_id": "2601402000150",
        "altura": "562",
        "entre_calle_1": null,
        "entre_calle_2": null,
        "piso": null,
        "depto": null,
        "barrio": null,
        "manzana": null,
        "lote": null,
        "casa": null,
        "ruta": null,
        "km": null,
        "localidad": "Rada Tilly",
        "localidad_id": "26014030",
        "codigo_postal": "9001",
        "provincia": "Chubut",
        "lat": -45.9239,
        "lon": -67.5574,
        "origen_coordenadas": "georef"
      },
      "rubros": [
        {
          "rubro": { "codigo": "01", "nombre": "AGRICULTURA, GANADERIA, CAZA, Y SILVICULTURA" },
          "categoria": { "codigo": "0101", "nombre": "CULTIVOS AGRICOLAS" },
          "subcategoria": { "codigo": "010101", "nombre": "CEREALES" },
          "principal": true
        }
      ],
      "contacto": { "email": "proveedor@ejemplo.com", "telefono": "0297-4000000" }
    }
  ]
}
```

Los valores son de ejemplo: los códigos de categoría y subcategoría, y el `calle_id`, son ilustrativos.

### Campos

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `cuit` | texto, 11 dígitos sin guiones | Sí | Identifica al proveedor. El nodo deduce de los dos primeros dígitos si es persona física (20, 23, 24, 27) o jurídica (30, 33, 34). |
| `nro_inscripcion` | texto | Sí | Número de inscripción en el registro (hoy `nro_comp` en el reporte). |
| `razon_social` | texto | Sí | Nombre o razón social. |
| `estado` | `activo`, `suspendido` o `baja` | Sí | El mapa muestra solo los `activo`. |
| `fecha_alta` | fecha ISO | No | |
| `fecha_modificacion` | fecha y hora ISO (UTC) | Sí | Última modificación del legajo; es la base de la actualización incremental. |
| `domicilio.tipo` | `legal`, `real` o `comercial` | Sí | Si el registro guarda más de un domicilio, se envía el legal (el que usa el mapa hoy). |
| `domicilio.calle` | texto | Sí, salvo domicilio rural | **Solo el nombre de la calle**, sin número, piso, barrio ni localidad. |
| `domicilio.calle_id` | texto | No | Identificador de la calle en Georef. Resuelve calles abreviadas o mal escritas ("JUAN D. PERON", "LOS CIPRECES") y las calles que solo tienen número, como "CODIGO 2465" de Comodoro (en Georef, "CALLE 2465"). |
| `domicilio.altura` | texto | No | Número de puerta. Vacío si no tiene (no `0`). |
| `domicilio.entre_calle_1`, `entre_calle_2` | texto | No | Esquina o entrecalles. Hoy vienen dentro de la calle ("HUDSON Y BUCETICH"). |
| `domicilio.piso`, `domicilio.depto` | texto | No | Van separados: no se publican y no se usan para ubicar. |
| `domicilio.barrio`, `manzana`, `lote`, `casa` | texto | No | Para los barrios de vivienda sin calle ("Bº 630 VIVIENDAS MBK 53", "MANZANA 28 LOTE 9"). Hoy vienen mezclados en el texto del domicilio. |
| `domicilio.ruta`, `domicilio.km` | texto | No | Domicilios sobre ruta ("RUTA PROV. 44 KM 22"). |
| `domicilio.localidad` | texto | Sí | Nombre de la localidad, nunca el de la provincia ni el del departamento. |
| `domicilio.localidad_id` | texto | Sí | Identificador de la localidad en Georef (BAHRA/INDEC), elegido de una lista al cargar el domicilio. Evita ambigüedades como Sarmiento o San Martín, y los padrones que dicen "Santa Fe" para un proveedor de Rufino. |
| `domicilio.codigo_postal` | texto | No | Separado de la localidad. |
| `domicilio.provincia` | texto | Sí | |
| `domicilio.lat`, `domicilio.lon` | número (WGS84) | Sí para domicilios rurales, de barrio sin calle o sobre ruta; en el resto, recomendado | Si la plataforma valida el domicilio al cargarlo (con la API Georef o marcándolo en un mapa), el nodo usa estas coordenadas y no geocodifica. |
| `domicilio.origen_coordenadas` | `georef`, `mapa` o `declarado` | Si hay `lat`/`lon` | Cómo se obtuvieron: el nodo muestra la precisión en el visor. |
| `rubros[]` | lista | Sí | Al menos uno, con rubro, categoría y subcategoría (los tres niveles del reporte actual). `principal: true` en uno solo. |
| `contacto` | objeto | No | El nodo lo guarda en la base interna y **nunca lo publica**. |

### Errores

| Código | Cuándo |
|---|---|
| 400 | Parámetro inválido (fecha mal formada, `por_pagina` fuera de rango). |
| 401 / 403 | Token ausente, vencido o sin permiso. |
| 429 | Demasiadas consultas; indicar la espera en el encabezado `Retry-After`. |
| 500 / 503 | Error de la plataforma: el nodo reintenta más tarde y conserva los datos anteriores. |

Cuerpo de error: `{ "error": "texto para personas", "codigo": "parametro_invalido" }`.

## Por qué así

- **Domicilio en campos separados.** El reporte actual trae la calle, el número, el piso y a veces la localidad en un solo texto (`SEGUI Nro 562 Piso 3`, `MANUEL CASAS Nro 128 MEDANOS - VILLARINO`), y la localidad pegada al código postal (`9001 Rada Tilly`). Por eso el paquete de septiembre dejó 7.739 direcciones sin resolver y 85 personas físicas sin ubicar.
- **Coordenadas desde el origen.** Validar el domicilio cuando el proveedor lo carga corrige el dato una sola vez, para todos los sistemas que lo usen, no solo para el mapa.
- **Lo que la geocodificación no puede resolver.** Después de dos pasadas sobre el padrón del SIAFyC (Georef, OpenStreetMap e interpolación con proveedores vecinos, noviembre de 2026), 1.758 proveedores siguen en el centro de su localidad o provincia. Casi la mitad no tiene una calle que se pueda buscar: barrios de vivienda con manzana y casa (~320), chacras, lotes y parajes (~150), sin domicilio "S/D" (~85), rutas con kilómetro (~85) y calles por código de Comodoro (~80). Para esos, los campos separados (`barrio`, `manzana`, `ruta`, `km`, `calle_id`) y las coordenadas marcadas en un mapa al cargar el legajo son la única forma de ubicarlos.
- **Actualización incremental.** Con `modificados_desde`, el nodo trae solo lo que cambió desde la última consulta y la carga tarda segundos.
- **Estado explícito.** Hoy no se distinguen las bajas ni las suspensiones.

## Validaciones sugeridas en la carga del legajo

Son del lado de la plataforma de proveedores; el nodo no las puede hacer después:

1. **Domicilio obligatorio**: no aceptar "S/D", "S/N" ni altura `0`.
2. **Localidad de una lista** (catálogo Georef), con su `localidad_id`: no texto libre.
3. **Calle de una lista** cuando la localidad la tiene en Georef (`calle_id`), con la altura validada contra la numeración de la cuadra.
4. **Marcar el punto en un mapa** cuando no hay calle (zona rural, barrio sin calles, ruta) o cuando la calle no está en la lista.
5. **Campos separados** para piso, departamento, barrio, manzana, lote y casa, en lugar de un solo texto.

## Qué hace el nodo con cada consulta

Lo implementa [`scripts/importar-api-proveedores.mjs`](../scripts/importar-api-proveedores.mjs); el detalle está en [datos-proveedores.md](datos-proveedores.md#actualización-desde-la-api-del-registro-de-proveedores).

1. Pide las páginas con `modificados_desde` igual al `generado` de la última importación correcta.
2. Los datos de la API pisan los del padrón del SIAFyC para el mismo CUIT; los que no estaban se agregan.
3. Ubica el domicilio legal:
   - reusa la ubicación ya calculada cuando el domicilio no cambió;
   - si es nuevo o cambió, lo geocodifica (Georef y, si no alcanza, OpenStreetMap);
   - si la geocodificación no llega a la calle y altura, usa `lat`/`lon` (el pin del proveedor), salvo que esté en la posición por defecto del mapa o en otra localidad. Con pines validados en la plataforma (`origen_coordenadas` confiable), se podrían usar directamente.
4. Aplica las correcciones manuales (tabla `proveedores.domicilio_correccion`), que se conservan entre cargas.
5. Actualiza las tablas de `proveedores` en una sola transacción: si algo falla, queda la versión anterior.
6. Las vistas públicas (`v_proveedores_publico`, `v_proveedores_por_localidad`) y GeoServer toman los cambios solos.

### Lo que se observó en la primera importación (noviembre de 2026)

- `localidad_id` llega completado a 10 dígitos (`0026077040` es la localidad `26077040` de Georef) y las provincias sin tilde (`Rio Negro`). El nodo lo resuelve con Georef.
- 201 de los 773 pines (26 %) están en el centro exacto de la localidad: la posición inicial del mapa de "Mis Datos" que el proveedor no movió. Conviene que la plataforma mande `lat`/`lon` solo si el proveedor movió o confirmó el pin.
- En una muestra de pines movidos que no coincidían con la geocodificación, los 7 que Georef pudo verificar estaban a entre 0,6 y 1,4 km de la calle y altura declaradas: por eso el nodo prefiere la geocodificación cuando llega a la altura.
- La respuesta todavía no trae el cursor `siguiente`: la paginación es por número de página.

Lo que se publica de cada proveedor está en [datos-proveedores.md](datos-proveedores.md).

## Transición desde el reporte Excel

Mientras no exista la API, el importador lee el reporte del SIAFyC y lo convierte a este formato:

| Reporte Excel (SIAFyC) | Campo de la API | Conversión |
|---|---|---|
| `cuit` (`30-71048310-4`) | `cuit` | Se quitan los guiones. |
| `nro_comp` | `nro_inscripcion` | |
| `entidad` | `razon_social` | |
| (no existe) | `estado` | Se toma `activo` para todos. |
| `domicilio_orig` (`FRANCISCO SEGUI Nro 562`) | `domicilio.calle`, `altura`, `piso`, `depto` | Se separa con reglas (`Nro`, `Piso`, `Dpto`). |
| `ciudad_orig` (`9001 Rada Tilly`) | `domicilio.codigo_postal`, `localidad` | Se separa el código postal. Si la localidad es el nombre de la provincia, se busca la localidad dentro del texto del domicilio. |
| `rubro` (una fila por rubro) | `rubros[]` | Se agrupan las filas del mismo CUIT. |
| `mail`, `telefono` | `contacto` | |
