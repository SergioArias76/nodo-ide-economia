"use client";

import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

// Los botones parten del reset de globals.css (sin preflight de Tailwind)
export const reset = "appearance-none";

export const tarjeta = "rounded-xl border border-borde bg-fondo text-texto shadow-lg";

export const campo =
  "m-0 w-full rounded-md border border-borde bg-fondo px-2.5 py-1.5 text-sm text-texto " +
  "placeholder:text-tenue focus:border-acento focus:outline-none focus:ring-2 focus:ring-acento/30";

export const botonPrimario =
  `${reset} inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md bg-acento px-3 py-1.5 ` +
  "text-sm font-medium text-acento-texto transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-50";

export const botonSecundario =
  `${reset} inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-borde px-3 py-1.5 ` +
  "text-sm transition-colors hover:bg-superficie disabled:cursor-default disabled:opacity-50";

type BotonIconoProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icono: LucideIcon;
  etiqueta: string; // texto accesible y tooltip
  activo?: boolean;
  tamano?: "sm" | "md";
};

// Botón cuadrado con ícono, como los de la barra de herramientas
export function BotonIcono({ icono: Icono, etiqueta, activo, tamano = "md", className = "", ...resto }: BotonIconoProps) {
  return (
    <button
      type="button"
      title={etiqueta}
      aria-label={etiqueta}
      aria-pressed={activo}
      className={
        `${reset} inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors ` +
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-acento disabled:cursor-default disabled:opacity-40 " +
        (tamano === "md" ? "size-9 " : "size-7 ") +
        (activo ? "bg-acento text-acento-texto " : "text-texto hover:bg-superficie ") +
        className
      }
      {...resto}
    >
      <Icono className={tamano === "md" ? "size-[1.15rem]" : "size-4"} strokeWidth={1.9} aria-hidden />
    </button>
  );
}

export function Titulo({ children, accion }: { children: ReactNode; accion?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="m-0 text-xs font-semibold uppercase tracking-wider text-tenue">{children}</h2>
      {accion}
    </div>
  );
}
