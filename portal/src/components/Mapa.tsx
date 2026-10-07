"use client";

import { useEffect, useRef, useState } from "react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import XYZ from "ol/source/XYZ";
import TileWMS from "ol/source/TileWMS";
import { fromLonLat } from "ol/proj";
import "ol/ol.css";
import { CAPAS_NODO, PUBLIC_GEOSERVER } from "@/lib/config";

// Mapa base del IGN (Argenmap), recomendado para organismos argentinos
const ARGENMAP =
  "https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{-y}.png";

export default function Mapa() {
  const contenedor = useRef<HTMLDivElement>(null);
  const capas = useRef<Record<string, TileLayer>>({});
  const [visibles, setVisibles] = useState<Record<string, boolean>>(
    Object.fromEntries(CAPAS_NODO.map((c) => [c.nombre, true])),
  );

  useEffect(() => {
    const overlays = CAPAS_NODO.map((c) => {
      const capa = new TileLayer({
        source: new TileWMS({
          url: `${PUBLIC_GEOSERVER}/wms`,
          params: { LAYERS: c.nombre, TILED: true },
          serverType: "geoserver",
        }),
      });
      capas.current[c.nombre] = capa;
      return capa;
    });

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
      ],
      view: new View({ center: fromLonLat([-68.5, -43.7]), zoom: 6 }), // Chubut
    });
    return () => mapa.setTarget(undefined);
  }, []);

  function alternar(nombre: string) {
    const visible = !visibles[nombre];
    capas.current[nombre]?.setVisible(visible);
    setVisibles({ ...visibles, [nombre]: visible });
  }

  return (
    <div className="visor">
      <aside className="panel">
        <h2>Capas</h2>
        {CAPAS_NODO.map((c) => (
          <label key={c.nombre}>
            <input type="checkbox" checked={visibles[c.nombre]} onChange={() => alternar(c.nombre)} />
            {c.titulo}
          </label>
        ))}
      </aside>
      <div ref={contenedor} className="mapa" />
    </div>
  );
}
