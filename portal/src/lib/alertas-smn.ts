// Alertas meteorológicas vigentes del Servicio Meteorológico Nacional que tocan el Chubut. Solo del servidor
// (lo usa app/api/alertas). El SMN publica un feed RSS con un enlace por alerta a un documento CAP 1.2 (el
// estándar de alertas de la OMM) que trae el polígono del área afectada; acá se juntan en un GeoJSON chico.
// Licencia de los datos: CC BY 4.0, Servicio Meteorológico Nacional.

const FEED = "https://ssl.smn.gob.ar/CAP/AR.php";
// Solo se siguen enlaces del propio SMN, aunque el feed traiga otros
const PREFIJO_CAP = "https://ssl.smn.gob.ar/feeds/CAP/";
const MINUTOS = 10;
const SIMULTANEOS = 8;
// Recuadro del Chubut (oeste, sur, este, norte), con margen: el visor recorta al límite provincial
const CHUBUT = [-72.3, -46.1, -63.4, -41.9];

const NIVELES: Record<string, { nivel: string; orden: number }> = {
  Minor: { nivel: "Amarillo", orden: 1 },
  Moderate: { nivel: "Amarillo", orden: 1 },
  Severe: { nivel: "Naranja", orden: 2 },
  Extreme: { nivel: "Rojo", orden: 3 },
};

type Alerta = {
  type: "Feature";
  geometry: { type: "Polygon"; coordinates: number[][][] };
  properties: Record<string, string | number>;
};
export type Alertas = { type: "FeatureCollection"; features: Alerta[]; actualizado: string; total_pais: number };

const decodificar = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();

const campo = (xml: string, nombre: string) => {
  const m = new RegExp(`<${nombre}>([\\s\\S]*?)</${nombre}>`).exec(xml);
  return m ? decodificar(m[1]) : "";
};

const fecha = (iso: string) =>
  iso
    ? new Date(iso).toLocaleString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        day: "numeric",
        month: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }) + " h"
    : "";

async function texto(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000), cache: "no-store", headers: { "User-Agent": "NodoIDE-Economia-Chubut/1.0" } });
  if (!r.ok) throw new Error(`El SMN respondió ${r.status}`);
  return r.text();
}

// "lat,lon lat,lon ..." (CAP) → anillo GeoJSON [lon, lat], cerrado
function anillo(polygon: string) {
  const puntos = polygon
    .trim()
    .split(/\s+/)
    .map((p) => p.split(",").map(Number))
    .filter((p) => p.length === 2 && p.every((n) => !isNaN(n)))
    .map(([lat, lon]) => [lon, lat]);
  if (puntos.length < 3) return null;
  const [a, z] = [puntos[0], puntos[puntos.length - 1]];
  if (a[0] !== z[0] || a[1] !== z[1]) puntos.push(a);
  return puntos;
}

const tocaChubut = (r: number[][]) => {
  const lons = r.map((p) => p[0]), lats = r.map((p) => p[1]);
  return Math.min(...lons) <= CHUBUT[2] && Math.max(...lons) >= CHUBUT[0] && Math.min(...lats) <= CHUBUT[3] && Math.max(...lats) >= CHUBUT[1];
};

function leerCap(xml: string, enlace: string, ahora: number): Alerta[] {
  if (campo(xml, "msgType") === "Cancel") return [];
  const vence = campo(xml, "expires");
  if (vence && new Date(vence).getTime() < ahora) return [];
  const severidad = NIVELES[campo(xml, "severity")] ?? NIVELES.Moderate;
  const evento = campo(xml, "event") || campo(xml, "headline");
  const propiedades = {
    // "nombre" es el título de la ficha de consulta del visor
    nombre: `${evento} (nivel ${severidad.nivel.toLowerCase()})`,
    evento,
    nivel: severidad.nivel,
    desde: fecha(campo(xml, "onset") || campo(xml, "effective")),
    hasta: fecha(vence),
    descripcion: campo(xml, "description"),
    recomendaciones: campo(xml, "instruction"),
    fuente: "Servicio Meteorológico Nacional",
    enlace: campo(xml, "web") || "https://www.smn.gob.ar/alertas",
    documento_cap: enlace,
  };
  return [...xml.matchAll(/<polygon>([\s\S]*?)<\/polygon>/g)]
    .map((m) => anillo(m[1]))
    .filter((r): r is number[][] => r != null && tocaChubut(r))
    .map((r) => ({ type: "Feature", geometry: { type: "Polygon", coordinates: [r] }, properties: propiedades }));
}

let guardadas: { valor: Alertas; vence: number } | null = null;

export async function leerAlertas(): Promise<Alertas> {
  if (guardadas && guardadas.vence > Date.now()) return guardadas.valor;
  try {
    const feed = await texto(FEED);
    const enlaces = [...new Set([...feed.matchAll(/<link>([^<]+)<\/link>/g)].map((m) => decodificar(m[1])).filter((u) => u.startsWith(PREFIJO_CAP)))];
    const ahora = Date.now();
    const features: Alerta[] = [];
    // De a pocas por vez, para no saturar al SMN; una alerta que no responde se saltea
    for (let i = 0; i < enlaces.length; i += SIMULTANEOS) {
      const lote = await Promise.all(enlaces.slice(i, i + SIMULTANEOS).map((u) => texto(u).then((x) => leerCap(x, u, ahora)).catch(() => [])));
      features.push(...lote.flat());
    }
    // Las más graves arriba
    const orden = (f: Alerta) => Object.values(NIVELES).find((n) => n.nivel === f.properties.nivel)?.orden ?? 0;
    features.sort((a, b) => orden(a) - orden(b));
    const valor: Alertas = { type: "FeatureCollection", features, actualizado: new Date().toISOString(), total_pais: enlaces.length };
    guardadas = { valor, vence: Date.now() + MINUTOS * 60_000 };
    return valor;
  } catch (e) {
    // Si el SMN no responde, las últimas leídas (si hay) antes que nada
    if (guardadas) return guardadas.valor;
    throw e;
  }
}
