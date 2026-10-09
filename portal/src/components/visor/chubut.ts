// El visor muestra y analiza solo la provincia del Chubut. Límite oficial del IGN con 250 m de margen,
// simplificado por scripts/generar-limite-chubut.mjs. El mismo contorno recorta las capas en pantalla y
// filtra los datos en el servidor (CQL de los pedidos WFS), así los números coinciden en todos lados.
import type Layer from "ol/layer/Layer";
import type RenderEvent from "ol/render/Event";
import Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import WKT from "ol/format/WKT";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { MultiPolygon, Polygon } from "ol/geom";
import { buffer, type Extent } from "ol/extent";
import { getRenderPixel } from "ol/render";
import { apply } from "ol/transform";
import { Fill, Stroke, Style } from "ol/style";
import type { Coordinate } from "ol/coordinate";
import limite from "@/lib/limite-chubut.json";

const formato = new GeoJSON();
const leer = (g: unknown) => formato.readGeometry(g, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" }) as MultiPolygon;

export const CHUBUT = leer(limite.geometria); // EPSG:3857
export const EXTENSION_CHUBUT: Extent = CHUBUT.getExtent();
// Hasta dónde se puede mover el centro del mapa: la provincia y un margen de 150 km
export const LIMITE_VISTA: Extent = buffer(EXTENSION_CHUBUT, 150_000);

// Filtro CQL para WFS (la geometría se nombra según la capa)
const WKT_FILTRO = `SRID=3857;${new WKT().writeGeometry(CHUBUT, { decimals: 1 })}`;
export const cqlChubut = (geometria: string) => `INTERSECTS(${geometria}, ${WKT_FILTRO})`;

export const enChubut = (c: Coordinate) => CHUBUT.intersectsCoordinate(c);

// Recorta lo que dibuja la capa al contorno de la provincia (receta "layer clipping" de OpenLayers)
export function recortarAChubut(capa: Layer) {
  capa.on("prerender", (e: RenderEvent) => {
    const ctx = e.context as CanvasRenderingContext2D;
    const aPixel = (c: Coordinate) => getRenderPixel(e, apply(e.frameState!.coordinateToPixelTransform, c.slice(0, 2)));
    ctx.save();
    ctx.beginPath();
    for (const poligono of CHUBUT.getCoordinates()) {
      for (const anillo of poligono) {
        anillo.forEach((c, i) => {
          const [x, y] = aPixel(c);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
      }
    }
    ctx.clip();
  });
  capa.on("postrender", (e: RenderEvent) => (e.context as CanvasRenderingContext2D).restore());
  return capa;
}

// Fuera del Chubut el mapa base queda velado y la provincia, con su contorno
export function capaMascara(zIndex: number) {
  const mundo = [
    [-20037508, -20037508],
    [20037508, -20037508],
    [20037508, 20037508],
    [-20037508, 20037508],
    [-20037508, -20037508],
  ];
  // Los huecos tienen que girar al revés que el anillo exterior para que el canvas no los rellene
  const area = (r: Coordinate[]) => r.reduce((s, [x1, y1], i) => (i ? s + (r[i - 1][0] * y1 - x1 * r[i - 1][1]) : 0), 0);
  const huecos = CHUBUT.getCoordinates().map((p) => (area(p[0]) > 0 ? p[0].slice().reverse() : p[0]));
  const exterior = new Polygon([mundo, ...huecos]); // mundo gira en sentido antihorario (área positiva)
  return new VectorLayer({
    zIndex,
    source: new VectorSource({ features: [new Feature(exterior), new Feature(CHUBUT.clone())] }),
    style: (f) =>
      f.getGeometry() instanceof MultiPolygon
        ? new Style({ stroke: new Stroke({ color: "rgba(33, 112, 140, 0.9)", width: 1.5 }) })
        : new Style({ fill: new Fill({ color: "rgba(19, 38, 46, 0.32)" }) }),
  });
}
