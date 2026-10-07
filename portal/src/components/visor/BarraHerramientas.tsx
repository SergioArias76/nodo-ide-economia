"use client";

import { useState } from "react";
import {
  Camera, Circle, Download, Grid3x3, LocateFixed, MapPin, Maximize, Minimize, Pencil, PenLine, Pentagon, Printer,
  Ruler, Spline, Square, SquareDashed, Trash, Type, Eraser, LoaderCircle,
} from "lucide-react";
import { BotonIcono, botonPrimario, campo, reset, tarjeta } from "./ui";
import type { Modo } from "./tipos";

type Props = {
  modo: Modo | null;
  onModo: (m: Modo | null) => void;
  cantidad: number;
  grilla: boolean;
  onGrilla: () => void;
  pantallaCompleta: boolean;
  onPantallaCompleta: () => void;
  onUbicacion: () => void;
  ubicando: boolean;
  onCaptura: () => void;
  onImprimir: (titulo: string, orientacion: "landscape" | "portrait") => Promise<void>;
  onBorrarTodo: () => void;
  onExportar: () => void;
};

const DIBUJO = [
  { modo: "dibujar-punto", icono: MapPin, etiqueta: "Punto" },
  { modo: "dibujar-linea", icono: Spline, etiqueta: "Línea" },
  { modo: "dibujar-poligono", icono: Pentagon, etiqueta: "Polígono" },
  { modo: "dibujar-rectangulo", icono: Square, etiqueta: "Rectángulo" },
  { modo: "dibujar-circulo", icono: Circle, etiqueta: "Círculo" },
  { modo: "dibujar-texto", icono: Type, etiqueta: "Texto" },
  { modo: "editar", icono: PenLine, etiqueta: "Editar dibujos y mediciones" },
  { modo: "borrar", icono: Eraser, etiqueta: "Borrar (clic sobre el elemento)" },
] as const;

const separador = <span className="mx-0.5 h-6 w-px shrink-0 bg-borde" aria-hidden />;

