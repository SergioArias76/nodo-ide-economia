"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { temaDe } from "@/lib/config";
import { BotonIcono, IconoTema } from "./ui";

export type Resultado = {
  grupo: string; // tema de la capa (define su franja de color)
  capa: string; // título de la capa
  titulo: string; // encabezado de la ficha
  campos: { etiqueta: string; valor: string | string[] }[];
};

export type Consulta =
  | { estado: "cargando" }
  | { estado: "error" }
  | { estado: "listo"; resultados: Resultado[] };

type Props = {
  consulta: Consulta;
  indice: number;
  onIndice: (i: number) => void;
  onCerrar: () => void;
};

export default function FichaConsulta({ consulta, indice, onIndice, onCerrar }: Props) {
  const resultados = consulta.estado === "listo" ? consulta.resultados : [];
  const actual = resultados[indice];

  return (
    <div
      role="dialog"
      aria-label="Datos del punto consultado"
      className="relative w-80 max-w-[calc(100vw-2rem)] origin-bottom animate-[ficha-aparece_200ms_cubic-bezier(0.16,1,0.3,1)] rounded-xl border border-borde/70 bg-fondo text-sm text-texto shadow-tarjeta"
    >
      {/* Franja del tema: recortada por una capa con el redondeado de la tarjeta (la ficha no puede
          llevar overflow-hidden porque cortaría el pico) */}
      {actual && (
        <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[11px]">
          <span className="block h-[3px]" style={{ background: temaDe(actual.grupo).color }} />
        </span>
      )}
      <div className="flex items-start justify-between gap-2 border-b border-borde py-2.5 pr-2 pl-4">
        <div className="min-w-0">
          {actual ? (
            <>
              <h3 className="m-0 text-[0.9375rem] leading-snug font-semibold break-words">{actual.titulo}</h3>
              <p className="m-0 mt-1 flex items-center gap-1.5 text-xs text-tenue">
                <IconoTema grupo={actual.grupo} chico />
                <span className="min-w-0 truncate">{actual.capa}</span>
              </p>
            </>
          ) : (
            <p className="m-0 py-0.5 text-tenue">
              {consulta.estado === "cargando" && (
                <span className="inline-flex items-center gap-2">
                  <span className="size-3.5 animate-spin rounded-full border-2 border-borde border-t-acento" />
                  Consultando…
                </span>
              )}
              {consulta.estado === "error" && "No se pudo consultar el servicio."}
              {consulta.estado === "listo" && "No hay datos en este punto."}
            </p>
          )}
        </div>
        <BotonIcono icono={X} etiqueta="Cerrar" tamano="sm" onClick={onCerrar} className="text-tenue" />
      </div>

      {actual && (
        <dl className="m-0 max-h-64 space-y-2.5 overflow-y-auto px-4 py-3">
          {actual.campos.map((c) => (
            <div key={c.etiqueta}>
              <dt className="text-xs text-tenue">{c.etiqueta}</dt>
              <dd className="m-0 mt-0.5 break-words">
                {Array.isArray(c.valor) ? (
                  <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
                    {c.valor.map((v) => (
                      <li key={v} className="rounded-full bg-superficie px-2 py-0.5 text-xs">
                        {v}
                      </li>
                    ))}
                  </ul>
                ) : (
                  c.valor
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {resultados.length > 1 && (
        <div className="flex items-center justify-between border-t border-borde px-2 py-1.5">
          <BotonIcono
            icono={ChevronLeft}
            etiqueta="Resultado anterior"
            tamano="sm"
            onClick={() => onIndice(indice - 1)}
            disabled={indice === 0}
          />
          <span className="text-xs text-tenue tabular-nums">
            {indice + 1} de {resultados.length.toLocaleString("es-AR")}
          </span>
          <BotonIcono
            icono={ChevronRight}
            etiqueta="Resultado siguiente"
            tamano="sm"
            onClick={() => onIndice(indice + 1)}
            disabled={indice === resultados.length - 1}
          />
        </div>
      )}

      {/* Pico que apunta al lugar consultado */}
      <div className="absolute -bottom-[7px] left-1/2 size-3 -translate-x-1/2 rotate-45 border-r border-b border-borde bg-fondo" />
    </div>
  );
}
