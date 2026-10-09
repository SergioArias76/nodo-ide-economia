#!/usr/bin/env node
// Copia al nodo las capas nacionales del catálogo de IDERA que publican WFS, recortadas al Chubut, y las
// publica en GeoServer (workspace "nacional") con el estilo del organismo de origen.
//
// Por qué: los servicios nacionales a veces tardan más de 40 s o no responden (el del IGN), y el visor
// depende de ellos para mostrar, consultar y analizar. Copiados al nodo responden en milisegundos, no
// tienen problemas de CORS y se pueden documentar en el catálogo. Son datos que cambian poco: alcanza con
// correr este script una vez por semana (ver docs/despliegue.md). El visor usa la copia del nodo si existe
// y, si no, el servicio original.
//
// Uso: node scripts/importar-capas-nacionales.mjs [id-de-capa ...]   (sin ids: todas las que tienen WFS)
// Requiere el stack levantado (PostGIS y GeoServer), el .env de la raíz y npm ci en portal/ (usa su Turf).
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Turf de portal/node_modules (recorte previo de geometrías grandes)
const turf = createRequire(new URL("../portal/package.json", import.meta.url))("@turf/turf");

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const env = Object.fromEntries(
  readFileSync(`${RAIZ}.env`, "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const [k, ...v] = l.split("=");
      return [k, v.join("=").replace(/^["']|["']$/g, "")];
    }),
);
if (env.DOMINIO === "localhost") process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // certificado autofirmado en dev

const REST = env.GEOSERVER_REST ?? `https://${env.DOMINIO}/geoserver/rest`;
const AUTH = "Basic " + Buffer.from(`${env.GEOSERVER_ADMIN_USER}:${env.GEOSERVER_ADMIN_PASSWORD}`).toString("base64");
const WS = "nacional";
const STORE = "ide_nacional";
const ESPERA = 180_000;

const catalogo = JSON.parse(readFileSync(`${RAIZ}portal/src/lib/capas-idera.json`, "utf8")).capas;
const limite = JSON.parse(readFileSync(`${RAIZ}portal/src/lib/limite-chubut.json`, "utf8")).geometria;

// --- utilidades ---

const tablaDe = (id) => id.replaceAll("-", "_");
const ident = (s) => `"${s.replaceAll('"', '""')}"`;
const texto = (s) => `'${String(s).replaceAll("'", "''")}'`;

// Contorno del Chubut en EPSG:3857 para el filtro CQL de los servicios de origen
const merc = ([lon, lat]) => [(lon * 20037508.34) / 180, (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * (20037508.34 / 180)];
const WKT_CHUBUT =
  "SRID=3857;MULTIPOLYGON(" +
  limite.coordinates.map((p) => "(" + p.map((r) => "(" + r.map((c) => merc(c).map((n) => n.toFixed(1)).join(" ")).join(",") + ")").join(",") + ")").join(",") +
  ")";

// Rectángulo del Chubut en EPSG:3857 (plan B del filtro, ver importar)
const BBOX_CHUBUT = (() => {
  const xy = limite.coordinates.flat(2).map(merc);
  const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((n) => n.toFixed(0)).join(",");
})();

function psql(sql) {
  const r = spawnSync("docker", ["compose", "exec", "-T", "postgis", "psql", "-v", "ON_ERROR_STOP=1", "-q", "-A", "-t", "-U", env.POSTGRES_USER, "-d", env.IDE_DB], {
    cwd: RAIZ,
    input: sql,
    encoding: "utf8",
    maxBuffer: 1 << 30,
  });
  if (r.status !== 0) throw new Error(r.stderr || "psql falló");
  return r.stdout;
}

async function api(metodo, ruta, cuerpo, tipo = "application/json") {
  const r = await fetch(`${REST}${ruta}`, {
    method: metodo,
    headers: { Authorization: AUTH, ...(cuerpo != null && { "Content-Type": tipo }) },
    body: cuerpo == null ? undefined : typeof cuerpo === "string" || cuerpo instanceof Uint8Array ? cuerpo : JSON.stringify(cuerpo),
  });
  return r.status;
}
const existe = async (ruta) => (await api("GET", `${ruta}.json`)) === 200;
const ok = (que, estado) => {
  if (estado < 200 || estado > 299) throw new Error(`${que}: HTTP ${estado}`);
};

async function pedir(url, params, intentos = 2, espera = ESPERA) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params),
        signal: AbortSignal.timeout(espera),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      if (i >= intentos) throw e;
    }
  }
}

