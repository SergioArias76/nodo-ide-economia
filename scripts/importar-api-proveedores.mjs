#!/usr/bin/env node
// Importa los proveedores de la API del Registro de Proveedores (docs/api-proveedores.md).
//
// La API trae los proveedores inscriptos en la plataforma nueva: son datos recientes y pisan los del
// padrón del SIAFyC para el mismo CUIT (el padrón sigue siendo la base para los que no están en la API).
// La ubicación sale del domicilio legal que informa la API:
//   1. si es el mismo domicilio que ya estaba ubicado (en el padrón o en una importación anterior), se
//      conserva esa ubicación;
//   2. si es nuevo o cambió, se ubica en el centro de su localidad (localidad_id de Georef) y se geocodifica
//      con scripts/geocodificar-domicilios.mjs;
//   3. si la geocodificación no llega a la calle, se usa el pin que marcó el proveedor, salvo que esté en
//      la posición por defecto del mapa (el centro de la localidad) o en otra localidad.
//
// Uso (con el stack levantado, desde la raíz del repo; URL y clave en .env):
//   node scripts/importar-api-proveedores.mjs                  # lo modificado desde la última importación
//   node scripts/importar-api-proveedores.mjs --completo       # el padrón completo de la API
//   node scripts/importar-api-proveedores.mjs --sin-geocodificar
//   node scripts/importar-api-proveedores.mjs --solo-aplicar   # sin consultar: vuelve a aplicar lo guardado
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { apellido, calleEquivalente, callesDe, distanciaKm } from "./lib/calles.mjs";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const AGENTE = "nodo-ide-economia-chubut/1.0 (+https://github.com/SergioArias76/nodo-ide-economia)";
const GEOREF_LOCALIDADES = "https://apis.datos.gob.ar/georef/api/localidades";
const POR_PAGINA = 1000;

const args = process.argv.slice(2);
const COMPLETO = args.includes("--completo");
const SOLO_APLICAR = args.includes("--solo-aplicar");
const GEOCODIFICAR = !args.includes("--sin-geocodificar");

// Pin "por defecto": a menos de 150 m del centro de la localidad (el mapa de la plataforma arranca ahí).
// Pin en otra localidad: a más de 15 km (60 km si el domicilio está sobre una ruta).
const PIN_POR_DEFECTO_KM = 0.15;
const PIN_LEJOS_KM = 15;
const PIN_LEJOS_RUTA_KM = 60;
// Con la calle ya ubicada pero sin altura, el pin solo afina la posición si cae cerca de esa calle
const PIN_SOBRE_CALLE_KM = 1;

// --- .env, base de datos ---

