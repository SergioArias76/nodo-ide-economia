"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Accessibility, CirclePlus, CircleQuestionMark, Cog, Layers, Map as IconoMapa, Moon, PanelLeftClose, Sun } from "lucide-react";
import { elegirTema, useTema } from "@/lib/tema";
import Buscador, { type Lugar } from "./Buscador";
import { BotonIcono, tarjeta } from "./ui";
import type { Panel } from "./tipos";

const PANELES = [
  { id: "capas", icono: Layers, etiqueta: "Capas" },
  { id: "base", icono: IconoMapa, etiqueta: "Mapa base" },
  { id: "agregar", icono: CirclePlus, etiqueta: "Agregar capas" },
  { id: "analisis", icono: Cog, etiqueta: "Análisis geográfico" },
  { id: "ayuda", icono: CircleQuestionMark, etiqueta: "Ayuda" },
  { id: "accesibilidad", icono: Accessibility, etiqueta: "Accesibilidad" },
] as const;

type Props = {
  panel: Panel | null;
  onPanel: (p: Panel | null) => void;
  onLugar: (l: Lugar) => void;
  minimizado?: boolean; // en el celular el panel se oculta (sin desmontarse) mientras se dibuja en el mapa
  children: ReactNode;
};

export default function PanelLateral({ panel, onPanel, onLugar, minimizado, children }: Props) {
  const { oscuro } = useTema();
  return (
    <div className="pointer-events-none absolute top-3 bottom-3 left-3 z-20 sm:bottom-16 flex w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-2">
      <header className={`${tarjeta} pointer-events-auto relative flex flex-col gap-2.5 overflow-hidden p-3 pt-[calc(0.75rem+3px)]`}>
        {/* Las seis franjas del isotipo, de sol a mar */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{
            background:
              "linear-gradient(90deg, var(--sol) 0 16.66%, var(--sol-2) 0 33.33%, var(--meseta) 0 50%, var(--meseta-2) 0 66.66%, var(--mar) 0 83.33%, var(--mar-2) 0)",
          }}
        />
        <Link href="/" className="flex items-center gap-2.5 self-start text-texto no-underline" title="Inicio del portal IDE">
          {/* eslint-disable-next-line @next/next/no-img-element -- isotipo oficial en SVG */}
          <img src="/marca/isotipo.svg" alt="" className="-my-1.5 size-11 shrink-0" />
          <span className="font-marca leading-[1.1]">
            <span className="block text-[0.95rem] font-semibold">Ministerio de Economía</span>
            <span className="block text-xs font-medium text-tenue">Gobierno del Chubut · IDE</span>
          </span>
        </Link>
        <Buscador onElegir={onLugar} />
      </header>

      <div className="flex min-h-0 flex-1 items-start gap-2">
        <nav aria-label="Paneles" className={`${tarjeta} pointer-events-auto flex flex-col gap-1 p-1`}>
          {PANELES.map((p) => (
            <BotonIcono
              key={p.id}
              icono={p.icono}
              etiqueta={p.etiqueta}
              activo={panel === p.id}
              onClick={() => onPanel(panel === p.id ? null : p.id)}
            />
          ))}
          {/* Cambio rápido de tema; "según el sistema" se elige en Accesibilidad */}
          <BotonIcono
            icono={oscuro ? Sun : Moon}
            etiqueta={oscuro ? "Usar modo claro" : "Usar modo oscuro"}
            onClick={() => elegirTema(oscuro ? "claro" : "oscuro")}
          />
          {panel && (
            <>
              <span className="mx-auto my-0.5 h-px w-6 bg-borde" aria-hidden />
              <BotonIcono icono={PanelLeftClose} etiqueta="Ocultar panel" onClick={() => onPanel(null)} />
            </>
          )}
        </nav>
        {panel && (
          <section
            aria-label={PANELES.find((p) => p.id === panel)?.etiqueta}
            className={`${tarjeta} pointer-events-auto max-h-full min-w-0 flex-1 overflow-y-auto p-3 ${minimizado ? "max-sm:hidden" : ""}`}
          >
            {children}
          </section>
        )}
      </div>
    </div>
  );
}
