import type Layer from "ol/layer/Layer";
import type { Extent } from "ol/extent";
import type { CapaNodo } from "@/lib/config";

// Una capa superpuesta del visor: del nodo, de un WMS externo o de un archivo del usuario
export type CapaVisor = {
  id: string;
  titulo: string;
  grupo: string;
  origen: "nodo" | "wms" | "archivo";
  capa: Layer;
  visible: boolean;
  opacidad: number; // 0 a 1
  extension?: Extent; // EPSG:3857, para "zoom a la capa"
  leyenda?: string; // URL de GetLegendGraphic (capas externas)
  color?: string; // capas de archivo
  nodo?: CapaNodo; // configuración propia (ficha de consulta y símbolo)
};

export type Panel = "capas" | "base" | "agregar" | "ayuda" | "accesibilidad";

export type Modo =
  | "medir-distancia"
  | "medir-area"
  | "dibujar-punto"
  | "dibujar-linea"
  | "dibujar-poligono"
  | "dibujar-rectangulo"
  | "dibujar-circulo"
  | "dibujar-texto"
  | "editar"
  | "borrar";

// Orden de dibujo de las capas
export const Z = { base: 0, superpuesta: 10, grilla: 40, dibujo: 50, resaltado: 60 } as const;
