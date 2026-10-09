// Geoprocesos del panel "Análisis geográfico", con las mismas funciones que el geoportal del INDEC:
// conteo por área, estadísticas, área de influencia, superposición, distancias y geometrías derivadas.
// Se calculan en el navegador con Turf sobre GeoJSON en EPSG:4326; los datos de las capas WMS se
// piden por WFS al mismo servidor.
import type Feature from "ol/Feature";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type ImageWMS from "ol/source/ImageWMS";
import GeoJSON from "ol/format/GeoJSON";
import { fromExtent } from "ol/geom/Polygon";
import type { Extent } from "ol/extent";
import type { Geometry, Polygon } from "ol/geom";
import type {
  Feature as GFeature,
  FeatureCollection,
  Geometry as GGeometry,
  GeoJsonProperties,
  LineString as GLineString,
  MultiPolygon as GMultiPolygon,
  Point as GPoint,
  Polygon as GPolygon,
} from "geojson";
import { PUBLIC_GEOSERVER, WORKSPACE } from "@/lib/config";
import { ATRIBUTOS_INTERNOS, ATRIBUTOS_NOMBRE, etiquetaDe } from "./consulta";
import type { CapaVisor } from "./tipos";

type Turf = typeof import("@turf/turf");
// Turf pesa: se carga recién al ejecutar el primer geoproceso
let turfCargado: Promise<Turf> | null = null;
const cargarTurf = () => (turfCargado ??= import("@turf/turf"));

export type GFeatures = GFeature<GGeometry, GeoJsonProperties>[];

// Máximo de elementos que se piden por WFS (los 12.000 proveedores pesan unos 8 MB); con más, se avisa
// que el resultado es parcial
export const MAXIMO = 20000;
// El servidor público de ruteo (FOSSGIS, routing.openstreetmap.de) acepta hasta 100 puntos por consulta
const RUTEO = "https://routing.openstreetmap.de";
const LOTE_RUTEO = 90;
export const MAXIMO_RUTEO = 450;

export const PROCESOS = {
  conteo: { nombre: "Conteo por área", ayuda: "Cuenta los elementos de una capa que tocan el área de análisis." },
  estadisticas: {
    nombre: "Estadísticas",
    ayuda: "Suma, promedio, máximo o mínimo de un campo en el área de análisis, en total o agrupado por otro campo.",
  },
  influencia: { nombre: "Área de influencia", ayuda: "Genera el área a una distancia dada alrededor de cada elemento (buffer)." },
  superposicion: {
    nombre: "Superposición",
    ayuda: "Cruza dos capas: lo que comparten (intersección), lo que queda fuera de la segunda (diferencia) o ambas juntas (unión).",
  },
  distancias: {
    nombre: "Distancias",
    ayuda: "Distancia de cada elemento a un destino, en línea recta o por la red vial (a pie, en bicicleta o en vehículo).",
  },
  geometrias: {
    nombre: "Geometrías derivadas",
    ayuda: "Reemplaza cada elemento por su centroide, su rectángulo envolvente, su centro de masa o un punto dentro de él.",
  },
} as const;
export type Proceso = keyof typeof PROCESOS;

export type AreaAnalisis = "mapa" | "capa" | "dibujo";
export const AREAS: { valor: AreaAnalisis; etiqueta: string }[] = [
  { valor: "mapa", etiqueta: "Extensión del mapa" },
  { valor: "capa", etiqueta: "Toda la capa de entrada" },
  { valor: "dibujo", etiqueta: "Dibujar un área" },
];

export const OPERACIONES = {
  cuenta: "Cuenta",
  suma: "Suma",
  promedio: "Promedio",
  maximo: "Máximo",
  minimo: "Mínimo",
} as const;
export type Operacion = keyof typeof OPERACIONES;

export const RELACIONES = { interseccion: "Intersección", diferencia: "Diferencia", union: "Unión" } as const;
export type Relacion = keyof typeof RELACIONES;

export const DERIVADAS = {
  centroide: "Centroide",
  envolvente: "Envolvente",
  masa: "Centro de masa",
  interior: "Punto en el elemento",
} as const;
export type Derivada = keyof typeof DERIVADAS;

export const MODOS = { auto: "Vehículo", bici: "Bicicleta", pie: "A pie" } as const;
export type ModoTransporte = keyof typeof MODOS;
const PERFIL: Record<ModoTransporte, string> = { auto: "car", bici: "bike", pie: "foot" };

// --- Capas de entrada ---

// Fuente de datos de una capa para el análisis
export type Entrada = {
  id: string;
  titulo: string;
  capa?: CapaVisor;
  features?: () => Feature[]; // dibujos del usuario
};

