"use client";

import { useEffect, useId, useState } from "react";
import { LoaderCircle, MapPin, Search } from "lucide-react";
import { campo, reset } from "./ui";

export type Lugar = { nombre: string; detalle: string; lon: number; lat: number };

type RespuestaGeoref = {
  localidades: {
    nombre: string;
    centroide: { lon: number; lat: number };
    departamento?: { nombre: string | null };
    provincia: { nombre: string };
  }[];
};

// API Georef del Estado nacional (datos.gob.ar): localidades de todo el país, primero las del Chubut
const GEOREF = "https://apis.datos.gob.ar/georef/api/localidades";

export default function Buscador({ onElegir }: { onElegir: (l: Lugar) => void }) {
  const [texto, setTexto] = useState("");
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);
  const id = useId();

  useEffect(() => {
    const consulta = texto.trim();
    if (consulta.length < 3) return;
    const control = new AbortController();
    const espera = setTimeout(async () => {
      setCargando(true);
      try {
        const url = `${GEOREF}?nombre=${encodeURIComponent(consulta)}&max=10&campos=nombre,centroide,departamento.nombre,provincia.nombre`;
        const datos: RespuestaGeoref = await (await fetch(url, { signal: control.signal })).json();
        const lista = datos.localidades.map((l) => ({
          nombre: l.nombre,
          detalle: [l.departamento?.nombre, l.provincia.nombre].filter(Boolean).join(", "),
          lon: l.centroide.lon,
          lat: l.centroide.lat,
        }));
        lista.sort((a, b) => Number(b.detalle.endsWith("Chubut")) - Number(a.detalle.endsWith("Chubut")));
        setLugares(lista);
        setActivo(-1);
        setAbierto(true);
      } catch {
        if (!control.signal.aborted) setLugares([]);
      } finally {
        if (!control.signal.aborted) setCargando(false);
      }
    }, 300);
    return () => {
      clearTimeout(espera);
      control.abort();
    };
  }, [texto]);

  function elegir(l: Lugar) {
    onElegir(l);
    setTexto(l.nombre);
    setAbierto(false);
  }

  const mostrar = abierto && texto.trim().length >= 3;

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-tenue" aria-hidden />
      <input
        type="search"
        role="combobox"
        aria-expanded={mostrar}
        aria-controls={id}
        aria-activedescendant={activo >= 0 ? `${id}-${activo}` : undefined}
        aria-label="Buscar localidad"
        placeholder="Buscar localidad…"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActivo(Math.min(activo + 1, lugares.length - 1));
          else if (e.key === "ArrowUp") setActivo(Math.max(activo - 1, 0));
          else if (e.key === "Enter" && lugares[Math.max(activo, 0)]) elegir(lugares[Math.max(activo, 0)]);
          else if (e.key === "Escape") setAbierto(false);
          else return;
          e.preventDefault();
        }}
        className={`${campo} pr-8 pl-8`}
      />
      {cargando && (
        <LoaderCircle className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-tenue" aria-hidden />
      )}
      {mostrar && (
        <ul
          id={id}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 m-0 mt-1 max-h-72 list-none overflow-y-auto rounded-lg border border-borde bg-fondo p-1 shadow-lg"
        >
          {!cargando && lugares.length === 0 && <li className="px-3 py-2 text-sm text-tenue">Sin resultados</li>}
          {lugares.map((l, i) => (
            <li key={`${l.nombre}-${l.lat}-${l.lon}`} id={`${id}-${i}`} role="option" aria-selected={i === activo}>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(l)}
                className={
                  `${reset} flex w-full cursor-pointer items-start gap-2 rounded-md px-2.5 py-1.5 text-left ` +
                  (i === activo ? "bg-superficie" : "hover:bg-superficie")
                }
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-acento" aria-hidden />
                <span className="text-sm leading-tight">
                  {l.nombre}
                  <span className="block text-xs text-tenue">{l.detalle}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
