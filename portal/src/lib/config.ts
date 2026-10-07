// Rutas públicas (las resuelve Nginx en el mismo dominio que el portal)
export const PUBLIC_GEOSERVER = "/geoserver";
export const PUBLIC_GEONETWORK = "/geonetwork";

export const WORKSPACE = "economia";

type Valor = string | number | null | undefined;

export type Campo = {
  atributo: string;
  etiqueta: string;
  formato?: (v: Valor) => string;
  lista?: boolean; // valores separados por " | "
};

export type CapaNodo = {
  nombre: string;
  titulo: string;
  atributoTitulo: string; // atributo que encabeza la ficha de consulta
  campos: Campo[];
};

const PRECISION: Record<string, string> = {
  calle_altura: "Calle y altura",
  calle_altura_interpolada: "Calle y altura (interpolada)",
  calle_altura_sin_validar: "Calle y altura (sin validar)",
  calle_sin_altura: "Calle sin altura",
  localidad: "Centro de la localidad",
  provincia: "Provincia",
};

const cuit = (v: Valor) => {
  const s = String(v ?? "");
  return /^\d{11}$/.test(s) ? `${s.slice(0, 2)}-${s.slice(2, 10)}-${s.slice(10)}` : s;
};
const entero = (v: Valor) => (v == null ? "" : Number(v).toLocaleString("es-AR"));

// Capas del nodo que muestra el visor. Agregar aquí a medida que se publiquen en GeoServer.
export const CAPAS_NODO: CapaNodo[] = [
  {
    nombre: `${WORKSPACE}:proveedores_por_localidad`,
    titulo: "Proveedores por localidad",
    atributoTitulo: "localidad",
    campos: [
      { atributo: "departamento", etiqueta: "Departamento" },
      { atributo: "provincia", etiqueta: "Provincia" },
      { atributo: "cant_proveedores", etiqueta: "Proveedores", formato: entero },
      { atributo: "cant_juridicas", etiqueta: "Personas jurídicas", formato: entero },
      { atributo: "cant_humanas", etiqueta: "Personas humanas", formato: entero },
    ],
  },
  {
    nombre: `${WORKSPACE}:proveedores_radicacion`,
    titulo: "Proveedores (personas jurídicas)",
    atributoTitulo: "entidad",
    campos: [
      { atributo: "cuit", etiqueta: "CUIT", formato: cuit },
      { atributo: "rubros", etiqueta: "Rubros", lista: true },
      { atributo: "localidad", etiqueta: "Localidad" },
      { atributo: "departamento", etiqueta: "Departamento" },
      { atributo: "precision", etiqueta: "Ubicación", formato: (v) => PRECISION[String(v)] ?? String(v ?? "") },
    ],
  },
];

export const SERVICIOS = [
  { tipo: "WMS", url: `${PUBLIC_GEOSERVER}/${WORKSPACE}/wms?service=WMS&request=GetCapabilities` },
  { tipo: "WFS", url: `${PUBLIC_GEOSERVER}/${WORKSPACE}/wfs?service=WFS&request=GetCapabilities` },
  { tipo: "WMTS", url: `${PUBLIC_GEOSERVER}/gwc/service/wmts?request=GetCapabilities` },
  { tipo: "CSW", url: `${PUBLIC_GEONETWORK}/srv/spa/csw?service=CSW&request=GetCapabilities` },
];