// Capas que se pueden analizar: las del nodo y las nacionales con WFS, los archivos y los resultados
export const esAnalizable = (c: CapaVisor) => c.origen === "nodo" || c.origen === "archivo" || (c.origen === "catalogo" && c.wfs === true);

const formato = new GeoJSON();
const a4326 = (features: Feature[]) =>
  (formato.writeFeaturesObject(features, { featureProjection: "EPSG:3857", dataProjection: "EPSG:4326" }) as FeatureCollection)
    .features as GFeatures;

// Features de OpenLayers (EPSG:3857) a partir de GeoJSON en EPSG:4326
export const aMapa = (features: GFeatures) =>
  formato.readFeatures({ type: "FeatureCollection", features }, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });

// URL y nombre WFS de una capa WMS (GeoServer atiende WFS en el mismo punto de acceso)
function wfsDe(c: CapaVisor) {
  if (c.origen === "nodo") return { url: `${PUBLIC_GEOSERVER}/${WORKSPACE}/wfs`, nombre: c.id };
  const fuente = c.capa.getSource() as ImageWMS;
  return { url: fuente.getUrl()!, nombre: String(fuente.getParams().LAYERS) };
}

async function pedirWfs(c: CapaVisor, extension: Extent | null, cantidad = MAXIMO) {
  const { url, nombre } = wfsDe(c);
  const q = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: nombre,
    srsName: "EPSG:3857",
    outputFormat: "application/json",
    count: String(cantidad),
  });
  // Las capas del nodo respetan el filtro elegido en el panel de capas (tipo de persona, localidad)
  const filtro = c.origen === "nodo" ? ((c.capa.getSource() as ImageWMS).getParams().CQL_FILTER as string | undefined) : undefined;
  if (filtro === "EXCLUDE") return { features: [] as Feature[], truncado: false };
  const caja = extension && extension.map((n) => n.toFixed(2)).join(",");
  if (filtro) {
    // GeoServer no combina BBOX y CQL_FILTER: el recorte va dentro del filtro
    q.set("CQL_FILTER", caja ? `(${filtro}) AND BBOX(geom,${caja},'EPSG:3857')` : filtro);
  } else if (caja) {
    q.set("bbox", `${caja},EPSG:3857`);
  }
  const r = await fetch(`${url}?${q}`);
  if (!r.ok) throw new Error(`El servicio de ${c.titulo} respondió con error ${r.status}.`);
  let datos;
  try {
    datos = await r.json();
  } catch {
    throw new Error(`El servicio de ${c.titulo} no devolvió datos en GeoJSON.`);
  }
  const features = formato.readFeatures(datos);
  return { features, truncado: features.length >= cantidad };
}

export type Datos = { features: GFeatures; truncado: boolean };

// Elementos de la capa que tocan el área de análisis (en EPSG:4326)
export async function obtener(entrada: Entrada, area: Polygon | null): Promise<Datos> {
  const turf = await cargarTurf();
  let ol: Feature[];
  let truncado = false;
  if (entrada.features) ol = entrada.features();
  else if (entrada.capa!.origen === "archivo")
    ol = ((entrada.capa!.capa as VectorLayer<VectorSource>).getSource()?.getFeatures() ?? []) as Feature[];
  else ({ features: ol, truncado } = await pedirWfs(entrada.capa!, area?.getExtent() ?? null));

  let features = a4326(ol.filter((f) => f.getGeometry()));
  if (area) {
    const recorte = a4326Geom(area);
    features = features.filter((f) => turf.booleanIntersects(recorte, f));
  }
  return { features, truncado };
}

const a4326Geom = (g: Geometry) =>
  formato.writeGeometryObject(g, { featureProjection: "EPSG:3857", dataProjection: "EPSG:4326" }) as GGeometry;

export const areaDeExtension = (extension: Extent) => fromExtent(extension);

// --- Campos para las estadísticas ---

export type CampoEntrada = { atributo: string; etiqueta: string; numerico: boolean };

// Atributos de la capa, a partir de una muestra de elementos
export async function camposDe(entrada: Entrada): Promise<CampoEntrada[]> {
  let muestra: Feature[];
  if (entrada.features) muestra = entrada.features();
  else if (entrada.capa!.origen === "archivo")
    muestra = ((entrada.capa!.capa as VectorLayer<VectorSource>).getSource()?.getFeatures() ?? []) as Feature[];
  else muestra = (await pedirWfs(entrada.capa!, null, 20)).features;

  const tipos = new Map<string, boolean>(); // atributo → ¿todos los valores son números?
  for (const f of muestra.slice(0, 200)) {
    for (const [k, v] of Object.entries(f.getProperties())) {
      if (k === f.getGeometryName() || ATRIBUTOS_INTERNOS.test(k) || (v != null && typeof v === "object")) continue;
      const numero = v == null || v === "" || (typeof v === "number" ? true : typeof v === "string" && /^-?\d+([.,]\d+)?$/.test(v));
      tipos.set(k, (tipos.get(k) ?? true) && numero);
    }
  }
  const nodo = entrada.capa?.nodo;
  return [...tipos].map(([atributo, numerico]) => ({
    atributo,
    numerico,
    etiqueta: nodo?.campos.find((c) => c.atributo === atributo)?.etiqueta ?? etiquetaDe(atributo),
  }));
}

