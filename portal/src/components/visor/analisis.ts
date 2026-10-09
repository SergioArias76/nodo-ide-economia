// Geoprocesos del panel "Análisis geográfico", con las mismas funciones y el mismo comportamiento que el
// geoportal estadístico del INDEC (portalgeoestadistico.indec.gob.ar, js/geoprocess.json y js/core.js):
// conteo por área, estadísticas, área de influencia, superposición, distancias y geometrías derivadas.
//
// Como en el INDEC, el área de análisis se aplica en el servidor: las capas WMS se piden por WFS con
// CQL_FILTER=INTERSECTS(geom, área) (y el conteo, con resultType=hits); los archivos, dibujos y resultados
// se filtran en el navegador. Los cálculos se hacen con Turf sobre GeoJSON en EPSG:4326.
import type Feature from "ol/Feature";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type ImageWMS from "ol/source/ImageWMS";
import GeoJSON from "ol/format/GeoJSON";
import WKT from "ol/format/WKT";
import { fromExtent } from "ol/geom/Polygon";
import type { Extent } from "ol/extent";
import type { Geometry, Polygon } from "ol/geom";
import type {
  Feature as GFeature,
  FeatureCollection,
  Geometry as GGeometry,
  GeoJsonProperties,
  MultiPolygon as GMultiPolygon,
  Polygon as GPolygon,
} from "geojson";
import { PUBLIC_GEOSERVER, WORKSPACE, type Campo } from "@/lib/config";
import { ATRIBUTOS_INTERNOS, ATRIBUTOS_NOMBRE, etiquetaDe } from "./consulta";
import { cqlChubut } from "./chubut";
import type { CapaVisor } from "./tipos";

type Turf = typeof import("@turf/turf");
// Turf pesa: se carga recién al ejecutar el primer geoproceso
let turfCargado: Promise<Turf> | null = null;
const cargarTurf = () => (turfCargado ??= import("@turf/turf"));

export type GFeatures = GFeature<GGeometry, GeoJsonProperties>[];

// Máximo de elementos que se descargan por WFS (los 12.000 proveedores pesan unos 8 MB). El conteo no
// tiene tope: lo resuelve el servidor.
export const MAXIMO = 20000;
// El servidor público de ruteo (FOSSGIS, routing.openstreetmap.de) acepta hasta 100 puntos por consulta
const RUTEO = "https://routing.openstreetmap.de";
const PUNTOS_RUTEO = 95;
export const MAXIMO_RUTEO = 500;
export const MAXIMO_DESTINOS = 10;
// Algunos servicios nacionales tardan (el del IGN, a veces más de 40 segundos): se espera hasta 90
const ESPERA = 90_000;

export const PROCESOS = {
  conteo: { nombre: "Conteo por área", ayuda: "Cuenta los elementos de una capa que intersectan con el área de análisis." },
  estadisticas: {
    nombre: "Estadísticas",
    ayuda: "Cuenta, suma, promedio, máximo o mínimo de un campo numérico en el área de análisis, en total o sumarizado por otro campo.",
  },
  influencia: { nombre: "Área de influencia", ayuda: "Genera el área a una distancia dada alrededor de cada elemento (buffer)." },
  superposicion: {
    nombre: "Superposición",
    ayuda: "Cruza cada elemento de la capa de entrada con los de la capa de superposición: intersección, diferencia o unión.",
  },
  distancias: {
    nombre: "Distancias",
    ayuda: "Distancia de cada elemento a uno o más destinos, en línea recta o por la red vial (a pie, en bicicleta o en vehículo).",
  },
  geometrias: {
    nombre: "Geometrías derivadas",
    ayuda: "Reemplaza cada elemento por su centroide, su envolvente, su centro de masa o un punto sobre el elemento.",
  },
} as const;
export type Proceso = keyof typeof PROCESOS;

