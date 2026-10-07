import type { Metadata } from "next";
import MapaCliente from "@/components/MapaCliente";

export const metadata: Metadata = { title: "Visor" };

export default function Visor() {
  return <MapaCliente />;
}
