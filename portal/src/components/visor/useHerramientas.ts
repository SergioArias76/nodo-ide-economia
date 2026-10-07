"use client";

import { useEffect, useRef, useState } from "react";
import type Map from "ol/Map";
import Overlay from "ol/Overlay";
import Feature from "ol/Feature";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import { Draw, Modify, Snap } from "ol/interaction";
import { createBox, type GeometryFunction } from "ol/interaction/Draw";
import type Interaction from "ol/interaction/Interaction";
import type { Type as TipoDibujo } from "ol/geom/Geometry";
import type { FeatureLike } from "ol/Feature";
import { Circle as CirculoGeom, LineString, Point, Polygon, type Geometry } from "ol/geom";
import { fromCircle } from "ol/geom/Polygon";
import { Circle, Fill, Stroke, Style, Text } from "ol/style";
import { getArea, getLength } from "ol/sphere";
import type { Coordinate } from "ol/coordinate";
import { descargarTexto } from "./exportar";
import { Z, type Modo } from "./tipos";

const NARANJA = "#ff682c"; // meseta del isotipo
const AZUL = "#21708c"; // mar profundo del isotipo

const estiloDibujo = (f: FeatureLike) => {
  const texto = f.get("texto") as string | undefined;
  if (texto != null) {
    return new Style({
      text: new Text({
        text: texto,
        font: "600 14px system-ui, sans-serif",
        fill: new Fill({ color: "#13262e" }),
        stroke: new Stroke({ color: "#ffffff", width: 3 }),
      }),
    });
  }
  return new Style({
    fill: new Fill({ color: "rgba(255, 104, 44, 0.15)" }),
    stroke: new Stroke({ color: NARANJA, width: 2.5 }),
    image: new Circle({ radius: 6, fill: new Fill({ color: NARANJA }), stroke: new Stroke({ color: "#fff", width: 2 }) }),
  });
};

const estiloMedicion = new Style({
  fill: new Fill({ color: "rgba(33, 112, 140, 0.12)" }),
  stroke: new Stroke({ color: AZUL, width: 2.5, lineDash: [8, 6] }),
  image: new Circle({ radius: 4, fill: new Fill({ color: AZUL }) }),
});

const numero = (n: number, dec = 2) => n.toLocaleString("es-AR", { maximumFractionDigits: dec });

export function formatearMedida(g: Geometry) {
  if (g instanceof Polygon) {
    const a = getArea(g);
    return a > 1e6 ? `${numero(a / 1e6)} km²` : a > 1e4 ? `${numero(a / 1e4)} ha` : `${numero(a, 0)} m²`;
  }
  const l = getLength(g);
  return l > 1000 ? `${numero(l / 1000)} km` : `${numero(l, 0)} m`;
}

// Etiqueta flotante con la medida, pegada al último vértice
function etiquetaMedida(mapa: Map) {
  const el = document.createElement("div");
  el.className =
    "pointer-events-none rounded-md bg-tinta/90 px-2 py-1 text-xs font-semibold whitespace-nowrap text-white shadow";
  const overlay = new Overlay({ element: el, offset: [0, -12], positioning: "bottom-center", stopEvent: false });
  mapa.addOverlay(overlay);
  return overlay;
}

const posicionEtiqueta = (g: Geometry): Coordinate =>
  g instanceof Polygon ? g.getInteriorPoint().getCoordinates() : (g as LineString).getLastCoordinate();

const TIPOS: Partial<Record<Modo, { tipo: TipoDibujo; geometria?: GeometryFunction }>> = {
  "medir-distancia": { tipo: "LineString" },
  "medir-area": { tipo: "Polygon" },
  "dibujar-punto": { tipo: "Point" },
  "dibujar-linea": { tipo: "LineString" },
  "dibujar-poligono": { tipo: "Polygon" },
  "dibujar-rectangulo": { tipo: "Circle", geometria: createBox() },
  "dibujar-circulo": { tipo: "Circle" },
};

export type EditorTexto = { feature: Feature<Point>; coordenada: Coordinate };

