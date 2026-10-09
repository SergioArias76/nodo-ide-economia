#!/usr/bin/env node
// Genera portal/src/lib/capas-idera.json a partir del catálogo de capas del visor de IDERA
// (mapa.idera.gob.ar): servicios WMS nacionales agrupados por tema (educación, salud, transporte…).
// Uso: node scripts/actualizar-capas-idera.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ORIGEN = "https://mapa.idera.gob.ar/src/config/data.json";
const DESTINO = fileURLToPath(new URL("../portal/src/lib/capas-idera.json", import.meta.url));

// Servicios sin datos del Chubut (catastro de la provincia de Buenos Aires)
const EXCLUIDOS = ["geo.arba.gov.ar"];
// Capas que IDERA publica sin título propio
const TITULOS = { "areas_protegidas:eco-regiones_Arg": "Ecorregión" };

const slug = (s) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const datos = await (await fetch(ORIGEN)).json();

const grupos = new Map(); // sección de IDERA → nombre del grupo (la primera aparición manda)
const capas = [];
const ids = new Set();

for (const item of datos.items) {
  // Solo los "Datos" temáticos: WMS con capas elegidas. Se omiten mapas base y la pestaña "Organismos".
  if (item.type !== "wms" || !item.allowed_layers) continue;
  const url = item.host.split("?")[0];
  if (!url.startsWith("https://")) continue; // un sitio https no puede cargar servicios http
  if (EXCLUIDOS.some((h) => url.includes(h))) continue;
  if (!grupos.has(item.seccion)) grupos.set(item.seccion, item.nombre);

  for (const nombre of item.allowed_layers) {
    const extra = item.customize_layers?.[nombre] ?? {};
    const titulo = (extra.new_title ?? TITULOS[nombre] ?? nombre).trim();
    let id = slug(titulo);
    while (ids.has(id)) id += "-2";
    ids.add(id);
    capas.push({
      id,
      grupo: grupos.get(item.seccion),
      titulo,
      resumen: (extra.new_abstract ?? "").trim(),
      url,
      capa: nombre,
      // Solo se consulta con clic lo que el servicio devuelve en JSON
      consultable: item.feature_info_format === "application/json",
    });
  }
}

// ¿El servicio permite usar sus imágenes desde otro sitio (CORS)? Sin eso, la captura PNG/PDF
// falla si la capa está visible; con eso se la pide con crossOrigin. Un servicio caído cuenta como "no".
const cors = {};
for (const url of new Set(capas.map((c) => c.url))) {
  try {
    const r = await fetch(`${url}?service=WMS&request=GetCapabilities&version=1.3.0`, {
      headers: { Origin: "https://ide.chubut.example" },
      signal: AbortSignal.timeout(20000),
    });
    cors[url] = r.ok && r.headers.has("access-control-allow-origin");
  } catch {
    cors[url] = false;
  }
  console.log(`${cors[url] ? "CORS   " : "sin CORS"} ${url}`);
}
for (const c of capas) c.cors = cors[c.url];

// ¿La capa se puede descargar por WFS en GeoJSON desde otro sitio? Es lo que necesita el análisis
// geográfico del visor (conteo, áreas de influencia, superposición…). Se prueba pidiendo un elemento.
for (const c of capas) {
  c.wfs = false;
  if (!c.cors) continue;
  const q = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: c.capa,
    count: "1",
    outputFormat: "application/json",
  });
  try {
    const r = await fetch(`${c.url}?${q}`, {
      headers: { Origin: "https://ide.chubut.example" },
      signal: AbortSignal.timeout(20000),
    });
    c.wfs = r.ok && r.headers.has("access-control-allow-origin") && Array.isArray((await r.json()).features);
  } catch {
    // sin WFS o con respuesta que no es GeoJSON
  }
  console.log(`${c.wfs ? "WFS   " : "sin WFS"} ${c.titulo}`);
}

writeFileSync(DESTINO, JSON.stringify({ origen: ORIGEN, generado: new Date().toISOString().slice(0, 10), capas }, null, 2) + "\n");
console.log(`${capas.length} capas en ${new Set(capas.map((c) => c.grupo)).size} grupos → ${DESTINO}`);
