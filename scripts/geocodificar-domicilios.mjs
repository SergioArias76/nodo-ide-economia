#!/usr/bin/env node
// Regeocodifica con Georef (API del Estado, cuadras con numeración) y OpenStreetMap (Nominatim) los domicilios de proveedores que quedaron ubicados solo
// por localidad o por provincia, y guarda lo que encuentra en proveedores.domicilio_correccion.
//
// Uso (con el stack levantado, desde la raíz del repo):
//   node scripts/geocodificar-domicilios.mjs                      # personas humanas, sin tocar la base
//   node scripts/geocodificar-domicilios.mjs --aplicar            # además guarda las correcciones
//   node scripts/geocodificar-domicilios.mjs --tipo todos --limite 50
//
// Respeta la política de uso de Nominatim: una consulta por segundo e identificación del sistema.
// Las respuestas quedan en datos/geocodificacion/cache-*.json: si se corta, se retoma sin
// repetir consultas. Lo que no se pudo ubicar queda en datos/geocodificacion/no-ubicados.csv.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const SALIDA = `${RAIZ}datos/geocodificacion`;
const CACHE = `${SALIDA}/cache-nominatim.json`;
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const GEOREF = "https://apis.datos.gob.ar/georef/api/direcciones";
const CACHE_GEOREF = `${SALIDA}/cache-georef.json`;
const AGENTE = "nodo-ide-economia-chubut/1.0 (+https://github.com/SergioArias76/nodo-ide-economia)";
const DISTANCIA_MAXIMA_KM = 25; // un resultado más lejos de su localidad se descarta

const args = process.argv.slice(2);
const opcion = (n, defecto) => (args.includes(n) ? args[args.indexOf(n) + 1] : defecto);
const APLICAR = args.includes("--aplicar");
const TIPO = opcion("--tipo", "humana"); // humana | juridica | todos
const LIMITE = Number(opcion("--limite", "0")) || Infinity;

// --- Base de datos (psql dentro del contenedor, como scripts/cargar-proveedores.sh) ---

