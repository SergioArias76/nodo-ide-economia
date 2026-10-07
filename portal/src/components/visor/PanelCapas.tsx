"use client";

import { useState } from "react";
import { ChevronDown, EyeOff, Search, SlidersHorizontal, Trash, ZoomIn } from "lucide-react";
import { temaDe } from "@/lib/config";
import { BotonIcono, IconoTema, Titulo, campo, reset } from "./ui";
import type { CapaVisor } from "./tipos";

type Props = {
  capas: CapaVisor[];
  onCambiar: (id: string, cambios: Partial<Pick<CapaVisor, "visible" | "opacidad">>) => void;
  onFiltrar: (id: string, elegidos: string[]) => void;
  onZoom: (c: CapaVisor) => void;
  onQuitar: (id: string) => void;
};

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

function FilaCapa({ c, onCambiar, onFiltrar, onZoom, onQuitar }: { c: CapaVisor } & Omit<Props, "capas">) {
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
                    onFiltrar(c.id, marcada ? c.filtro!.filter((v) => v !== o.valor) : [...c.filtro!, o.valor])
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

export default function PanelCapas({ capas, onCambiar, onFiltrar, onZoom, onQuitar }: Props) {
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
  const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
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
                      <FilaCapa key={c.id} c={c} onCambiar={onCambiar} onFiltrar={onFiltrar} onZoom={onZoom} onQuitar={onQuitar} />
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
