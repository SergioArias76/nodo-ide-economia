import type Map from "ol/Map";
import type { Coordinate } from "ol/coordinate";
import type { Pixel } from "ol/pixel";
import type Geometry from "ol/geom/Geometry";
import type Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import ImageWMS from "ol/source/ImageWMS";
import type { CapaNodo } from "@/lib/config";
import type { CapaVisor } from "./tipos";
import type { Resultado } from "./FichaConsulta";

export type Hallazgo = { resultado: Resultado; geometria?: Geometry };

const geojson = new GeoJSON(); // GetFeatureInfo devuelve la geometría en la proyección del mapa
const capitalizar = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
// Identificadores internos de las bases de origen: no le dicen nada a quien consulta
const ATRIBUTOS_INTERNOS = /^(gid|fid|id|ogc_fid|objectid|the_geom|geom|shape_(area|leng|length)|bbox)$/i;
// "depto_partido_comuna" → "Depto partido comuna"
const ETIQUETAS: Record<string, string> = {
  cueanexo: "CUE-Anexo",
  cue: "CUE",
  jurisdiccion: "Jurisdicción",
  depto_partido_comuna: "Departamento",
  departamento: "Departamento",
  ambito: "Ámbito",
  region_cfe: "Región (CFE)",
  sector: "Sector",
  nombre: "Nombre",
  domicilio: "Domicilio",
  localidad: "Localidad",
  provincia: "Provincia",
  cp: "Código postal",
  tel: "Teléfono",
  telefono: "Teléfono",
  email: "Correo electrónico",
  mail: "Correo electrónico",
  fna: "Nombre completo",
  gna: "Tipo",
  nam: "Nombre",
  fdc: "Fuente",
  sag: "Organismo",
  objeto: "Objeto",
};
const etiquetaDe = (k: string) => {
  if (ETIQUETAS[k.toLowerCase()]) return ETIQUETAS[k.toLowerCase()];
  const t = k.replace(/[_.]+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
};
const ATRIBUTOS_NOMBRE = ["nombre", "name", "fna", "gna", "nam", "titulo", "entidad", "localidad"];

// Ficha con los campos y formatos definidos para la capa en lib/config.ts
function fichaNodo(nodo: CapaNodo, p: Record<string, unknown>): Resultado {
  return {
    grupo: nodo.grupo,
    capa: nodo.titulo,
    titulo: String(p[nodo.atributoTitulo] ?? "Sin nombre"),
    campos: nodo.campos.flatMap((c) => {
      const crudo = p[c.atributo] as string | number | null | undefined;
      if (crudo == null || crudo === "") return [];
      const valor = c.lista
        ? String(crudo).split(" | ").map(capitalizar)
        : (c.formato?.(crudo) ?? String(crudo));
      return [{ etiqueta: c.etiqueta, valor }];
    }),
  };
}

// Ficha genérica para capas externas o archivos: todos los atributos con valor
function fichaGenerica(grupo: string, capa: string, p: Record<string, unknown>): Resultado {
  const entradas = Object.entries(p).filter(
    ([k, v]) => v != null && v !== "" && typeof v !== "object" && k !== "geometry" && !ATRIBUTOS_INTERNOS.test(k),
  );
  // El primero de ATRIBUTOS_NOMBRE que tenga valor, en ese orden de prioridad
  const nombre = ATRIBUTOS_NOMBRE.map((n) => entradas.find(([k]) => k.toLowerCase() === n)).find(Boolean);
  return {
    grupo,
    capa,
    titulo: nombre ? String(nombre[1]) : capa,
    campos: entradas.filter((e) => e !== nombre).map(([k, v]) => ({ etiqueta: etiquetaDe(k), valor: String(v) })),
  };
}

async function consultarWms(mapa: Map, c: CapaVisor, coordenada: Coordinate): Promise<Hallazgo[]> {
  const fuente = c.capa.getSource();
  if (!(fuente instanceof ImageWMS)) return [];
  const url = fuente.getFeatureInfoUrl(coordenada, mapa.getView().getResolution()!, "EPSG:3857", {
    INFO_FORMAT: "application/json",
    FEATURE_COUNT: 50,
    BUFFER: 6, // tolerancia en píxeles para acertar a los puntos
  });
  if (!url) return [];
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GetFeatureInfo ${r.status}`);
  let datos;
  try {
    datos = await r.json();
  } catch {
    if (c.origen === "nodo") throw new Error("Respuesta inválida");
    return []; // el servicio externo no ofrece JSON: se ignora
  }
  return geojson.readFeatures(datos).map((f: Feature) => ({
    resultado: c.nodo ? fichaNodo(c.nodo, f.getProperties()) : fichaGenerica(c.grupo, c.titulo, f.getProperties()),
    geometria: f.getGeometry() ?? undefined,
  }));
}

// Consulta todas las capas visibles en el punto, en el orden del panel
export async function consultar(mapa: Map, capas: CapaVisor[], coordenada: Coordinate, pixel: Pixel) {
  const visibles = capas.filter((c) => c.visible && c.consultable !== false);
  const porCapa = await Promise.all(
    visibles.map(async (c): Promise<Hallazgo[]> => {
      if (c.origen === "archivo") {
        const features = mapa.getFeaturesAtPixel(pixel, { layerFilter: (l) => l === c.capa, hitTolerance: 5 });
        return features.map((f) => ({
          resultado: fichaGenerica(c.grupo, c.titulo, f.getProperties()),
          geometria: (f as Feature).getGeometry() ?? undefined,
        }));
      }
      try {
        return await consultarWms(mapa, c, coordenada);
      } catch (e) {
        if (c.origen === "nodo") throw e;
        return [];
      }
    }),
  );
  return porCapa.flat();
}

// ¿Hay algo dibujado bajo el cursor? Mira el píxel de las capas consultables
export function hayDatoEn(capas: CapaVisor[], pixel: Pixel) {
  return capas.some((c) => {
    if (!c.visible) return false;
    const dato = c.capa.getData(pixel) as Uint8ClampedArray | null;
    return dato != null && dato[3] > 0;
  });
}
