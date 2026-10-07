"use client";

import { useState } from "react";
import { ChevronDown, EyeOff, Search, SlidersHorizontal, Trash, ZoomIn } from "lucide-react";
import { BotonIcono, Titulo, campo, reset } from "./ui";
import type { CapaVisor } from "./tipos";

type Props = {
  capas: CapaVisor[];
  onCambiar: (id: string, cambios: Partial<Pick<CapaVisor, "visible" | "opacidad">>) => void;
  onZoom: (c: CapaVisor) => void;
  onQuitar: (id: string) => void;
};

// Símbolo de las capas del nodo: debe coincidir con geoserver/estilos/<capa>.sld
function Simbolo({ c }: { c: CapaVisor }) {
  if (c.leyenda) {
    // eslint-disable-next-line @next/next/no-img-element -- leyenda dinámica de un WMS externo
    return <img src={c.leyenda} alt="" className="max-h-5 max-w-8 shrink-0 object-contain" />;
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

function FilaCapa({ c, onCambiar, onZoom, onQuitar }: { c: CapaVisor } & Omit<Props, "capas">) {
  const [ajustes, setAjustes] = useState(false);
  return (
    <li
      className={
        "rounded-lg border bg-fondo transition-colors " + (c.visible ? "border-acento/40" : "border-borde")
      }
    >
      <div className="flex items-center gap-2 py-1.5 pr-1 pl-2.5">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-1">
          <input
            type="checkbox"
            className="m-0 size-4 shrink-0 accent-acento"
            checked={c.visible}
            onChange={() => onCambiar(c.id, { visible: !c.visible })}
          />
          <span className={"min-w-0 flex-1 text-sm leading-tight " + (c.visible ? "" : "text-tenue")}>
            {c.titulo}
            {c.nodo?.nota && <span className="mt-0.5 block text-xs text-tenue">{c.nodo.nota}</span>}
          </span>
          <Simbolo c={c} />
        </label>
        {c.extension && <BotonIcono icono={ZoomIn} etiqueta="Zoom a la capa" tamano="sm" onClick={() => onZoom(c)} />}
        <BotonIcono
          icono={SlidersHorizontal}
          etiqueta="Opacidad"
          tamano="sm"
          activo={ajustes}
          onClick={() => setAjustes(!ajustes)}
        />
        {c.origen !== "nodo" && (
          <BotonIcono icono={Trash} etiqueta="Quitar capa" tamano="sm" onClick={() => onQuitar(c.id)} />
        )}
      </div>
      {ajustes && (
        <label className="flex items-center gap-3 border-t border-borde px-3 py-2 text-xs text-tenue">
          Opacidad
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(c.opacidad * 100)}
            onChange={(e) => onCambiar(c.id, { opacidad: Number(e.target.value) / 100 })}
            className="m-0 flex-1 accent-acento"
          />
          <span className="w-9 text-right tabular-nums">{Math.round(c.opacidad * 100)}%</span>
        </label>
      )}
    </li>
  );
}

export default function PanelCapas({ capas, onCambiar, onZoom, onQuitar }: Props) {
  const [filtro, setFiltro] = useState("");
  const [cerrados, setCerrados] = useState<Record<string, boolean>>({});
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
      {grupos.map((g) => {
        const abierto = !cerrados[g] || filtro !== "";
        return (
          <section key={g} className="flex flex-col gap-2">
            <button
              type="button"
              aria-expanded={abierto}
              onClick={() => setCerrados({ ...cerrados, [g]: abierto })}
              className={`${reset} flex cursor-pointer items-center justify-between rounded-md bg-acento px-3 py-2 text-left text-sm font-semibold text-acento-texto`}
            >
              {g}
              <ChevronDown className={"size-4 transition-transform " + (abierto ? "" : "-rotate-90")} aria-hidden />
            </button>
            {abierto && (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {visibles
                  .filter((c) => c.grupo === g)
                  .map((c) => (
                    <FilaCapa key={c.id} c={c} onCambiar={onCambiar} onZoom={onZoom} onQuitar={onQuitar} />
                  ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