export function useHerramientas(mapa: Map | null) {
  const [modo, setModo] = useState<Modo | null>(null);
  const [cantidad, setCantidad] = useState(0); // elementos dibujados o medidos
  const [editorTexto, setEditorTexto] = useState<EditorTexto | null>(null);
  const dibujos = useRef(new VectorSource());
  const mediciones = useRef(new VectorSource());

  useEffect(() => {
    if (!mapa) return;
    const capas = [
      new VectorLayer({ source: mediciones.current, style: estiloMedicion, zIndex: Z.dibujo }),
      new VectorLayer({ source: dibujos.current, style: estiloDibujo, zIndex: Z.dibujo }),
    ];
    capas.forEach((c) => mapa.addLayer(c));
    const contar = () => setCantidad(dibujos.current.getFeatures().length + mediciones.current.getFeatures().length);
    const fuentes = [dibujos.current, mediciones.current];
    fuentes.forEach((f) => f.on(["addfeature", "removefeature", "clear"], contar));
    return () => capas.forEach((c) => mapa.removeLayer(c));
  }, [mapa]);

  // Interacciones del modo activo
  useEffect(() => {
    if (!mapa || !modo) return;
    const interacciones: Interaction[] = [];
    const config = TIPOS[modo];
    const midiendo = modo.startsWith("medir");

    if (config) {
      const fuente = midiendo ? mediciones.current : dibujos.current;
      const draw = new Draw({ source: fuente, type: config.tipo, geometryFunction: config.geometria });
      let etiqueta: Overlay | null = null;
      if (midiendo) {
        draw.on("drawstart", (e) => {
          etiqueta = etiquetaMedida(mapa);
          const g = e.feature.getGeometry()!;
          g.on("change", () => {
            etiqueta!.getElement()!.textContent = formatearMedida(g);
            etiqueta!.setPosition(posicionEtiqueta(g));
          });
        });
        draw.on("drawend", (e) => e.feature.set("etiqueta", etiqueta));
        draw.on("drawabort", () => etiqueta && mapa.removeOverlay(etiqueta));
      } else {
        // Los círculos se guardan como polígonos para poder exportarlos a GeoJSON
        draw.on("drawend", (e) => {
          const g = e.feature.getGeometry();
          if (g instanceof CirculoGeom) e.feature.setGeometry(fromCircle(g, 64));
        });
      }
      interacciones.push(draw, new Snap({ source: fuente }));
    }

    if (modo === "editar") {
      for (const fuente of [dibujos.current, mediciones.current]) {
        const modify = new Modify({ source: fuente });
        modify.on("modifyend", (e) =>
          e.features.forEach((f) => {
            const etiqueta = f.get("etiqueta") as Overlay | undefined;
            const g = f.getGeometry() as Geometry;
            if (etiqueta) {
              etiqueta.getElement()!.textContent = formatearMedida(g);
              etiqueta.setPosition(posicionEtiqueta(g));
            }
          }),
        );
        interacciones.push(modify);
      }
    }
    interacciones.forEach((i) => mapa.addInteraction(i));

    const clic = mapa.on("singleclick", (e) => {
      if (modo === "dibujar-texto") {
        const feature = new Feature(new Point(e.coordinate));
        feature.set("texto", "");
        dibujos.current.addFeature(feature);
        setEditorTexto({ feature, coordenada: e.coordinate });
      }
      if (modo === "borrar") {
        mapa.forEachFeatureAtPixel(
          e.pixel,
          (f) => {
            const feature = f as Feature;
            const etiqueta = feature.get("etiqueta") as Overlay | undefined;
            if (etiqueta) mapa.removeOverlay(etiqueta);
            for (const fuente of [dibujos.current, mediciones.current])
              if (fuente.hasFeature(feature)) fuente.removeFeature(feature);
            return true; // solo el de arriba
          },
          { hitTolerance: 5 },
        );
      }
    });

    const teclado = (e: KeyboardEvent) => e.key === "Escape" && !document.activeElement?.closest("form") && setModo(null);
    window.addEventListener("keydown", teclado);
    return () => {
      interacciones.forEach((i) => mapa.removeInteraction(i));
      mapa.un("singleclick", clic.listener);
      window.removeEventListener("keydown", teclado);
    };
  }, [mapa, modo]);

  function confirmarTexto(texto: string) {
    if (!editorTexto) return;
    if (texto.trim()) editorTexto.feature.set("texto", texto.trim());
    else dibujos.current.removeFeature(editorTexto.feature);
    setEditorTexto(null);
  }

  // Cambiar de herramienta descarta un texto a medio escribir
  function cambiarModo(m: Modo | null) {
    if (editorTexto) confirmarTexto("");
    setModo(m);
  }

  function borrarTodo() {
    if (!mapa) return;
    mediciones.current.getFeatures().forEach((f) => {
      const etiqueta = f.get("etiqueta") as Overlay | undefined;
      if (etiqueta) mapa.removeOverlay(etiqueta);
    });
    mediciones.current.clear();
    dibujos.current.clear();
    setEditorTexto(null);
  }

  function exportarDibujos() {
    const features = [...dibujos.current.getFeatures(), ...mediciones.current.getFeatures()].map((f) => {
      const copia = new Feature(f.getGeometry()!.clone());
      if (f.get("texto")) copia.set("texto", f.get("texto"));
      if (f.get("etiqueta")) copia.set("medida", formatearMedida(f.getGeometry()!));
      return copia;
    });
    const json = new GeoJSON().writeFeatures(features, { featureProjection: "EPSG:3857", dataProjection: "EPSG:4326" });
    descargarTexto(json, "dibujos-ide-economia.geojson", "application/geo+json");
  }

  return { modo, setModo: cambiarModo, cantidad, editorTexto, confirmarTexto, borrarTodo, exportarDibujos };
}
