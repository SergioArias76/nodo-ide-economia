import type { Metadata } from "next";
import UbicacionesCliente from "@/components/ubicaciones/UbicacionesCliente";

export const metadata: Metadata = { title: "Ubicación de proveedores", robots: { index: false, follow: false } };

export default function Ubicaciones() {
  return <UbicacionesCliente />;
}