function leerEnv() {
  const env = {};
  const archivo = `${RAIZ}.env`;
  if (!existsSync(archivo)) return env;
  for (const linea of readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return env;
}
const ENV = { ...leerEnv(), ...process.env };

function psql(sql, { archivo } = {}) {
  const r = spawnSync("docker", ["compose", "exec", "-T", "postgis", "psql", "-U", "ide_admin", "-d", "ide", "-v", "ON_ERROR_STOP=1", "-At"], {
    cwd: RAIZ,
    input: archivo ? readFileSync(`${RAIZ}${archivo}`, "utf8") : sql,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`psql: ${r.stderr}`);
  return r.stdout;
}
const consulta = (sql) => JSON.parse(psql(`SELECT coalesce(json_agg(row_to_json(t)), '[]') FROM (${sql}) t;`).trim() || "[]");

// Texto dentro de $tag$…$tag$ sin riesgo de cerrar el literal
function literal(texto) {
  const tag = "datos_api";
  if (texto.includes(`$${tag}$`)) throw new Error("Texto inesperado en los datos de la API");
  return `$${tag}$${texto}$${tag}$`;
}

// --- API del Registro ---

async function pedir(url, opciones = {}) {
  for (let intento = 1; ; intento++) {
    let r;
    try {
      r = await fetch(url, { ...opciones, headers: { "User-Agent": AGENTE, Accept: "application/json", ...opciones.headers } });
      if (r.status !== 429 && r.status < 500) return r;
    } catch (e) {
      if (intento >= 20) throw e;
    }
    // con 429 (cupo agotado) se espera más: el de Georef es por hora
    const maximo = r?.status === 429 ? 80 : 20;
    if (intento >= maximo) return r;
    const espera = Number(r?.headers.get("retry-after")) || (r?.status === 429 ? 60 : 30);
    console.log(`  ${new URL(url).host} no responde (${r?.status ?? "sin conexión"}); reintento ${intento}/${maximo} en ${espera} s…`);
    await new Promise((ok) => setTimeout(ok, espera * 1000));
  }
}

async function descargar(desde) {
  const url = ENV.PROVEEDORES_API_URL;
  const clave = ENV.PROVEEDORES_API_KEY;
  if (!url || !clave) throw new Error("Faltan PROVEEDORES_API_URL y PROVEEDORES_API_KEY en .env");
  const porCuit = new Map();
  let generado = null;
  let total = 0;
  for (let pagina = 1; ; pagina++) {
    const q = new URLSearchParams({ pagina: String(pagina), por_pagina: String(POR_PAGINA), ...(desde ? { modificados_desde: desde } : {}) });
    const r = await pedir(`${url}?${q}`, { headers: { Authorization: `Bearer ${clave}` } });
    const cuerpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`API ${r.status}: ${cuerpo.error ?? ""} (${cuerpo.codigo ?? "sin código"})`);
    generado ??= cuerpo.generado; // el de la primera página: lo que cambie mientras tanto entra la próxima vez
    total = cuerpo.total;
    for (const p of cuerpo.proveedores ?? []) porCuit.set(p.cuit, p);
    console.log(`  página ${pagina}: ${cuerpo.proveedores?.length ?? 0} proveedores (${porCuit.size}/${total})`);
    if (!cuerpo.proveedores?.length || pagina * POR_PAGINA >= total) break;
  }
  if (!generado) throw new Error("La API no informó 'generado'");
  return { proveedores: [...porCuit.values()], generado, total };
}

// --- Localidades (Georef, por localidad_id) ---

// La plataforma completa el id a 10 dígitos: "0026077040" es la localidad 26077040 de Georef
const idGeoref = (id) => (id && id.length === 10 && id.startsWith("00") ? id.slice(2) : id);

async function localidades(ids) {
  const resultado = new Map();
  const lista = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < lista.length; i += 50) {
    const q = new URLSearchParams({
      id: lista.slice(i, i + 50).join(","),
      max: "100",
      aplanar: "true",
      campos: "id,nombre,centroide,departamento.nombre,provincia.nombre,localidad_censal.nombre",
    });
    const r = await pedir(`${GEOREF_LOCALIDADES}?${q}`);
    // sin las localidades no se puede ubicar: mejor cortar que dejar proveedores sin punto
    if (!r.ok) throw new Error(`Georef ${r.status} al consultar localidades; volver a correr más tarde`);
    const datos = await r.json();
    for (const l of datos.localidades ?? []) {
      resultado.set(l.id, {
        // el nombre de la localidad censal ("La Plata" y no "Joaquín Gorina"), como en el padrón
        localidad: l.localidad_censal_nombre ?? l.nombre,
        nombre: l.nombre,
        departamento: l.departamento_nombre ?? null,
        provincia: l.provincia_nombre ?? null,
        centro: { lon: l.centroide_lon, lat: l.centroide_lat },
      });
    }
  }
  return resultado;
}

// --- Domicilio ---

// "Piso 0", "Dpto 0" o "S/D" de la plataforma valen como vacío
const vacio = (v) => v == null || /^\s*(0|s\/?d|s\/?n|-)?\s*$/i.test(String(v));
const alturaDe = (v) => (vacio(v) ? "" : String(v).replace(/\D/g, "").replace(/^0+/, ""));

