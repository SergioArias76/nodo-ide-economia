// Buscador de proveedores de la página de inicio. Solo del servidor (lo usa app/api/buscar): consulta el WFS
// de GeoServer por la red interna y devuelve un resumen chico (conteos por localidad, rubros principales y
// algunos nombres), en lugar de mandar al navegador cientos de KB por consulta. El rubro y la localidad se
// validan contra las listas publicadas, así el texto del usuario nunca llega al filtro CQL.

const GEOSERVER = process.env.GEOSERVER_URL ?? "http://localhost:8080/geoserver";
const WFS = `${GEOSERVER}/economia/wfs`;
const MINUTOS_LISTAS = 30;
const MINUTOS_CONSULTAS = 10;

export type Localidad = { localidad: string; provincia: string; n: number; lon: number; lat: number };
export type Rubro = { rubro: string; n: number };
export type Opciones = { rubros: Rubro[]; localidades: Localidad[]; total: number };
export type Resultado = {
  total: number;
  juridicas: number;
  fisicas: number;
  localidades: { localidad: string; provincia: string; n: number }[];
  rubros: Rubro[];
  ejemplos: { entidad: string; cuit: string; localidad: string; tipo: string }[];
};

async function wfs<T>(params: Record<string, string>): Promise<T[]> {
  const q = new URLSearchParams({ service: "WFS", version: "2.0.0", request: "GetFeature", outputFormat: "application/json", ...params });
  const r = await fetch(`${WFS}?${q}`, { signal: AbortSignal.timeout(10000), cache: "no-store" });
  if (!r.ok) throw new Error(`GeoServer respondió ${r.status}`);
  const d: { features: { properties: T; geometry: { coordinates: number[] } | null }[] } = await r.json();
  return d.features.map((f) => ({ ...f.properties, _xy: f.geometry?.coordinates }) as T);
}

let opciones: { valor: Opciones; vence: number } | null = null;

export async function leerOpciones(): Promise<Opciones> {
  if (opciones && opciones.vence > Date.now()) return opciones.valor;
  const [rubros, localidades] = await Promise.all([
    wfs<{ rubro: string; cant_proveedores: number }>({ typeNames: "economia:proveedores_rubros", propertyName: "rubro,cant_proveedores" }),
    wfs<{ localidad: string; provincia: string; cant_proveedores: number; _xy?: number[] }>({ typeNames: "economia:proveedores_por_localidad" }),
  ]);
  const valor: Opciones = {
    rubros: rubros.map((r) => ({ rubro: r.rubro, n: r.cant_proveedores })).sort((a, b) => b.n - a.n),
    localidades: localidades
      .filter((l) => l.localidad && l._xy)
      .map((l) => ({ localidad: l.localidad, provincia: l.provincia, n: l.cant_proveedores, lon: l._xy![0], lat: l._xy![1] }))
      .sort((a, b) => b.n - a.n),
    total: localidades.reduce((s, l) => s + l.cant_proveedores, 0),
  };
  opciones = { valor, vence: Date.now() + MINUTOS_LISTAS * 60_000 };
  return valor;
}

const consultas = new Map<string, { valor: Resultado; vence: number }>();
const cql = (s: string) => `'${s.replace(/'/g, "''")}'`;

// rubro y localidad ya validados contra las opciones; null = sin ese filtro
export async function buscar(rubro: string | null, localidad: Localidad | null): Promise<Resultado> {
  const clave = `${rubro ?? ""}|${localidad ? `${localidad.localidad}|${localidad.provincia}` : ""}`;
  const guardada = consultas.get(clave);
  if (guardada && guardada.vence > Date.now()) return guardada.valor;

  const filtros: string[] = [];
  // "rubros" es la lista "A | B | C": se busca el rubro como elemento completo, no como parte de otro
  if (rubro) filtros.push(`(rubros = ${cql(rubro)} OR rubros LIKE ${cql(`${rubro} | %`)} OR rubros LIKE ${cql(`% | ${rubro}`)} OR rubros LIKE ${cql(`% | ${rubro} | %`)})`);
  if (localidad) filtros.push(`localidad = ${cql(localidad.localidad)} AND provincia = ${cql(localidad.provincia)}`);

  const filas = await wfs<{ entidad: string; cuit: string; localidad: string; provincia: string; tipo_persona: string; rubros: string | null }>({
    typeNames: "economia:proveedores_radicacion",
    // Con el CUIT, para que cada nombre de ejemplo abra el proveedor en el visor
    propertyName: "entidad,cuit,localidad,provincia,tipo_persona,rubros",
    ...(filtros.length ? { CQL_FILTER: filtros.join(" AND ") } : {}),
  });

  const porLocalidad = new Map<string, { localidad: string; provincia: string; n: number }>();
  const porRubro = new Map<string, number>();
  for (const f of filas) {
    const k = `${f.localidad}|${f.provincia}`;
    const l = porLocalidad.get(k) ?? { localidad: f.localidad, provincia: f.provincia, n: 0 };
    l.n++;
    porLocalidad.set(k, l);
    for (const r of (f.rubros ?? "").split(" | ").filter(Boolean)) if (r !== rubro) porRubro.set(r, (porRubro.get(r) ?? 0) + 1);
  }
  const juridicas = filas.filter((f) => f.tipo_persona === "juridica").length;
  const valor: Resultado = {
    total: filas.length,
    juridicas,
    fisicas: filas.length - juridicas,
    localidades: [...porLocalidad.values()].sort((a, b) => b.n - a.n),
    rubros: [...porRubro].map(([r, n]) => ({ rubro: r, n })).sort((a, b) => b.n - a.n).slice(0, 6),
    // Algunos nombres: primero personas jurídicas, en orden alfabético
    ejemplos: filas
      .slice()
      .sort((a, b) => (a.tipo_persona === b.tipo_persona ? a.entidad.localeCompare(b.entidad, "es") : a.tipo_persona === "juridica" ? -1 : 1))
      .slice(0, 6)
      .map((f) => ({ entidad: f.entidad, cuit: f.cuit, localidad: f.localidad, tipo: f.tipo_persona })),
  };
  if (consultas.size > 500) consultas.clear();
  consultas.set(clave, { valor, vence: Date.now() + MINUTOS_CONSULTAS * 60_000 });
  return valor;
}
