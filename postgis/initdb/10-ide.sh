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

  -- Lo que ide_admin cree en los esquemas publicables queda legible por GeoServer
  ALTER DEFAULT PRIVILEGES FOR ROLE ide_admin IN SCHEMA proveedores, base
    GRANT SELECT ON TABLES TO geoserver_ro;
SQL
