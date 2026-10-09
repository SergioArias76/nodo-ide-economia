"use client";

import { useState } from "react";
import type { Geometry } from "ol/geom";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, LoaderCircle, Maximize2, Minimize2, Table, X } from "lucide-react";
import { csv, type Tabla } from "./analisis";
import { descargarTexto } from "./exportar";
import { BotonIcono, reset, tarjeta } from "./ui";

// Panel de datos a la derecha del mapa, como el del geoportal del INDEC: resultados de estadísticas y
// distancias y tablas de atributos. Columnas ordenables, descarga en CSV y clic en la fila para ir al elemento.
export type EstadoDatos =
  | { estado: "cargando"; titulo: string }
  | { estado: "error"; titulo: string; mensaje: string }
  | { estado: "listo"; tabla: Tabla; otras?: Tabla[] }; // otras: más tablas del mismo resultado, en pestañas

type Props = {
  datos: EstadoDatos;
  ampliado: boolean;
  onAmpliar: () => void;
  onCerrar: () => void;
  onIr: (g: Geometry) => void;
};

const PAGINA = 200;

const comparar = (a: unknown, b: unknown) => {
  if (a == null || a === "") return 1;
  if (b == null || b === "") return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "es", { numeric: true });
};

const nombreArchivo = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "datos";

export default function PanelDatos({ datos, ampliado, onAmpliar, onCerrar, onIr }: Props) {
  const titulo = datos.estado === "listo" ? datos.tabla.titulo : datos.titulo;
  return (
    <aside
      aria-label={`Datos: ${titulo}`}
      className={
        `${tarjeta} pointer-events-auto absolute z-20 flex flex-col overflow-hidden ` +
        "max-sm:inset-x-3 max-sm:bottom-3 max-sm:h-[55dvh] sm:top-3 sm:right-3 sm:bottom-10 " +
        (ampliado ? "sm:w-[50vw]" : "sm:w-[21rem]")
      }
    >
      <header className="flex items-start gap-2 border-b border-borde/70 p-2 pl-3">
        <Table className="mt-1 size-4 shrink-0 text-acento" aria-hidden />
        <h2 className="m-0 min-w-0 flex-1 py-0.5 text-sm leading-snug font-semibold">{titulo}</h2>
        <BotonIcono icono={ampliado ? Minimize2 : Maximize2} etiqueta={ampliado ? "Achicar" : "Ampliar"} tamano="sm" className="max-sm:hidden" onClick={onAmpliar} />
        <BotonIcono icono={X} etiqueta="Cerrar" tamano="sm" onClick={onCerrar} />
      </header>
      {datos.estado === "cargando" && (
        <p className="m-0 flex items-center gap-2 p-3 text-sm text-tenue">
          <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden /> Cargando datos… Algunos servicios nacionales tardan más de medio minuto.
        </p>
      )}
      {datos.estado === "error" && <p className="m-0 p-3 text-sm">{datos.mensaje}</p>}
      {datos.estado === "listo" && <Listo key={datos.tabla.titulo + datos.tabla.filas.length} tablas={[datos.tabla, ...(datos.otras ?? [])]} onIr={onIr} />}
    </aside>
  );
}

