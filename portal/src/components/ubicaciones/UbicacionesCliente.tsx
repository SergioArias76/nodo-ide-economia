"use client";

import dynamic from "next/dynamic";

// OpenLayers usa APIs del navegador: se carga solo en el cliente.
const Ubicaciones = dynamic(() => import("./Ubicaciones"), {
  ssr: false,
  loading: () => <p className="cargando m-0 p-4">Cargando…</p>,
});

export default function UbicacionesCliente() {
  return <Ubicaciones />;
}
