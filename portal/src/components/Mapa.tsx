"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Map from "ol/Map";
import View from "ol/View";
import Overlay from "ol/Overlay";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import XYZ from "ol/source/XYZ";
import TileWMS from "ol/source/TileWMS";
import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { Circle, Fill, Stroke, Style } from "ol/style";
import { fromLonLat } from "ol/proj";
import "ol/ol.css";
import { CAPAS_NODO, PUBLIC_GEOSERVER } from "@/lib/config";
import FichaConsulta, { type Consulta } from "./FichaConsulta";

// Mapa base del IGN (Argenmap), recomendado para organismos argentinos
const ARGENMAP =
  "https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{-y}.png";

const leyenda = (capa: string) =>
  `${PUBLIC_GEOSERVER}/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetLegendGraphic&FORMAT=image/png&TRANSPARENT=true` +
  `&WIDTH=14&HEIGHT=14&LAYER=${capa}&LEGEND_OPTIONS=forceLabels:off`;

const geojson = new GeoJSON(); // GetFeatureInfo devuelve la geometría en la proyección del mapa

export default function Mapa() {
  const contenedor = useRef<HTMLDivElement>(null);
  const capas = useRef<Record<string, TileLayer<TileWMS>>>({});
  const overlay = useRef<Overlay>(null);
  const resaltado = useRef(new VectorSource());
  const ultimaConsulta = useRef(0);
  // OpenLayers mueve el nodo del popup dentro del mapa: React lo llena por portal
  const [nodoPopup] = useState(() => document.createElement("div"));
  const [visibles, setVisibles] = useState<Record<string, boolean>>(
    Object.fromEntries(CAPAS_NODO.map((c) => [c.nombre, true])),
  );
  const [consulta, setConsulta] = useState<Consulta | null>(null);
  const [geometrias, setGeometrias] = useState<Point[]>([]);
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    const overlays = CAPAS_NODO.map((c) => {
      const capa = new TileLayer({
        source: new TileWMS({
          url: `${PUBLIC_GEOSERVER}/wms`,
          params: { LAYERS: c.nombre, TILED: true },
          serverType: "geoserver",
          crossOrigin: "anonymous",
        }),
      });
      capas.current[c.nombre] = capa;
      return capa;
    });

    const popup = new Overlay({
      element: nodoPopup,
      positioning: "bottom-center",
      offset: [0, -14],
      autoPan: { animation: { duration: 250 }, margin: 24 },
    });
    overlay.current = popup;

    const mapa = new Map({
      target: contenedor.current!,
      layers: [
        new TileLayer({
          source: new XYZ({
            url: ARGENMAP,
            attributions: '<a href="https://www.ign.gob.ar/">Instituto Geográfico Nacional</a>',
          }),
        }),
        ...overlays,
        new VectorLayer({
          source: resaltado.current,
          style: new Style({
            image: new Circle({
              radius: 10,
              fill: new Fill({ color: "rgba(11, 93, 143, 0.15)" }),
              stroke: new Stroke({ color: "#0b5d8f", width: 3 }),
            }),
          }),
        }),
      ],
      overlays: [popup],
      view: new View({ center: fromLonLat([-68.5, -43.7]), zoom: 6 }), // Chubut
    });

    // Capas consultables visibles, en el orden de CAPAS_NODO (los resúmenes antes que el detalle)
    const consultables = () => overlays.filter((c) => c.getVisible());

    mapa.on("singleclick", async (e) => {
      const activas = consultables();
      if (activas.length === 0) return;
      const id = ++ultimaConsulta.current;
      popup.setPosition(e.coordinate);
      setConsulta({ estado: "cargando" });
      setGeometrias([]);
      setIndice(0);

      const resolucion = mapa.getView().getResolution()!;
      try {
        const porCapa = await Promise.all(
          activas.map(async (capa) => {
            const nodo = CAPAS_NODO.find((c) => capas.current[c.nombre] === capa)!;
            const url = capa.getSource()!.getFeatureInfoUrl(e.coordinate, resolucion, "EPSG:3857", {
              INFO_FORMAT: "application/json",
              FEATURE_COUNT: 50,
              BUFFER: 6, // tolerancia en píxeles para acertar a los puntos
            })!;
            const r = await fetch(url);
            if (!r.ok) throw new Error(`GetFeatureInfo ${r.status}`);
            return geojson.readFeatures(await r.json()).map((f) => ({
              resultado: { capa: nodo, propiedades: f.getProperties() as Record<string, string | number | null> },
              geometria: f.getGeometry() as Point,
            }));
          }),
        );
        if (id !== ultimaConsulta.current) return; // llegó una consulta más nueva
        const todos = porCapa.flat();
        setConsulta({ estado: "listo", resultados: todos.map((t) => t.resultado) });
        setGeometrias(todos.map((t) => t.geometria));
      } catch {
        if (id === ultimaConsulta.current) setConsulta({ estado: "error" });
      }
    });

    // Cursor de mano sobre los puntos: se mira el píxel de las teselas ya dibujadas
    mapa.on("pointermove", (e) => {
      if (e.dragging) return;
      const sobrePunto = consultables().some((c) => {
        const dato = c.getData(e.pixel) as Uint8ClampedArray | null;
        return dato != null && dato[3] > 0;
      });
      contenedor.current!.style.cursor = sobrePunto ? "pointer" : "";
    });

    return () => mapa.setTarget(undefined);
  }, [nodoPopup]);

  // El popup y el resaltado siguen al resultado que se está mirando
  useEffect(() => {
    resaltado.current.clear();
    const punto = geometrias[indice];
    if (!punto) return;
    resaltado.current.addFeature(new Feature(punto));
    overlay.current?.setPosition(punto.getCoordinates());
  }, [geometrias, indice]);

  function cerrar() {
    ultimaConsulta.current++;
    overlay.current?.setPosition(undefined);
    setConsulta(null);
    setGeometrias([]);
  }

  useEffect(() => {
    if (!consulta) return;
    const teclado = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    window.addEventListener("keydown", teclado);
    return () => window.removeEventListener("keydown", teclado);
  }, [consulta]);

  function alternar(nombre: string) {
    const visible = !visibles[nombre];
    capas.current[nombre]?.setVisible(visible);
    setVisibles({ ...visibles, [nombre]: visible });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
      <aside className="flex shrink-0 flex-col gap-4 border-b border-borde bg-superficie p-4 sm:w-72 sm:border-r sm:border-b-0">
        <h2 className="m-0 text-xs font-semibold uppercase tracking-wider text-tenue">Capas</h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {CAPAS_NODO.map((c) => (
            <li key={c.nombre}>
              <label
                className={
                  "flex cursor-pointer items-center gap-3 rounded-lg border bg-fondo px-3 py-2.5 transition-colors " +
                  (visibles[c.nombre] ? "border-acento/40" : "border-borde opacity-70 hover:opacity-100")
                }
              >
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-acento"
                  checked={visibles[c.nombre]}
                  onChange={() => alternar(c.nombre)}
                />
                <span className="flex-1 text-sm leading-tight">{c.titulo}</span>
                {/* eslint-disable-next-line @next/next/no-img-element -- leyenda dinámica de GeoServer */}
                <img src={leyenda(c.nombre)} alt="" width={14} height={14} className="shrink-0" />
              </label>
            </li>
          ))}
        </ul>
        <p className="m-0 flex items-start gap-2 text-xs leading-relaxed text-tenue">
          <svg viewBox="0 0 20 20" fill="currentColor" className="mt-px size-4 shrink-0" aria-hidden>
            <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 4a1 1 0 110 2 1 1 0 010-2zm1 8H9V9h2v5z" />
          </svg>
          Hacé clic sobre un punto del mapa para ver sus datos.
        </p>
      </aside>
      <div ref={contenedor} className="min-h-[60vh] flex-1" />
      {consulta &&
        createPortal(
          <FichaConsulta consulta={consulta} indice={indice} onIndice={setIndice} onCerrar={cerrar} />,
          nodoPopup,
        )}
    </div>
  );
}