// Tipos de los campos del servicio de origen → PostgreSQL. Las fechas quedan como texto (cada servicio
// las escribe distinto).
const TIPOS = [
  [/^(xsd:)?(int|short|byte)$/i, "integer"],
  [/^(xsd:)?(long|integer)$/i, "bigint"],
  [/^(xsd:)?(double|float|decimal)$/i, "double precision"],
  [/^(xsd:)?boolean$/i, "boolean"],
];
const tipoSql = (t) => TIPOS.find(([re]) => re.test(t))?.[1] ?? "text";

// --- preparación (idempotente) ---

async function preparar() {
  psql(`
    CREATE SCHEMA IF NOT EXISTS nacional;
    CREATE TABLE IF NOT EXISTS nacional.limite_chubut (id integer PRIMARY KEY, geom geometry(MultiPolygon, 4326));
    INSERT INTO nacional.limite_chubut VALUES (1, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${texto(JSON.stringify(limite))}), 4326)))
      ON CONFLICT (id) DO UPDATE SET geom = EXCLUDED.geom;
    -- Registro de las copias: de dónde salió cada capa y cuándo se actualizó
    CREATE TABLE IF NOT EXISTS nacional.capas (
      id text PRIMARY KEY, tabla text NOT NULL, titulo text, grupo text,
      fuente text, capa_origen text, elementos integer, actualizado timestamptz NOT NULL DEFAULT now());
    GRANT USAGE ON SCHEMA nacional TO geoserver_ro;
    GRANT SELECT ON ALL TABLES IN SCHEMA nacional TO geoserver_ro;
    ALTER DEFAULT PRIVILEGES IN SCHEMA nacional GRANT SELECT ON TABLES TO geoserver_ro;
  `);
  if (!(await existe(`/workspaces/${WS}`)))
    ok("workspace", await api("POST", "/namespaces", { namespace: { prefix: WS, uri: `https://${env.DOMINIO}/${WS}` } }));
  if (!(await existe(`/workspaces/${WS}/datastores/${STORE}`)))
    ok(
      "store",
      await api("POST", `/workspaces/${WS}/datastores`, {
        dataStore: {
          name: STORE,
          connectionParameters: {
            entry: [
              { "@key": "dbtype", $: "postgis" },
              { "@key": "host", $: "postgis" },
              { "@key": "port", $: "5432" },
              { "@key": "database", $: env.IDE_DB },
              { "@key": "schema", $: "nacional" },
              { "@key": "user", $: "geoserver_ro" },
              { "@key": "passwd", $: env.GEOSERVER_DB_PASSWORD },
              { "@key": "Expose primary keys", $: "true" },
              // prueba cada conexión antes de usarla: si PostGIS se reinicia, GeoServer no queda con conexiones rotas
              { "@key": "validate connections", $: "true" },
            ],
          },
        },
      }),
    );
}

// --- una capa ---

