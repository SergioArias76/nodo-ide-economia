#!/usr/bin/env node
// Genera portal/src/lib/limite-chubut.json: el límite de la provincia del Chubut (IGN, capa idera:provincia,
// código INDEC 26), simplificado para el navegador. El visor recorta todas las capas a este contorno y pide
// los datos (consulta, tablas y análisis) solo dentro de él, con el mismo contorno en todos los casos para
// que los números coincidan.
// Uso: node scripts/generar-limite-chubut.mjs   (usa Turf de portal/node_modules)
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../portal/package.json", import.meta.url));
const turf = require("@turf/turf");

const ORIGEN = "https://wms.ign.gob.ar/geoserver/idera/wms";
const DESTINO = fileURLToPath(new URL("../portal/src/lib/limite-chubut.json", import.meta.url));
// Margen sobre el límite oficial: los domicilios sobre la costa (la Avenida Ducos en Comodoro Rivadavia)
// quedan a metros del mar y la simplificación no debe dejarlos afuera
const MARGEN_KM = 0.25;
// ~150 m: sigue la costa con pocos vértices (el contorno viaja en el filtro de cada pedido WFS)
const TOLERANCIA = 0.0015;

const q = new URLSearchParams({
  service: "WFS",
  version: "2.0.0",
  request: "GetFeature",
  typeNames: "idera:provincia",
  outputFormat: "application/json",
  CQL_FILTER: "codigo_indec='26'",
});
const datos = await (await fetch(`${ORIGEN}?${q}`, { signal: AbortSignal.timeout(180000) })).json();
const chubut = datos.features[0];
if (!chubut) throw new Error("No se encontró la provincia del Chubut en el servicio del IGN");

// Solo el continente y las islas de más de 1 km²: las rocas costeras no suman y alargan el contorno
const partes = (chubut.geometry.type === "MultiPolygon" ? chubut.geometry.coordinates : [chubut.geometry.coordinates])
  .filter((p) => turf.area(turf.polygon(p)) > 1e6)
  .map((p) => [p[0]]); // sin huecos
const ancho = turf.buffer(turf.multiPolygon(partes), MARGEN_KM, { units: "kilometers" });
const simple = turf.simplify(ancho, { tolerance: TOLERANCIA, highQuality: true });
const poligonos = simple.geometry.type === "Polygon" ? [simple.geometry.coordinates] : simple.geometry.coordinates;
const redondeo = (anillo) => anillo.map((pt) => pt.map((n) => Math.round(n * 1e5) / 1e5));
const geometria = { type: "MultiPolygon", coordinates: poligonos.map((p) => [redondeo(p[0])]) };

writeFileSync(
  DESTINO,
  JSON.stringify({
    origen: `${ORIGEN} (idera:provincia, codigo_indec 26), con ${MARGEN_KM * 1000} m de margen`,
    generado: new Date().toISOString().slice(0, 10),
    geometria,
  }) + "\n",
);
console.log(`${geometria.coordinates.length} polígonos, ${geometria.coordinates.flat(2).length} vértices → ${DESTINO}`);