export default function BarraHerramientas(p: Props) {
  const [dibujo, setDibujo] = useState(false);
  const [impresion, setImpresion] = useState(false);
  const [titulo, setTitulo] = useState("Proveedores del Estado provincial");
  const [orientacion, setOrientacion] = useState<"landscape" | "portrait">("landscape");
  const [imprimiendo, setImprimiendo] = useState(false);
  const alternar = (m: Modo) => p.onModo(p.modo === m ? null : m);

  return (
    <div className="pointer-events-none absolute top-3 right-3 z-10 max-sm:top-[4.5rem] flex flex-col items-end gap-2">
      <div role="toolbar" aria-label="Herramientas" className={`${tarjeta} pointer-events-auto flex flex-wrap items-center justify-end gap-0.5 p-1`}>
        <BotonIcono icono={Ruler} etiqueta="Medir distancia" activo={p.modo === "medir-distancia"} onClick={() => alternar("medir-distancia")} />
        <BotonIcono icono={SquareDashed} etiqueta="Medir superficie" activo={p.modo === "medir-area"} onClick={() => alternar("medir-area")} />
        {separador}
        <BotonIcono
          icono={p.ubicando ? LoaderCircle : LocateFixed}
          etiqueta="Mi ubicación"
          onClick={p.onUbicacion}
          className={p.ubicando ? "[&_svg]:animate-spin" : ""}
        />
        <BotonIcono icono={Grid3x3} etiqueta="Grilla de coordenadas" activo={p.grilla} onClick={p.onGrilla} />
        <BotonIcono
          icono={p.pantallaCompleta ? Minimize : Maximize}
          etiqueta={p.pantallaCompleta ? "Salir de pantalla completa" : "Pantalla completa"}
          onClick={p.onPantallaCompleta}
        />
        {separador}
        <BotonIcono icono={Camera} etiqueta="Captura del mapa (PNG)" onClick={p.onCaptura} />
        <BotonIcono icono={Printer} etiqueta="Imprimir (PDF)" activo={impresion} onClick={() => setImpresion(!impresion)} />
        {separador}
        <BotonIcono
          icono={Pencil}
          etiqueta="Dibujar"
          activo={dibujo}
          onClick={() => {
            if (dibujo && p.modo && p.modo !== "medir-distancia" && p.modo !== "medir-area") p.onModo(null);
            setDibujo(!dibujo);
          }}
        />
      </div>

      {impresion && (
        <form
          className={`${tarjeta} pointer-events-auto flex w-72 flex-col gap-2.5 p-3`}
          onSubmit={async (e) => {
            e.preventDefault();
            setImprimiendo(true);
            try {
              await p.onImprimir(titulo, orientacion);
              setImpresion(false);
            } finally {
              setImprimiendo(false);
            }
          }}
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-tenue">
            Título del mapa
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={campo} />
          </label>
          <fieldset className="m-0 flex gap-3 border-0 p-0 text-sm">
            <legend className="mb-1 p-0 text-xs font-medium text-tenue">Hoja A4</legend>
            {(["landscape", "portrait"] as const).map((o) => (
              <label key={o} className="flex cursor-pointer items-center gap-1.5">
                <input type="radio" name="orientacion" checked={orientacion === o} onChange={() => setOrientacion(o)} className="m-0 accent-acento" />
                {o === "landscape" ? "Horizontal" : "Vertical"}
              </label>
            ))}
          </fieldset>
          <button type="submit" className={botonPrimario} disabled={imprimiendo}>
            {imprimiendo ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Printer className="size-4" aria-hidden />}
            Generar PDF
          </button>
        </form>
      )}

      {dibujo && (
        <div role="toolbar" aria-label="Dibujo" aria-orientation="vertical" className={`${tarjeta} pointer-events-auto flex flex-col gap-0.5 p-1`}>
          {DIBUJO.map((d) => (
            <BotonIcono key={d.modo} icono={d.icono} etiqueta={d.etiqueta} activo={p.modo === d.modo} onClick={() => alternar(d.modo)} />
          ))}
          <span className="mx-auto my-0.5 h-px w-6 bg-borde" aria-hidden />
          <BotonIcono icono={Download} etiqueta="Descargar dibujos (GeoJSON)" disabled={p.cantidad === 0} onClick={p.onExportar} />
          <BotonIcono icono={Trash} etiqueta="Borrar todo" disabled={p.cantidad === 0} onClick={p.onBorrarTodo} />
        </div>
      )}

      {p.modo && <AvisoModo modo={p.modo} onSalir={() => p.onModo(null)} />}
    </div>
  );
}

const AVISOS: Record<Modo, string> = {
  "medir-distancia": "Clic para agregar puntos, doble clic para terminar.",
  "medir-area": "Clic para agregar vértices, doble clic para cerrar.",
  "dibujar-punto": "Clic en el mapa para marcar un punto.",
  "dibujar-linea": "Clic para agregar puntos, doble clic para terminar.",
  "dibujar-poligono": "Clic para agregar vértices, doble clic para cerrar.",
  "dibujar-rectangulo": "Clic en una esquina y otro clic en la opuesta.",
  "dibujar-circulo": "Clic en el centro y otro clic para el radio.",
  "dibujar-texto": "Clic donde querés ubicar el texto.",
  editar: "Arrastrá los vértices para modificar.",
  borrar: "Clic sobre el dibujo o la medición a borrar.",
};

function AvisoModo({ modo, onSalir }: { modo: Modo; onSalir: () => void }) {
  return (
    <div role="status" className="pointer-events-auto flex max-w-xs items-center gap-2 rounded-lg bg-[#1f2933]/90 py-1.5 pr-1.5 pl-3 text-xs text-white shadow-lg">
      {AVISOS[modo]}
      <button
        type="button"
        onClick={onSalir}
        className={`${reset} shrink-0 cursor-pointer rounded-md bg-white/15 px-2 py-1 font-semibold hover:bg-white/25`}
      >
        Terminar
      </button>
    </div>
  );
}
