-- Proveedores desde la API del Registro de Proveedores (docs/api-proveedores.md).
-- Idempotente: corre al inicializar una base nueva y, en una existente, lo ejecuta
-- scripts/importar-api-proveedores.mjs antes de cada importación.
--
-- La API trae los proveedores inscriptos en la plataforma nueva: son datos recientes y pisan los del
-- padrón del SIAFyC (que tiene también proveedores viejos y desactualizados). Lo recibido se guarda
-- en api_proveedor y no depende de la carga del padrón: cada carga del SIAFyC lo vuelve a aplicar
-- con postgis/etl/proveedores_desde_api.sql.
\connect ide
SET ROLE ide_admin;

-- activo | baja. La API puede dar de baja a un proveedor que sigue en el padrón del SIAFyC.
ALTER TABLE proveedores.proveedor ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'activo';

-- Último estado de cada proveedor recibido de la API, tal como vino, más la ubicación de partida
-- que calculó el importador para su domicilio legal. La ubicación definitiva puede mejorarla una
-- corrección (proveedores.domicilio_correccion, por CUIT y domicilio), como en el padrón.
CREATE TABLE IF NOT EXISTS proveedores.api_proveedor (
    cuit                varchar(11) PRIMARY KEY,
    estado              text NOT NULL,                 -- activo | baja
    fecha_modificacion  timestamptz NOT NULL,
    datos               jsonb NOT NULL,                -- el proveedor como lo devuelve la API
    domicilio_orig      text,                          -- domicilio legal en un texto ("Francisco Segui 562 Piso 1")
    localidad           text,                          -- de Georef, por localidad_id
    departamento        text,
    provincia           text,
    precision           text,                          -- de la ubicación de partida
    fuente_geo          text,
    geom                geometry(Point, 4326),
    recibido_en         timestamptz NOT NULL DEFAULT now()
);

-- Una fila por consulta correcta: "generado" es el modificados_desde de la siguiente
CREATE TABLE IF NOT EXISTS proveedores.api_sincronizacion (
    id                serial PRIMARY KEY,
    modificados_desde timestamptz,                     -- null: padrón completo
    generado          timestamptz NOT NULL,
    recibidos         integer NOT NULL,
    ejecutado_en      timestamptz NOT NULL DEFAULT now()
);

-- Vistas publicables: solo proveedores activos, y de qué fuente vienen sus datos
CREATE OR REPLACE VIEW proveedores.v_proveedores_publico AS
SELECT p.id, p.entidad, p.cuit, p.tipo_persona,
       -- calle y altura, sin piso ni depto. ("Avenida." viene así de la normalización)
       nullif(concat_ws(' ', replace(d.calle, 'Avenida.', 'Avenida'), d.altura), '') AS domicilio,
       p.rubro_principal, p.rubros, p.rubro_n1,
       d.localidad, d.departamento, d.provincia,
       d.precision,
       d.geom::geometry(Point, 4326) AS geom,
       CASE WHEN p.fuente = 'registro' THEN 'Registro de Proveedores' ELSE 'Padrón del SIAFyC' END AS fuente_datos
FROM proveedores.proveedor p
JOIN proveedores.domicilio d ON d.proveedor_id = p.id
WHERE p.tipo_persona IN ('juridica', 'fisica')
  AND p.estado = 'activo'
  AND d.precision <> 'provincia';

CREATE OR REPLACE VIEW proveedores.v_proveedores_por_localidad AS
SELECT row_number() OVER (ORDER BY d.provincia, d.localidad) AS id,
       d.localidad, d.departamento, d.provincia,
       count(*)                                          AS cant_proveedores,
       count(*) FILTER (WHERE p.tipo_persona = 'juridica') AS cant_juridicas,
       count(*) FILTER (WHERE p.tipo_persona = 'fisica')   AS cant_fisicas,
       ST_Centroid(ST_Collect(d.geom))::geometry(Point, 4326) AS geom
FROM proveedores.proveedor p
JOIN proveedores.domicilio d ON d.proveedor_id = p.id
WHERE d.precision <> 'provincia'
  AND p.estado = 'activo'
GROUP BY d.provincia, d.departamento, d.localidad;
