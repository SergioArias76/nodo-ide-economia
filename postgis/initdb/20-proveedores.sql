-- Modelo inicial (borrador) de proveedores. A ajustar con la estructura real del Registro Provincial.
\connect ide
SET ROLE ide_admin;

CREATE TABLE proveedores.proveedor (
    id              serial PRIMARY KEY,
    cuit            varchar(11) NOT NULL UNIQUE,
    razon_social    text NOT NULL,
    tipo_persona    varchar(10) CHECK (tipo_persona IN ('humana', 'juridica')),
    rubro           text,
    estado          text,
    fecha_alta      date,
    actualizado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE proveedores.domicilio (
    id              serial PRIMARY KEY,
    proveedor_id    integer NOT NULL REFERENCES proveedores.proveedor(id) ON DELETE CASCADE,
    tipo            varchar(20) NOT NULL DEFAULT 'radicacion',  -- radicacion | legal | sucursal
    calle           text,
    numero          text,
    localidad       text,
    departamento    text,
    provincia       text DEFAULT 'Chubut',
    codigo_postal   text,
    geocod_fuente   text,   -- p. ej. georef-ar, manual
    geocod_calidad  text,
    geom            geometry(Point, 4326)
);
CREATE INDEX domicilio_geom_idx ON proveedores.domicilio USING gist (geom);

-- Vista pública: sin domicilio exacto para personas humanas (ver docs/convenciones.md)
CREATE VIEW proveedores.v_proveedores_publico AS
SELECT d.id, p.razon_social, p.rubro, p.estado, d.localidad, d.departamento, d.geom
FROM proveedores.proveedor p
JOIN proveedores.domicilio d ON d.proveedor_id = p.id
WHERE d.tipo = 'radicacion'
  AND p.tipo_persona = 'juridica';
