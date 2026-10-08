"use client";

import { useId, useState } from "react";
import { ChevronDown, EyeOff, MapPin, Search, SlidersHorizontal, Trash, X, ZoomIn } from "lucide-react";
import { temaDe } from "@/lib/config";
import { BotonIcono, IconoTema, Titulo, campo, reset } from "./ui";
import type { CapaVisor, Localidad } from "./tipos";

type Props = {
  capas: CapaVisor[];
  onCambiar: (id: string, cambios: Partial<Pick<CapaVisor, "visible" | "opacidad">>) => void;
  localidades: Localidad[]; // opciones del filtro por localidad
  onFiltrar: (id: string, cambios: Partial<Pick<CapaVisor, "filtro" | "localidades">>) => void;
  onZoom: (c: CapaVisor) => void;
  onQuitar: (id: string) => void;
};

const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

// Buscador de localidades con las elegidas como etiquetas; sin ninguna elegida se muestran todas
function FiltroLocalidad({ titulo, opciones, elegidas, onCambiar }: {
  titulo: string;
  opciones: Localidad[];
  elegidas: string[];
  onCambiar: (elegidas: string[]) => void;
}) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);
  const id = useId();
  const buscado = normalizar(texto.trim());
  const sugeridas = buscado
    ? opciones
        .filter((l) => !elegidas.includes(l.nombre) && normalizar(l.nombre).includes(buscado))
        // primero las que empiezan con lo escrito
        .sort((a, b) => Number(normalizar(b.nombre).startsWith(buscado)) - Number(normalizar(a.nombre).startsWith(buscado)))
        .slice(0, 8)
    : [];
  const mostrar = abierto && buscado !== "";

  function elegir(l: Localidad) {
    onCambiar([...elegidas, l.nombre]);
    setTexto("");
    setActivo(-1);
  }

  return (
    <div className="flex flex-col gap-1.5 px-3 pt-0.5 pb-2 pl-[2.1rem]">
      {elegidas.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label={`Localidades de ${titulo}`}>
          {elegidas.map((nombre) => (
            <li
              key={nombre}
              className="inline-flex items-center gap-1 rounded-full border border-acento/50 bg-acento/10 py-0.5 pr-0.5 pl-2 text-xs text-texto"
            >
              <MapPin className="size-3 text-acento" aria-hidden />
              {nombre}
              <button
                type="button"
                aria-label={`Quitar ${nombre}`}
                title={`Quitar ${nombre}`}
                onClick={() => onCambiar(elegidas.filter((e) => e !== nombre))}
                className={`${reset} inline-flex size-4 cursor-pointer items-center justify-center rounded-full text-tenue hover:bg-acento/20 hover:text-texto focus-visible:outline-2 focus-visible:outline-acento`}
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
          {elegidas.length > 1 && (
            <li>
              <button
                type="button"
                onClick={() => onCambiar([])}
                className={`${reset} cursor-pointer py-0.5 text-xs text-acento hover:underline`}
              >
                Quitar todas
              </button>
            </li>
          )}
        </ul>
      )}
      <div className="relative">
        <MapPin className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-tenue" aria-hidden />
        <input
          type="search"
          role="combobox"
          aria-expanded={mostrar}
          aria-controls={id}
          aria-activedescendant={activo >= 0 ? `${id}-${activo}` : undefined}
          aria-label={`Filtrar ${titulo} por localidad`}
          placeholder={elegidas.length ? "Sumar otra localidad" : "Filtrar por localidad"}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setActivo(-1);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setActivo(Math.min(activo + 1, sugeridas.length - 1));
            else if (e.key === "ArrowUp") setActivo(Math.max(activo - 1, 0));
            else if (e.key === "Enter" && sugeridas[Math.max(activo, 0)]) elegir(sugeridas[Math.max(activo, 0)]);
            else if (e.key === "Escape") setAbierto(false);
            else if (e.key === "Backspace" && texto === "" && elegidas.length) onCambiar(elegidas.slice(0, -1));
            else return;
            e.preventDefault();
          }}
          className={`${campo} py-1 pl-7 text-xs`}
        />
        {mostrar && (
          <ul
            id={id}
            role="listbox"
            className="absolute inset-x-0 top-full z-20 m-0 mt-1 max-h-64 list-none overflow-y-auto rounded-lg border border-borde bg-fondo p-1 shadow-lg"
          >
            {sugeridas.length === 0 && <li className="px-2.5 py-1.5 text-xs text-tenue">No hay proveedores en esa localidad</li>}
            {sugeridas.map((l, i) => (
              <li key={`${l.nombre}-${l.provincia}`} id={`${id}-${i}`} role="option" aria-selected={i === activo}>
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => elegir(l)}
                  className={
                    `${reset} flex w-full cursor-pointer items-baseline gap-2 rounded-md px-2.5 py-1.5 text-left ` +
                    (i === activo ? "bg-superficie" : "hover:bg-superficie")
                  }
                >
                  <span className="min-w-0 flex-1 text-sm leading-tight">
                    {l.nombre}
                    <span className="block text-xs text-tenue">{[l.departamento, l.provincia].filter(Boolean).join(", ")}</span>
                  </span>
                  <span className="shrink-0 text-xs text-tenue tabular-nums">
                    {l.cantidad.toLocaleString("es-AR")} {l.cantidad === 1 ? "proveedor" : "proveedores"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Símbolo de las capas del nodo (debe coincidir con geoserver/estilos/<capa>.sld) y de los archivos
function Simbolo({ c }: { c: CapaVisor }) {
  if (c.nodo?.filtro) {
    const opciones = c.nodo.filtro.opciones;
    return (
      <svg viewBox="0 0 20 20" className="size-5 shrink-0" aria-hidden>
        {opciones.map((o, i) => (
          <circle key={o.valor} cx={6 + i * 8} cy={10} r={4.5} fill={o.color} stroke="#fff" strokeWidth={1} />
        ))}
      </svg>
    );
  }
  const color = c.nodo?.simbolo.color ?? c.color ?? "#888";
  const circulo = (r: number, cx: number, cy: number, op = 1) => (
    <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={op} stroke="#fff" strokeWidth={1} />
  );
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0" aria-hidden>
      {c.nodo?.simbolo.proporcional ? (
        <>
          {circulo(7.5, 11.5, 11.5, 0.6)}
          {circulo(3.5, 5, 15, 0.6)}
        </>
      ) : c.origen === "archivo" ? (
        <rect x={3} y={3} width={14} height={14} rx={3} fill={color} fillOpacity={0.35} stroke={color} strokeWidth={2} />
      ) : (
        circulo(4.5, 10, 10)
      )}
    </svg>
  );
}

function FilaCapa({ c, localidades, onCambiar, onFiltrar, onZoom, onQuitar }: { c: CapaVisor } & Omit<Props, "capas">) {
  const [ajustes, setAjustes] = useState(false);
  return (
    <li className="rounded-lg transition-colors hover:bg-superficie">
      <div className="flex items-center gap-1 py-1 pr-1 pl-2">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-1" title={c.resumen || undefined}>
          <input
            type="checkbox"
            className="m-0 size-4 shrink-0 accent-acento"
            checked={c.visible}
            onChange={() => onCambiar(c.id, { visible: !c.visible })}
          />
          <span className={"min-w-0 flex-1 text-sm leading-snug " + (c.visible ? "font-medium text-texto" : "text-tenue")}>
            {c.titulo}
            {c.nodo?.nota && <span className="block text-xs font-normal text-tenue">{c.nodo.nota}</span>}
          </span>
          {/* Las capas externas suelen tener leyendas por clases: se ven completas en los ajustes */}
          {!c.leyenda && <Simbolo c={c} />}
        </label>
        {c.extension && <BotonIcono icono={ZoomIn} etiqueta="Zoom a la capa" tamano="sm" className="text-tenue" onClick={() => onZoom(c)} />}
        <BotonIcono
          icono={SlidersHorizontal}
          etiqueta="Opacidad"
          tamano="sm"
          activo={ajustes}
          className={ajustes ? "" : "text-tenue"}
          onClick={() => setAjustes(!ajustes)}
        />
        {(c.origen === "wms" || c.origen === "archivo") && (
          <BotonIcono icono={Trash} etiqueta="Quitar capa" tamano="sm" className="text-tenue" onClick={() => onQuitar(c.id)} />
        )}
      </div>
      {c.nodo?.filtro && c.filtro && (
        <fieldset className="m-0 flex flex-wrap gap-1.5 border-0 px-3 pt-0.5 pb-2 pl-[2.1rem]">
          <legend className="sr-only">Filtrar {c.titulo}</legend>
          {c.nodo.filtro.opciones.map((o) => {
            const marcada = c.filtro!.includes(o.valor);
            return (
              <label
                key={o.valor}
                className={
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-1.5 text-xs transition-colors " +
                  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-acento " +
                  (marcada ? "border-acento/50 bg-acento/10 text-texto" : "border-borde text-tenue hover:bg-superficie")
                }
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={marcada}
                  onChange={() =>
                    onFiltrar(c.id, { filtro: marcada ? c.filtro!.filter((v) => v !== o.valor) : [...c.filtro!, o.valor] })
                  }
                />
                <span
                  aria-hidden
                  className="size-2.5 rounded-full ring-1 ring-white/80"
                  style={{ background: marcada ? o.color : "transparent", boxShadow: `inset 0 0 0 1.5px ${o.color}` }}
                />
                {o.etiqueta}
              </label>
            );
          })}
        </fieldset>
      )}
      {c.nodo?.filtroLocalidad && c.localidades && localidades.length > 0 && (
        <FiltroLocalidad
          titulo={c.titulo}
          opciones={localidades}
          elegidas={c.localidades}
          onCambiar={(elegidas) => onFiltrar(c.id, { localidades: elegidas })}
        />
      )}
      {ajustes && (
        <label className="flex items-center gap-3 px-3 pt-1 pb-2.5 pl-[2.1rem] text-xs text-tenue">
          Opacidad
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(c.opacidad * 100)}
            onChange={(e) => onCambiar(c.id, { opacidad: Number(e.target.value) / 100 })}
            className="m-0 min-w-0 flex-1 accent-acento"
          />
          <span className="w-10 shrink-0 text-right">{Math.round(c.opacidad * 100)}%</span>
        </label>
      )}
      {ajustes && c.leyenda && c.visible && (
        <figure className="m-0 px-3 pb-2.5 pl-[2.1rem]">
          <figcaption className="mb-1 text-xs text-tenue">Leyenda</figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element -- leyenda dinámica de un WMS externo */}
          <img src={c.leyenda} alt={`Leyenda de ${c.titulo}`} className="max-w-full rounded bg-white p-1 ring-1 ring-borde" />
        </figure>
      )}
    </li>
  );
}

export default function PanelCapas({ capas, localidades, onCambiar, onFiltrar, onZoom, onQuitar }: Props) {
  const [filtro, setFiltro] = useState("");
  // Al abrir, solo se despliegan los grupos propios del nodo y los que tienen capas encendidas
  const [cerrados, setCerrados] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      [...new Set(capas.map((c) => c.grupo))].map((g) => [
        g,
        !capas.some((c) => c.grupo === g && (c.origen === "nodo" || c.visible)),
      ]),
    ),
  );
  const visibles = capas.filter((c) => normalizar(`${c.titulo} ${c.grupo}`).includes(normalizar(filtro)));
  const grupos = [...new Set(visibles.map((c) => c.grupo))];
  const hayActivas = capas.some((c) => c.visible);

  return (
    <div className="flex flex-col gap-3">
      <Titulo
        accion={
          <button
            type="button"
            disabled={!hayActivas}
            onClick={() => capas.forEach((c) => c.visible && onCambiar(c.id, { visible: false }))}
            className={`${reset} inline-flex cursor-pointer items-center gap-1 text-xs text-acento hover:underline disabled:cursor-default disabled:text-tenue disabled:no-underline`}
          >
            <EyeOff className="size-3.5" aria-hidden /> Desactivar todas
          </button>
        }
      >
        Capas
      </Titulo>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-tenue" aria-hidden />
        <input
          type="search"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar capa"
          aria-label="Buscar capa"
          className={`${campo} pl-8`}
        />
      </div>

      {grupos.length === 0 && <p className="m-0 text-sm text-tenue">No hay capas que coincidan.</p>}
      <div className="-mx-1 flex flex-col divide-y divide-borde/70">
        {grupos.map((g) => {
          const abierto = !cerrados[g] || filtro !== "";
          const encendidas = capas.filter((c) => c.grupo === g && c.visible).length;
          const tema = temaDe(g);
          return (
            <section key={g} className="py-1.5">
              <button
                type="button"
                aria-expanded={abierto}
                onClick={() => setCerrados({ ...cerrados, [g]: abierto })}
                className={`${reset} flex w-full cursor-pointer items-center gap-3 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-superficie`}
              >
                <IconoTema grupo={g} />
                <span className="flex-1 text-sm font-semibold">{g}</span>
                {encendidas > 0 && (
                  <span
                    className="min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-semibold"
                    style={{ background: tema.color, color: tema.sobre }}
                    aria-label={`${encendidas} encendidas`}
                  >
                    {encendidas}
                  </span>
                )}
                <ChevronDown
                  className={"size-4 text-tenue transition-transform duration-200 " + (abierto ? "" : "-rotate-90")}
                  aria-hidden
                />
              </button>
              {abierto && (
                <ul className="m-0 mt-0.5 flex list-none flex-col p-0 pl-8">
                  {visibles
                    .filter((c) => c.grupo === g)
                    .map((c) => (
                      <FilaCapa key={c.id} c={c} localidades={localidades} onCambiar={onCambiar} onFiltrar={onFiltrar} onZoom={onZoom} onQuitar={onQuitar} />
                    ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
