-- Pasa staging.proveedores_qgis (GeoJSON del paquete QGIS cargado con ogr2ogr) al modelo.
-- La fuente es un padrón completo: se reemplaza todo en una sola transacción.
\set ON_ERROR_STOP on

BEGIN;

TRUNCATE proveedores.proveedor CASCADE;

INSERT INTO proveedores.proveedor
    (id, cuit, nro_comp, entidad, rubro_principal, rubros, cant_rubros,
     rubro_n1, rubro_n2, rubro_n3, mail, telefono, fuente)
SELECT fid,
       nullif(replace(cuit, '-', ''), ''),
       nullif(nro_comp, ''),
       entidad,
       nullif(rubro_principal, ''),
       nullif(rubros, ''),
       cant_rubros,
       nullif(rubro_n1, ''),
       nullif(rubro_n2, ''),
       nullif(rubro_n3, ''),
       nullif(mail, ''),
       nullif(telefono, ''),
       :'fuente'
FROM staging.proveedores_qgis;

INSERT INTO proveedores.proveedor_rubro (proveedor_id, rubro)
SELECT DISTINCT fid, trim(r)
FROM staging.proveedores_qgis, string_to_table(rubros, ' | ') AS r
WHERE trim(r) <> '';

INSERT INTO proveedores.domicilio
    (proveedor_id, direccion, domicilio_orig, calle, altura, complemento, cp,
     localidad, departamento, provincia, pais, calidad_dir, precision, fuente_geo, geom)
SELECT fid,
       nullif(direccion, ''), nullif(domicilio_orig, ''), nullif(calle, ''), nullif(altura, ''),
       nullif(complemento, ''), nullif(cp, ''), nullif(localidad, ''), nullif(departamento, ''),
       nullif(provincia, ''), nullif(pais, ''), nullif(calidad_dir, ''), precision,
       nullif(fuente_geo, ''), geom
FROM staging.proveedores_qgis;

-- Correcciones de ubicación (scripts/geocodificar-domicilios.mjs o carga manual): solo si el
-- domicilio del padrón no cambió desde que se hizo la corrección
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
WHERE d.proveedor_id = p.id
  AND d.domicilio_orig IS NOT DISTINCT FROM c.domicilio_orig;

COMMIT;

ANALYZE proveedores.proveedor, proveedores.proveedor_rubro, proveedores.domicilio;

-- Resumen
SELECT tipo_persona, count(*) FROM proveedores.proveedor GROUP BY 1 ORDER BY 1;
SELECT precision, count(*) FROM proveedores.domicilio GROUP BY 1 ORDER BY 2 DESC;
SELECT count(*) AS publicados FROM proveedores.v_proveedores_publico;
