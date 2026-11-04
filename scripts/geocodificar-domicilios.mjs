#!/usr/bin/env node
// Regeocodifica con Georef (API del Estado, cuadras con numeración) y OpenStreetMap (Nominatim) los domicilios de proveedores que quedaron ubicados solo
// por localidad o por provincia, y guarda lo que encuentra en proveedores.domicilio_correccion.
//
// Uso (con el stack levantado, desde la raíz del repo):
//   node scripts/geocodificar-domicilios.mjs                      # personas físicas, sin tocar la base
//   node scripts/geocodificar-domicilios.mjs --aplicar            # además guarda las correcciones
//   node scripts/geocodificar-domicilios.mjs --tipo todos --limite 50
//   node scripts/geocodificar-domicilios.mjs --tipo todos --fuente registro --aplicar   (solo los de la API del Registro)
//
// Respeta la política de uso de Nominatim: una consulta por segundo e identificación del sistema.
// Las respuestas quedan en datos/geocodificacion/cache-*.json: si se corta, se retoma sin
// repetir consultas. Lo que no se pudo ubicar queda en datos/geocodificacion/no-ubicados.csv.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { apellido, calleEquivalente, callesDe, distanciaKm, palabraClave, palabras, PREFIJO_VIA, sinAcentos, TITULOS } from "./lib/calles.mjs";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const SALIDA = `${RAIZ}datos/geocodificacion`;
const CACHE = `${SALIDA}/cache-nominatim.json`;
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const GEOREF_API = "https://apis.datos.gob.ar/georef/api";
const CACHE_GEOREF = `${SALIDA}/cache-georef.json`;
const AGENTE = "nodo-ide-economia-chubut/1.0 (+https://github.com/SergioArias76/nodo-ide-economia)";
const DISTANCIA_MAXIMA_KM = 25; // un resultado más lejos de su localidad se descarta

const args = process.argv.slice(2);
const opcion = (n, defecto) => (args.includes(n) ? args[args.indexOf(n) + 1] : defecto);
const APLICAR = args.includes("--aplicar");
const TIPO = opcion("--tipo", "fisica"); // fisica | juridica | todos
const LIMITE = Number(opcion("--limite", "0")) || Infinity;
const FUENTE = opcion("--fuente", null); // p. ej. "registro": solo los proveedores que vienen de la API
if (FUENTE && !/^[a-z_]+$/.test(FUENTE)) throw new Error("--fuente: solo letras minúsculas y _");

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

const tipos = TIPO === "todos" ? ["fisica", "juridica"] : [TIPO];
const candidatos = JSON.parse(
  psql(`SELECT coalesce(json_agg(row_to_json(t)), '[]') FROM (
    SELECT p.cuit, d.domicilio_orig, d.calle, d.altura, d.localidad, d.departamento, d.provincia,
           d.precision, ST_X(d.geom) AS lon, ST_Y(d.geom) AS lat
    FROM proveedores.proveedor p
    JOIN proveedores.domicilio d ON d.proveedor_id = p.id
    WHERE p.tipo_persona IN (${tipos.map((t) => `'${t}'`).join(",")})
      ${FUENTE ? `AND p.fuente = '${FUENTE}'` : ""}
      AND p.cuit IS NOT NULL AND d.domicilio_orig IS NOT NULL
      AND d.precision IN ('localidad', 'provincia')
      AND NOT EXISTS (SELECT 1 FROM proveedores.domicilio_correccion c
                      WHERE c.cuit = p.cuit AND c.domicilio_orig = d.domicilio_orig)
    ORDER BY p.cuit) t`),
).slice(0, LIMITE);

// --- Normalización de los domicilios del padrón ---

const PROVINCIAS_COMO_LOCALIDAD = ["buenos aires", "chubut", "santa fe", "santa cruz", "la pampa", "neuquen", "mendoza", "la rioja", "san juan", "cordoba", "rio negro"];