// --- Geoprocesos ---

export type Fila = { grupo: string; valor: number; elementos: number };

const numero = (v: unknown) => {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    return isNaN(n) ? null : n;
  }
  return null;
};

export function estadisticas(features: GFeatures, campo: string | null, operacion: Operacion, agrupar: string | null): Fila[] {
  const grupos = new Map<string, number[]>();
  for (const f of features) {
    const clave = agrupar ? String(f.properties?.[agrupar] ?? "(sin dato)") : "Total";
    const valor = operacion === "cuenta" || !campo ? 1 : numero(f.properties?.[campo]);
    if (!grupos.has(clave)) grupos.set(clave, []);
    if (valor != null) grupos.get(clave)!.push(valor);
  }
  const calcular = (vs: number[]) => {
    if (operacion === "cuenta") return vs.length;
    if (!vs.length) return NaN;
    if (operacion === "suma") return vs.reduce((a, b) => a + b, 0);
    if (operacion === "promedio") return vs.reduce((a, b) => a + b, 0) / vs.length;
    return operacion === "maximo" ? Math.max(...vs) : Math.min(...vs);
  };
  return [...grupos]
    .map(([grupo, vs]) => ({ grupo, valor: calcular(vs), elementos: vs.length }))
    .sort((a, b) => (agrupar ? b.valor - a.valor || a.grupo.localeCompare(b.grupo, "es") : 0));
}

const esPoligono = (f: GFeature): f is GFeature<GPolygon | GMultiPolygon> =>
  f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon";

// Une todos los polígonos en uno solo
async function disolver(features: GFeatures) {
  const turf = await cargarTurf();
  const poligonos = features.filter(esPoligono);
  if (!poligonos.length) return null;
  if (poligonos.length === 1) return poligonos[0];
  return turf.union(turf.featureCollection(poligonos));
}

export async function influencia(features: GFeatures, distancia: number, unidad: "meters" | "kilometers", disolverlas: boolean) {
  const turf = await cargarTurf();
  const areas = features.flatMap((f) => {
    const b = turf.buffer(f as GFeature<GGeometry>, distancia, { units: unidad });
    return b ? [{ ...b, properties: { ...f.properties, distancia: `${distancia} ${unidad === "meters" ? "m" : "km"}` } }] : [];
  }) as GFeatures;
  if (!disolverlas) return areas;
  const unida = await disolver(areas);
  return unida ? [{ ...unida, properties: { distancia: `${distancia} ${unidad === "meters" ? "m" : "km"}`, elementos: features.length } }] : [];
}

export async function superposicion(entrada: GFeatures, otra: GFeatures, relacion: Relacion, tituloOtra: string, tituloEntrada: string) {
  const turf = await cargarTurf();
  if (relacion === "union") {
    // Dos capas de polígonos se funden en uno; si no, se juntan los elementos de ambas
    if (entrada.every(esPoligono) && otra.every(esPoligono)) {
      const unida = await disolver([...entrada, ...otra]);
      return unida ? [{ ...unida, properties: { capas: `${tituloEntrada} + ${tituloOtra}` } }] : [];
    }
    return [
      ...entrada.map((f) => ({ ...f, properties: { ...f.properties, capa_origen: tituloEntrada } })),
      ...otra.map((f) => ({ ...f, properties: { ...f.properties, capa_origen: tituloOtra } })),
    ] as GFeatures;
  }
  const mascara = await disolver(otra);
  if (!mascara) throw new Error(`Para la ${RELACIONES[relacion].toLowerCase()}, la capa de superposición tiene que tener polígonos (por ejemplo, un área de influencia o los departamentos).`);
  return entrada.flatMap((f): GFeatures => {
    if (esPoligono(f)) {
      const recorte =
        relacion === "interseccion"
          ? turf.intersect(turf.featureCollection([f, mascara]))
          : turf.difference(turf.featureCollection([f, mascara]));
      return recorte ? [{ ...recorte, properties: f.properties }] : [];
    }
    // Puntos y líneas no se cortan: se conservan los que caen dentro (o fuera) de la máscara
    const toca = turf.booleanIntersects(f, mascara);
    return toca === (relacion === "interseccion") ? [f] : [];
  });
}