function Listo({ tablas, onIr }: { tablas: Tabla[]; onIr: (g: Geometry) => void }) {
  const [activa, setActiva] = useState(0);
  const tabla = tablas[activa];
  return (
    <>
      <div className="flex items-end gap-1 border-b border-borde/70 px-2 pt-1.5">
        {tablas.length > 1 && (
          <div role="tablist" className="flex min-w-0 flex-1 flex-wrap gap-1">
            {tablas.map((t, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === activa}
                onClick={() => setActiva(i)}
                className={
                  `${reset} -mb-px cursor-pointer rounded-t-md border border-b-0 px-2.5 py-1 text-xs ` +
                  (i === activa ? "border-borde/70 bg-fondo font-semibold text-texto" : "border-transparent text-tenue hover:text-texto")
                }
              >
                {t.pestana ?? t.titulo}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => descargarTexto(csv(tabla.columnas, tabla.filas), `${nombreArchivo(tabla.archivo)}.csv`, "text/csv")}
          className={`${reset} mb-1 ml-auto inline-flex shrink-0 cursor-pointer items-center gap-1 text-xs text-acento hover:underline`}
        >
          <Download className="size-3.5" aria-hidden /> CSV
        </button>
      </div>
      <Contenido key={activa} tabla={tabla} onIr={onIr} />
    </>
  );
}

function Contenido({ tabla, onIr }: { tabla: Tabla; onIr: (g: Geometry) => void }) {
  const [orden, setOrden] = useState<{ clave: string; asc: boolean } | null>(null);
  const [mostrar, setMostrar] = useState(PAGINA);
  const [elegida, setElegida] = useState<number | null>(null);

  const indices = tabla.filas.map((_, i) => i);
  if (orden) {
    indices.sort((a, b) => {
      const r = comparar(tabla.filas[a][orden.clave], tabla.filas[b][orden.clave]);
      return orden.asc ? r : -r;
    });
  }
  const visibles = indices.slice(0, mostrar);
  const celda = (i: number, clave: string) => {
    const v = tabla.filas[i][clave];
    const columna = tabla.columnas.find((c) => c.clave === clave)!;
    if (v == null || v === "") return "";
    if (columna.formato) return columna.formato(v);
    return typeof v === "number" ? v.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : String(v);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs text-tenue">
        {tabla.subtitulo && <span>{tabla.subtitulo}</span>}
        <span>
          Total: <b className="text-texto tabular-nums">{tabla.filas.length.toLocaleString("es-AR")}</b>
        </span>
        {tabla.geometrias && <span>Clic en una fila para verla en el mapa</span>}
        {tabla.aviso && <span className="w-full text-texto">{tabla.aviso}</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto border-t border-borde/70">
        {tabla.filas.length === 0 ? (
          <p className="m-0 p-3 text-sm text-tenue">No hay elementos.</p>
        ) : (
          <table className="w-max min-w-full border-collapse text-[0.8125rem] leading-snug">
            <thead className="sticky top-0 z-10 bg-superficie text-left text-xs">
              <tr>
                {tabla.columnas.map((c) => {
                  const activa = orden?.clave === c.clave;
                  const Icono = activa ? (orden.asc ? ArrowUp : ArrowDown) : ArrowUpDown;
                  return (
                    <th key={c.clave} scope="col" aria-sort={activa ? (orden.asc ? "ascending" : "descending") : undefined} className="p-0 font-semibold">
                      <button
                        type="button"
                        onClick={() => setOrden({ clave: c.clave, asc: activa ? !orden.asc : !c.numerico })}
                        className={
                          `${reset} flex w-full cursor-pointer items-center gap-1 px-2.5 py-1.5 whitespace-nowrap hover:bg-borde/40 ` +
                          (c.numerico ? "justify-end text-right " : "text-left ") +
                          (activa ? "text-texto" : "text-tenue")
                        }
                      >
                        {c.etiqueta}
                        <Icono className="size-3 shrink-0" aria-hidden />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibles.map((i) => {
                const g = tabla.geometrias?.[i];
                return (
                  <tr
                    key={i}
                    onClick={g ? () => (setElegida(i), onIr(g)) : undefined}
                    className={
                      "border-t border-borde/60 " +
                      (g ? "cursor-pointer hover:bg-superficie " : "") +
                      (elegida === i ? "bg-acento/10" : "")
                    }
                  >
                    {tabla.columnas.map((c) => (
                      <td key={c.clave} className={"max-w-[14rem] px-2.5 py-1 align-top " + (c.numerico ? "text-right tabular-nums" : "")}>
                        {celda(i, c.clave)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {indices.length > mostrar && (
          <div className="p-2 text-center">
            <button type="button" onClick={() => setMostrar(mostrar + PAGINA)} className={`${reset} cursor-pointer text-xs text-acento hover:underline`}>
              Mostrar {Math.min(PAGINA, indices.length - mostrar).toLocaleString("es-AR")} más (de {indices.length.toLocaleString("es-AR")})
            </button>
          </div>
        )}
      </div>
    </>
  );
}
