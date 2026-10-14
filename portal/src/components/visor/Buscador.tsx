"use client";

import { useEffect, useId, useState } from "react";
import { Building2, LoaderCircle, MapPin, Search, User } from "lucide-react";
import { toLonLat } from "ol/proj";
import { PUBLIC_GEOSERVER, WORKSPACE } from "@/lib/config";
import { campo, reset } from "./ui";

// proveedor: atributos del proveedor buscado por CUIT, para abrir su ficha al elegirlo
export type Lugar = { nombre: string; detalle: string; lon: number; lat: number; proveedor?: Record<string, unknown> };

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
const CAPA_PROVEEDORES = `${WORKSPACE}:proveedores_radicacion`;

// Texto con forma de CUIT (dígitos, guiones o espacios): se busca entre los proveedores, no entre localidades
const digitosCuit = (t: string) => (/^[\d\s-]+$/.test(t) ? t.replace(/\D/g, "") : null);
const conGuiones = (c: string) => (c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c);

async function buscarLocalidades(consulta: string, signal: AbortSignal): Promise<Lugar[]> {
  // Solo localidades del Chubut (código INDEC 26): el visor está limitado a la provincia
  const url = `${GEOREF}?nombre=${encodeURIComponent(consulta)}&provincia=26&max=10&campos=nombre,centroide,departamento.nombre,provincia.nombre`;
  const datos: RespuestaGeoref = await (await fetch(url, { signal })).json();
  const lista = datos.localidades.map((l) => ({
    nombre: l.nombre,
    detalle: [l.departamento?.nombre, l.provincia.nombre].filter(Boolean).join(", "),
    lon: l.centroide.lon,
    lat: l.centroide.lat,
  }));
  lista.sort((a, b) => Number(b.detalle.endsWith("Chubut")) - Number(a.detalle.endsWith("Chubut")));
  return lista;
}

// Proveedores cuyo CUIT empieza con los dígitos escritos (WFS de la capa publicada)
async function buscarProveedores(digitos: string, signal: AbortSignal): Promise<Lugar[]> {
  const q = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: CAPA_PROVEEDORES,
    count: "10",
    sortBy: "cuit",
    srsName: "EPSG:3857",
    outputFormat: "application/json",
    CQL_FILTER: `cuit LIKE '${digitos}%'`,
  });
  const datos = await (await fetch(`${PUBLIC_GEOSERVER}/${WORKSPACE}/wfs?${q}`, { signal })).json();
  return (datos.features as { properties: Record<string, unknown>; geometry: { coordinates: number[] } | null }[])
    .filter((f) => f.geometry)
    .map((f) => {
      const [lon, lat] = toLonLat(f.geometry!.coordinates);
      const p = f.properties;
      return {
        nombre: String(p.entidad ?? "Sin nombre"),
        detalle: [conGuiones(String(p.cuit ?? "")), p.localidad].filter(Boolean).join(" · "),
        lon,
        lat,
        proveedor: p,
      };
    });
}

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
    const digitos = digitosCuit(consulta);
    if (digitos != null && digitos.length < 3) return;
    const control = new AbortController();
    const espera = setTimeout(async () => {
      setCargando(true);
      try {
        setLugares(digitos ? await buscarProveedores(digitos, control.signal) : await buscarLocalidades(consulta, control.signal));
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
    // Con el CUIT en el buscador, al volver a abrirlo aparece el mismo proveedor
    setTexto(l.proveedor ? conGuiones(String(l.proveedor.cuit ?? "")) : l.nombre);
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
        aria-label="Buscar localidad del Chubut o CUIT de proveedor"
        placeholder="Buscar localidad o CUIT…"
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
                {l.proveedor ? (
                  l.proveedor.tipo_persona === "fisica" ? (
                    <User className="mt-0.5 size-4 shrink-0 text-acento" aria-hidden />
                  ) : (
                    <Building2 className="mt-0.5 size-4 shrink-0 text-acento" aria-hidden />
                  )
                ) : (
                  <MapPin className="mt-0.5 size-4 shrink-0 text-acento" aria-hidden />
                )}
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