export type AreaAnalisis = "mapa" | "capa" | "dibujo";
export const AREAS: { valor: AreaAnalisis; etiqueta: string }[] = [
  { valor: "mapa", etiqueta: "Extensión del mapa" },
  { valor: "capa", etiqueta: "Extensión de la capa de entrada" },
  { valor: "dibujo", etiqueta: "Dibujar área" },
];

export const OPERACIONES = { cuenta: "Cuenta", suma: "Suma", promedio: "Promedio", maximo: "Máximo", minimo: "Mínimo" } as const;
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

export const MODOS = { pie: "A pie", bici: "Bicicleta", auto: "Vehículo" } as const;
export type ModoTransporte = keyof typeof MODOS;
const PERFIL: Record<ModoTransporte, string> = { auto: "car", bici: "bike", pie: "foot" };

// --- Tablas del panel de datos ---

export type Columna = { clave: string; etiqueta: string; numerico?: boolean; formato?: (v: unknown) => string };
export type Tabla = {
  titulo: string;
  pestana?: string; // nombre corto, cuando el resultado tiene varias tablas
  subtitulo?: string;
  columnas: Columna[];
  filas: Record<string, unknown>[];
  geometrias?: (Geometry | undefined)[]; // EPSG:3857, para ir al elemento con clic en la fila
  archivo: string; // nombre del CSV
  aviso?: string;
};

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

const esVectorial = (e: Entrada) => e.features != null || e.capa?.origen === "archivo";

const featuresDe = (e: Entrada): Feature[] =>
  e.features ? e.features() : (((e.capa!.capa as VectorLayer<VectorSource>).getSource()?.getFeatures() ?? []) as Feature[]);

const formato = new GeoJSON();
const wkt = new WKT();

const a4326 = (features: Feature[]) =>
  (formato.writeFeaturesObject(features, { featureProjection: "EPSG:3857", dataProjection: "EPSG:4326" }) as FeatureCollection)
    .features as GFeatures;

const a4326Geom = (g: Geometry) =>
  formato.writeGeometryObject(g, { featureProjection: "EPSG:3857", dataProjection: "EPSG:4326" }) as GGeometry;

// Features de OpenLayers (EPSG:3857) a partir de GeoJSON en EPSG:4326
export const aMapa = (features: GFeatures) =>
  formato.readFeatures({ type: "FeatureCollection", features }, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });

export const areaDeExtension = (extension: Extent) => fromExtent(extension);

// URL y nombre WFS de una capa WMS (GeoServer atiende WFS en el mismo punto de acceso)
function wfsDe(c: CapaVisor) {
  if (c.origen === "nodo") return { url: `${PUBLIC_GEOSERVER}/${WORKSPACE}/wfs`, nombre: c.id };
  const fuente = c.capa.getSource() as ImageWMS;
  return { url: fuente.getUrl()!, nombre: c.capaWfs ?? String(fuente.getParams().LAYERS) };
}

// --- Esquema de la capa (DescribeFeatureType): nombre de la geometría y campos con su tipo ---

export type CampoEntrada = { atributo: string; etiqueta: string; numerico: boolean; formato?: Campo["formato"]; lista?: boolean };
type Esquema = { geometria: string; campos: CampoEntrada[] };

const NUMERICOS = /^(xsd:)?(int|integer|long|short|byte|double|float|decimal|number)$/i;
const esquemas = new Map<string, Promise<Esquema>>();

