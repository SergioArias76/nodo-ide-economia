"use client";

// Pantalla interna para ubicar a mano a los proveedores que la geocodificación dejó en el centro de su
// localidad o de su provincia. Lo marcado se guarda como corrección de ubicación (fuente "manual"):
// el visor lo muestra en el momento y la carga del padrón lo vuelve a aplicar mientras el domicilio no cambie.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import "ol/ol.css";
import OlMap from "ol/Map";
import View from "ol/View";
import Feature from "ol/Feature";
import { Point } from "ol/geom";
import TileLayer from "ol/layer/Tile";
import ImageLayer from "ol/layer/Image";
import VectorLayer from "ol/layer/Vector";
import XYZ from "ol/source/XYZ";
import ImageWMS from "ol/source/ImageWMS";
import VectorSource from "ol/source/Vector";
import Translate from "ol/interaction/Translate";
import { Collection } from "ol";
import { fromLonLat, toLonLat } from "ol/proj";
import { Circle, Fill, Stroke, Style } from "ol/style";
import { Building2, Check, ChevronRight, LoaderCircle, MapPin, Search, User } from "lucide-react";
import { MAPAS_BASE, PRECISION, PUBLIC_GEOSERVER, WORKSPACE } from "@/lib/config";
import { botonPrimario, botonSecundario, campo, reset, tarjeta } from "../visor/ui";

type Proveedor = {
  id: number;
  cuit: string | null;
  entidad: string;
  tipo_persona: string | null;
  rubro: string | null;
  domicilio: string | null;
  localidad: string | null;
  departamento: string | null;
  provincia: string | null;
  precision: string;
  fuente_geo: string | null;
  lon: number;
  lat: number;
  nota: string | null;
  actualizado_en: string | null;
};
type Resumen = { pendientes: number; manuales: number; total: number; localidades: { localidad: string; provincia: string; pendientes: number }[] };
type Estado = "pendientes" | "manuales" | "todos";
type Direccion = { nombre: string; detalle: string; lon: number; lat: number };

const ESTADOS: { valor: Estado; etiqueta: string }[] = [
  { valor: "pendientes", etiqueta: "Pendientes" },
  { valor: "manuales", etiqueta: "Marcados a mano" },
  { valor: "todos", etiqueta: "Todos" },
];

const conGuiones = (c: string | null) => (c && c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : (c ?? "Sin CUIT"));
const pendiente = (p: Proveedor) => p.precision === "localidad" || p.precision === "provincia";

// Imagen satelital: ayuda a reconocer manzanas, lotes y chacras que no tienen calle y altura
const SATELITAL = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  atribucion: "Imagen © Esri, Maxar, Earthstar Geographics",
};

const estiloActual = new Style({
  image: new Circle({ radius: 7, fill: new Fill({ color: "#9bb2bb" }), stroke: new Stroke({ color: "#13262e", width: 2 }) }),
});
const estiloNuevo = new Style({
  image: new Circle({ radius: 9, fill: new Fill({ color: "#ff682c" }), stroke: new Stroke({ color: "#ffffff", width: 3 }) }),
});

// API Georef del Estado nacional: calle y altura dentro de una provincia (y localidad, si la reconoce)
async function buscarDireccion(texto: string, p: Proveedor): Promise<Direccion[]> {
  const pedir = async (conLocalidad: boolean) => {
    const q = new URLSearchParams({ direccion: texto, max: "8", campos: "nomenclatura,ubicacion,localidad_censal.nombre" });
    if (p.provincia) q.set("provincia", p.provincia);
    if (conLocalidad && p.localidad) q.set("localidad", p.localidad);
    const datos = await (await fetch(`https://apis.datos.gob.ar/georef/api/direcciones?${q}`)).json();
    return ((datos.direcciones ?? []) as { nomenclatura: string; ubicacion: { lon: number | null; lat: number | null }; localidad_censal?: { nombre: string } }[])
      .filter((d) => d.ubicacion.lon != null && d.ubicacion.lat != null)
      .map((d) => ({ nombre: d.nomenclatura, detalle: d.localidad_censal?.nombre ?? "", lon: d.ubicacion.lon!, lat: d.ubicacion.lat! }));
  };
  const enLocalidad = await pedir(true);
  return enLocalidad.length ? enLocalidad : pedir(false);
}

