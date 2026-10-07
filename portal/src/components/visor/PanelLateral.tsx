"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Accessibility, CirclePlus, CircleQuestionMark, Layers, Map as IconoMapa, PanelLeftClose } from "lucide-react";
import Buscador, { type Lugar } from "./Buscador";
import { BotonIcono, tarjeta } from "./ui";
import type { Panel } from "./tipos";

const PANELES = [
  { id: "capas", icono: Layers, etiqueta: "Capas" },
  { id: "base", icono: IconoMapa, etiqueta: "Mapa base" },
  { id: "agregar", icono: CirclePlus, etiqueta: "Agregar capas" },
  { id: "ayuda", icono: CircleQuestionMark, etiqueta: "Ayuda" },
  { id: "accesibilidad", icono: Accessibility, etiqueta: "Accesibilidad" },
] as const;

type Props = {
  panel: Panel | null;
  onPanel: (p: Panel | null) => void;
  onLugar: (l: Lugar) => void;
  children: ReactNode;
};

export default function PanelLateral({ panel, onPanel, onLugar, children }: Props) {
  return (
    <div className="pointer-events-none absolute top-3 bottom-3 left-3 z-20 sm:bottom-16 flex w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-2">
      <header className={`${tarjeta} pointer-events-auto flex items-center gap-3 p-2 pl-3`}>
        <Link href="/" className="flex shrink-0 items-center gap-2 text-texto no-underline" title="Inicio del portal">
          <svg viewBox="0 0 24 24" className="size-7" aria-hidden>
            <path d="M12 2 3 7l9 5 9-5-9-5Z" fill="var(--acento)" />
            <path d="m3 12 9 5 9-5" fill="none" stroke="#e8590c" strokeWidth={2} strokeLinejoin="round" />
            <path d="m3 17 9 5 9-5" fill="none" stroke="var(--tenue)" strokeWidth={2} strokeLinejoin="round" />
          </svg>
          <span className="text-sm leading-none font-bold">
            IDE Economía
            <span className="block text-xs font-semibold text-acento">Chubut</span>
          </span>
        </Link>
        <div className="min-w-0 flex-1">
          <Buscador onElegir={onLugar} />
        </div>
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
            className={`${tarjeta} pointer-events-auto max-h-full min-w-0 flex-1 overflow-y-auto p-3`}
          >
            {children}
          </section>
        )}
      </div>
    </div>
  );
}