async function importar(c) {
  const tabla = tablaDe(c.id);
  const nombre = c.capaWfs ?? c.capa;

  // Campos y geometría del servicio de origen
  const desc = await (await pedir(c.url, { service: "WFS", version: "2.0.0", request: "DescribeFeatureType", typeNames: nombre, outputFormat: "application/json" })).json();
  const props = desc.featureTypes[0].properties;
  const geomOrigen = props.find((p) => p.type.startsWith("gml:"))?.name;
  if (!geomOrigen) throw new Error("la capa no tiene geometría");
  const campos = props
    .filter((p) => p.name !== geomOrigen)
    .map((p) => ({ origen: p.name, columna: ["fid", "geom"].includes(p.name.toLowerCase()) ? `${p.name}_origen` : p.name, tipo: tipoSql(p.type) }));

  // Elementos que tocan el Chubut (el servicio filtra; PostGIS recorta las geometrías al contorno)
  const base = { service: "WFS", version: "2.0.0", request: "GetFeature", typeNames: nombre, outputFormat: "application/json", srsName: "EPSG:3857" };
  let r;
  try {
    r = await pedir(c.url, { ...base, CQL_FILTER: `INTERSECTS(${geomOrigen}, ${WKT_CHUBUT})` }, 1);
  } catch {
    // Con polígonos enormes (país, provincias, bosques nativos) el servidor de origen no llega a cruzarlos
    // con el contorno: se pide el rectángulo del Chubut, más barato, y el recorte exacto lo hace PostGIS
    r = await pedir(c.url, { ...base, bbox: `${BBOX_CHUBUT},EPSG:3857` }, 2, 600_000);
  }
  const features = (await r.json()).features;

  // Se carga por tandas de ~2 MB: un solo bloque con capas grandes (bosques nativos, 130 MB) agota la
  // memoria de PostgreSQL. Todo va en una transacción: si algo falla, queda la copia anterior.
  const tandas = [];
  let tanda = [];
  let peso = 0;
  const caja = BBOX_CHUBUT.split(",").map(Number);
  for (const original of features) {
    if (!original.geometry) continue;
    // Recorte previo al rectángulo del Chubut: el polígono del país entero pesa 48 MB y PostGIS (1,5 GB de
    // memoria en el servidor) no puede cortarlo de una vez. bboxClip es lineal y casi no usa memoria.
    const f = /Polygon|LineString/.test(original.geometry.type) ? { ...original, geometry: turf.bboxClip(original, caja).geometry } : original;
    if (!f.geometry?.coordinates?.length) continue;
    let json = JSON.stringify(f);
    // Geometrías de más de 1 MB (bosques nativos): simplificación de 10 m, imperceptible a la escala de esos
    // mapas (1:250.000) y que evita agotar la memoria de PostGIS al recortarlas
    if (json.length > 1_000_000 && f.geometry.type !== "Point") json = JSON.stringify(turf.simplify(f, { tolerance: 10, highQuality: false }));
    if (peso + json.length > 2_000_000 && tanda.length) {
      tandas.push(tanda);
      tanda = [];
      peso = 0;
    }
    tanda.push(json);
    peso += json.length;
  }
  if (tanda.length) tandas.push(tanda);

  const columnas = campos.map((f) => `${ident(f.columna)} ${f.tipo}`).join(", ");
  const valores = campos.map((f) => `nullif(f->'properties'->>${texto(f.origen)}, '')::${f.tipo}`).join(", ");
  const insertar = (lista) => {
    const datos = `[${lista.join(",")}]`;
    if (datos.includes("$gj$")) throw new Error("respuesta inesperada");
    return `
    INSERT INTO nacional.${ident(tabla)} (${[...campos.map((f) => ident(f.columna)), "geom"].join(", ")})
    SELECT ${valores ? valores + ", " : ""}g
    FROM (
      SELECT f, ST_MakeValid(ST_Force2D(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(f->>'geometry'), 3857), 4326))) AS g0
      FROM jsonb_array_elements($gj$${datos}$gj$::jsonb) f
    ) s,
    LATERAL (
      SELECT CASE WHEN ST_CoveredBy(s.g0, l.geom) THEN s.g0
                  ELSE ST_CollectionExtract(ST_Intersection(s.g0, l.geom), ST_Dimension(s.g0) + 1) END AS g
      FROM nacional.limite_chubut l
    ) c
    WHERE NOT ST_IsEmpty(c.g);`;
  };
  const salida = psql(`
    SET client_min_messages = warning;
    BEGIN;
    DROP TABLE IF EXISTS nacional.${ident(tabla)};
    CREATE TABLE nacional.${ident(tabla)} (fid serial PRIMARY KEY${columnas ? ", " + columnas : ""}, geom geometry(Geometry, 4326));
    ${tandas.map(insertar).join("\n")}
    CREATE INDEX ON nacional.${ident(tabla)} USING gist (geom);
    GRANT SELECT ON nacional.${ident(tabla)} TO geoserver_ro;
    INSERT INTO nacional.capas (id, tabla, titulo, grupo, fuente, capa_origen, elementos, actualizado)
    SELECT ${texto(c.id)}, ${texto(tabla)}, ${texto(c.titulo)}, ${texto(c.grupo)}, ${texto(c.url)}, ${texto(c.capa)}, count(*), now()
    FROM nacional.${ident(tabla)}
    ON CONFLICT (id) DO UPDATE SET tabla = EXCLUDED.tabla, titulo = EXCLUDED.titulo, grupo = EXCLUDED.grupo, fuente = EXCLUDED.fuente,
      capa_origen = EXCLUDED.capa_origen, elementos = EXCLUDED.elementos, actualizado = EXCLUDED.actualizado;
    COMMIT;
    ANALYZE nacional.${ident(tabla)};
    SELECT elementos FROM nacional.capas WHERE id = ${texto(c.id)};
  `);
  const elementos = Number(salida.trim().split(/\s+/).pop());

  // Publicación (la primera vez se crea; después se recalcula la extensión)
  const ft = `/workspaces/${WS}/datastores/${STORE}/featuretypes`;
  const hoy = new Date().toLocaleDateString("es-AR");
  const datos = {
    featureType: {
      name: tabla,
      nativeName: tabla,
      srs: "EPSG:4326",
      title: `${c.titulo} (Chubut)`,
      abstract: `${c.resumen ? c.resumen + " " : ""}Copia recortada a la provincia del Chubut del servicio ${c.url} (capa ${c.capa}), actualizada el ${hoy}.`,
    },
  };
  if (await existe(`${ft}/${tabla}`)) ok("capa", await api("PUT", `${ft}/${tabla}?recalculate=nativebbox,latlonbbox`, datos));
  else ok("capa", await api("POST", ft, datos));

  const estilo = await copiarEstilo(c, tabla);
  return { elementos, estilo };
}

