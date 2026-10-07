// Rutas públicas (las resuelve Nginx en el mismo dominio que el portal)
export const PUBLIC_GEOSERVER = "/geoserver";
export const PUBLIC_GEONETWORK = "/geonetwork";

export const WORKSPACE = "economia";

// Capas del nodo que muestra el visor. Agregar aquí a medida que se publiquen en GeoServer.
export const CAPAS_NODO = [
  { nombre: `${WORKSPACE}:proveedores_por_localidad`, titulo: "Proveedores por localidad" },
  { nombre: `${WORKSPACE}:proveedores_radicacion`, titulo: "Proveedores (personas jurídicas)" },
];

export const SERVICIOS = [
  { tipo: "WMS", url: `${PUBLIC_GEOSERVER}/${WORKSPACE}/wms?service=WMS&request=GetCapabilities` },
  { tipo: "WFS", url: `${PUBLIC_GEOSERVER}/${WORKSPACE}/wfs?service=WFS&request=GetCapabilities` },
  { tipo: "WMTS", url: `${PUBLIC_GEOSERVER}/gwc/service/wmts?request=GetCapabilities` },
  { tipo: "CSW", url: `${PUBLIC_GEONETWORK}/srv/spa/csw?service=CSW&request=GetCapabilities` },
];
