"use client";

import { useEffect, useState } from "react";
import {
  Camera, CirclePlus, Grid3x3, Layers, Link, LocateFixed, Map as IconoMapa, Maximize, MousePointerClick, PenLine,
  Monitor, Moon, Printer, Ruler, Search, SquareDashed, Sun,
} from "lucide-react";
import { MAPAS_BASE, SIN_BASE, miniatura } from "@/lib/config";
import { elegirTema, useTema, type Tema } from "@/lib/tema";
import { Titulo, reset } from "./ui";

export function PanelMapasBase({ base, onElegir }: { base: string; onElegir: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <Titulo>Mapa base</Titulo>
      <div role="radiogroup" aria-label="Mapa base" className="grid grid-cols-2 gap-2">
        {MAPAS_BASE.map((b) => (
          <button
            key={b.id}
            type="button"
            role="radio"
            aria-checked={base === b.id}
            onClick={() => onElegir(b.id)}
            className={
              `${reset} cursor-pointer overflow-hidden rounded-lg border-2 bg-fondo text-left transition-colors ` +
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento " +
              (base === b.id ? "border-acento" : "border-borde hover:border-tenue")
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- tesela externa de muestra */}
            <img src={miniatura(b)} alt="" className="block h-16 w-full object-cover" loading="lazy" />
            <span className={"block px-2 py-1 text-xs " + (base === b.id ? "font-semibold" : "")}>{b.titulo}</span>
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={base === SIN_BASE}
          onClick={() => onElegir(SIN_BASE)}
          className={
            `${reset} cursor-pointer overflow-hidden rounded-lg border-2 bg-fondo text-left transition-colors ` +
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento " +
            (base === SIN_BASE ? "border-acento" : "border-borde hover:border-tenue")
          }
        >
          <span aria-hidden className="grid h-16 w-full place-items-center bg-superficie text-tenue">
            <SquareDashed className="size-6" strokeWidth={1.6} />
          </span>
          <span className={"block px-2 py-1 text-xs " + (base === SIN_BASE ? "font-semibold" : "")}>Sin mapa base</span>
        </button>
      </div>
    </div>
  );
}

const AYUDA = [
  { icono: Search, titulo: "Buscar localidad", texto: "Escribí el nombre en el buscador de arriba y elegí un resultado." },
  { icono: MousePointerClick, titulo: "Consultar", texto: "Hacé clic sobre un elemento del mapa para ver sus datos." },
  { icono: Layers, titulo: "Capas", texto: "Prendé o apagá capas, cambiá su opacidad o acercate a su extensión." },
  { icono: IconoMapa, titulo: "Mapa base", texto: "Elegí el fondo: OpenStreetMap, Argenmap del IGN o ninguno." },
  { icono: Moon, titulo: "Modo claro u oscuro", texto: "Cambialo con el botón de luna o sol de la barra; en Accesibilidad podés volver al del sistema." },
  { icono: CirclePlus, titulo: "Agregar capas", texto: "Sumá capas de otros servicios WMS o abrí archivos GeoJSON, KML, GPX o Shapefile." },
  { icono: Ruler, titulo: "Medir", texto: "Distancias y superficies. Doble clic termina la medición." },
  { icono: LocateFixed, titulo: "Mi ubicación", texto: "Centra el mapa en tu posición (el navegador pide permiso)." },
  { icono: Grid3x3, titulo: "Grilla", texto: "Muestra meridianos y paralelos con sus coordenadas." },
  { icono: Maximize, titulo: "Pantalla completa", texto: "Amplía el visor a toda la pantalla." },
  { icono: Camera, titulo: "Captura", texto: "Descarga una imagen PNG de lo que se ve en el mapa." },
  { icono: Printer, titulo: "Imprimir", texto: "Genera un PDF A4 con título, escala, capas y fuentes." },
  { icono: PenLine, titulo: "Dibujar", texto: "Puntos, líneas, polígonos, rectángulos, círculos y textos. Se pueden editar, borrar y descargar en GeoJSON." },
  { icono: Link, titulo: "Compartir", texto: "La dirección de la página guarda la vista y las capas activas: copiala para compartir el mapa." },
];

export function PanelAyuda() {
  return (
    <div className="flex flex-col gap-3">
      <Titulo>Ayuda</Titulo>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {AYUDA.map((a) => (
          <li key={a.titulo} className="flex gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-superficie text-acento">
              <a.icono className="size-4" aria-hidden />
            </span>
            <span className="text-sm leading-snug">
              <strong className="block font-semibold">{a.titulo}</strong>
              <span className="text-tenue">{a.texto}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="m-0 text-xs text-tenue">
        Atajos: <kbd>Esc</kbd> cierra la ficha o termina la herramienta activa.
      </p>
    </div>
  );
}

type Preferencias = { texto: boolean; contraste: boolean; movimiento: boolean };
const CLAVE = "visor-accesibilidad";

// Se aplican como atributos en <html>; globals.css define su efecto
function aplicar(p: Preferencias) {
  const html = document.documentElement;
  html.toggleAttribute("data-texto-grande", p.texto);
  html.toggleAttribute("data-alto-contraste", p.contraste);
  html.toggleAttribute("data-sin-animaciones", p.movimiento);
}

export function usePreferenciasAccesibilidad() {
  useEffect(() => {
    try {
      const guardadas = localStorage.getItem(CLAVE);
      if (guardadas) aplicar(JSON.parse(guardadas));
    } catch {}
  }, []);
}

const TEMAS_PORTAL: { id: Tema; titulo: string; icono: typeof Sun }[] = [
  { id: "sistema", titulo: "Sistema", icono: Monitor },
  { id: "claro", titulo: "Claro", icono: Sun },
  { id: "oscuro", titulo: "Oscuro", icono: Moon },
];

export function PanelAccesibilidad() {
  const { tema } = useTema();
  const [p, setP] = useState<Preferencias>(() => {
    const html = document.documentElement;
    return {
      texto: html.hasAttribute("data-texto-grande"),
      contraste: html.hasAttribute("data-alto-contraste"),
      movimiento: html.hasAttribute("data-sin-animaciones"),
    };
  });

  function cambiar(clave: keyof Preferencias) {
    const nuevas = { ...p, [clave]: !p[clave] };
    setP(nuevas);
    aplicar(nuevas);
    try {
      localStorage.setItem(CLAVE, JSON.stringify(nuevas));
    } catch {}
  }

  const opciones: { clave: keyof Preferencias; titulo: string; texto: string }[] = [
    { clave: "texto", titulo: "Texto más grande", texto: "Agranda los textos y controles del visor." },
    { clave: "contraste", titulo: "Alto contraste", texto: "Colores con mayor contraste en los paneles." },
    { clave: "movimiento", titulo: "Reducir movimiento", texto: "Desplazamientos del mapa sin animación." },
  ];

  return (
    <div className="flex flex-col gap-3">
      <Titulo>Accesibilidad</Titulo>
      <fieldset className="m-0 flex flex-col gap-2 rounded-lg border border-borde px-3 pt-2 pb-3">
        <legend className="px-1 text-sm font-semibold">Tema</legend>
        <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-1 rounded-md bg-superficie p-1">
          {TEMAS_PORTAL.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={tema === t.id}
              onClick={() => elegirTema(t.id)}
              className={
                `${reset} inline-flex cursor-pointer items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs transition-colors ` +
                "focus-visible:outline-2 focus-visible:outline-acento " +
                (tema === t.id ? "bg-fondo font-semibold text-texto shadow-sm" : "text-tenue hover:text-texto")
              }
            >
              <t.icono className="size-3.5" aria-hidden />
              {t.titulo}
            </button>
          ))}
        </div>
      </fieldset>
      {opciones.map((o) => (
        <label key={o.clave} className="flex cursor-pointer items-start gap-3 rounded-lg border border-borde px-3 py-2.5">
          <input
            type="checkbox"
            role="switch"
            checked={p[o.clave]}
            onChange={() => cambiar(o.clave)}
            className="m-0 mt-0.5 size-4 shrink-0 accent-acento"
          />
          <span className="text-sm leading-snug">
            <strong className="block font-semibold">{o.titulo}</strong>
            <span className="text-tenue">{o.texto}</span>
          </span>
        </label>
      ))}
      <p className="m-0 text-xs text-tenue">Todo el visor se puede usar con teclado (Tab para moverse, Enter para activar).</p>
    </div>
  );
}
