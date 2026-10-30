#!/usr/bin/env node
// Convierte el reporte "Listado de Rubros/Categ/Subcat y Proveedores" del SIAFyC (Excel .xls) al GeoJSON que
// carga scripts/cargar-proveedores.sh, con los mismos campos que el paquete QGIS (docs/datos-proveedores.md).
//
// El reporte trae una fila por proveedor y rubro, debajo de filas de rubro (____), categoría (-----) y
// subcategoría (. . .), y no trae coordenadas. Este script:
//   1. agrupa por CUIT (sin CUIT, por número de comprobante) y arma rubros, rubro principal y niveles;
//   2. separa el domicilio (calle, altura, complemento) y la ciudad (código postal y localidad), como
//      describe docs/api-proveedores.md;
//   3. ubica cada proveedor: si su domicilio no cambió respecto de la base, conserva la ubicación que ya
//      tiene; si es nuevo o cambió, lo pone en el centro de su localidad (las que ya están en la base o,
//      si no, Georef) con precisión "localidad", para que scripts/geocodificar-domicilios.mjs lo mejore.
//
// Uso: node scripts/importar-padron-siafyc.mjs [Proveedores.xls]   (por defecto datos/fuentes/proveedores/Proveedores.xls)
//      bash scripts/cargar-proveedores.sh datos/fuentes/proveedores/padron_siafyc.geojson
// Requiere el stack levantado (lee las ubicaciones actuales de PostGIS); GDAL corre en un contenedor temporal.
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const XLS = resolve(process.argv[2] ?? `${RAIZ}datos/fuentes/proveedores/Proveedores.xls`);
const SALIDA = `${RAIZ}datos/fuentes/proveedores/padron_siafyc.geojson`;
const NO_UBICADOS = `${RAIZ}datos/geocodificacion/padron-sin-localidad.csv`;
const GDAL_IMAGE = process.env.GDAL_IMAGE ?? "ghcr.io/osgeo/gdal:ubuntu-small-latest";
const GEOREF = "https://apis.datos.gob.ar/georef/api/localidades";
const AGENTE = "nodo-ide-economia-chubut/1.0 (+https://github.com/SergioArias76/nodo-ide-economia)";

// --- utilidades ---

