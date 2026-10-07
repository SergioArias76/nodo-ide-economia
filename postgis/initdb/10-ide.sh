#!/bin/bash
# Se ejecuta solo en la primera inicialización del volumen pgdata.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-SQL
  CREATE ROLE ide_admin LOGIN PASSWORD '${IDE_ADMIN_PASSWORD}';
  CREATE ROLE geoserver_ro LOGIN PASSWORD '${GEOSERVER_DB_PASSWORD}';
  CREATE DATABASE ${IDE_DB} OWNER ide_admin;

  CREATE ROLE ${GEONETWORK_DB_USER} LOGIN PASSWORD '${GEONETWORK_DB_PASSWORD}';
  CREATE DATABASE ${GEONETWORK_DB} OWNER ${GEONETWORK_DB_USER};
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$IDE_DB" <<-SQL
  CREATE EXTENSION IF NOT EXISTS postgis;

  CREATE SCHEMA proveedores AUTHORIZATION ide_admin;
  CREATE SCHEMA base        AUTHORIZATION ide_admin;
  CREATE SCHEMA staging     AUTHORIZATION ide_admin;

  GRANT CONNECT ON DATABASE ${IDE_DB} TO geoserver_ro;
  GRANT USAGE ON SCHEMA proveedores, base TO geoserver_ro;

  -- Capas base: todo lo que cree ide_admin queda legible por GeoServer.
  -- En proveedores NO: hay datos personales; se otorga SELECT solo sobre las vistas públicas.
  ALTER DEFAULT PRIVILEGES FOR ROLE ide_admin IN SCHEMA base
    GRANT SELECT ON TABLES TO geoserver_ro;
SQL
