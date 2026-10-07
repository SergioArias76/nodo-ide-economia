"use client";

import type { CapaNodo } from "@/lib/config";

export type Resultado = {
  capa: CapaNodo;
  propiedades: Record<string, string | number | null>;
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

// Sin preflight de Tailwind: los márgenes y bordes por defecto del navegador se anulan a mano.
const boton =
  "m-0 inline-flex cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-1 text-tenue " +
  "transition-colors hover:bg-superficie hover:text-texto disabled:cursor-default disabled:opacity-30 " +
  "disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-acento";

function Icono({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-4" aria-hidden>
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const capitalizar = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export default function FichaConsulta({ consulta, indice, onIndice, onCerrar }: Props) {
  const resultados = consulta.estado === "listo" ? consulta.resultados : [];
  const actual = resultados[indice];

  return (
    <div
      role="dialog"
      aria-label="Datos del punto consultado"
      className="relative w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-borde bg-fondo text-sm text-texto shadow-xl"
    >
      <div className="flex items-start justify-between gap-2 border-b border-borde py-2.5 pl-4 pr-2">
        <div className="min-w-0">
          {actual ? (
            <>
              <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-acento">{actual.capa.titulo}</p>
              <h3 className="m-0 text-[15px] font-semibold leading-snug break-words">
                {String(actual.propiedades[actual.capa.atributoTitulo] ?? "Sin nombre")}
              </h3>
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
        <button type="button" className={boton} onClick={onCerrar} aria-label="Cerrar">
          <Icono d="M5 5l10 10M15 5L5 15" />
        </button>
      </div>

      {actual && (
        <dl className="m-0 max-h-64 space-y-2.5 overflow-y-auto px-4 py-3">
          {actual.capa.campos.map((c) => {
            const crudo = actual.propiedades[c.atributo];
            if (crudo == null || crudo === "") return null;
            return (
              <div key={c.atributo}>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-tenue">{c.etiqueta}</dt>
                <dd className="m-0 mt-0.5">
                  {c.lista ? (
                    <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
                      {String(crudo)
                        .split(" | ")
                        .map((v) => (
                          <li key={v} className="rounded-full bg-superficie px-2 py-0.5 text-xs">
                            {capitalizar(v)}
                          </li>
                        ))}
                    </ul>
                  ) : (
                    (c.formato?.(crudo) ?? String(crudo))
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {resultados.length > 1 && (
        <div className="flex items-center justify-between border-t border-borde px-2 py-1.5">
          <button
            type="button"
            className={boton}
            onClick={() => onIndice(indice - 1)}
            disabled={indice === 0}
            aria-label="Resultado anterior"
          >
            <Icono d="M12.5 15l-5-5 5-5" />
          </button>
          <span className="text-xs text-tenue tabular-nums">
            {indice + 1} de {resultados.length.toLocaleString("es-AR")}
          </span>
          <button
            type="button"
            className={boton}
            onClick={() => onIndice(indice + 1)}
            disabled={indice === resultados.length - 1}
            aria-label="Resultado siguiente"
          >
            <Icono d="M7.5 5l5 5-5 5" />
          </button>
        </div>
      )}

      {/* Pico que apunta al lugar consultado */}
      <div className="absolute -bottom-[7px] left-1/2 size-3 -translate-x-1/2 rotate-45 border-r border-b border-borde bg-fondo" />
    </div>
  );
}
