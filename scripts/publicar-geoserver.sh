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

echo "Workspace y store"
existe "/workspaces/$WS" || ok "workspace $WS" "$(api POST /namespaces "${json[@]}" \
  -d "{\"namespace\":{\"prefix\":\"$WS\",\"uri\":\"https://$DOMINIO/$WS\"}}")"
existe "/workspaces/$WS/datastores/$STORE" || ok "store $STORE" "$(api POST "/workspaces/$WS/datastores" "${json[@]}" -d @- <<EOF
{"dataStore":{"name":"$STORE","connectionParameters":{"entry":[
  {"@key":"dbtype","\$":"postgis"},{"@key":"host","\$":"postgis"},{"@key":"port","\$":"5432"},
  {"@key":"database","\$":"$IDE_DB"},{"@key":"schema","\$":"proveedores"},
  {"@key":"user","\$":"geoserver_ro"},{"@key":"passwd","\$":"$GEOSERVER_DB_PASSWORD"},
  {"@key":"Expose primary keys","\$":"true"}]}}}
EOF
)"

echo "Capas y estilos"
# capa publicada ← vista de PostGIS
while read -r capa vista; do
  existe "/workspaces/$WS/datastores/$STORE/featuretypes/$capa" || ok "capa $capa" \
    "$(api POST "/workspaces/$WS/datastores/$STORE/featuretypes" "${json[@]}" \
      -d "{\"featureType\":{\"name\":\"$capa\",\"nativeName\":\"$vista\",\"srs\":\"EPSG:4326\"}}")"

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
proveedores_radicacion v_proveedores_publico
proveedores_por_localidad v_proveedores_por_localidad
EOF

# Las teselas cacheadas quedaron con el estilo anterior
for capa in proveedores_radicacion proveedores_por_localidad; do
  curl -s "${INSEGURO[@]}" -u "$GEOSERVER_ADMIN_USER:$GEOSERVER_ADMIN_PASSWORD" -o /dev/null \
    -X POST "${REST%/rest}/gwc/rest/masstruncate" -H 'Content-Type: text/xml' \
    -d "<truncateLayer><layerName>$WS:$capa</layerName></truncateLayer>" || true
done
echo "Listo: https://$DOMINIO/visor"