// "SARMIENTO Nro 663 Piso 6 Dpto B" → "SARMIENTO 663"; "Nro 0" y "S/N" se descartan
function limpiar(domicilio) {
  return domicilio
    .replace(/\b(piso|dpto|depto|dto|of|oficina|local|casa\s*n[º°o]?|mz|manzana|lote|pb)\b.*$/i, "")
    .replace(/\bnro\.?\s*0\b/i, "")
    .replace(/\bs\/n\b/i, "")
    // un número de 6 cifras o más no es una altura: es un teléfono ("SAN MARTIN 123 2804000000"), y a
    // Georef lo hace fallar con un error 500
    .replace(/\b\d{6,}\b/g, "")
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

// --- Que Windows no suspenda la máquina mientras corre (la corrida dura más de una hora) ---
// Un PowerShell auxiliar pide "sistema y pantalla en uso" y espera a que se cierre su entrada,
// que se cierra sola cuando termina (o se corta) este proceso.
if (process.platform === "win32") {
  const mantener = `$t = Add-Type -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);' -Name Energia -Namespace Geo -PassThru; [void]$t::SetThreadExecutionState([uint32]2147483651); [void][Console]::In.ReadLine()`;
  try {
    const hijo = spawn("powershell", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(mantener, "utf16le").toString("base64")], { stdio: ["pipe", "ignore", "ignore"], windowsHide: true });
    hijo.on("error", () => {});
    hijo.unref();
    hijo.stdin.unref?.();
  } catch {
    // sin PowerShell la corrida sigue igual; solo puede suspenderse por inactividad
  }
}

// Pedidos HTTP que aguantan cortes de red (suspensión, wifi): reintenta cada 30 s hasta 20 veces
// Con 429 (cupo agotado: Georef tiene un cupo por hora compartido) espera lo que diga Retry-After o un
// minuto, hasta 80 veces. Si no se recupera, corta con error: una respuesta fallida nunca va a la caché,
// porque quedaría guardada como "no existe esa calle". Al volver a correr, se retoma desde la caché.
// ¿El servicio responde a una consulta simple? (Georef: la lista de provincias)
async function servicioResponde(url) {
  const u = new URL(url);
  if (!u.pathname.includes("/georef/")) return false;
  try {
    const r = await fetch(`${u.origin}/georef/api/provincias?max=1`, { headers: { "User-Agent": AGENTE } });
    return r.ok;
  } catch {
    return false;
  }
}
async function pedir(url) {
  const host = new URL(url).host;
  for (let intento = 1; ; intento++) {
    let r = null;
    try {
      r = await fetch(url, { headers: { "User-Agent": AGENTE } });
      if (r.status !== 429 && r.status < 500) return r;
    } catch {
      // sin conexión: se reintenta igual
    }
    const cupo = r?.status === 429;
    // Un error 500 repetido puede ser de esa consulta y no del servicio (a Georef lo rompen algunos
    // domicilios): a la tercera vez se prueba el servicio con una consulta simple. Si responde, la consulta
    // vuelve como "rota" y se sigue con el próximo paso; si no, es una caída y se sigue esperando.
    if (r && r.status >= 500 && intento >= 3 && (await servicioResponde(url))) {
      if (process.stdout.isTTY) process.stdout.write("\n");
      console.log(`  ${host} no puede con esta consulta (${r.status}); se sigue sin ella: ${decodeURIComponent(new URL(url).search).slice(0, 120)}`);
      r.consultaRota = true;
      return r;
    }
    const maximo = cupo ? 80 : 20;
    if (intento >= maximo) throw new Error(`${host} no responde (${r?.status ?? "sin conexión"}) después de ${maximo} intentos`);
    const espera = cupo ? Math.max(Number(r.headers.get("retry-after")) || 60, 10) : 30;
    if (process.stdout.isTTY) process.stdout.write("\n");
    console.log(cupo
      ? `  ${host}: cupo de consultas agotado; espero ${espera} s (intento ${intento}/${maximo})…`
      : `  sin respuesta de ${host} (${r?.status ?? "sin conexión"}); reintento ${intento}/${maximo} en ${espera} s…`);
    await new Promise((ok) => setTimeout(ok, espera * 1000));
  }
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
  const r = await pedir(`${NOMINATIM}?${q}`);
  if (!r.ok) throw new Error(`Nominatim ${r.status}`);
  const resultado = (await r.json())[0] ?? null;
  cache[clave] = resultado;
  if (++consultas % 20 === 0) {
    writeFileSync(CACHE, JSON.stringify(cache));
    writeFileSync(CACHE_GEOREF, JSON.stringify(cacheGeoref));
  }
  return resultado;
}