function psql(sql, entrada) {
  const r = spawnSync("docker", ["compose", "exec", "-T", "postgis", "psql", "-U", "ide_admin", "-d", "ide", "-v", "ON_ERROR_STOP=1", "-At", ...(entrada ? [] : ["-c", sql])], {
    cwd: RAIZ,
    input: entrada ? sql : undefined,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`psql: ${r.stderr}`);
  return r.stdout;
}

const tipos = TIPO === "todos" ? ["humana", "juridica"] : [TIPO];
const candidatos = JSON.parse(
  psql(`SELECT coalesce(json_agg(row_to_json(t)), '[]') FROM (
    SELECT p.cuit, d.domicilio_orig, d.calle, d.altura, d.localidad, d.departamento, d.provincia,
           d.precision, ST_X(d.geom) AS lon, ST_Y(d.geom) AS lat
    FROM proveedores.proveedor p
    JOIN proveedores.domicilio d ON d.proveedor_id = p.id
    WHERE p.tipo_persona IN (${tipos.map((t) => `'${t}'`).join(",")})
      AND p.cuit IS NOT NULL AND d.domicilio_orig IS NOT NULL
      AND d.precision IN ('localidad', 'provincia')
      AND NOT EXISTS (SELECT 1 FROM proveedores.domicilio_correccion c
                      WHERE c.cuit = p.cuit AND c.domicilio_orig = d.domicilio_orig)
    ORDER BY p.cuit) t`),
).slice(0, LIMITE);

// --- Normalización de los domicilios del padrón ---

const sinAcentos = (s) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
const PROVINCIAS_COMO_LOCALIDAD = ["buenos aires", "chubut", "santa fe", "santa cruz", "la pampa", "neuquen", "mendoza", "la rioja", "san juan", "cordoba", "rio negro"];

// "SARMIENTO Nro 663 Piso 6 Dpto B" → "SARMIENTO 663"; "Nro 0" y "S/N" se descartan
function limpiar(domicilio) {
  return domicilio
    .replace(/\b(piso|dpto|depto|dto|of|oficina|local|casa\s*n[º°o]?|mz|manzana|lote|pb)\b.*$/i, "")
    .replace(/\bnro\.?\s*0\b/i, "")
    .replace(/\bs\/n\b/i, "")
    .replace(/\bnro\.?\b/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

// La localidad del padrón sirve si no es el nombre de una provincia ("Buenos Aires", "Chubut"…)
function localidadReal(c) {
  if (!c.localidad) return null;
  const l = sinAcentos(c.localidad);
  if (l === sinAcentos(c.provincia ?? "") || PROVINCIAS_COMO_LOCALIDAD.includes(l)) return null;
  return c.localidad === "Capital Federal" ? "Ciudad Autónoma de Buenos Aires" : c.localidad;
}

// --- Nominatim, con caché y una consulta por segundo ---

mkdirSync(SALIDA, { recursive: true });
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
const cacheGeoref = existsSync(CACHE_GEOREF) ? JSON.parse(readFileSync(CACHE_GEOREF, "utf8")) : {};
let ultima = 0;
let ultimaGeoref = 0;
let consultas = 0;

async function nominatim(params) {
  const q = new URLSearchParams({ ...params, format: "jsonv2", addressdetails: "1", limit: "1", countrycodes: "ar", "accept-language": "es" });
  const clave = q.toString();
  if (clave in cache) return cache[clave];
  const espera = ultima + 1100 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultima = Date.now();
  const r = await fetch(`${NOMINATIM}?${q}`, { headers: { "User-Agent": AGENTE } });
  if (!r.ok) throw new Error(`Nominatim ${r.status}`);
  const resultado = (await r.json())[0] ?? null;
  cache[clave] = resultado;
  if (++consultas % 20 === 0) writeFileSync(CACHE, JSON.stringify(cache));
writeFileSync(CACHE_GEOREF, JSON.stringify(cacheGeoref));
  return resultado;
}

// Georef: devuelve hasta 10 coincidencias en la provincia; se elige después por distancia
async function georef(direccion, provincia) {
  const q = new URLSearchParams({ direccion, provincia, max: "10" });
  const clave = q.toString();
  if (clave in cacheGeoref) return cacheGeoref[clave];
  const espera = ultimaGeoref + 250 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultimaGeoref = Date.now();
  const r = await fetch(`${GEOREF}?${q}`, { headers: { "User-Agent": AGENTE } });
  const datos = r.ok ? await r.json() : { direcciones: [] };
  const resultado = (datos.direcciones ?? []).filter((d) => d.ubicacion?.lat != null);
  cacheGeoref[clave] = resultado;
  if (Object.keys(cacheGeoref).length % 50 === 0) writeFileSync(CACHE_GEOREF, JSON.stringify(cacheGeoref));
  return resultado;
}

// ¿La calle que devolvió el servicio es la que se pidió? (descarta "Los Notros" → "Los Peñascos")
const TITULOS = /\b(av|avda|avenida|calle|bv|bvar|boulevard|bulevar|pje|pasaje|gral|general|dr|doctor|cqe|cque|cacique|tte|teniente|cnel|coronel|pte|presidente|ing|ingeniero|almte|almirante|grl|sgto|sargento|de|del|la|las|los|el)\b/g;
const tokens = (s) => sinAcentos(s ?? "").replace(/[^a-z0-9 ]/g, " ").replace(TITULOS, " ").split(/\s+/).filter((t) => t.length >= 3);
function mismaCalle(pedida, encontrada) {
  const a = tokens(pedida), b = new Set(tokens(encontrada));
  return a.length > 0 && a.some((t) => b.has(t));
}

// --- Validación y precisión del resultado ---

const distanciaKm = (a, b) => {
  const r = Math.PI / 180;
  const x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
};

function provinciaCoincide(res, provincia) {
  const estado = sinAcentos(res.address?.state ?? "");
  const p = sinAcentos(provincia ?? "");
  if (p.includes("ciudad autonoma")) return estado.includes("ciudad autonoma") || estado === "buenos aires" && (res.address?.city ?? "").includes("Autónoma");
  return estado === p || estado.includes(p) || p.includes(estado);
}

function precisionDe(res) {
  if (res.address?.house_number) return "calle_altura";
  if (res.category === "highway" || res.address?.road) return "calle_sin_altura";
  if (["city", "town", "village", "hamlet", "suburb", "municipality"].includes(res.addresstype)) return "localidad";
  return null;
}
const PREFIJO_VIA = /^(?:(?:av|avda|avenida|bv|bvar|bvard|boulevard|bulevar|calle|pje|pasaje)\b\.?|b\.)\s*/i;
const ORDEN = { provincia: 0, localidad: 1, calle_sin_altura: 2, esquina: 3, calle_altura: 3 };

async function geocodificar(c) {
  const localidad = localidadReal(c);
  const domicilio = limpiar(c.domicilio_orig);
  // 1) Georef: cuadras del INDEC con numeración (interpola la altura) y esquinas "X y Z"
  const esEsquina = /\s+y\s+/i.test(domicilio);
  if (/\d/.test(domicilio) || esEsquina) {
    let candidatos = await georef(domicilio, c.provincia);
    // Georef no reconoce "BVAR. BROWN" ni "AV. LOS ARRAYANES": reintenta sin el tipo de vía
    const sinTipo = domicilio.replace(PREFIJO_VIA, "").trim();
    if (!candidatos.length && sinTipo !== domicilio) candidatos = await georef(sinTipo, c.provincia);
    const conDistancia = candidatos
      .map((d) => ({ d, km: distanciaKm({ lon: d.ubicacion.lon, lat: d.ubicacion.lat }, c) }))
      .filter((x) => (c.precision === "localidad" ? x.km <= DISTANCIA_MAXIMA_KM : candidatos.length === 1))
      .sort((x, y) => x.km - y.km);
    const elegido = conDistancia[0]?.d;
    if (elegido) {
      return {
        cuit: c.cuit,
        domicilio_orig: c.domicilio_orig,
        calle: elegido.calle?.nombre ?? c.calle,
        altura: elegido.altura?.valor != null ? String(elegido.altura.valor) : c.altura,
        localidad: elegido.localidad_censal?.nombre ?? localidad ?? c.localidad,
        departamento: elegido.departamento?.nombre ?? c.departamento,
        provincia: c.provincia,
        precision: esEsquina ? "esquina" : "calle_altura",
        fuente_geo: "georef/regeo",
        lon: elegido.ubicacion.lon,
        lat: elegido.ubicacion.lat,
      };
    }
  }

  // 2) OpenStreetMap
  const intentos = [];
  if (c.calle && localidad) {
    const altura = c.altura && c.altura !== "0" ? `${c.altura} ` : "";
    intentos.push({ street: `${altura}${c.calle}`, city: localidad, state: c.provincia, country: "Argentina" });
  }
  intentos.push({ q: [domicilio, localidad, c.provincia, "Argentina"].filter(Boolean).join(", ") });

  for (const params of intentos) {
    const res = await nominatim(params);
    if (!res || !provinciaCoincide(res, c.provincia)) continue;
    const punto = { lon: Number(res.lon), lat: Number(res.lat) };
    // Con localidad conocida, el resultado tiene que caer cerca del punto actual (centro de la localidad)
    if (c.precision === "localidad" && distanciaKm(punto, c) > DISTANCIA_MAXIMA_KM) continue;
    const precision = precisionDe(res);
    if (!precision || ORDEN[precision] <= ORDEN[c.precision]) continue; // no mejora lo que ya hay
    if (precision !== "localidad" && !mismaCalle(c.calle || domicilio, res.address?.road)) continue; // calle equivocada
    const a = res.address ?? {};
    return {
      cuit: c.cuit,
      domicilio_orig: c.domicilio_orig,
      calle: a.road ?? c.calle,
      altura: a.house_number ?? c.altura,
      localidad: localidad ?? a.city ?? a.town ?? a.village ?? a.municipality ?? c.localidad,
      departamento: c.departamento ?? ((a.county ?? "").replace(/^(Departamento|Partido( de)?)\s+/i, "") || null),
      provincia: c.provincia,
      precision,
      fuente_geo: `nominatim/regeo-${"q" in params ? "libre" : "estructurada"}`,
      lon: punto.lon,
      lat: punto.lat,
    };
  }
  return null;
}

// --- Ejecución ---

console.log(`${candidatos.length} domicilios a revisar (${tipos.join(" y ")}); ${Object.keys(cache).length} respuestas en caché`);
const corregidos = [];
const noUbicados = [];
for (const [i, c] of candidatos.entries()) {
  const r = await geocodificar(c);
  if (r) corregidos.push(r);
  else noUbicados.push(c);
  if ((i + 1) % 50 === 0 || i + 1 === candidatos.length) {
    console.log(`  ${i + 1}/${candidatos.length} · mejorados ${corregidos.length} · sin mejora ${noUbicados.length}`);
  }
}
writeFileSync(CACHE, JSON.stringify(cache));

const fecha = new Date().toISOString().slice(0, 10);
writeFileSync(`${SALIDA}/correcciones-${fecha}.json`, JSON.stringify(corregidos, null, 1));
const csv = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
writeFileSync(
  `${SALIDA}/no-ubicados.csv`,
  "cuit,domicilio_orig,localidad,provincia,precision_actual\n" +
    noUbicados.map((c) => [c.cuit, c.domicilio_orig, c.localidad, c.provincia, c.precision].map(csv).join(",")).join("\n") + "\n",
);

const porPrecision = Object.groupBy(corregidos, (r) => r.precision);
console.log("\nResultado:");
for (const [p, l] of Object.entries(porPrecision)) console.log(`  ${p}: ${l.length}`);
console.log(`  sin mejora: ${noUbicados.length} (datos/geocodificacion/no-ubicados.csv)`);

if (!APLICAR) {
  console.log("\nNo se tocó la base. Para guardar las correcciones: --aplicar");
  process.exit(0);
}

// Guarda las correcciones y las aplica a los domicilios actuales (la carga del padrón las vuelve a aplicar)
const json = JSON.stringify(corregidos);
if (json.includes("$correcciones$")) throw new Error("Texto inesperado en los datos");
psql(
  `BEGIN;
  INSERT INTO proveedores.domicilio_correccion
    (cuit, domicilio_orig, calle, altura, localidad, departamento, provincia, precision, fuente_geo, geom, actualizado_en)
  SELECT cuit, domicilio_orig, calle, altura, localidad, departamento, provincia, precision, fuente_geo,
         ST_SetSRID(ST_MakePoint(lon, lat), 4326), now()
  FROM json_to_recordset($correcciones$${json}$correcciones$) AS t(
    cuit text, domicilio_orig text, calle text, altura text, localidad text, departamento text,
    provincia text, precision text, fuente_geo text, lon float8, lat float8)
  ON CONFLICT (cuit) DO UPDATE SET
    domicilio_orig = EXCLUDED.domicilio_orig, calle = EXCLUDED.calle, altura = EXCLUDED.altura,
    localidad = EXCLUDED.localidad, departamento = EXCLUDED.departamento, provincia = EXCLUDED.provincia,
    precision = EXCLUDED.precision, fuente_geo = EXCLUDED.fuente_geo, geom = EXCLUDED.geom,
    actualizado_en = now();
  UPDATE proveedores.domicilio d
  SET calle = coalesce(c.calle, d.calle), altura = coalesce(c.altura, d.altura),
      localidad = coalesce(c.localidad, d.localidad), departamento = coalesce(c.departamento, d.departamento),
      provincia = coalesce(c.provincia, d.provincia), precision = c.precision, fuente_geo = c.fuente_geo, geom = c.geom
  FROM proveedores.domicilio_correccion c
  JOIN proveedores.proveedor p ON p.cuit = c.cuit
  WHERE d.proveedor_id = p.id AND d.domicilio_orig IS NOT DISTINCT FROM c.domicilio_orig;
  COMMIT;`,
  true,
);
console.log(`\n${corregidos.length} correcciones guardadas en proveedores.domicilio_correccion y aplicadas.`);