function esquemaWfs(c: CapaVisor): Promise<Esquema> {
  const { url, nombre } = wfsDe(c);
  const clave = `${url}#${nombre}`;
  if (!esquemas.has(clave)) {
    const q = new URLSearchParams({
      service: "WFS",
      version: "2.0.0",
      request: "DescribeFeatureType",
      typeNames: nombre,
      outputFormat: "application/json",
    });
    const pedido = fetch(`${url}?${q}`, { signal: AbortSignal.timeout(ESPERA) })
      .then((r) => r.json())
      .then((d) => {
        const props = d.featureTypes[0].properties as { name: string; type: string }[];
        const geometria = props.find((p) => p.type.startsWith("gml:"))?.name;
        if (!geometria) throw new Error("sin geometría");
        return {
          geometria,
          campos: props
            .filter((p) => !p.type.startsWith("gml:") && !ATRIBUTOS_INTERNOS.test(p.name))
            .map((p) => {
              const propio = c.nodo?.campos.find((x) => x.atributo === p.name);
              return { atributo: p.name, etiqueta: propio?.etiqueta ?? etiquetaDe(p.name), numerico: NUMERICOS.test(p.type), formato: propio?.formato, lista: propio?.lista };
            }),
        };
      });
    pedido.catch(() => esquemas.delete(clave)); // se reintenta la próxima vez
    esquemas.set(clave, pedido);
  }
  return esquemas.get(clave)!;
}

// Campos de un archivo, dibujo o resultado: los de sus elementos (numérico si todos los valores lo son)
function camposVectoriales(features: Feature[]): CampoEntrada[] {
  const tipos = new Map<string, boolean>();
  for (const f of features) {
    for (const [k, v] of Object.entries(f.getProperties())) {
      if (k === f.getGeometryName() || (v != null && typeof v === "object")) continue;
      tipos.set(k, (tipos.get(k) ?? true) && (v == null || v === "" || typeof v === "number"));
    }
  }
  return [...tipos].map(([atributo, numerico]) => ({ atributo, numerico, etiqueta: etiquetaDe(atributo) }));
}

export async function camposDe(entrada: Entrada): Promise<CampoEntrada[]> {
  return esVectorial(entrada) ? camposVectoriales(featuresDe(entrada)) : (await esquemaWfs(entrada.capa!)).campos;
}

// --- Pedidos WFS con el área de análisis aplicada en el servidor ---

async function filtroCql(c: CapaVisor, area: Polygon | null) {
  // Las capas del nodo respetan el filtro elegido en el panel de capas (tipo de persona, localidad)
  const propio = c.origen === "nodo" ? ((c.capa.getSource() as ImageWMS).getParams().CQL_FILTER as string | undefined) : undefined;
  if (propio === "EXCLUDE") return "EXCLUDE";
  const partes = propio ? [`(${propio})`] : [];
  // Las capas se limitan al Chubut, salvo las del nodo: los proveedores están en todo el país
  const { geometria } = await esquemaWfs(c);
  if (c.origen !== "nodo") partes.push(cqlChubut(geometria));
  if (area) partes.push(`INTERSECTS(${geometria}, SRID=3857;${wkt.writeGeometry(area, { decimals: 2 })})`);
  return partes.join(" AND ");
}

// POST como el INDEC: un área dibujada con muchos vértices no entra en la URL
async function pedirWfs(c: CapaVisor, extra: Record<string, string>, area: Polygon | null) {
  const { url, nombre } = wfsDe(c);
  const filtro = await filtroCql(c, area);
  if (filtro === "EXCLUDE") return null;
  const q = new URLSearchParams({ service: "WFS", version: "2.0.0", request: "GetFeature", typeNames: nombre, ...extra });
  if (filtro) q.set("CQL_FILTER", filtro);
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: q,
    signal: AbortSignal.timeout(ESPERA),
  }).catch(() => {
    throw new Error(`El servicio de ${c.titulo} no respondió a tiempo: puede estar saturado. Probá de nuevo en unos minutos o achicá el área de análisis.`);
  });
  if (!r.ok) throw new Error(`El servicio de ${c.titulo} respondió con error ${r.status}. Probá de nuevo en unos minutos.`);
  return r;
}

// Cantidad exacta de elementos en el área (el servidor la cuenta sin descargarlos)
export async function contar(entrada: Entrada, area: Polygon | null): Promise<number> {
  if (esVectorial(entrada)) return (await obtener(entrada, area)).features.length;
  const r = await pedirWfs(entrada.capa!, { resultType: "hits" }, area);
  if (!r) return 0;
  const n = (await r.text()).match(/numberMatched="(\d+)"/)?.[1];
  if (n == null) throw new Error(`El servicio de ${entrada.titulo} no informó la cantidad de elementos.`);
  return Number(n);
}