// Georef: devuelve hasta 10 coincidencias en la provincia (o en la localidad); se elige después por distancia.
// recurso "calles" sirve para encontrar el nombre oficial de una calle abreviada o mal escrita.
async function georef(direccion, provincia, extra = {}, recurso = "direcciones") {
  const q = new URLSearchParams(recurso === "direcciones" ? { direccion, provincia, ...extra, max: "10" } : { nombre: direccion, provincia, ...extra, max: "50" });
  const clave = recurso === "direcciones" ? q.toString() : `${recurso}?${q}`;
  if (clave in cacheGeoref) return cacheGeoref[clave];
  const espera = ultimaGeoref + 250 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultimaGeoref = Date.now();
  const r = await pedir(`${GEOREF_API}/${recurso}?${q}`);
  // 400 es una consulta que Georef no entiende (vale guardarla como sin resultado); otro error, no
  if (!r.ok && r.status !== 400 && !r.consultaRota) throw new Error(`Georef ${r.status} en ${recurso}`);
  const datos = r.ok ? await r.json() : {};
  const resultado = recurso === "direcciones" ? (datos.direcciones ?? []).filter((d) => d.ubicacion?.lat != null) : (datos[recurso.replaceAll("-", "_")] ?? []);
  cacheGeoref[clave] = resultado;
  if (Object.keys(cacheGeoref).length % 50 === 0) writeFileSync(CACHE_GEOREF, JSON.stringify(cacheGeoref));
  return resultado;
}

// ¿La calle que devolvió el servicio es la que se pidió? (descarta "Los Notros" → "Los Peñascos")
const tokens = (s) => sinAcentos(s ?? "").replace(/[^a-z0-9 ]/g, " ").replace(TITULOS, " ").split(/\s+/).filter((t) => t.length >= 3);
function mismaCalle(pedida, encontrada) {
  const a = tokens(pedida), b = new Set(tokens(encontrada));
  return a.length > 0 && a.some((t) => b.has(t));
}


// --- Validación y precisión del resultado ---


function provinciaCoincide(res, provincia) {
  const estado = sinAcentos(res.address?.state ?? "");
  const p = sinAcentos(provincia ?? "");
  if (p.includes("ciudad autonoma")) return estado.includes("ciudad autonoma") || estado === "buenos aires" && (res.address?.city ?? "").includes("Autónoma");
  return estado === p || estado.includes(p) || p.includes(estado);
}

// ¿El resultado está en la localidad pedida? La distancia sola no alcanza: Trelew está a 18 km de Rawson
// y comparte nombres de calles. No se mira el departamento (Trelew es del departamento Rawson).
const mismoNombre = (a, b) => {
  const x = sinAcentos(a ?? ""), y = sinAcentos(b ?? "");
  return x !== "" && y !== "" && (x === y || x.includes(y) || y.includes(x));
};
function localidadCoincide(res, localidad) {
  if (!localidad) return true;
  const a = res.address ?? {};
  return [a.city, a.town, a.village, a.hamlet, a.municipality, a.suburb, a.city_district, a.neighbourhood]
    .some((l) => mismoNombre(l, localidad));
}

function precisionDe(res) {
  if (res.address?.house_number) return "calle_altura";
  if (res.category === "highway" || res.address?.road) return "calle_sin_altura";
  if (["city", "town", "village", "hamlet", "suburb", "municipality"].includes(res.addresstype)) return "localidad";
  return null;
}
const ORDEN = { provincia: 0, localidad: 1, barrio: 1.5, calle_sin_altura: 2, esquina: 3, calle_altura_interpolada: 3, calle_altura: 3 };

