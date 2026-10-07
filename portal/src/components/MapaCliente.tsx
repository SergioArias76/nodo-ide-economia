"use client";

import dynamic from "next/dynamic";

// OpenLayers usa APIs del navegador: se carga solo en el cliente.
const Mapa = dynamic(() => import("./Mapa"), {
  ssr: false,
  loading: () => <p className="cargando">Cargando mapa…</p>,
});

export default function MapaCliente() {
  return <Mapa />;
}