export type Datos = { features: GFeatures; truncado: boolean };

// Elementos de la capa que intersectan con el área de análisis (null: toda la capa), en EPSG:4326
export async function obtener(entrada: Entrada, area: Polygon | null): Promise<Datos> {
  if (esVectorial(entrada)) {
    let features = a4326(featuresDe(entrada).filter((f) => f.getGeometry()));
    if (area) {
      const turf = await cargarTurf();
      const recorte = a4326Geom(area);
      features = features.filter((f) => turf.booleanIntersects(recorte, f));
    }
    return { features, truncado: false };
  }
  // En EPSG:3857 para evitar la ambigüedad del orden de ejes de EPSG:4326 en WFS 2.0
  const r = await pedirWfs(entrada.capa!, { outputFormat: "application/json", srsName: "EPSG:3857", count: String(MAXIMO) }, area);
  if (!r) return { features: [], truncado: false };
  let datos;
  try {
    datos = await r.json();
  } catch {
    throw new Error(`El servicio de ${entrada.titulo} no devolvió datos en GeoJSON.`);
  }
  const features = a4326(formato.readFeatures(datos).filter((f) => f.getGeometry()));
  return { features, truncado: features.length >= MAXIMO };
}

// --- Geoprocesos ---

const numero = (v: unknown) => {
  if (typeof v === "number") return isNaN(v) ? null : v;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
  return null;
};

export type Fila = { grupo: string; valor: number; elementos: number };

