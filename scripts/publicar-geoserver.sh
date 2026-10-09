#!/usr/bin/env bash
# Publica en GeoServer las capas del nodo: workspace, store PostGIS, capas y estilos (geoserver/estilos/*.sld).
# Se puede correr más de una vez: crea lo que falta y actualiza los estilos.
# Uso: scripts/publicar-geoserver.sh   (requiere el stack levantado y los datos cargados)
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; source .env; set +a

REST="${GEOSERVER_REST:-https://$DOMINIO/geoserver/rest}"
WS=economia
STORE=ide_proveedores
INSEGURO=(); [ "$DOMINIO" = localhost ] && INSEGURO=(-k)  # certificado autofirmado en dev

# api MÉTODO RUTA [curl args...] → imprime el código HTTP
api() {
  local metodo=$1 ruta=$2; shift 2
  curl -s "${INSEGURO[@]}" -u "$GEOSERVER_ADMIN_USER:$GEOSERVER_ADMIN_PASSWORD" -o /dev/null -w '%{http_code}' \
    -X "$metodo" "$REST$ruta" "$@"
}
existe() { [ "$(api GET "$1.json")" = 200 ]; }  # sin extensión, los estilos responden 500
ok() { case "$2" in 2??) echo "  ✓ $1";; *) echo "  ✗ $1 (HTTP $2)" >&2; exit 1;; esac; }
json=(-H 'Content-Type: application/json')

echo "Seguridad"
# WCS (coberturas raster) no se usa; WPS no está instalado en la imagen
ok "WCS deshabilitado" "$(api PUT /services/wcs/settings "${json[@]}" -d '{"wcs":{"enabled":false}}')"
# WFS solo lectura (sin transacciones): los datos se cargan por scripts
ok "WFS sin escritura" "$(api PUT /services/wfs/settings "${json[@]}" -d '{"wfs":{"serviceLevel":"BASIC"}}')"
# La contraseña maestra protege el keystore; se cambia solo si difiere de la del .env
maestra=$(curl -s "${INSEGURO[@]}" -u "$GEOSERVER_ADMIN_USER:$GEOSERVER_ADMIN_PASSWORD" "$REST/security/masterpw.json" |
  sed -n 's/.*"oldMasterPassword":"\([^"]*\)".*/\1/p')
if [ "$maestra" != "$GEOSERVER_MASTER_PASSWORD" ]; then
  ok "contraseña maestra" "$(printf '{"oldMasterPassword":"%s","newMasterPassword":"%s"}' "$maestra" "$GEOSERVER_MASTER_PASSWORD" |
    api PUT /security/masterpw.json "${json[@]}" --data-binary @-)"
fi

echo "Workspace y store"
existe "/workspaces/$WS" || ok "workspace $WS" "$(api POST /namespaces "${json[@]}" \
  -d "{\"namespace\":{\"prefix\":\"$WS\",\"uri\":\"https://$DOMINIO/$WS\"}}")"
existe "/workspaces/$WS/datastores/$STORE" || ok "store $STORE" "$(api POST "/workspaces/$WS/datastores" "${json[@]}" -d @- <<EOF
{"dataStore":{"name":"$STORE","connectionParameters":{"entry":[
  {"@key":"dbtype","\$":"postgis"},{"@key":"host","\$":"postgis"},{"@key":"port","\$":"5432"},
  {"@key":"database","\$":"$IDE_DB"},{"@key":"schema","\$":"proveedores"},
  {"@key":"user","\$":"geoserver_ro"},{"@key":"passwd","\$":"$GEOSERVER_DB_PASSWORD"},
  {"@key":"Expose primary keys","\$":"true"},{"@key":"validate connections","\$":"true"}]}}}
EOF
)"

echo "Íconos de los estilos"
# Junto a los SLD del workspace: los estilos los citan por nombre (ExternalGraphic relativo)
for svg in geoserver/estilos/iconos/*.svg; do
  ok "ícono $(basename "$svg")" "$(api PUT "/resource/workspaces/$WS/styles/$(basename "$svg")" \
    -H 'Content-Type: image/svg+xml' --data-binary "@$svg")"
done

echo "Capas y estilos"
# capa publicada | vista de PostGIS | título | resumen (los muestran los clientes WMS/WFS)
while IFS="|" read -r capa vista titulo resumen; do
  existe "/workspaces/$WS/datastores/$STORE/featuretypes/$capa" || ok "capa $capa" \
    "$(api POST "/workspaces/$WS/datastores/$STORE/featuretypes" "${json[@]}" \
      -d "{\"featureType\":{\"name\":\"$capa\",\"nativeName\":\"$vista\",\"srs\":\"EPSG:4326\"}}")"
  # Por stdin: en Git Bash los argumentos de curl pierden los acentos
  ok "título de $capa" "$(printf '{"featureType":{"title":"%s","abstract":"%s"}}' "$titulo" "$resumen" |
    api PUT "/workspaces/$WS/datastores/$STORE/featuretypes/$capa" "${json[@]}" --data-binary @-)"

  sld="geoserver/estilos/$capa.sld"
  [ -f "$sld" ] || continue
  sldxml=(-H 'Content-Type: application/vnd.ogc.sld+xml' --data-binary "@$sld")
  if existe "/workspaces/$WS/styles/$capa"; then
    ok "estilo $capa (actualizado)" "$(api PUT "/workspaces/$WS/styles/$capa" "${sldxml[@]}")"
  else
    ok "estilo $capa" "$(api POST "/workspaces/$WS/styles?name=$capa" "${sldxml[@]}")"
  fi
  ok "estilo por defecto de $capa" "$(api PUT "/layers/$WS:$capa" "${json[@]}" \
    -d "{\"layer\":{\"defaultStyle\":{\"name\":\"$WS:$capa\"}}}")"
done <<'EOF'
proveedores_radicacion|v_proveedores_publico|Proveedores del Estado provincial|Proveedores inscriptos en el Sistema Provincial de Proveedores del Estado (SIPPE) del Chubut, con CUIT, rubros y tipo de persona. Personas jurídicas y físicas en su domicilio; las que no tienen calle y altura, en el centro de su localidad.
proveedores_por_localidad|v_proveedores_por_localidad|Proveedores del Estado provincial por localidad|Cantidad de proveedores inscriptos en el SIPPE del Chubut por localidad, discriminados en personas jurídicas y físicas.
proveedores_rubros|v_proveedores_rubros|Rubros de los proveedores del Estado provincial|Rubros en los que están inscriptos los proveedores del SIPPE del Chubut, con la cantidad de proveedores de cada uno. Tabla sin geometría (solo WFS).
EOF

# Las teselas cacheadas quedaron con el estilo anterior
for capa in proveedores_radicacion proveedores_por_localidad; do
  curl -s "${INSEGURO[@]}" -u "$GEOSERVER_ADMIN_USER:$GEOSERVER_ADMIN_PASSWORD" -o /dev/null \
    -X POST "${REST%/rest}/gwc/rest/masstruncate" -H 'Content-Type: text/xml' \
    -d "<truncateLayer><layerName>$WS:$capa</layerName></truncateLayer>" || true
done
echo "Listo: https://$DOMINIO/visor"