export async function derivadas(features: GFeatures, tipo: Derivada) {
  const turf = await cargarTurf();
  const calcular = {
    centroide: turf.centroid,
    envolvente: turf.envelope,
    masa: turf.centerOfMass,
    interior: turf.pointOnFeature,
  }[tipo] as (f: GFeature) => GFeature;
  return features.map((f) => ({ ...calcular(f), properties: { ...f.properties } })) as GFeatures;
}

// Nombre legible de un elemento (para las tablas de resultados)
export function nombreDe(p: GeoJsonProperties, c?: CapaVisor) {
  if (!p) return "Sin nombre";
  const atributo = c?.nodo?.atributoTitulo ?? ATRIBUTOS_NOMBRE.find((n) => Object.keys(p).some((k) => k.toLowerCase() === n && p[k]));
  const clave = atributo && Object.keys(p).find((k) => k.toLowerCase() === atributo.toLowerCase());
  return clave ? String(p[clave]) : "Sin nombre";
}

export type Distancia = { nombre: string; km: number; minutos?: number; origen: number[] };

// Distancia de cada elemento (su centroide) al destino [lon, lat]
export async function distancias(
  features: GFeatures,
  destino: number[],
  tipo: "recta" | "red",
  modo: ModoTransporte,
  c?: CapaVisor,
  alAvanzar?: (hechos: number) => void,
): Promise<Distancia[]> {
  const turf = await cargarTurf();
  const origenes = features.map((f) => ({
    nombre: nombreDe(f.properties, c),
    origen: (f.geometry.type === "Point" ? f.geometry.coordinates : turf.centroid(f).geometry.coordinates) as number[],
  }));
  if (tipo === "recta") {
    return origenes
      .map((o) => ({ ...o, km: turf.distance(o.origen, destino, { units: "kilometers" }) }))
      .sort((a, b) => a.km - b.km);
  }
  if (origenes.length > MAXIMO_RUTEO)
    throw new Error(`Por red vial se calculan hasta ${MAXIMO_RUTEO} elementos por vez; hay ${origenes.length}. Achicá el área de análisis.`);
  const salida: Distancia[] = [];
  for (let i = 0; i < origenes.length; i += LOTE_RUTEO) {
    const lote = origenes.slice(i, i + LOTE_RUTEO);
    const puntos = [...lote.map((o) => o.origen), destino].map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(";");
    const q = new URLSearchParams({
      sources: lote.map((_, j) => j).join(";"),
      destinations: String(lote.length),
      annotations: "distance,duration",
    });
    const r = await fetch(`${RUTEO}/routed-${PERFIL[modo]}/table/v1/driving/${puntos}?${q}`);
    const datos = await r.json().catch(() => null);
    if (!r.ok || datos?.code !== "Ok") throw new Error("El servicio de ruteo no respondió. Probá de nuevo en unos minutos o usá línea recta.");
    lote.forEach((o, j) => {
      const metros = datos.distances[j][0] as number | null;
      const segundos = datos.durations[j][0] as number | null;
      salida.push({ ...o, km: metros == null ? NaN : metros / 1000, minutos: segundos == null ? undefined : segundos / 60 });
    });
    alAvanzar?.(salida.length);
  }
  return salida.sort((a, b) => (isNaN(a.km) ? 1 : isNaN(b.km) ? -1 : a.km - b.km));
}

// Líneas de cada elemento al destino, con la distancia como atributo (para la capa de resultado)
export function lineasDistancia(filas: Distancia[], destino: number[]): GFeatures {
  const lineas = filas.map(
    (f): GFeature<GLineString> => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: [f.origen, destino] },
      properties: {
        nombre: f.nombre,
        distancia_km: isNaN(f.km) ? "sin ruta" : Number(f.km.toFixed(2)),
        ...(f.minutos != null && { tiempo_min: Math.round(f.minutos) }),
      },
    }),
  );
  const punto: GFeature<GPoint> = { type: "Feature", geometry: { type: "Point", coordinates: destino }, properties: { nombre: "Destino" } };
  return [...lineas, punto];
}

// --- Salidas ---

export const formatoNumero = (n: number, decimales = 2) =>
  isNaN(n) ? "—" : n.toLocaleString("es-AR", { maximumFractionDigits: decimales });

// CSV para planillas en español: separador ";" y coma decimal
export function csv(encabezados: string[], filas: (string | number | undefined)[][]) {
  const celda = (v: string | number | undefined) => {
    if (v == null || (typeof v === "number" && isNaN(v))) return "";
    const s = typeof v === "number" ? String(v).replace(".", ",") : v;
    return /[;"\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return "﻿" + [encabezados, ...filas].map((f) => f.map(celda).join(";")).join("\r\n");
}