const normal = (s) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const titulo = (s) => s.toLowerCase().replace(/(^|[\s.(/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

function psql(sql) {
  const r = spawnSync("docker", ["compose", "exec", "-T", "postgis", "psql", "-U", "ide_admin", "-d", "ide", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], {
    cwd: RAIZ,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`psql: ${r.stderr}`);
  return r.stdout;
}

// CSV con comillas (la salida de ogr2ogr)
function filasCsv(texto) {
  const filas = [];
  let fila = [], campo = "", comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') (campo += '"'), i++;
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ",") fila.push(campo), (campo = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo), filas.push(fila), (fila = []), (campo = "");
    } else campo += c;
  }
  if (campo || fila.length) fila.push(campo), filas.push(fila);
  return filas;
}

// --- 1. Excel → filas (ogr2ogr lee el .xls con el driver XLS de GDAL) ---

const gdal = spawnSync(
  "docker",
  ["run", "--rm", "-v", `${dirname(XLS)}:/fuente:ro`, GDAL_IMAGE, "ogr2ogr", "-f", "CSV", "/vsistdout/", `/fuente/${basename(XLS)}`],
  { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, env: { ...process.env, MSYS_NO_PATHCONV: "1" } },
);
if (gdal.status !== 0) throw new Error(`ogr2ogr: ${gdal.stderr}`);
const filas = filasCsv(gdal.stdout);

// Columnas del encabezado del reporte (Entidad, C.U.I.T., NºComp, Mail, Domicilio, Tipo Dom., Telef., Ciudad)
const encabezado = filas.findIndex((f) => f[1] === "Entidad");
if (encabezado < 0) throw new Error("No encontré el encabezado del reporte (columna Entidad): ¿es el listado de rubros y proveedores?");
const col = Object.fromEntries(filas[encabezado].map((n, i) => [normal(n), i]));
const C = { entidad: col.entidad, cuit: col["c u i t"], comp: col["ncomp"] ?? col["n comp"] ?? col["nºcomp"], mail: col.mail, domicilio: col.domicilio, tipo: col["tipo dom"], telefono: col.telef, ciudad: col.ciudad };
if (Object.values(C).some((v) => v == null)) throw new Error(`Faltan columnas en el encabezado: ${filas[encabezado].join(", ")}`);

// --- 2. Agrupado por proveedor ---

const proveedores = new Map();
let n1 = null, n2 = null, n3 = null;
for (const f of filas.slice(encabezado + 1)) {
  const a = (f[0] ?? "").trim();
  if (a.startsWith("____")) (n1 = a.replace(/^_+\s*/, "").trim()), (n2 = n3 = null);
  else if (a.startsWith("-----")) (n2 = f[1].trim()), (n3 = null);
  else if (a.startsWith(". . .")) n3 = f[1].trim();
  else if (!a && f[C.entidad]?.trim() && (f[C.cuit]?.trim() || f[C.comp]?.trim())) {
    const cuit = f[C.cuit].trim();
    const clave = cuit.replaceAll("-", "") || `comp:${f[C.comp].trim()}`; // la base guarda el CUIT sin guiones
    const rubro = n3 ?? n2 ?? n1;
    let p = proveedores.get(clave);
    if (!p) proveedores.set(clave, (p = { cuit, filas: [], rubros: [], niveles: [n1, n2, n3] }));
    p.filas.push(f);
    if (rubro && !p.rubros.includes(rubro)) p.rubros.push(rubro);
  }
}

// "FRANCISCO SEGUI Nro 562 Piso 1 Dpto B" → calle, altura y complemento; "9001 Rada Tilly" → CP y localidad
function partes(domicilio, ciudad) {
  const m = domicilio.match(/^(.*?)\s+Nro\.?\s*(\d+)\s*(.*)$/i);
  const calle = (m ? m[1] : domicilio).trim();
  const altura = m && m[2] !== "0" ? m[2] : "";
  const complemento = (m ? m[3] : "").replace(/\b(Piso|Dpto|S|T|M):0\b/gi, "").replace(/\s+/g, " ").trim();
  const c = ciudad.trim().match(/^(\d{4})\s+(.+)$/);
  return { calle, altura, complemento, cp: c ? c[1] : "", localidad: (c ? c[2] : ciudad).trim() };
}

// --- 3. Ubicaciones actuales y localidades conocidas ---

const actuales = new Map(
  JSON.parse(
    psql(`SELECT coalesce(json_agg(row_to_json(t)), '[]') FROM (
      SELECT p.cuit, p.nro_comp, d.direccion, d.domicilio_orig, d.calle, d.altura, d.complemento, d.cp, d.localidad,
             d.departamento, d.provincia, d.pais, d.calidad_dir, d.precision, d.fuente_geo, ST_X(d.geom) AS lon, ST_Y(d.geom) AS lat
      FROM proveedores.proveedor p JOIN proveedores.domicilio d ON d.proveedor_id = p.id) t`),
  ).map((d) => [d.cuit ? d.cuit : `comp:${d.nro_comp}`, d]),
);

// Centro de cada localidad de la base: el punto de los proveedores ubicados por localidad (todos comparten el
// mismo) o, si solo hay ubicados por provincia ("Capital Federal"), el de la provincia. Se busca por
// localidad y CP, y si no por localidad sola cuando no se repite en otra provincia
const localidades = new Map();
for (const d of actuales.values()) {
  if (!d.localidad || !d.provincia) continue;
  for (const clave of [`${normal(d.localidad)}|${d.cp ?? ""}`, normal(d.localidad)]) {
    const l = localidades.get(clave) ?? { localidad: d.localidad, departamento: d.departamento, provincia: d.provincia, provincias: new Set(), centro: null };
    l.provincias.add(d.provincia);
    if (d.precision === "localidad" && l.precision !== "localidad") Object.assign(l, { centro: [d.lon, d.lat], precision: "localidad" });
    if (d.precision === "provincia" && !l.centro) Object.assign(l, { centro: [d.lon, d.lat], precision: "provincia" });
    localidades.set(clave, l);
  }
}

async function georef(params) {
  const r = await fetch(`${GEOREF}?${new URLSearchParams({ ...params, max: "10" })}`, { headers: { "User-Agent": AGENTE } });
  return r.ok ? ((await r.json()).localidades ?? []) : [];
}

// Localidad del padrón → nombre, departamento, provincia y centro
const resueltas = new Map();
async function ubicarLocalidad(localidad, cp) {
  const clave = `${normal(localidad)}|${cp}`;
  if (resueltas.has(clave)) return resueltas.get(clave);
  let r = null;
  const conocida = localidades.get(clave) ?? (localidades.get(normal(localidad))?.provincias.size === 1 ? localidades.get(normal(localidad)) : null);
  if (conocida?.centro) r = { ...conocida, fuente: "padron_anterior" };
  else {
    // Georef: con CP del Chubut (9000 a 9299) se busca en la provincia; si no, en todo el país, y entre las
    // coincidencias se prefiere la de la provincia conocida o la que tenga el nombre exacto
    const chubut = /^9[0-2]\d\d$/.test(cp);
    let lista = await georef({ nombre: conocida?.localidad ?? localidad, ...(chubut ? { provincia: "Chubut" } : conocida ? { provincia: conocida.provincia } : {}) });
    if (!lista.length && (chubut || conocida)) lista = await georef({ nombre: localidad });
    const exacta = lista.find((l) => normal(l.nombre) === normal(localidad)) ?? lista[0];
    if (exacta)
      r = {
        localidad: exacta.nombre,
        departamento: exacta.departamento?.nombre ?? conocida?.departamento ?? null,
        provincia: exacta.provincia?.nombre,
        centro: [exacta.centroide.lon, exacta.centroide.lat],
        precision: "localidad",
        fuente: "georef/localidad",
      };
  }
  resueltas.set(clave, r);
  return r;
}

// --- 4. GeoJSON ---

const features = [];
const sinLocalidad = [];
const cuenta = { iguales: 0, nuevos: 0, cambiados: 0, sinUbicar: 0 };
for (const [clave, p] of proveedores) {
  // Con más de un domicilio (legal, filial, real…) se usa el legal
  const f = p.filas.find((x) => x[C.tipo] === "Legal") ?? p.filas[0];
  const domicilio = f[C.domicilio].trim();
  const ciudad = f[C.ciudad].trim();
  const d = partes(domicilio, ciudad);
  const props = {
    entidad: f[C.entidad].trim(),
    cuit: p.cuit,
    nro_comp: f[C.comp].trim(),
    rubro_principal: p.rubros[0] ?? "",
    rubros: p.rubros.join(" | "),
    cant_rubros: p.rubros.length,
    rubro_n1: p.niveles[0] ?? "",
    rubro_n2: p.niveles[1] ?? "",
    rubro_n3: p.niveles[2] ?? "",
    mail: f[C.mail].trim(),
    telefono: f[C.telefono].trim(),
    domicilio_orig: domicilio,
  };
  const antes = actuales.get(clave);
  // Mismo domicilio (sin distinguir mayúsculas ni espacios): se conserva la ubicación. El CP y la localidad
  // no se comparan: el paquete QGIS corrigió los del SIAFyC (Lago Puelo figura con 9211 y es 8431)
  if (antes && normal(antes.domicilio_orig) === normal(domicilio)) {
    cuenta.iguales++;
    const { cuit, nro_comp, domicilio_orig, lon, lat, ...ubicacion } = antes;
    features.push({ type: "Feature", properties: { ...props, ...ubicacion }, geometry: { type: "Point", coordinates: [lon, lat] } });
    continue;
  }
  cuenta[antes ? "cambiados" : "nuevos"]++;
  const l = d.localidad ? await ubicarLocalidad(d.localidad, d.cp) : null;
  if (!l) {
    // Sigue en el padrón (rubros, conteos), sin domicilio en el mapa
    cuenta.sinUbicar++;
    sinLocalidad.push([p.cuit, props.entidad, domicilio, ciudad]);
    features.push({ type: "Feature", properties: { ...props, ...d, calle: titulo(d.calle), pais: "Argentina" }, geometry: null });
    continue;
  }
  const calle = titulo(d.calle);
  features.push({
    type: "Feature",
    properties: {
      ...props,
      direccion: [[calle, d.altura].filter(Boolean).join(" "), l.localidad, l.provincia, "Argentina"].filter(Boolean).join(", "),
      calle,
      altura: d.altura,
      complemento: d.complemento,
      cp: d.cp,
      localidad: l.localidad,
      departamento: l.departamento ?? "",
      provincia: l.provincia,
      pais: "Argentina",
      calidad_dir: "",
      precision: l.precision,
      fuente_geo: l.fuente,
    },
    geometry: { type: "Point", coordinates: l.centro },
  });
}

writeFileSync(SALIDA, JSON.stringify({ type: "FeatureCollection", name: "padron_siafyc", features }));
mkdirSync(dirname(NO_UBICADOS), { recursive: true });
writeFileSync(NO_UBICADOS, ["cuit,entidad,domicilio,ciudad", ...sinLocalidad.map((f) => f.map((v) => `"${v.replaceAll('"', '""')}"`).join(","))].join("\n") + "\n");

const bajas = [...actuales.keys()].filter((k) => !proveedores.has(k)).length;
console.log(`${proveedores.size} proveedores en ${basename(XLS)}`);
console.log(`  ${cuenta.iguales} con el mismo domicilio: conservan su ubicación`);
console.log(`  ${cuenta.nuevos} nuevos y ${cuenta.cambiados} con domicilio cambiado: ubicados en el centro de su localidad`);
if (cuenta.sinUbicar) console.log(`  ${cuenta.sinUbicar} sin localidad reconocible: quedan fuera del mapa (${NO_UBICADOS})`);
console.log(`  ${bajas} de la base ya no están en el padrón`);
console.log(`GeoJSON: ${SALIDA}`);
console.log("Siguiente: bash scripts/cargar-proveedores.sh datos/fuentes/proveedores/padron_siafyc.geojson");
