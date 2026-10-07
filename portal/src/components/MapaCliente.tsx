"use client";

import dynamic from "next/dynamic";

// OpenLayers usa APIs del navegador: se carga solo en el cliente.
const Visor = dynamic(() => import("./visor/Visor"), {
  ssr: false,
  loading: () => <p className="cargando m-0 p-4">Cargando visor…</p>,
});

export default function MapaCliente() {
  return <Visor />;
}
