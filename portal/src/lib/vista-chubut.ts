// Miniaturas de capas sobre la provincia, sin OpenLayers: el contorno del Chubut como trazado SVG y la capa
// como imagen WMS del mismo recuadro (proyección en proyeccion-chubut.ts, así coinciden).
import limite from "@/lib/limite-chubut.json";
import { ALTO, ANCHO, ESTE, NORTE, OESTE, SUR, proyectar } from "@/lib/proyeccion-chubut";

export { ALTO, ANCHO };

const punto = ([lon, lat]: number[]) => proyectar(lon, lat).map((v) => v.toFixed(1)).join(" ");

export const CONTORNO_CHUBUT = {
  trazado: (limite.geometria.coordinates as number[][][][])
    .flatMap((poligono) => poligono.map((anillo) => `M${anillo.map(punto).join("L")}Z`))
    .join(""),
  caja: `0 0 ${ANCHO} ${ALTO}`,
};

// GetMap en WMS 1.1.1 (orden longitud, latitud) con el doble de resolución para pantallas densas
export const imagenWms = (servicio: string, capa: string, escala = 2) =>
  `${servicio}?${new URLSearchParams({
    service: "WMS",
    version: "1.1.1",
    request: "GetMap",
    layers: capa,
    styles: "",
    srs: "EPSG:4326",
    bbox: [OESTE, SUR, ESTE, NORTE].join(","),
    width: String(Math.round(ANCHO * escala)),
    height: String(Math.round(ALTO * escala)),
    format: "image/png",
    transparent: "true",
  })}`;
