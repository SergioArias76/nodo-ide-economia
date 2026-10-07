"use client";

import { useState } from "react";
import { Globe, LoaderCircle, Plus, Upload } from "lucide-react";
import WMSCapabilities from "ol/format/WMSCapabilities";
import GeoJSON from "ol/format/GeoJSON";
import KML from "ol/format/KML";
import GPX from "ol/format/GPX";
import type Feature from "ol/Feature";
import type { Extent } from "ol/extent";
import { WMS_SUGERIDOS } from "@/lib/config";
import { Titulo, botonPrimario, botonSecundario, campo, reset } from "./ui";

export type CapaWms = { url: string; nombre: string; titulo: string; extension?: Extent; leyenda?: string };

type Props = {
  onAgregarWms: (c: CapaWms) => void;
  onAgregarArchivo: (titulo: string, features: Feature[]) => void;
};

type CapaCapabilities = {
  Name?: string;
  Title?: string;
  EX_GeographicBoundingBox?: Extent;
  Style?: { LegendURL?: { OnlineResource?: string }[] }[];
  Layer?: CapaCapabilities[];
};

// Aplana el árbol de capas del GetCapabilities y deja las que se pueden pedir por nombre
function aplanar(capa: CapaCapabilities, salida: CapaCapabilities[] = []) {
  if (capa.Name) salida.push(capa);
  capa.Layer?.forEach((c) => aplanar(c, salida));
  return salida;
}