// Domicilios sin calle real: "S/D", "MANZANA 15", "CHACRA 223", "ZONA RURAL", "RUTA 258 KM…"
const SIN_CALLE = /^\s*(s\/?d|s\/?n|manzana|mz|mzna|chacra|lote|zona|paraje|ruta|rp|rn|casa|edif|edificio|barrio|b[º°ª]|sector|parcela|km|kilometro|quinta|codigo\s*$)(?![a-z])/i;
const GENERICOS = ["cerro", "rio", "lago", "laguna", "villa", "colonia", "valle", "loma", "costa", "playa", "puerto", "arroyo", "norte", "sur", "este", "oeste", "centro"];
const BARRIO_TIPOS = ["suburb", "neighbourhood", "quarter", "residential", "city_district", "hamlet", "isolated_dwelling"];

// "Bº 630 VIVIENDAS", "BARRIO: COVIRA Nro 58", "MIL VIVIENDAS ... Bº CONSTITUCION" → nombre del barrio
function barrioDe(domicilio) {
  const m = domicilio.match(/(?:B[º°ª]|\bBARRIO\b|\bBO\.)\s*:?\s*(.+)$/i);
  if (!m) return null;
  const b = m[1].replace(/\b(nro|casa|mz|mzna|manzana|lote|dpto|depto|sector|sect|esc|piso|tira|block|mblok|monoblock|n[º°])\b.*$/i, "").replace(/[-,:"]+/g, " ").replace(/\s+/g, " ").trim();
  return b.length >= 3 ? b : null;
}

// Dónde buscar: la localidad del padrón, las vecinas que Georef separa (Rawson → Playa Unión) y la que
// aparezca escrita en el domicilio ("GURRUCHAGA 1232 RADA TILLY"). "Departamento Rawson" busca en el departamento.
const VECINAS = { rawson: ["Playa Unión"], "comodoro rivadavia": ["Rada Tilly"] };
const MENCIONADAS = ["Playa Unión", "Rada Tilly", "Rafaela", "Puerto Pirámides", "Villa Carlos Paz", "Mar del Plata", "La Plata"];
async function zonasDe(c, localidad) {
  const zonas = [];
  const texto = sinAcentos(c.domicilio_orig);
  for (const m of MENCIONADAS) {
    if (texto.includes(sinAcentos(m)) && sinAcentos(m) !== sinAcentos(localidad ?? "")) zonas.push({ localidad: m, filtro: { localidad_censal: m }, libre: true });
  }
  // La localidad escrita después de la altura: "ROSA BOUSSY 391 RUFINO" (el padrón dice "Santa Fe"),
  // "NOGOYA 1749 CONCORDIA ENTRE RIOS". Vale si Georef tiene una localidad con ese nombre en la provincia;
  // si el padrón trae una localidad real, la escrita tiene que estar a menos de 60 km.
  const cola = c.domicilio_orig
    .replace(/\b(piso|dpto|depto|dto|of|oficina|local|tel|t\.e\.?)\b.*$/i, "")
    .match(/\d+\s+([A-Za-zÁÉÍÓÚÑáéíóúñ. ]{4,})$/)?.[1]
    ?.replace(new RegExp(`\\s+(${["sta\\.? fe", "santa fe", "entre rios", "bs\\.? as\\.?", "buenos aires", "cordoba", "chubut", "rio negro", "neuquen", "mendoza", "santa cruz", sinAcentos(c.provincia ?? "-")].join("|")})\\s*$`, "i"), "")
    .trim();
  if (cola && cola.length >= 4 && !/^(b[º°ª]|barrio|bo\.|casa|mz|manzana|lote|sector|esc)/i.test(cola) && sinAcentos(cola) !== sinAcentos(localidad ?? "")) {
    const l = (await georef(cola, c.provincia, {}, "localidades-censales"))
      .find((x) => sinAcentos(x.nombre) === sinAcentos(cola).replace(/\./g, ""));
    if (l && l.centroide && (!localidad || distanciaKm({ lon: l.centroide.lon, lat: l.centroide.lat }, c) <= 60)) {
      zonas.unshift({ localidad: l.nombre, filtro: { localidad_censal: l.nombre }, libre: true });
    }
  }
  const depto = (c.localidad ?? "").match(/^departamento\s+(.+)$/i);
  if (depto) zonas.push({ localidad: null, filtro: { departamento: depto[1] }, libre: false });
  else if (localidad) {
    zonas.push({ localidad, filtro: { localidad_censal: localidad }, libre: false });
    for (const v of VECINAS[sinAcentos(localidad)] ?? []) zonas.push({ localidad: v, filtro: { localidad_censal: v }, libre: false });
  }
  return zonas;
}

function deGeoref(c, d, localidad, precision, fuente) {
  return {
    cuit: c.cuit,
    domicilio_orig: c.domicilio_orig,
    calle: d.calle?.nombre ?? c.calle,
    altura: d.altura?.valor != null ? String(d.altura.valor) : c.altura,
    localidad: d.localidad_censal?.nombre ?? localidad ?? c.localidad,
    departamento: d.departamento?.nombre ?? c.departamento,
    provincia: c.provincia,
    precision,
    fuente_geo: fuente,
    lon: d.ubicacion.lon,
    lat: d.ubicacion.lat,
  };
}

// Proveedores ya ubicados por calle y altura, agrupados por localidad: sirven de referencia en calles
// que Georef conoce sin numeración y OpenStreetMap no tiene
const anclas = new Map();
for (const a of JSON.parse(
  psql(`SELECT coalesce(json_agg(row_to_json(t)), '[]') FROM (
    SELECT d.localidad, d.calle, d.altura::int AS altura, ST_X(d.geom) AS lon, ST_Y(d.geom) AS lat
    FROM proveedores.domicilio d
    WHERE d.precision IN ('calle_altura', 'calle_altura_interpolada') AND d.calle IS NOT NULL
      AND d.localidad IS NOT NULL AND d.altura ~ '^[0-9]{1,5}$' AND d.altura::int > 0) t`),
)) {
  const k = sinAcentos(a.localidad);
  if (!anclas.has(k)) anclas.set(k, []);
  anclas.get(k).push(a);
}

// Con altura: interpola entre los dos vecinos que la encierran (si están a menos de 600 números y 1,5 km)
// o usa uno que esté a menos de 100 números. Sin eso, la calle sin altura (el vecino más próximo en numeración).
function porVecinos(vecinos, altura) {
  if (!vecinos.length) return null;
  // la calle tiene que ser una sola: si los vecinos están a más de 6 km entre sí, puede haber homónimas
  if (vecinos.some((a) => vecinos.some((b) => distanciaKm(a, b) > 6))) return null;
  if (altura) {
    const n = Number(altura);
    const abajo = vecinos.filter((a) => a.altura <= n).sort((x, y) => y.altura - x.altura)[0];
    const arriba = vecinos.filter((a) => a.altura >= n).sort((x, y) => x.altura - y.altura)[0];
    if (abajo && arriba && arriba.altura - abajo.altura <= 600 && distanciaKm(abajo, arriba) <= 1.5) {
      const f = arriba.altura === abajo.altura ? 0 : (n - abajo.altura) / (arriba.altura - abajo.altura);
      return { ...abajo, lon: abajo.lon + f * (arriba.lon - abajo.lon), lat: abajo.lat + f * (arriba.lat - abajo.lat), precision: "calle_altura_interpolada" };
    }
    const proximo = vecinos.slice().sort((x, y) => Math.abs(x.altura - n) - Math.abs(y.altura - n))[0];
    return { ...proximo, precision: Math.abs(proximo.altura - n) <= 100 ? "calle_altura_interpolada" : "calle_sin_altura" };
  }
  return { ...vecinos[0], precision: "calle_sin_altura" };
}

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
      // la cuadra tiene que ser de la localidad del padrón (si Georef informa la suya)
      .filter((x) => !localidad || !x.d.localidad_censal?.nombre || mismoNombre(x.d.localidad_censal.nombre, localidad))
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

  // 1b) Georef dentro de la localidad, con el nombre oficial de la calle ("JUAN D. PERON" → "JUAN DOMINGO PERON")
  const altura = c.altura && /^\d+$/.test(c.altura) && c.altura !== "0" ? c.altura : null;
  // "AMEGHINO 419 - T.E.433992" → "AMEGHINO"; "HUDSON Y BUCETICH" → "HUDSON" (y "BUCETICH" como alternativa)
  const [calleBuscada, ...otrasCalles] = callesDe(domicilio).length ? callesDe(domicilio) : callesDe(c.calle ?? "");
  const zonas = await zonasDe(c, localidad);
  const cerca = (p, z) => z.libre || c.precision !== "localidad" || distanciaKm(p, c) <= DISTANCIA_MAXIMA_KM;
  const oficiales = [];
  const clave = palabraClave(calleBuscada);
  // ni "S/D", ni "MANZANA 4", ni un nombre genérico solo ("CERRO", "RIO"), ni el nombre de la localidad ("TREVELIN Nro 0")
  const hayCalle = clave && !SIN_CALLE.test(calleBuscada) && !palabras(calleBuscada).every((t) => GENERICOS.includes(t))
    && sinAcentos(calleBuscada) !== sinAcentos(localidad ?? "") && sinAcentos(calleBuscada) !== sinAcentos(c.localidad ?? "");
  if (hayCalle) {
    for (const z of zonas) {
      for (const k of await georef(clave, c.provincia, z.filtro, "calles")) {
        if (calleEquivalente(calleBuscada, k.nombre) && !oficiales.some((o) => o.nombre === k.nombre && o.z === z)) oficiales.push({ nombre: k.nombre, z });
      }
    }
    if (altura) {
      for (const o of oficiales) {
        const d = (await georef(`${o.nombre} ${altura}`, c.provincia, o.z.filtro)).find((d) => d.calle?.nombre === o.nombre);
        if (d && cerca({ lon: d.ubicacion.lon, lat: d.ubicacion.lat }, o.z)) return deGeoref(c, d, localidad, "calle_altura", "georef/regeo-localidad");
      }
    }
  }

  // 1c) Otros proveedores ya ubicados en la misma calle y localidad: se interpola la altura entre ellos
  if (hayCalle) {
    const nombres = [calleBuscada, ...otrasCalles, ...oficiales.map((o) => o.nombre)];
    const vecinos = zonas.flatMap((z) => (z.localidad ? anclas.get(sinAcentos(z.localidad)) ?? [] : []).map((a) => ({ ...a, z })))
      // el vecino puede tener el nombre corto ("Payro" por "ROBERTO PAYRO"), pero con el apellido: "Julio" no es "JULIO A ROCA"
      .filter((a) => nombres.some((n) => calleEquivalente(n, a.calle) || (calleEquivalente(a.calle, n) && calleEquivalente(apellido(n), a.calle))) && cerca(a, a.z));
    const r = porVecinos(vecinos, altura);
    if (r) {
      return {
        cuit: c.cuit, domicilio_orig: c.domicilio_orig, calle: r.calle, altura: c.altura,
        localidad: r.z.localidad ?? localidad ?? c.localidad, departamento: c.departamento, provincia: c.provincia,
        precision: r.precision, fuente_geo: "padron/vecinos", lon: r.lon, lat: r.lat,
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
  // la calle sola (sin altura), con el nombre del padrón y con el oficial de Georef
  if (localidad && hayCalle) {
    for (const n of new Set([calleBuscada, ...otrasCalles, ...oficiales.map((o) => o.nombre)])) {
      intentos.push({ street: n, city: localidad, state: c.provincia, country: "Argentina" });
    }
  }

  for (const params of intentos) {
    const res = await nominatim(params);
    if (!res || !provinciaCoincide(res, c.provincia) || !localidadCoincide(res, localidad)) continue;
    const punto = { lon: Number(res.lon), lat: Number(res.lat) };
    // Con localidad conocida, el resultado tiene que caer cerca del punto actual (centro de la localidad)
    if (c.precision === "localidad" && distanciaKm(punto, c) > DISTANCIA_MAXIMA_KM) continue;
    const precision = precisionDe(res);
    if (!precision || ORDEN[precision] <= ORDEN[c.precision]) continue; // no mejora lo que ya hay
    const road = res.address?.road;
    // la calle de OpenStreetMap tiene que ser la pedida (o su nombre oficial), con la misma regla que el resto
    const nombresCalle = [calleBuscada, ...otrasCalles, ...oficiales.map((o) => o.nombre)].filter(Boolean);
    if (precision !== "localidad" && !nombresCalle.some((n) => calleEquivalente(n, road ?? "") || (calleEquivalente(road ?? "", n) && calleEquivalente(apellido(n), road ?? "")))) continue; // calle equivocada
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
  // 3) El barrio ("Bº 630 VIVIENDAS", "BARRIO CONSTITUCION") en OpenStreetMap
  const barrio = barrioDe(c.domicilio_orig);
  if (barrio && localidad) {
    const res = await nominatim({ q: `Barrio ${barrio}, ${localidad}, ${c.provincia}, Argentina` });
    const nombre = res?.name ?? res?.address?.suburb ?? res?.address?.neighbourhood ?? "";
    if (res && provinciaCoincide(res, c.provincia) && localidadCoincide(res, localidad) && BARRIO_TIPOS.includes(res.addresstype)
        && calleEquivalente(barrio, nombre.replace(/^barrio\s+/i, ""))) {
      const punto = { lon: Number(res.lon), lat: Number(res.lat) };
      if (c.precision !== "localidad" || distanciaKm(punto, c) <= DISTANCIA_MAXIMA_KM) {
        return {
          cuit: c.cuit, domicilio_orig: c.domicilio_orig, calle: c.calle, altura: c.altura, localidad,
          departamento: c.departamento, provincia: c.provincia, precision: "barrio", fuente_geo: "nominatim/regeo-barrio", ...punto,
        };
      }
    }
  }
  return null;
}

// --- Ejecución ---

console.log(`${candidatos.length} domicilios a revisar (${tipos.join(" y ")}); ${Object.keys(cache).length} respuestas en caché`);
const corregidos = [];
const noUbicados = [];
// Barra de progreso: en una terminal se redibuja en el lugar; redirigida a un archivo, una línea cada 50
// El tiempo restante sale de la velocidad de los últimos 100: lo que viene de la caché sale al instante
const marcas = [];
function progreso(hechos) {
  const total = candidatos.length;
  const pct = total ? hechos / total : 1;
  const ancho = 30;
  const lleno = Math.round(pct * ancho);
  marcas.push(Date.now());
  if (marcas.length > 101) marcas.shift();
  const porItem = marcas.length > 1 ? (marcas.at(-1) - marcas[0]) / (marcas.length - 1) : 0;
  const seg = (porItem * (total - hechos)) / 1000;
  const resta = seg >= 3600 ? `${Math.floor(seg / 3600)} h ${Math.round((seg % 3600) / 60)} min` : seg >= 60 ? `${Math.round(seg / 60)} min` : `${Math.round(seg)} s`;
  const linea = `  [${"█".repeat(lleno)}${"░".repeat(ancho - lleno)}] ${(pct * 100).toFixed(1).padStart(5)}% · ${hechos}/${total}`
    + ` · mejorados ${corregidos.length} · sin mejora ${noUbicados.length}${hechos < total ? ` · faltan ~${resta}` : ""}`;
  if (process.stdout.isTTY) process.stdout.write(`\r${linea}\x1b[K${hechos === total ? "\n" : ""}`);
  else if (hechos % 50 === 0 || hechos === total) console.log(linea);
}
for (const [i, c] of candidatos.entries()) {
  const r = await geocodificar(c);
  if (r) corregidos.push(r);
  else noUbicados.push(c);
  progreso(i + 1);
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
  WHERE d.proveedor_id = p.id AND coalesce(d.domicilio_orig, '') = c.domicilio_orig;
  COMMIT;`,
  true,
);
console.log(`\n${corregidos.length} correcciones guardadas en proveedores.domicilio_correccion y aplicadas.`);