// --- estilo del organismo de origen ---

// GetStyles devuelve el SLD; los íconos apuntan a archivos internos de ese servidor (file:...), así que se
// reemplazan por la imagen que entrega GetLegendGraphic para cada regla, pedida al tamaño (Size) de esa regla
// para que se dibuje igual que en el origen, y subida al workspace del nodo.
async function copiarEstilo(c, tabla) {
  let sld;
  try {
    const r = await fetch(`${c.url}?service=WMS&version=1.1.1&request=GetStyles&layers=${encodeURIComponent(c.capaWfs ?? c.capa)}`, { signal: AbortSignal.timeout(ESPERA) });
    sld = await r.text();
    if (!r.ok || !sld.includes("StyledLayerDescriptor")) throw new Error();
  } catch {
    return "estilo por defecto (el origen no entrega su SLD)";
  }

  let iconos = 0;
  const partes = [];
  let desde = 0;
  for (const m of sld.matchAll(/<(?:sld:)?Rule>[\s\S]*?<\/(?:sld:)?Rule>/g)) {
    let regla = m[0];
    const hrefs = [...new Set([...regla.matchAll(/xlink:href="([^"]+)"/g)].map((x) => x[1]))].filter((h) => !/^https?:/.test(h));
    if (hrefs.length) {
      const nombreRegla = regla.match(/<(?:sld:)?Name>([^<]*)<\/(?:sld:)?Name>/)?.[1];
      const lado = String(Math.max(4, Math.round(Number(regla.match(/<(?:sld:)?Size>\s*([\d.]+)\s*</)?.[1]) || 16)));
      const q = new URLSearchParams({
        service: "WMS",
        version: "1.1.1",
        request: "GetLegendGraphic",
        layer: c.capaWfs ?? c.capa, // sin el prefijo viejo "ign:" que algunas capas traen en IDERA
        format: "image/png",
        width: lado,
        height: lado,
        transparent: "true",
        legend_options: "forceLabels:off;fontAntiAliasing:true",
        ...(nombreRegla && { rule: nombreRegla }),
      });
      const r = await fetch(`${c.url}?${q}`, { signal: AbortSignal.timeout(ESPERA) }).catch(() => null);
      if (r?.ok && r.headers.get("content-type")?.startsWith("image/")) {
        const archivo = `${tabla}_${++iconos}.png`;
        ok("ícono", await api("PUT", `/resource/workspaces/${WS}/styles/${archivo}`, new Uint8Array(await r.arrayBuffer()), "image/png"));
        for (const href of hrefs) regla = regla.replaceAll(`xlink:href="${href}"`, `xlink:href="${archivo}"`);
        regla = regla.replace(/(<(?:sld:)?Format>)image\/(svg\+xml|gif|jpeg)(<\/(?:sld:)?Format>)/g, "$1image/png$3");
      }
    }
    partes.push(sld.slice(desde, m.index), regla);
    desde = m.index + m[0].length;
  }
  sld = partes.join("") + sld.slice(desde);

  const ruta = `/workspaces/${WS}/styles`;
  const tipo = "application/vnd.ogc.sld+xml";
  if (await existe(`${ruta}/${tabla}`)) ok("estilo", await api("PUT", `${ruta}/${tabla}`, sld, tipo));
  else ok("estilo", await api("POST", `${ruta}?name=${tabla}`, sld, tipo));
  ok("estilo por defecto", await api("PUT", `/layers/${WS}:${tabla}`, { layer: { defaultStyle: { name: `${WS}:${tabla}` } } }));
  return iconos ? `estilo de origen (${iconos} íconos)` : "estilo de origen";
}

// --- principal ---

const pedidas = process.argv.slice(2);
const capas = catalogo.filter((c) => c.wfs && (!pedidas.length || pedidas.includes(c.id)));
if (!capas.length) throw new Error("No hay capas para importar (¿el id está bien escrito?)");

console.log(`Preparando el esquema "nacional" y el workspace "${WS}"…`);
await preparar();

const fallas = [];
for (const c of capas) {
  const inicio = Date.now();
  try {
    const { elementos, estilo } = await importar(c);
    console.log(`  ✓ ${c.titulo}: ${elementos} elementos, ${estilo} (${Math.round((Date.now() - inicio) / 1000)} s)`);
  } catch (e) {
    fallas.push(c.titulo);
    console.log(`  ✗ ${c.titulo}: ${e.message}`);
  }
}
console.log(`Listo: ${capas.length - fallas.length} de ${capas.length} capas en el nodo.${fallas.length ? ` Fallaron: ${fallas.join(", ")} (el visor las sigue pidiendo al servicio original).` : ""}`);
if (fallas.length) process.exitCode = 1;
