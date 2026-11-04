-- Aplica los proveedores recibidos de la API del Registro (proveedores.api_proveedor) sobre el modelo.
-- La API son datos recientes: pisa lo que tenga el padrón del SIAFyC para el mismo CUIT y agrega los
-- que no están. Lo ejecutan scripts/importar-api-proveedores.mjs y, después de cada carga del padrón,
-- scripts/cargar-proveedores.sh. Es idempotente: aplica siempre el último estado recibido.
\set ON_ERROR_STOP on

BEGIN;

-- 1. Proveedores que solo están en la API: id nuevo a continuación de los del padrón
INSERT INTO proveedores.proveedor (id, cuit, entidad, fuente)
SELECT (SELECT coalesce(max(id), 0) FROM proveedores.proveedor) + row_number() OVER (ORDER BY a.cuit),
       a.cuit, a.datos->>'razon_social', 'registro'
FROM proveedores.api_proveedor a
WHERE NOT EXISTS (SELECT 1 FROM proveedores.proveedor p WHERE p.cuit = a.cuit);

-- 2. Datos del proveedor. El rubro de cada fila es el nivel más específico (subcategoría, categoría o
--    rubro), como en el padrón; los tres niveles salen del rubro principal.
WITH r AS (
  SELECT a.cuit,
         string_agg(DISTINCT n.nombre, ' | ') AS rubros,
         count(DISTINCT n.nombre)::int        AS cant_rubros
  FROM proveedores.api_proveedor a,
       jsonb_array_elements(a.datos->'rubros') x,
       LATERAL (SELECT coalesce(x#>>'{subcategoria,nombre}', x#>>'{categoria,nombre}', x#>>'{rubro,nombre}') AS nombre) n
  WHERE n.nombre IS NOT NULL
  GROUP BY a.cuit
), principal AS (
  SELECT DISTINCT ON (a.cuit) a.cuit, x
  FROM proveedores.api_proveedor a, jsonb_array_elements(a.datos->'rubros') x
  ORDER BY a.cuit, coalesce((x->>'principal')::boolean, false) DESC
)
UPDATE proveedores.proveedor p
SET entidad         = a.datos->>'razon_social',
    nro_comp        = coalesce(a.datos->>'nro_inscripcion', p.nro_comp),
    estado          = a.estado,
    rubro_principal = coalesce(pr.x#>>'{subcategoria,nombre}', pr.x#>>'{categoria,nombre}', pr.x#>>'{rubro,nombre}'),
    rubros          = r.rubros,
    cant_rubros     = coalesce(r.cant_rubros, 0),
    rubro_n1        = pr.x#>>'{rubro,nombre}',
    rubro_n2        = pr.x#>>'{categoria,nombre}',
    rubro_n3        = pr.x#>>'{subcategoria,nombre}',
    mail            = a.datos#>>'{contacto,email}',
    telefono        = a.datos#>>'{contacto,telefono}',
    fuente          = 'registro'
FROM proveedores.api_proveedor a
LEFT JOIN r ON r.cuit = a.cuit
LEFT JOIN principal pr ON pr.cuit = a.cuit
WHERE p.cuit = a.cuit;

DELETE FROM proveedores.proveedor_rubro pr
USING proveedores.proveedor p, proveedores.api_proveedor a
WHERE pr.proveedor_id = p.id AND p.cuit = a.cuit;

INSERT INTO proveedores.proveedor_rubro (proveedor_id, rubro)
SELECT DISTINCT p.id, n.nombre
FROM proveedores.api_proveedor a
JOIN proveedores.proveedor p ON p.cuit = a.cuit,
     jsonb_array_elements(a.datos->'rubros') x,
     LATERAL (SELECT coalesce(x#>>'{subcategoria,nombre}', x#>>'{categoria,nombre}', x#>>'{rubro,nombre}') AS nombre) n
WHERE n.nombre IS NOT NULL;

-- 3. Domicilio legal de la API con su ubicación de partida (la que calculó el importador)
DELETE FROM proveedores.domicilio d
USING proveedores.proveedor p, proveedores.api_proveedor a
WHERE d.proveedor_id = p.id AND p.cuit = a.cuit;

INSERT INTO proveedores.domicilio
    (proveedor_id, direccion, domicilio_orig, calle, altura, complemento, cp,
     localidad, departamento, provincia, pais, precision, fuente_geo, geom)
SELECT p.id,
       nullif(concat_ws(' ', a.datos#>>'{domicilio,calle}', a.datos#>>'{domicilio,altura}'), ''),
       a.domicilio_orig,
       a.datos#>>'{domicilio,calle}',
       a.datos#>>'{domicilio,altura}',
       nullif(concat_ws(' ', 'Piso ' || (a.datos#>>'{domicilio,piso}'), 'Dpto ' || (a.datos#>>'{domicilio,depto}')), ''),
       a.datos#>>'{domicilio,codigo_postal}',
       a.localidad, a.departamento, a.provincia, 'Argentina',
       a.precision, a.fuente_geo, a.geom
FROM proveedores.api_proveedor a
JOIN proveedores.proveedor p ON p.cuit = a.cuit
WHERE a.geom IS NOT NULL;

-- 4. Correcciones (geocodificación, pin del proveedor o carga manual) hechas para ese mismo domicilio
UPDATE proveedores.domicilio d
SET calle = coalesce(c.calle, d.calle),
    altura = coalesce(c.altura, d.altura),
    localidad = coalesce(c.localidad, d.localidad),
    departamento = coalesce(c.departamento, d.departamento),
    provincia = coalesce(c.provincia, d.provincia),
    precision = c.precision,
    fuente_geo = c.fuente_geo,
    geom = c.geom
FROM proveedores.domicilio_correccion c
JOIN proveedores.proveedor p ON p.cuit = c.cuit
JOIN proveedores.api_proveedor a ON a.cuit = c.cuit
WHERE d.proveedor_id = p.id
  AND d.domicilio_orig = c.domicilio_orig;

COMMIT;

ANALYZE proveedores.proveedor, proveedores.proveedor_rubro, proveedores.domicilio;