function ServicioWms({ onAgregarWms }: Pick<Props, "onAgregarWms">) {
  const [url, setUrl] = useState("");
  const [estado, setEstado] = useState<"inicial" | "cargando" | "error" | "listo">("inicial");
  const [capas, setCapas] = useState<CapaWms[]>([]);
  const [filtro, setFiltro] = useState("");
  const [agregadas, setAgregadas] = useState<string[]>([]);

  async function conectar(direccion = url) {
    setUrl(direccion);
    setEstado("cargando");
    try {
      const base = direccion.split("?")[0];
      const r = await fetch(`${base}?service=WMS&request=GetCapabilities&version=1.3.0`);
      const caps = new WMSCapabilities().read(await r.text());
      const lista = aplanar(caps.Capability.Layer).map((c) => ({
        url: base,
        nombre: c.Name!,
        titulo: c.Title || c.Name!,
        extension: c.EX_GeographicBoundingBox,
        leyenda: c.Style?.[0]?.LegendURL?.[0]?.OnlineResource,
      }));
      setCapas(lista);
      setEstado("listo");
    } catch {
      setEstado("error");
    }
  }

  const filtradas = capas.filter((c) => `${c.titulo} ${c.nombre}`.toLowerCase().includes(filtro.toLowerCase()));

  return (
    <div className="flex flex-col gap-2.5">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (url) conectar();
        }}
      >
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://servidor/geoserver/wms"
          aria-label="Dirección del servicio WMS"
          className={campo}
          required
        />
        <button type="submit" className={botonPrimario} disabled={estado === "cargando"}>
          {estado === "cargando" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : "Conectar"}
        </button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {WMS_SUGERIDOS.map((s) => (
          <button
            key={s.url}
            type="button"
            onClick={() => conectar(s.url.startsWith("/") ? `${location.origin}${s.url}` : s.url)}
            className={`${reset} cursor-pointer rounded-full border border-borde px-2.5 py-0.5 text-xs hover:border-acento hover:text-acento`}
          >
            {s.titulo}
          </button>
        ))}
      </div>
      {estado === "error" && (
        <p className="m-0 text-sm text-red-600 dark:text-red-400">
          No se pudo leer el servicio. Verificá la dirección y que el servidor permita el acceso desde otros sitios (CORS).
        </p>
      )}
      {estado === "listo" && (
        <>
          <input
            type="search"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder={`Filtrar ${capas.length} capas`}
            aria-label="Filtrar capas del servicio"
            className={campo}
          />
          <ul className="m-0 flex max-h-72 list-none flex-col gap-1 overflow-y-auto p-0">
            {filtradas.map((c) => {
              const ya = agregadas.includes(c.url + c.nombre);
              return (
                <li key={c.nombre} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-superficie">
                  <span className="min-w-0 flex-1 text-sm leading-tight">
                    {c.titulo}
                    <span className="block truncate text-xs text-tenue">{c.nombre}</span>
                  </span>
                  <button
                    type="button"
                    disabled={ya}
                    onClick={() => {
                      onAgregarWms(c);
                      setAgregadas([...agregadas, c.url + c.nombre]);
                    }}
                    className={botonSecundario + " px-2 py-1 text-xs"}
                  >
                    {ya ? "Agregada" : <><Plus className="size-3.5" aria-hidden /> Agregar</>}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

async function leerArchivo(archivo: File): Promise<Feature[]> {
  const opciones = { featureProjection: "EPSG:3857" };
  const ext = archivo.name.split(".").pop()?.toLowerCase();
  if (ext === "zip") {
    const { default: shp } = await import("shpjs");
    const datos = await shp(await archivo.arrayBuffer());
    const colecciones = Array.isArray(datos) ? datos : [datos];
    return colecciones.flatMap((c) => new GeoJSON().readFeatures(c, opciones));
  }
  const texto = await archivo.text();
  if (ext === "kml") return new KML({ extractStyles: false }).readFeatures(texto, opciones);
  if (ext === "gpx") return new GPX().readFeatures(texto, opciones);
  return new GeoJSON().readFeatures(texto, opciones);
}

function Archivo({ onAgregarArchivo }: Pick<Props, "onAgregarArchivo">) {
  const [estado, setEstado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  async function cargar(archivos: FileList | null) {
    for (const archivo of archivos ?? []) {
      try {
        const features = await leerArchivo(archivo);
        if (features.length === 0) throw new Error("vacío");
        onAgregarArchivo(archivo.name.replace(/\.[^.]+$/, ""), features);
        setEstado({ tipo: "ok", texto: `${archivo.name}: ${features.length.toLocaleString("es-AR")} elementos` });
      } catch {
        setEstado({ tipo: "error", texto: `No se pudo leer ${archivo.name}` });
      }
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          cargar(e.dataTransfer.files);
        }}
        className={
          "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition-colors " +
          (arrastrando ? "border-acento bg-acento/10" : "border-borde hover:border-acento")
        }
      >
        <Upload className="size-6 text-acento" aria-hidden />
        <span>
          Arrastrá un archivo o <span className="font-semibold text-acento">elegilo</span>
        </span>
        <span className="text-xs text-tenue">GeoJSON, KML, GPX o Shapefile comprimido (.zip)</span>
        <input
          type="file"
          multiple
          accept=".geojson,.json,.kml,.gpx,.zip"
          className="sr-only"
          onChange={(e) => cargar(e.target.files)}
        />
      </label>
      {estado && (
        <p className={"m-0 text-sm " + (estado.tipo === "ok" ? "text-tenue" : "text-red-600 dark:text-red-400")}>
          {estado.texto}
        </p>
      )}
      <p className="m-0 text-xs text-tenue">Los archivos se abren en tu navegador: no se suben al servidor.</p>
    </div>
  );
}

export default function PanelAgregar(props: Props) {
  const [pestana, setPestana] = useState<"wms" | "archivo">("wms");
  const pestanas = [
    { id: "wms", titulo: "Servicio WMS", icono: Globe },
    { id: "archivo", titulo: "Archivo", icono: Upload },
  ] as const;
  return (
    <div className="flex flex-col gap-3">
      <Titulo>Agregar capas</Titulo>
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-lg bg-superficie p-1">
        {pestanas.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={pestana === p.id}
            onClick={() => setPestana(p.id)}
            className={
              `${reset} inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-sm ` +
              (pestana === p.id ? "bg-fondo font-semibold shadow-sm" : "text-tenue hover:text-texto")
            }
          >
            <p.icono className="size-4" aria-hidden /> {p.titulo}
          </button>
        ))}
      </div>
      {pestana === "wms" ? <ServicioWms onAgregarWms={props.onAgregarWms} /> : <Archivo onAgregarArchivo={props.onAgregarArchivo} />}
    </div>
  );
}