export default function Ubicaciones() {
  const [estado, setEstado] = useState<Estado>("pendientes");
  const [texto, setTexto] = useState("");
  const [buscado, setBuscado] = useState("");
  const [localidad, setLocalidad] = useState("");
  const [lista, setLista] = useState<Proveedor[]>([]);
  const [total, setTotal] = useState(0);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elegido, setElegido] = useState<Proveedor | null>(null);
  const [nuevo, setNuevo] = useState<number[] | null>(null); // lon, lat marcados
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [satelital, setSatelital] = useState(false);
  const [direccion, setDireccion] = useState("");
  const [direcciones, setDirecciones] = useState<Direccion[] | null>(null);
  const [buscandoDireccion, setBuscandoDireccion] = useState(false);
  const elementoMapa = useRef<HTMLDivElement>(null);
  const hayElegido = useRef(false); // el clic en el mapa marca solo con un proveedor elegido
  useEffect(() => {
    hayElegido.current = elegido != null;
  }, [elegido]);

  // Mapa: base, proveedores publicados (contexto), ubicación actual y la nueva (se puede arrastrar)
  const m = useMemo(() => {
    const osm = MAPAS_BASE.find((b) => b.id === "osm")!;
    const baseCalles = new TileLayer({ source: new XYZ({ url: osm.url, attributions: osm.atribucion }) });
    const baseSatelital = new TileLayer({ visible: false, source: new XYZ({ url: SATELITAL.url, attributions: SATELITAL.atribucion, maxZoom: 19 }) });
    const actual = new VectorSource();
    const nueva = new VectorSource();
    const marca = new Feature();
    const mapa = new OlMap({
      layers: [
        baseCalles,
        baseSatelital,
        new ImageLayer({
          opacity: 0.85,
          source: new ImageWMS({ url: `${PUBLIC_GEOSERVER}/wms`, params: { LAYERS: `${WORKSPACE}:proveedores_radicacion` }, ratio: 1.2 }),
        }),
        new VectorLayer({ source: actual, style: estiloActual }),
        new VectorLayer({ source: nueva, style: estiloNuevo }),
      ],
      view: new View({ center: fromLonLat([-68.5, -44]), zoom: 6, maxZoom: 20 }),
    });
    const arrastre = new Translate({ features: new Collection([marca]) });
    mapa.addInteraction(arrastre);
    return { mapa, baseCalles, baseSatelital, actual, nueva, marca, arrastre };
  }, []);

  useEffect(() => {
    m.mapa.setTarget(elementoMapa.current!);
    const alClic = m.mapa.on("singleclick", (e) => hayElegido.current && setNuevo(toLonLat(e.coordinate)));
    m.arrastre.on("translateend", () => setNuevo(toLonLat((m.marca.getGeometry() as Point).getCoordinates())));
    return () => {
      m.mapa.un("singleclick", alClic.listener);
      m.mapa.setTarget(undefined);
    };
  }, [m]);

  useEffect(() => {
    m.baseCalles.setVisible(!satelital);
    m.baseSatelital.setVisible(satelital);
  }, [m, satelital]);

  useEffect(() => {
    m.nueva.clear();
    if (!nuevo) return;
    m.marca.setGeometry(new Point(fromLonLat(nuevo)));
    m.nueva.addFeature(m.marca);
  }, [m, nuevo]);

  // Al elegir un proveedor no queda nada marcado; la dirección a buscar sale del domicilio del padrón
  function elegir(p: Proveedor | null) {
    setElegido(p);
    setNuevo(null);
    setDirecciones(null);
    setDireccion(p?.domicilio?.replace(/\s+Nro\s+0\b/i, "").replace(/\s+Nro\s+/i, " ") ?? "");
    setNota(p?.nota ?? "");
  }

  // En el mapa, su ubicación actual en gris y la vista sobre ella
  useEffect(() => {
    m.actual.clear();
    if (!elegido) return;
    const centro = fromLonLat([elegido.lon, elegido.lat]);
    m.actual.addFeature(new Feature(new Point(centro)));
    m.mapa.getView().animate({ center: centro, zoom: elegido.precision === "provincia" ? 8 : pendiente(elegido) ? 14 : 17, duration: 300 });
  }, [m, elegido]);

  // Lista: espera a que se deje de escribir para buscar
  useEffect(() => {
    const t = setTimeout(() => setBuscado(texto), 350);
    return () => clearTimeout(t);
  }, [texto]);

  // La lista se pide de nuevo al cambiar los filtros; "Ver más" agrega la página siguiente
  const filtros = useMemo(() => new URLSearchParams({ estado, q: buscado, localidad }).toString(), [estado, buscado, localidad]);
  const [cargadoPara, setCargadoPara] = useState<string | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const cargando = cargandoMas || cargadoPara !== filtros;

  const pedir = useCallback(
    async (desde: number, signal?: AbortSignal) => {
      const r = await fetch(`/api/ubicaciones?${filtros}&desde=${desde}`, { signal });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos.error ?? "No se pudo cargar la lista.");
      return datos as { filas: Proveedor[]; total: number; resumen: Resumen };
    },
    [filtros],
  );

  useEffect(() => {
    const control = new AbortController();
    pedir(0, control.signal)
      .then((d) => {
        setLista(d.filas);
        setTotal(d.total);
        setResumen(d.resumen);
        setError(null);
      })
      .catch((e) => !control.signal.aborted && setError(e instanceof Error ? e.message : "No se pudo cargar la lista."))
      .finally(() => !control.signal.aborted && setCargadoPara(filtros));
    return () => control.abort();
  }, [pedir, filtros]);

  async function verMas() {
    setCargandoMas(true);
    try {
      const d = await pedir(lista.length);
      setLista((anterior) => [...anterior, ...d.filas]);
      setTotal(d.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la lista.");
    } finally {
      setCargandoMas(false);
    }
  }

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3500);
    return () => clearTimeout(t);
  }, [aviso]);

  function siguiente(desde: Proveedor | null) {
    const i = desde ? lista.findIndex((p) => p.id === desde.id) : -1;
    elegir(lista.slice(i + 1).find((p) => p.cuit) ?? null);
  }

  async function guardarUbicacion() {
    if (!elegido?.cuit || !nuevo) return;
    setGuardando(true);
    try {
      const r = await fetch("/api/ubicaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuit: elegido.cuit, lon: nuevo[0], lat: nuevo[1], nota }),
      });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos.error ?? "No se pudo guardar.");
      const guardado: Proveedor = datos.proveedor;
      const i = lista.findIndex((p) => p.id === guardado.id);
      // En "Pendientes" el guardado sale de la lista; se pasa al que seguía
      const quitar = estado === "pendientes";
      const proximo = lista.slice(i + 1).find((p) => p.cuit) ?? null;
      setLista((l) => (quitar ? l.filter((p) => p.id !== guardado.id) : l.map((p) => (p.id === guardado.id ? guardado : p))));
      if (quitar) setTotal((t) => t - 1);
      setResumen((rs) => rs && { ...rs, pendientes: rs.pendientes - (pendiente(elegido) ? 1 : 0), manuales: rs.manuales + (elegido.fuente_geo === "manual" ? 0 : 1) });
      setAviso(`Se guardó la ubicación de ${guardado.entidad}.`);
      if (quitar) elegir(proximo);
      else setElegido(guardado);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  async function buscar() {
    if (!elegido || !direccion.trim()) return;
    setBuscandoDireccion(true);
    try {
      setDirecciones(await buscarDireccion(direccion.trim(), elegido));
    } catch {
      setDirecciones([]);
    } finally {
      setBuscandoDireccion(false);
    }
  }

  function irADireccion(d: Direccion) {
    setNuevo([d.lon, d.lat]);
    m.mapa.getView().animate({ center: fromLonLat([d.lon, d.lat]), zoom: 18, duration: 300 });
  }

  return (
    <div className="flex h-dvh flex-col bg-superficie text-texto">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-borde bg-fondo px-4 py-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- isotipo oficial en SVG */}
        <img src="/marca/isotipo.svg" alt="" className="-my-1 size-9" />
        <div className="mr-auto">
          <h1 className="m-0 text-base leading-tight font-semibold">Ubicación de proveedores</h1>
          <p className="m-0 text-xs text-tenue">
            Herramienta interna · lo que se marca acá se ve en el visor y se mantiene en cada actualización del padrón
          </p>
        </div>
        {resumen && (
          <p className="m-0 text-sm text-tenue tabular-nums">
            <b className="text-texto">{resumen.pendientes.toLocaleString("es-AR")}</b> pendientes ·{" "}
            <b className="text-texto">{resumen.manuales.toLocaleString("es-AR")}</b> marcados a mano ·{" "}
            {resumen.total.toLocaleString("es-AR")} proveedores
          </p>
        )}
        <Link href="/visor" className="text-sm text-acento">
          Ir al visor
        </Link>
      </header>

      <div className="flex min-h-0 flex-1 max-md:flex-col">
        {/* Lista */}
        <aside className="flex min-h-0 w-full flex-col border-r border-borde bg-fondo md:w-[24rem] max-md:h-[45%]">
          <div className="flex flex-col gap-2 border-b border-borde p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-tenue" aria-hidden />
              <input
                type="search"
                aria-label="Buscar por CUIT, nombre o domicilio"
                placeholder="CUIT, nombre o domicilio…"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                className={`${campo} pl-8`}
              />
            </div>
            <div role="radiogroup" aria-label="Qué proveedores ver" className="flex gap-1 rounded-lg bg-superficie p-0.5">
              {ESTADOS.map((e) => (
                <button
                  key={e.valor}
                  type="button"
                  role="radio"
                  aria-checked={estado === e.valor}
                  onClick={() => setEstado(e.valor)}
                  className={
                    `${reset} flex-1 cursor-pointer rounded-md px-2 py-1 text-xs font-medium ` +
                    (estado === e.valor ? "bg-fondo text-texto shadow-sm" : "text-tenue hover:text-texto")
                  }
                >
                  {e.etiqueta}
                </button>
              ))}
            </div>
            <select aria-label="Localidad" className={campo} value={localidad} onChange={(e) => setLocalidad(e.target.value)}>
              <option value="">Todas las localidades</option>
              {resumen?.localidades.map((l) => (
                <option key={`${l.provincia}-${l.localidad}`} value={l.localidad}>
                  {l.localidad} ({l.provincia}) · {l.pendientes} pendientes
                </option>
              ))}
            </select>
            <p className="m-0 text-xs text-tenue" aria-live="polite">
              {cargando && !lista.length ? "Cargando…" : `${total.toLocaleString("es-AR")} ${total === 1 ? "proveedor" : "proveedores"}`}
            </p>
          </div>

          {error && <p className="m-3 rounded-md bg-superficie p-2 text-sm">{error}</p>}
          <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-1.5">
            {lista.map((p) => {
              const activo = elegido?.id === p.id;
              const Icono = p.tipo_persona === "fisica" ? User : Building2;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={!p.cuit}
                    onClick={() => elegir(p)}
                    aria-current={activo || undefined}
                    title={p.cuit ? undefined : "Sin CUIT: no se puede guardar su ubicación"}
                    className={
                      `${reset} flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left disabled:cursor-default disabled:opacity-50 ` +
                      (activo ? "bg-acento/12 ring-1 ring-acento/40" : "hover:bg-superficie")
                    }
                  >
                    <Icono className="mt-0.5 size-4 shrink-0 text-tenue" aria-hidden />
                    <span className="min-w-0 flex-1 text-sm leading-snug">
                      <span className="block truncate font-medium">{p.entidad}</span>
                      <span className="block truncate text-xs text-tenue">{p.domicilio || "Sin domicilio en el padrón"}</span>
                      <span className="block truncate text-xs text-tenue">
                        {conGuiones(p.cuit)} · {[p.localidad, p.provincia].filter(Boolean).join(", ")}
                      </span>
                    </span>
                    {p.fuente_geo === "manual" && <Check className="mt-0.5 size-4 shrink-0 text-acento" aria-label="Marcado a mano" />}
                  </button>
                </li>
              );
            })}
            {!cargando && !lista.length && !error && <li className="p-3 text-sm text-tenue">No hay proveedores con estos filtros.</li>}
            {lista.length < total && (
              <li className="p-2">
                <button type="button" className={`${botonSecundario} w-full`} disabled={cargando} onClick={verMas}>
                  {cargando ? "Cargando…" : "Ver más"}
                </button>
              </li>
            )}
          </ul>
        </aside>

        {/* Mapa y ficha del elegido */}
        <main className="relative min-h-0 flex-1">
          <div ref={elementoMapa} className="absolute inset-0" />

          <div className={`${tarjeta} absolute top-3 right-3 flex gap-0.5 p-0.5 text-xs`} role="radiogroup" aria-label="Mapa base">
            {[
              { v: false, t: "Calles" },
              { v: true, t: "Satelital" },
            ].map((b) => (
              <button
                key={b.t}
                type="button"
                role="radio"
                aria-checked={satelital === b.v}
                onClick={() => setSatelital(b.v)}
                className={`${reset} cursor-pointer rounded-lg px-2.5 py-1 font-medium ` + (satelital === b.v ? "bg-acento text-acento-texto" : "hover:bg-superficie")}
              >
                {b.t}
              </button>
            ))}
          </div>

          {elegido ? (
            <section aria-label="Proveedor elegido" className={`${tarjeta} absolute top-3 left-3 flex max-h-[calc(100%-1.5rem)] w-[min(23rem,calc(100%-1.5rem))] flex-col gap-2.5 overflow-y-auto p-3.5 text-sm`}>
              <div>
                <h2 className="m-0 text-base leading-tight font-semibold">{elegido.entidad}</h2>
                <p className="m-0 text-xs text-tenue">
                  {conGuiones(elegido.cuit)}
                  {elegido.rubro ? ` · ${elegido.rubro.charAt(0)}${elegido.rubro.slice(1).toLowerCase()}` : ""}
                </p>
              </div>
              <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-tenue">Domicilio</dt>
                <dd className="m-0">{elegido.domicilio || "Sin domicilio en el padrón"}</dd>
                <dt className="text-tenue">Localidad</dt>
                <dd className="m-0">{[elegido.localidad, elegido.departamento, elegido.provincia].filter(Boolean).join(", ")}</dd>
                <dt className="text-tenue">Ubicación</dt>
                <dd className="m-0 flex items-center gap-1.5">
                  <span className="inline-block size-2.5 rounded-full border-2 border-[#13262e] bg-[#9bb2bb]" aria-hidden />
                  {PRECISION[elegido.precision] ?? elegido.precision}
                </dd>
              </dl>

              <form
                className="flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  buscar();
                }}
              >
                <input
                  aria-label="Buscar la dirección en el mapa"
                  placeholder="Calle y altura"
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  className={campo}
                />
                <button type="submit" className={botonSecundario} disabled={buscandoDireccion}>
                  {buscandoDireccion ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : "Buscar"}
                </button>
              </form>
              {direcciones && (
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                  {!direcciones.length && <li className="text-xs text-tenue">No se encontró esa dirección. Marcá el punto en el mapa.</li>}
                  {direcciones.map((d) => (
                    <li key={`${d.nombre}-${d.lon}-${d.lat}`}>
                      <button
                        type="button"
                        onClick={() => irADireccion(d)}
                        className={`${reset} flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-superficie`}
                      >
                        <MapPin className="mt-0.5 size-3.5 shrink-0 text-acento" aria-hidden />
                        {d.nombre}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <p className="m-0 rounded-md bg-superficie px-2.5 py-2 text-xs">
                {nuevo ? (
                  <>
                    <span className="mr-1 inline-block size-2.5 rounded-full bg-[#ff682c] align-middle ring-2 ring-white" aria-hidden />
                    Nueva ubicación: {nuevo[1].toFixed(5)}, {nuevo[0].toFixed(5)}. Podés arrastrar el punto para ajustarlo.
                  </>
                ) : (
                  "Hacé clic en el mapa donde está el proveedor, o buscá la dirección."
                )}
              </p>
              <label className="flex flex-col gap-1 text-xs text-tenue">
                Nota (opcional)
                <input
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Por ejemplo: ubicado con la imagen satelital"
                  maxLength={500}
                  className={campo}
                />
              </label>
              <div className="flex gap-2">
                <button type="button" className={`${botonPrimario} flex-1`} disabled={!nuevo || guardando} onClick={guardarUbicacion}>
                  {guardando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
                  Guardar ubicación
                </button>
                <button type="button" className={botonSecundario} onClick={() => siguiente(elegido)}>
                  Siguiente
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </div>
            </section>
          ) : (
            <p className={`${tarjeta} absolute top-3 left-3 m-0 max-w-[min(23rem,calc(100%-1.5rem))] p-3.5 text-sm`}>
              Elegí un proveedor de la lista para ubicarlo en el mapa.
            </p>
          )}

          {aviso && (
            <p role="status" className="absolute bottom-8 left-1/2 m-0 -translate-x-1/2 rounded-lg bg-texto px-3 py-2 text-sm text-fondo shadow-lg">
              {aviso}
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