// Como en el INDEC: la operación se aplica a los valores numéricos del campo, en total o por cada valor
// del campo de sumarización. Sin campo, se cuentan los elementos. Si el campo de sumarización tiene varios
// valores por elemento (los rubros de un proveedor), el elemento cuenta en cada uno.
export function estadisticas(features: GFeatures, campo: string | null, operacion: Operacion, sumarizar: CampoEntrada | null): Fila[] {
  const grupos = new Map<string, number[]>();
  for (const f of features) {
    const crudo = sumarizar ? f.properties?.[sumarizar.atributo] : "Total";
    const claves = crudo == null || crudo === "" ? ["(sin dato)"] : sumarizar?.lista ? String(crudo).split(" | ") : [String(crudo)];
    const valor = campo ? numero(f.properties?.[campo]) : 1;
    for (const clave of claves) {
      if (!grupos.has(clave)) grupos.set(clave, []);
      if (valor != null) grupos.get(clave)!.push(valor);
    }
  }
  const calcular = (vs: number[]) => {
    if (operacion === "cuenta") return vs.length;
    if (!vs.length) return NaN;
    if (operacion === "suma") return vs.reduce((a, b) => a + b, 0);
    if (operacion === "promedio") return vs.reduce((a, b) => a + b, 0) / vs.length;
    return vs.reduce((a, b) => (operacion === "maximo" ? Math.max(a, b) : Math.min(a, b)));
  };
  return [...grupos].map(([grupo, vs]) => ({ grupo, valor: calcular(vs), elementos: vs.length }));
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

const etiquetaDistancia = (d: number, u: "meters" | "kilometers") => `${d.toLocaleString("es-AR")} ${u === "meters" ? "m" : "km"}`;

export async function influencia(features: GFeatures, distancia: number, unidad: "meters" | "kilometers") {
  const turf = await cargarTurf();
  return features.flatMap((f) => {
    const b = turf.buffer(f as GFeature<GGeometry>, distancia, { units: unidad });
    return b ? [{ ...b, properties: { ...f.properties, distancia: etiquetaDistancia(distancia, unidad) } }] : [];
  }) as GFeatures;
}

// Área de influencia comparada con otra capa (por ejemplo, edificios de salud y proveedores de cuidado a
// domicilio): cuántos elementos de la otra capa caen en cada área y, para cada uno de ellos, cuál es el
// elemento de entrada más cercano, a qué distancia y si está dentro de alguna área.
export type Comparacion = {
  porArea: number[]; // elementos de la otra capa dentro de cada área (mismo orden que las áreas)
  cercanos: { indice: number; metros: number; dentro: boolean }[]; // por elemento de la otra capa
};

export async function compararInfluencia(entrada: GFeatures, areas: GFeatures, otra: GFeatures, alAvanzar?: (hechos: number) => void): Promise<Comparacion> {
  const turf = await cargarTurf();
  const cajas = areas.map((a) => turf.bbox(a));
  const centros = entrada.map((f) => (f.geometry.type === "Point" ? f.geometry.coordinates : turf.centroid(f).geometry.coordinates) as number[]);
  const porArea = areas.map(() => 0);
  const cercanos: Comparacion["cercanos"] = [];
  for (let i = 0; i < otra.length; i++) {
    const g = otra[i];
    const caja = turf.bbox(g);
    let dentro = false;
    areas.forEach((a, j) => {
      const c = cajas[j];
      if (caja[0] <= c[2] && caja[2] >= c[0] && caja[1] <= c[3] && caja[3] >= c[1] && turf.booleanIntersects(g, a)) {
        porArea[j]++;
        dentro = true;
      }
    });
    const punto = g.geometry.type === "Point" ? (g.geometry.coordinates as number[]) : turf.centroid(g).geometry.coordinates;
    let indice = -1;
    let metros = Infinity;
    centros.forEach((c, j) => {
      const m = turf.distance(punto, c, { units: "meters" });
      if (m < metros) [metros, indice] = [m, j];
    });
    cercanos.push({ indice, metros, dentro });
    if (i % 500 === 499) {
      alAvanzar?.(i + 1);
      await new Promise((r) => setTimeout(r));
    }
  }
  return { porArea, cercanos };
}

// "Disolver áreas de influencia" de una capa de resultado: une todas sus áreas en una
export async function disolverCapa(features: Feature[], titulo: string) {
  const unida = await disolver(a4326(features));
  return unida ? aMapa([{ ...unida, properties: { origen: titulo, elementos: features.length } }]) : [];
}

// Atributos de los dos elementos cruzados; los de la capa de superposición que repiten nombre llevan "_2"
function unirAtributos(a: GeoJsonProperties, b: GeoJsonProperties) {
  const salida = { ...a };
  for (const [k, v] of Object.entries(b ?? {})) {
    if (ATRIBUTOS_INTERNOS.test(k)) continue;
    salida[k in salida ? `${k}_2` : k] = v;
  }
  return salida;
}

// Igual que el INDEC: cada elemento de la entrada se cruza con cada elemento de la superposición
export async function superposicion(entrada: GFeatures, otra: GFeatures, relacion: Relacion, tituloEntrada: string, tituloOtra: string, alAvanzar?: (hechos: number) => void) {
  const turf = await cargarTurf();
  const cajasOtra = otra.map((f) => turf.bbox(f));
  const tocan = (caja: number[], j: number) =>
    caja[0] <= cajasOtra[j][2] && caja[2] >= cajasOtra[j][0] && caja[1] <= cajasOtra[j][3] && caja[3] >= cajasOtra[j][1];
  const salida: GFeatures = [];

  if (relacion === "union") {
    // Dos capas de polígonos se funden en una sola geometría; si no, se juntan los elementos de ambas
    if (entrada.every(esPoligono) && otra.every(esPoligono)) {
      const unida = await disolver([...entrada, ...otra]);
      return unida ? [{ ...unida, properties: { capas: `${tituloEntrada} + ${tituloOtra}` } }] : [];
    }
    return [
      ...entrada.map((f) => ({ ...f, properties: { ...f.properties, capa_origen: tituloEntrada } })),
      ...otra.map((f) => ({ ...f, properties: { ...f.properties, capa_origen: tituloOtra } })),
    ] as GFeatures;
  }

  // La diferencia se calcula contra todas las áreas juntas: restar elemento por elemento duplicaría el resultado
  const mascara = relacion === "diferencia" ? await disolver(otra) : null;

  for (let i = 0; i < entrada.length; i++) {
    const f = entrada[i];
    const caja = turf.bbox(f);
    const vecinos = otra.map((_, j) => j).filter((j) => tocan(caja, j));
    if (relacion === "interseccion" && esPoligono(f)) {
      // Polígono con polígono: una pieza por cada par que se superpone, con los datos de los dos
      for (const j of vecinos) {
        const g = otra[j];
        const recorte = esPoligono(g) ? turf.intersect(turf.featureCollection([f, g])) : null;
        if (recorte) salida.push({ ...recorte, properties: unirAtributos(f.properties, g.properties) });
      }
    } else if (relacion === "interseccion") {
      // Puntos y líneas no se cortan: el elemento queda una sola vez aunque caiga en varias áreas
      // superpuestas, con los datos de la primera y la cantidad de áreas que lo tocan
      const tocan = vecinos.filter((j) => turf.booleanIntersects(f, otra[j]));
      if (tocan.length) salida.push({ ...f, properties: { ...unirAtributos(f.properties, otra[tocan[0]].properties), coincidencias: tocan.length } });
    } else if (esPoligono(f) && mascara) {
      const resto = vecinos.length ? turf.difference(turf.featureCollection([f, mascara])) : f;
      if (resto) salida.push({ ...resto, properties: f.properties });
    } else if (!vecinos.some((j) => turf.booleanIntersects(f, otra[j]))) {
      salida.push(f);
    }
    if (i % 200 === 199) {
      alAvanzar?.(i + 1);
      await new Promise((r) => setTimeout(r)); // deja respirar a la página
    }
  }
  return salida;
}

export async function derivadas(features: GFeatures, tipo: Derivada) {
  const turf = await cargarTurf();
  const calcular = { centroide: turf.centroid, envolvente: turf.envelope, masa: turf.centerOfMass, interior: turf.pointOnFeature }[
    tipo
  ] as (f: GFeature) => GFeature;
  return features.map((f) => ({ ...calcular(f), properties: { ...f.properties } })) as GFeatures;
}

// Nombre legible de un elemento
export function nombreDe(p: GeoJsonProperties, c?: CapaVisor) {
  if (!p) return "Sin nombre";
  const atributo = c?.nodo?.atributoTitulo ?? ATRIBUTOS_NOMBRE.find((n) => Object.keys(p).some((k) => k.toLowerCase() === n && p[k]));
  // Si no hay uno conocido, el primer atributo con valor cuyo nombre diga "nombre"
  const clave =
    (atributo && Object.keys(p).find((k) => k.toLowerCase() === atributo.toLowerCase())) ||
    Object.keys(p).find((k) => /nombre|name/i.test(k) && p[k] != null && p[k] !== "");
  return clave ? String(p[clave]) : "Sin nombre";
}

export type Distancia = { origen: number; destino: number; metros: number; segundos?: number; punto: number[] };

// Distancia de cada elemento (su centroide, como en el INDEC) a cada destino [lon, lat]
export async function distancias(
  features: GFeatures,
  destinos: number[][],
  tipo: "recta" | "red",
  modo: ModoTransporte,
  alAvanzar?: (hechos: number) => void,
): Promise<Distancia[]> {
  const turf = await cargarTurf();
  const puntos = features.map((f) => (f.geometry.type === "Point" ? f.geometry.coordinates : turf.centroid(f).geometry.coordinates) as number[]);
  if (tipo === "recta") {
    return puntos.flatMap((p, origen) =>
      destinos.map((d, destino) => ({ origen, destino, punto: p, metros: turf.distance(p, d, { units: "meters" }) })),
    );
  }
  if (puntos.length > MAXIMO_RUTEO)
    throw new Error(`Por red vial se calculan hasta ${MAXIMO_RUTEO} elementos por vez y hay ${puntos.length.toLocaleString("es-AR")}. Achicá el área de análisis.`);
  const salida: Distancia[] = [];
  const lote = PUNTOS_RUTEO - destinos.length;
  for (let i = 0; i < puntos.length; i += lote) {
    const origenes = puntos.slice(i, i + lote);
    const coords = [...origenes, ...destinos].map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(";");
    const q = new URLSearchParams({
      sources: origenes.map((_, j) => j).join(";"),
      destinations: destinos.map((_, j) => origenes.length + j).join(";"),
      annotations: "distance,duration",
    });
    const r = await fetch(`${RUTEO}/routed-${PERFIL[modo]}/table/v1/driving/${coords}?${q}`).catch(() => null);
    const datos = await r?.json().catch(() => null);
    if (!r?.ok || datos?.code !== "Ok") throw new Error("El servicio de ruteo no respondió. Probá de nuevo en unos minutos o usá línea recta.");
    origenes.forEach((p, j) =>
      destinos.forEach((_, k) =>
        salida.push({
          origen: i + j,
          destino: k,
          punto: p,
          metros: datos.distances[j][k] ?? NaN,
          segundos: datos.durations[j][k] ?? undefined,
        }),
      ),
    );
    alAvanzar?.(Math.min(i + lote, puntos.length));
  }
  return salida;
}

// --- Formatos ---

export const formatoNumero = (n: number, decimales = 2) =>
  isNaN(n) ? "—" : n.toLocaleString("es-AR", { maximumFractionDigits: decimales });

// Como en el INDEC: metros hasta 1 km y después kilómetros; minutos hasta 90 y después horas
export const formatoDistancia = (m: number) => (isNaN(m) ? "sin ruta" : m < 1000 ? `${formatoNumero(m, 0)} m` : `${formatoNumero(m / 1000, 1)} km`);
export const formatoDuracion = (s?: number) => {
  if (s == null || isNaN(s)) return "—";
  const min = s / 60;
  return min <= 90 ? `${formatoNumero(min, 0)} min` : `${formatoNumero(min / 60, 1)} h`;
};

// CSV para planillas en español: separador ";" y coma decimal
export function csv(columnas: Columna[], filas: Record<string, unknown>[]) {
  const celda = (v: unknown) => {
    if (v == null || (typeof v === "number" && isNaN(v))) return "";
    const s = typeof v === "number" ? String(v).replace(".", ",") : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return "﻿" + [columnas.map((c) => celda(c.etiqueta)), ...filas.map((f) => columnas.map((c) => celda(f[c.clave])))].map((f) => f.join(";")).join("\r\n");
}

// Columnas de los atributos de una capa, para las tablas
export async function columnasDe(entrada: Entrada): Promise<Columna[]> {
  const campos = await camposDe(entrada).catch(() => []);
  return campos.map((c) => ({ clave: c.atributo, etiqueta: c.etiqueta, numerico: c.numerico, formato: c.formato as Columna["formato"] }));
}

// Tabla de atributos de una capa (botón "Tabla de atributos" del panel de capas)
export async function tablaDeAtributos(entrada: Entrada, area: Polygon | null): Promise<Tabla> {
  const [{ features, truncado }, columnas] = await Promise.all([obtener(entrada, area), columnasDe(entrada)]);
  const visibles = columnas.length ? columnas : camposVectoriales(aMapa(features)).map((c) => ({ clave: c.atributo, etiqueta: c.etiqueta, numerico: c.numerico }));
  return {
    titulo: entrada.titulo,
    subtitulo: area ? "Elementos en la extensión del mapa" : undefined,
    columnas: visibles,
    filas: features.map((f) => f.properties ?? {}),
    geometrias: aMapa(features).map((f) => f.getGeometry()),
    archivo: entrada.titulo,
    aviso: truncado ? `Se muestran los primeros ${MAXIMO.toLocaleString("es-AR")} elementos.` : undefined,
  };
}
