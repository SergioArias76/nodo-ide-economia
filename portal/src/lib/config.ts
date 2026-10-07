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
  grupo: string; // sección del panel de capas
  atributoTitulo: string; // atributo que encabeza la ficha de consulta
  nota?: string; // aclaración breve en el panel de capas
  // Símbolo de la leyenda: debe coincidir con el estilo de geoserver/estilos/<capa>.sld
  simbolo: { color: string; proporcional?: boolean };
  // Filtro por valores de un atributo (casillas en el panel; se aplica con CQL_FILTER de GeoServer)
  filtro?: { atributo: string; opciones: { valor: string; etiqueta: string; color: string }[] };
  campos: Campo[];
};

const PRECISION: Record<string, string> = {
  calle_altura: "Calle y altura",
  calle_altura_interpolada: "Calle y altura (interpolada)",
  calle_altura_sin_validar: "Calle y altura (sin validar)",
  calle_sin_altura: "Calle sin altura",
  esquina: "Esquina",
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
    grupo: "Proveedores del Estado",
    atributoTitulo: "localidad",
    simbolo: { color: "#21708c", proporcional: true },
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
    titulo: "Proveedores",
    grupo: "Proveedores del Estado",
    atributoTitulo: "entidad",
    nota: "Visible al acercar el mapa",
    simbolo: { color: "#ff682c" },
    filtro: {
      atributo: "tipo_persona",
      opciones: [
        { valor: "juridica", etiqueta: "Personas jurídicas", color: "#ff682c" },
        { valor: "humana", etiqueta: "Personas humanas", color: "#5894a7" },
      ],
    },
    campos: [
      { atributo: "tipo_persona", etiqueta: "Tipo de persona", formato: (v) => (v === "humana" ? "Persona humana" : v === "juridica" ? "Persona jurídica" : String(v ?? "")) },
      { atributo: "cuit", etiqueta: "CUIT", formato: cuit },
      { atributo: "domicilio", etiqueta: "Domicilio" },
      { atributo: "rubros", etiqueta: "Rubros", lista: true },
      { atributo: "localidad", etiqueta: "Localidad" },
      { atributo: "departamento", etiqueta: "Departamento" },
      { atributo: "precision", etiqueta: "Precisión de la ubicación", formato: (v) => PRECISION[String(v)] ?? String(v ?? "") },
    ],
  },
];

// Mapas base. Argenmap (IGN) es el recomendado por IDERA; por decisión del área se abre con OpenStreetMap.
const IGN = (capa: string) =>
  `https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/${capa}@EPSG%3A3857@png/{z}/{x}/{-y}.png`;
const ATRIBUCION_IGN = '<a href="https://www.ign.gob.ar/">Instituto Geográfico Nacional</a>';

export type MapaBase = { id: string; titulo: string; url: string; atribucion: string };

export const MAPAS_BASE: MapaBase[] = [
  { id: "argenmap", titulo: "Argenmap", url: IGN("capabaseargenmap"), atribucion: ATRIBUCION_IGN },
  { id: "gris", titulo: "Argenmap gris", url: IGN("mapabase_gris"), atribucion: ATRIBUCION_IGN },
  { id: "oscuro", titulo: "Argenmap oscuro", url: IGN("argenmap_oscuro"), atribucion: ATRIBUCION_IGN },
  {
    id: "osm",
    titulo: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    atribucion: '© <a href="https://www.openstreetmap.org/copyright">colaboradores de OpenStreetMap</a>',
  },
];

export const BASE_INICIAL = "osm";

// Tesela de muestra (zoom 5, centro de Chubut) para la miniatura del selector
export const miniatura = (b: MapaBase) =>
  b.url.replace("{z}", "5").replace("{x}", "9").replace("{-y}", "11").replace("{y}", "20");

// Cada tema de capas toma una franja del isotipo (sol, meseta, mar) y un ícono de la biblioteca provincial
// (public/marca/temas). El color identifica el tema en el panel y en las fichas de consulta.
// "sobre": color del ícono encima de la franja (tinta sobre sol y meseta, blanco sobre mar)
export type Tema = { color: string; icono: string; sobre: string };

export const TEMAS: Record<string, Tema> = {
  "Proveedores del Estado": { color: "var(--meseta-2)", icono: "proveedores", sobre: "#13262e" },
  "Industria y Servicios": { color: "var(--meseta)", icono: "industria", sobre: "#13262e" },
  "Geografía social": { color: "var(--sol-2)", icono: "social", sobre: "#13262e" },
  "Defensa y Seguridad": { color: "var(--sol-2)", icono: "seguridad", sobre: "#13262e" },
  "Clima y meteorología": { color: "var(--sol)", icono: "clima", sobre: "#13262e" },
  "Biota": { color: "var(--meseta)", icono: "biota", sobre: "#13262e" },
  "Geografía física": { color: "var(--meseta)", icono: "fisica", sobre: "#13262e" },
  "Transporte": { color: "var(--mar)", icono: "transporte", sobre: "#ffffff" },
  "Hidrografía y oceanografía": { color: "var(--mar-2)", icono: "hidrografia", sobre: "#ffffff" },
  "Demarcación": { color: "var(--mar-2)", icono: "demarcacion", sobre: "#ffffff" },
  "Unidades geoestadísticas": { color: "var(--mar)", icono: "estadistica", sobre: "#ffffff" },
};

export const temaDe = (grupo: string): Tema => TEMAS[grupo] ?? { color: "var(--tenue)", icono: "agregadas", sobre: "#ffffff" };

// Servicios WMS sugeridos en "Agregar capas" (deben permitir CORS)
export const WMS_SUGERIDOS = [
  { titulo: "Instituto Geográfico Nacional", url: "https://wms.ign.gob.ar/geoserver/ows" },
  { titulo: "Este nodo (Economía Chubut)", url: `${PUBLIC_GEOSERVER}/${WORKSPACE}/wms` },
];

export const SERVICIOS = [
  { tipo: "WMS", url: `${PUBLIC_GEOSERVER}/${WORKSPACE}/wms?service=WMS&request=GetCapabilities` },
  { tipo: "WFS", url: `${PUBLIC_GEOSERVER}/${WORKSPACE}/wfs?service=WFS&request=GetCapabilities` },
  { tipo: "WMTS", url: `${PUBLIC_GEOSERVER}/gwc/service/wmts?request=GetCapabilities` },
  { tipo: "CSW", url: `${PUBLIC_GEONETWORK}/srv/spa/csw?service=CSW&request=GetCapabilities` },
];