// "Francisco Segui 562 Piso 1 Dpto B": el texto con el que se guardan las correcciones de ubicación
function domicilioOrig(d) {
  return [d.calle, d.altura, vacio(d.piso) ? null : `Piso ${d.piso}`, vacio(d.depto) ? null : `Dpto ${d.depto}`]
    .filter((x) => !vacio(x))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

// ¿El domicilio de la API es el mismo que ya estaba ubicado? Misma altura, misma localidad y la misma
// calle, con la comparación tolerante de la geocodificación ("JUAN D. PERON" = "Juan Domingo Perón")
// La localidad no se compara por nombre ("Capital Federal" y "Ciudad Autónoma de Buenos Aires", "Rawson"
// y "Playa Unión" son el mismo lugar): el punto que ya tenía tiene que estar cerca del centro de la
// localidad de la API. La calle se compara con la escrita en el padrón y con la que dejó la geocodificación.
const MISMA_LOCALIDAD_KM = 15;
const ABREVIATURAS = [[/\bnte\b\.?/gi, "norte"], [/\bavda?\b\.?/gi, "avenida"], [/\bgdor\b\.?/gi, "gobernador"]];
const expandir = (s) => ABREVIATURAS.reduce((t, [re, por]) => t.replace(re, por), s ?? "");
function mismaCalle(a, b) {
  const x = expandir(a), y = expandir(b);
  return calleEquivalente(x, y) || (calleEquivalente(y, x) && calleEquivalente(apellido(x), y));
}
function mismoDomicilio(api, loc, actual) {
  if (!actual || vacio(api.calle)) return false;
  if (alturaDe(api.altura) !== alturaDe(actual.altura || alturaPadron(actual.domicilio_orig))) return false;
  if (!loc?.centro || actual.lon == null || distanciaKm(actual, loc.centro) > MISMA_LOCALIDAD_KM) return false;
  const calles = [actual.calle, callesDe(actual.domicilio_orig ?? "")[0]].filter((c) => !vacio(c));
  return calles.some((c) => mismaCalle(api.calle, c));
}
// "MITRE NTE Nro 226" → "226"
const alturaPadron = (d) => alturaDe((d ?? "").match(/\bnro\.?\s*(\d+)/i)?.[1] ?? "");

// --- Ejecución ---

console.log("Esquema de la API (idempotente)");
psql(null, { archivo: "postgis/initdb/25-proveedores-api.sql" });

if (!SOLO_APLICAR) {
  const ultima = consulta("SELECT generado FROM proveedores.api_sincronizacion ORDER BY generado DESC LIMIT 1")[0]?.generado ?? null;
  const desde = COMPLETO || !ultima ? null : new Date(ultima).toISOString().replace(/\.\d{3}Z$/, "Z");
  console.log(desde ? `Consultando la API: modificados desde ${desde}` : "Consultando la API: padrón completo");
  const { proveedores, generado, total } = await descargar(desde);
  console.log(`${proveedores.length} proveedores recibidos (total informado: ${total})`);

  // Lo que ya había: la importación anterior de cada CUIT y el domicilio actual en la base
  const cuits = proveedores.map((p) => p.cuit).filter((c) => /^\d{11}$/.test(c));
  const enLista = cuits.length ? cuits.map((c) => `'${c}'`).join(",") : "NULL";
  const previos = new Map(consulta(`SELECT cuit, domicilio_orig, localidad, departamento, provincia, precision, fuente_geo,
      ST_X(geom) AS lon, ST_Y(geom) AS lat FROM proveedores.api_proveedor WHERE cuit IN (${enLista})`).map((r) => [r.cuit, r]));
  const actuales = new Map(consulta(`SELECT p.cuit, d.domicilio_orig, d.calle, d.altura, d.localidad, d.departamento, d.provincia, d.precision, d.fuente_geo,
      ST_X(d.geom) AS lon, ST_Y(d.geom) AS lat
      FROM proveedores.proveedor p JOIN proveedores.domicilio d ON d.proveedor_id = p.id WHERE p.cuit IN (${enLista})`).map((r) => [r.cuit, r]));

  const locs = await localidades(proveedores.flatMap((p) => [p.domicilio?.localidad_id, idGeoref(p.domicilio?.localidad_id)]));
  const cuenta = { sinCambios: 0, conservados: 0, aUbicar: 0, sinLocalidad: 0, bajas: 0, invalidos: 0 };
  const filas = [];
  for (const p of proveedores) {
    if (!/^\d{11}$/.test(p.cuit ?? "")) {
      cuenta.invalidos++;
      continue;
    }
    const d = p.domicilio ?? {};
    const loc = locs.get(d.localidad_id) ?? locs.get(idGeoref(d.localidad_id)) ?? null;
    const orig = domicilioOrig(d) || null;
    if (p.estado !== "activo") cuenta.bajas++;
    const base = {
      cuit: p.cuit,
      estado: p.estado === "activo" ? "activo" : "baja", // "suspendido" no se muestra en el mapa
      fecha_modificacion: p.fecha_modificacion,
      datos: p,
      domicilio_orig: orig,
      localidad: loc?.localidad ?? d.localidad ?? null,
      departamento: loc?.departamento ?? null,
      provincia: loc?.provincia ?? d.provincia ?? null,
    };
    const previo = previos.get(p.cuit);
    const actual = actuales.get(p.cuit);
    let ubicacion;
    if (previo && previo.domicilio_orig === orig && previo.lon != null) {
      // 1a. mismo domicilio que en la importación anterior
      cuenta.sinCambios++;
      ubicacion = { precision: previo.precision, fuente_geo: previo.fuente_geo, lon: previo.lon, lat: previo.lat };
    } else if (actual && !["localidad", "provincia"].includes(actual.precision) && mismoDomicilio(d, loc, actual)) {
      // 1b. el mismo domicilio que ya estaba ubicado en el padrón
      cuenta.conservados++;
      ubicacion = { precision: actual.precision, fuente_geo: actual.fuente_geo, lon: actual.lon, lat: actual.lat };
    } else if (loc?.centro?.lon != null) {
      // 2. nuevo o cambió: al centro de la localidad, para que lo mejore la geocodificación
      cuenta.aUbicar++;
      ubicacion = { precision: "localidad", fuente_geo: "georef/localidad", ...loc.centro };
    } else {
      cuenta.sinLocalidad++;
      ubicacion = { precision: null, fuente_geo: null, lon: null, lat: null };
    }
    filas.push({ ...base, ...ubicacion });
  }

  // Guarda lo recibido y la consulta, en una sola transacción
  psql(`BEGIN;
    INSERT INTO proveedores.api_proveedor
      (cuit, estado, fecha_modificacion, datos, domicilio_orig, localidad, departamento, provincia, precision, fuente_geo, geom, recibido_en)
    SELECT cuit, estado, fecha_modificacion, datos, domicilio_orig, localidad, departamento, provincia, precision, fuente_geo,
           CASE WHEN lon IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(lon, lat), 4326) END, now()
    FROM json_to_recordset(${literal(JSON.stringify(filas))}) AS t(
      cuit text, estado text, fecha_modificacion timestamptz, datos jsonb, domicilio_orig text, localidad text,
      departamento text, provincia text, precision text, fuente_geo text, lon float8, lat float8)
    ON CONFLICT (cuit) DO UPDATE SET
      estado = EXCLUDED.estado, fecha_modificacion = EXCLUDED.fecha_modificacion, datos = EXCLUDED.datos,
      domicilio_orig = EXCLUDED.domicilio_orig, localidad = EXCLUDED.localidad, departamento = EXCLUDED.departamento,
      provincia = EXCLUDED.provincia, precision = EXCLUDED.precision, fuente_geo = EXCLUDED.fuente_geo,
      geom = EXCLUDED.geom, recibido_en = now();
    INSERT INTO proveedores.api_sincronizacion (modificados_desde, generado, recibidos)
    VALUES (${desde ? `'${desde}'` : "NULL"}, '${new Date(generado).toISOString()}', ${filas.length});
    COMMIT;`);

  console.log(`  mismo domicilio que la vez anterior: ${cuenta.sinCambios}`);
  console.log(`  mismo domicilio que en el padrón (se conserva la ubicación): ${cuenta.conservados}`);
  console.log(`  nuevos o con domicilio distinto (a geocodificar): ${cuenta.aUbicar}`);
  if (cuenta.sinLocalidad) console.log(`  sin localidad reconocible (sin punto en el mapa): ${cuenta.sinLocalidad}`);
  if (cuenta.bajas) console.log(`  bajas: ${cuenta.bajas}`);
  if (cuenta.invalidos) console.log(`  descartados por CUIT inválido: ${cuenta.invalidos}`);
}

console.log("Aplicando la API sobre el padrón");
psql(null, { archivo: "postgis/etl/proveedores_desde_api.sql" });

if (GEOCODIFICAR && !SOLO_APLICAR) {
  console.log("Geocodificando los domicilios nuevos o que cambiaron");
  const r = spawnSync(process.execPath, [`${RAIZ}scripts/geocodificar-domicilios.mjs`, "--tipo", "todos", "--fuente", "registro", "--aplicar"], { cwd: RAIZ, stdio: "inherit" });
  if (r.status !== 0) throw new Error("Falló la geocodificación");

  // 3. Pin del proveedor donde la geocodificación no llegó a la calle y altura
  const candidatos = consulta(`
    SELECT p.cuit, d.domicilio_orig, d.precision, d.calle, ST_X(d.geom) AS lon, ST_Y(d.geom) AS lat,
           (a.datos#>>'{domicilio,lat}')::float8 AS pin_lat, (a.datos#>>'{domicilio,lon}')::float8 AS pin_lon,
           a.datos#>>'{domicilio,localidad_id}' AS localidad_id, a.datos#>>'{domicilio,ruta}' AS ruta
    FROM proveedores.api_proveedor a
    JOIN proveedores.proveedor p ON p.cuit = a.cuit
    JOIN proveedores.domicilio d ON d.proveedor_id = p.id
    WHERE d.precision IN ('localidad', 'provincia', 'barrio', 'calle_sin_altura')
      AND a.datos#>>'{domicilio,lat}' IS NOT NULL AND a.datos#>>'{domicilio,lon}' IS NOT NULL`);
  const centros = await localidades(candidatos.flatMap((c) => [c.localidad_id, idGeoref(c.localidad_id)]));
  const pines = [];
  const descartados = { porDefecto: 0, otraLocalidad: 0, lejosDeLaCalle: 0 };
  for (const c of candidatos) {
    const pin = { lon: c.pin_lon, lat: c.pin_lat };
    const centro = (centros.get(c.localidad_id) ?? centros.get(idGeoref(c.localidad_id)))?.centro;
    if (!centro) continue;
    const km = distanciaKm(pin, centro);
    const sobreRuta = !vacio(c.ruta) || /\b(ruta|km)\b/i.test(c.calle ?? "");
    if (km < PIN_POR_DEFECTO_KM) { descartados.porDefecto++; continue; }
    if (km > (sobreRuta ? PIN_LEJOS_RUTA_KM : PIN_LEJOS_KM)) { descartados.otraLocalidad++; continue; }
    if (c.precision === "calle_sin_altura" && distanciaKm(pin, c) > PIN_SOBRE_CALLE_KM) { descartados.lejosDeLaCalle++; continue; }
    pines.push({ cuit: c.cuit, domicilio_orig: c.domicilio_orig ?? "", ...pin });
  }
  if (pines.length) {
    psql(`BEGIN;
      INSERT INTO proveedores.domicilio_correccion (cuit, domicilio_orig, precision, fuente_geo, geom, nota, actualizado_en)
      SELECT cuit, domicilio_orig, 'proveedor', 'registro/pin', ST_SetSRID(ST_MakePoint(lon, lat), 4326),
             'Pin marcado por el proveedor en la plataforma del Registro', now()
      FROM json_to_recordset(${literal(JSON.stringify(pines))}) AS t(cuit text, domicilio_orig text, lon float8, lat float8)
      ON CONFLICT (cuit) DO UPDATE SET
        domicilio_orig = EXCLUDED.domicilio_orig, calle = NULL, altura = NULL, localidad = NULL, departamento = NULL,
        provincia = NULL, precision = EXCLUDED.precision, fuente_geo = EXCLUDED.fuente_geo, geom = EXCLUDED.geom,
        nota = EXCLUDED.nota, actualizado_en = now();
      UPDATE proveedores.domicilio d SET precision = c.precision, fuente_geo = c.fuente_geo, geom = c.geom
      FROM proveedores.domicilio_correccion c JOIN proveedores.proveedor p ON p.cuit = c.cuit
      WHERE d.proveedor_id = p.id AND d.domicilio_orig = c.domicilio_orig AND c.fuente_geo = 'registro/pin';
      COMMIT;`);
  }
  console.log(`Pines del proveedor: ${pines.length} usados; descartados ${descartados.porDefecto} en la posición por defecto,`
    + ` ${descartados.otraLocalidad} en otra localidad y ${descartados.lejosDeLaCalle} lejos de su calle`);
}

// Resumen
const resumen = consulta(`SELECT d.precision, count(*)::int AS cantidad
  FROM proveedores.api_proveedor a JOIN proveedores.proveedor p ON p.cuit = a.cuit
  JOIN proveedores.domicilio d ON d.proveedor_id = p.id GROUP BY 1 ORDER BY 2 DESC`);
console.log("\nProveedores de la API por precisión de la ubicación:");
for (const r of resumen) console.log(`  ${r.precision}: ${r.cantidad}`);
