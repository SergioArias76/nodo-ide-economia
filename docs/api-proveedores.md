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
        "calle": "Francisco Segui",
        "altura": "562",
        "piso": null,
        "depto": null,
        "localidad": "Rada Tilly",
        "localidad_id": "26014030",
        "codigo_postal": "9001",
        "provincia": "Chubut",
        "lat": -45.9239,
        "lon": -67.5574
      },
      "rubros": [
        { "codigo": "01", "nombre": "AGRICULTURA, GANADERIA, CAZA, Y SILVICULTURA", "principal": true }
      ],
      "contacto": { "email": "proveedor@ejemplo.com", "telefono": "0297-4000000" }
    }
  ]
}
```

### Campos

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `cuit` | texto, 11 dígitos sin guiones | Sí | Identifica al proveedor. El nodo deduce de los dos primeros dígitos si es persona física (20, 23, 24, 27) o jurídica (30, 33, 34). |
| `nro_inscripcion` | texto | Sí | Número de inscripción en el registro (hoy `nro_comp` en el reporte). |
| `razon_social` | texto | Sí | Nombre o razón social. |
| `estado` | `activo`, `suspendido` o `baja` | Sí | El mapa muestra solo los `activo`. |
| `fecha_alta` | fecha ISO | No | |
| `fecha_modificacion` | fecha y hora ISO (UTC) | Sí | Última modificación del legajo; es la base de la actualización incremental. |
| `domicilio.calle` | texto | Sí | **Solo el nombre de la calle**, sin número, piso ni localidad. |
| `domicilio.altura` | texto | No | Número de puerta. Vacío si no tiene (no `0`). |
| `domicilio.piso`, `domicilio.depto` | texto | No | Van separados: no se publican y no se usan para ubicar. |
| `domicilio.localidad` | texto | Sí | Nombre de la localidad, nunca el de la provincia. |
| `domicilio.localidad_id` | texto | No | Identificador de la localidad en Georef (BAHRA/INDEC). Evita ambigüedades como Sarmiento o San Martín. |
| `domicilio.codigo_postal` | texto | No | Separado de la localidad. |
| `domicilio.provincia` | texto | Sí | |
| `domicilio.lat`, `domicilio.lon` | número (WGS84) | No | Si la plataforma valida el domicilio al cargarlo (por ejemplo con la API Georef), el nodo usa estas coordenadas y no geocodifica. |
| `rubros[]` | lista | Sí | Al menos uno. `principal: true` en uno solo. |
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
- **Actualización incremental.** Con `modificados_desde`, el nodo trae solo lo que cambió desde la última consulta y la carga tarda segundos.
- **Estado explícito.** Hoy no se distinguen las bajas ni las suspensiones.

## Qué hace el nodo con cada consulta

1. Pide las páginas con `modificados_desde` igual a la fecha de la última importación correcta.
2. Por cada proveedor:
   - Si trae `lat` y `lon`, los usa.
   - Si no, reusa la ubicación ya calculada cuando el domicilio no cambió.
   - Si es nuevo o cambió, lo geocodifica (Georef y, si no alcanza, OpenStreetMap).
3. Aplica las correcciones manuales (tabla `proveedores.domicilio_correccion`), que se conservan entre cargas.
4. Actualiza las tablas de `proveedores` en una sola transacción: si algo falla, queda la versión anterior.
5. Las vistas públicas (`v_proveedores_publico`, `v_proveedores_por_localidad`) y GeoServer toman los cambios solos.

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
