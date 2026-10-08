-- Modelo de proveedores. Estructura tomada del paquete QGIS de proveedores (SIPPE 07/09/2026).
-- La carga se hace con scripts/cargar-proveedores.sh (staging → este modelo).
\connect ide
SET ROLE ide_admin;

CREATE TABLE proveedores.proveedor (
    id               integer PRIMARY KEY,
    cuit             varchar(11) UNIQUE,          -- sin guiones; 5 registros del padrón vienen sin CUIT
    nro_comp         text,                         -- número del registro en SIPPE
    entidad          text NOT NULL,
    -- Por prefijo de CUIT: 20/23/24/27 persona física, 30/33/34 persona jurídica
    tipo_persona     text GENERATED ALWAYS AS (
                       CASE WHEN left(cuit, 2) IN ('20', '23', '24', '27') THEN 'fisica'
                            WHEN left(cuit, 2) IN ('30', '33', '34') THEN 'juridica'
                       END) STORED,
    rubro_principal  text,
    rubros           text,                         -- todos los rubros separados por ' | '
    cant_rubros      integer,
    rubro_n1         text,
    rubro_n2         text,
    rubro_n3         text,
    mail             text,                         -- dato personal: no se publica
    telefono         text,                         -- dato personal: no se publica
    fuente           text NOT NULL,
    cargado_en       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE proveedores.proveedor_rubro (
    proveedor_id  integer NOT NULL REFERENCES proveedores.proveedor(id) ON DELETE CASCADE,
    rubro         text NOT NULL,
    PRIMARY KEY (proveedor_id, rubro)
);
CREATE INDEX proveedor_rubro_rubro_idx ON proveedores.proveedor_rubro (rubro);

CREATE TABLE proveedores.domicilio (
    proveedor_id    integer PRIMARY KEY REFERENCES proveedores.proveedor(id) ON DELETE CASCADE,
    direccion       text,                          -- dirección normalizada usada para geocodificar
    domicilio_orig  text,                          -- tal como figura en el padrón
    calle           text,
    altura          text,
    complemento     text,
    cp              text,
    localidad       text,
    departamento    text,
    provincia       text,
    pais            text,
    calidad_dir     text,                          -- ALTA | MEDIA | BAJA | SIN DATO
    -- calle_altura | calle_altura_interpolada | calle_altura_sin_validar
    -- | calle_sin_altura | localidad | provincia
    precision       text NOT NULL,
    fuente_geo      text,                          -- georef | nominatim/...
    geom            geometry(Point, 4326) NOT NULL
);
CREATE INDEX domicilio_geom_idx ON proveedores.domicilio USING gist (geom);
CREATE INDEX domicilio_localidad_idx ON proveedores.domicilio (provincia, localidad);

-- Correcciones de ubicación (regeocodificación o carga manual). No referencia a proveedor porque la
-- carga del padrón vacía esa tabla en cascada: se identifica por CUIT y vale mientras el domicilio del
-- padrón siga siendo el mismo (domicilio_orig). La aplica postgis/etl/proveedores_desde_staging.sql.
CREATE TABLE proveedores.domicilio_correccion (
    cuit            varchar(11) PRIMARY KEY,
    domicilio_orig  text NOT NULL,                 -- domicilio del padrón al que corresponde la corrección
    calle           text,
    altura          text,
    localidad       text,
    departamento    text,
    provincia       text,
    precision       text NOT NULL,
    fuente_geo      text NOT NULL,                 -- nominatim/regeo | manual
    geom            geometry(Point, 4326) NOT NULL,
    nota            text,
    actualizado_en  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Vistas publicables (lo único que lee GeoServer; ver docs/convenciones.md)
-- ---------------------------------------------------------------------------

-- Proveedores con ubicación al menos a nivel localidad. Sin mail ni teléfono.
-- Personas jurídicas y físicas con su domicilio y punto exactos (decisión del Ministerio: los datos de
-- proveedores del Estado son públicos). Los 6 proveedores sin tipo (CUIT no reconocido) quedan fuera.
CREATE VIEW proveedores.v_proveedores_publico AS
SELECT p.id, p.entidad, p.cuit, p.tipo_persona,
       -- calle y altura, sin piso ni depto. ("Avenida." viene así de la normalización)
       nullif(concat_ws(' ', replace(d.calle, 'Avenida.', 'Avenida'), d.altura), '') AS domicilio,
       p.rubro_principal, p.rubros, p.rubro_n1,
       d.localidad, d.departamento, d.provincia,
       d.precision,
       d.geom::geometry(Point, 4326) AS geom
FROM proveedores.proveedor p
JOIN proveedores.domicilio d ON d.proveedor_id = p.id
WHERE p.tipo_persona IN ('juridica', 'fisica')
  AND d.precision <> 'provincia';

-- Conteo de todos los proveedores (incluidas personas físicas) por localidad.
CREATE VIEW proveedores.v_proveedores_por_localidad AS
SELECT row_number() OVER (ORDER BY d.provincia, d.localidad) AS id,
       d.localidad, d.departamento, d.provincia,
       count(*)                                          AS cant_proveedores,
       count(*) FILTER (WHERE p.tipo_persona = 'juridica') AS cant_juridicas,
       count(*) FILTER (WHERE p.tipo_persona = 'fisica')   AS cant_fisicas,
       ST_Centroid(ST_Collect(d.geom))::geometry(Point, 4326) AS geom
FROM proveedores.proveedor p
JOIN proveedores.domicilio d ON d.proveedor_id = p.id
WHERE d.precision <> 'provincia'
GROUP BY d.provincia, d.departamento, d.localidad;

GRANT SELECT ON proveedores.v_proveedores_publico, proveedores.v_proveedores_por_localidad TO geoserver_ro;
