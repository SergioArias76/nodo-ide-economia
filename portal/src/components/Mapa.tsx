"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Map from "ol/Map";
import View from "ol/View";
import Overlay from "ol/Overlay";
import TileLayer from "ol/layer/Tile";
import ImageLayer from "ol/layer/Image";
import VectorLayer from "ol/layer/Vector";
import XYZ from "ol/source/XYZ";
import ImageWMS from "ol/source/ImageWMS";
import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { Circle, Fill, Stroke, Style } from "ol/style";
import { fromLonLat } from "ol/proj";
import "ol/ol.css";
import { BASE_INICIAL, CAPAS_NODO, MAPAS_BASE, PUBLIC_GEOSERVER, miniatura, type CapaNodo } from "@/lib/config";
import FichaConsulta, { type Consulta } from "./FichaConsulta";

// Leyenda dibujada en el portal: GeoServer no puede graficar símbolos de tamaño variable
function Simbolo({ color, proporcional }: CapaNodo["simbolo"]) {
  const circulo = (r: number, cx: number, cy: number, opacidad = 1) => (
    <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={opacidad} stroke="#fff" strokeWidth={1} />
  );
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0" aria-hidden>
      {proporcional ? (
        <>
          {circulo(7.5, 11.5, 11.5, 0.6)}
          {circulo(3.5, 5, 15, 0.6)}
        </>
      ) : (
        circulo(4.5, 10, 10)
      )}
    </svg>
  );
}

const geojson = new GeoJSON(); // GetFeatureInfo devuelve la geometría en la proyección del mapa

export default function Mapa() {
  const contenedor = useRef<HTMLDivElement>(null);
  const capas = useRef<Record<string, ImageLayer<ImageWMS>>>({});
  const bases = useRef<Record<string, TileLayer<XYZ>>>({});
  const [base, setBase] = useState(BASE_INICIAL);
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
      const capa = new ImageLayer({
        // Imagen única (no teselas): GeoServer no corta las etiquetas en los bordes
        source: new ImageWMS({
          url: `${PUBLIC_GEOSERVER}/wms`,
          params: { LAYERS: c.nombre },
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
        ...MAPAS_BASE.map((b) => {
          const capa = new TileLayer({ visible: b.id === BASE_INICIAL, source: new XYZ({ url: b.url, attributions: b.atribucion }) });
          bases.current[b.id] = capa;
          return capa;
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

    // Cursor de mano sobre los puntos: se mira el píxel de la imagen ya dibujada
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

  function elegirBase(id: string) {
    for (const [clave, capa] of Object.entries(bases.current)) capa.setVisible(clave === id);
    setBase(id);
  }

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
                <span className="flex-1 text-sm leading-tight">
                  {c.titulo}
                  {c.nota && <span className="mt-0.5 block text-xs text-tenue">{c.nota}</span>}
                </span>
                <Simbolo {...c.simbolo} />
              </label>
            </li>
          ))}
        </ul>
        <h2 className="m-0 mt-2 text-xs font-semibold uppercase tracking-wider text-tenue">Mapa base</h2>
        <div role="radiogroup" aria-label="Mapa base" className="grid grid-cols-2 gap-2">
          {MAPAS_BASE.map((b) => (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={base === b.id}
              onClick={() => elegirBase(b.id)}
              className={
                "m-0 cursor-pointer overflow-hidden rounded-lg border-2 bg-fondo p-0 text-left text-texto transition-colors " +
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento " +
                (base === b.id ? "border-acento" : "border-borde hover:border-tenue")
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- tesela externa de muestra */}
              <img src={miniatura(b)} alt="" className="block h-14 w-full object-cover" loading="lazy" />
              <span className={"block px-2 py-1 text-xs " + (base === b.id ? "font-semibold" : "")}>{b.titulo}</span>
            </button>
          ))}
        </div>
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
