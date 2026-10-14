#!/bin/bash
# Usuario de la pantalla interna de ubicación manual (portal: /ubicaciones). Puede leer los proveedores y
# guardar correcciones de ubicación; nada más. Se ejecuta en la primera inicialización del volumen y,
# en una base existente, con scripts/crear-usuario-ubicaciones.sh (es idempotente).
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$IDE_DB" <<-SQL
  DO \$\$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ide_ubicaciones') THEN
      CREATE ROLE ide_ubicaciones LOGIN;
    END IF;
  END \$\$;
  ALTER ROLE ide_ubicaciones PASSWORD '${UBICACIONES_DB_PASSWORD}';

  GRANT CONNECT ON DATABASE ${IDE_DB} TO ide_ubicaciones;
  GRANT USAGE ON SCHEMA proveedores TO ide_ubicaciones;
  -- Del proveedor, solo lo que muestra la pantalla: nada de mail ni teléfono
  REVOKE SELECT ON proveedores.proveedor FROM ide_ubicaciones;
  GRANT SELECT (id, cuit, entidad, tipo_persona, rubro_principal) ON proveedores.proveedor TO ide_ubicaciones;
  GRANT SELECT ON proveedores.domicilio, proveedores.domicilio_correccion TO ide_ubicaciones;
  GRANT INSERT, UPDATE ON proveedores.domicilio_correccion TO ide_ubicaciones;
  -- La corrección se aplica en el momento al domicilio actual (la carga del padrón la vuelve a aplicar)
  GRANT UPDATE (precision, fuente_geo, geom) ON proveedores.domicilio TO ide_ubicaciones;
SQL
