"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Map from "ol/Map";
import View from "ol/View";
import Overlay from "ol/Overlay";
import Feature from "ol/Feature";
import Graticule from "ol/layer/Graticule";
import TileLayer from "ol/layer/Tile";
import ImageLayer from "ol/layer/Image";
import VectorLayer from "ol/layer/Vector";
import XYZ from "ol/source/XYZ";
import ImageWMS from "ol/source/ImageWMS";
import VectorSource from "ol/source/Vector";
import WMSCapabilities from "ol/format/WMSCapabilities";
import { Point, type Geometry } from "ol/geom";
import { circular } from "ol/geom/Polygon";
import { ScaleLine } from "ol/control";
import { Circle, Fill, Stroke, Style } from "ol/style";
import { fromLonLat, toLonLat, transformExtent } from "ol/proj";
import { boundingExtent, type Extent } from "ol/extent";
import type { FeatureLike } from "ol/Feature";
import "ol/ol.css";
import { Minus, Plus } from "lucide-react";
import { BASE_INICIAL, CAPAS_NODO, MAPAS_BASE, PUBLIC_GEOSERVER, SIN_BASE, WORKSPACE, temaDe, type CapaNodo } from "@/lib/config";
import catalogoIdera from "@/lib/capas-idera.json";
import FichaConsulta, { type Consulta } from "./FichaConsulta";
import PanelLateral from "./PanelLateral";
import PanelCapas from "./PanelCapas";
import PanelAgregar, { type CapaWms } from "./PanelAgregar";
import { PanelAccesibilidad, PanelAyuda, PanelMapasBase, usePreferenciasAccesibilidad } from "./PanelesInfo";
import BarraHerramientas from "./BarraHerramientas";
import { consultar, hayDatoEn } from "./consulta";
import { useHerramientas } from "./useHerramientas";
import { capturaPng, imprimirPdf } from "./exportar";
import { BotonIcono, botonPrimario, campo, tarjeta } from "./ui";
import { Z, type CapaVisor, type Localidad, type Panel } from "./tipos";
import type { Lugar } from "./Buscador";

const VISTA_INICIAL = { lon: -68.5, lat: -43.7, zoom: 6 }; // Chubut
const COLORES_ARCHIVO = ["#7048e8", "#0ca678", "#d6336c", "#1c7ed6", "#f59f00"];
const corto = (nombre: string) => nombre.split(":").pop()!;

// Margen al encuadrar la ficha: deja libre la barra de herramientas (≈56px) que flota sobre el mapa
const MARGEN_FICHA = 72;

const duracion = () => (document.documentElement.hasAttribute("data-sin-animaciones") ? 0 : 400);

// El resaltado del dato consultado lleva el color de su tema (franja del isotipo)
const estiloResaltado = (f: FeatureLike) => {
  const color = (f.get("color") as string | undefined) ?? "#21708c";
  return new Style({
    image: new Circle({ radius: 11, fill: new Fill({ color: `${color}33` }), stroke: new Stroke({ color, width: 3.5 }) }),
    stroke: new Stroke({ color, width: 3.5 }),
    fill: new Fill({ color: `${color}1f` }),
  });
};

// Las franjas se definen como variables CSS; OpenLayers necesita el color resuelto
const colorDelTema = (grupo: string) => {
  const valor = temaDe(grupo).color.match(/var\((--[\w-]+)\)/);
  return (valor && getComputedStyle(document.documentElement).getPropertyValue(valor[1]).trim()) || "#21708c";
};

const estiloUbicacion = new Style({
  image: new Circle({ radius: 7, fill: new Fill({ color: "#1c7ed6" }), stroke: new Stroke({ color: "#fff", width: 2.5 }) }),
  fill: new Fill({ color: "rgba(28, 126, 214, 0.12)" }),
  stroke: new Stroke({ color: "rgba(28, 126, 214, 0.5)", width: 1 }),
});

const CLAVES_URL = ["zoom", "lat", "lng", "base", "capas", "localidad"];

const lista = (valores: string[]) => valores.map((v) => `'${v.replaceAll("'", "''")}'`).join(", ");

// Filtro CQL de GeoServer para los valores elegidos; sin filtro cuando están todos
export function cqlDe(atributo: string, elegidos: string[], total: number) {
  if (elegidos.length === total) return undefined;
  if (elegidos.length === 0) return "EXCLUDE";
  return `${atributo} IN (${lista(elegidos)})`;
}

// Filtro CQL de una capa del nodo: valores del atributo y localidades elegidas (sin localidades: todas)
function cqlCapa(c: CapaNodo, elegidos?: string[], localidades?: string[]) {
  const partes = [
    c.filtro && elegidos && cqlDe(c.filtro.atributo, elegidos, c.filtro.opciones.length),
    c.filtroLocalidad && localidades?.length ? `localidad IN (${lista(localidades)})` : undefined,
  ].filter((p): p is string => p !== undefined);
  if (partes.includes("EXCLUDE")) return "EXCLUDE";
  return partes.length ? partes.join(" AND ") : undefined;
}

// Localidades con proveedores (WFS de la capa de conteo), ordenadas por nombre
async function cargarLocalidades(capa: string): Promise<Localidad[]> {
  const q = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: capa,
    propertyName: "localidad,departamento,provincia,cant_proveedores,geom",
    srsName: "EPSG:3857",
    outputFormat: "application/json",
  });
  const datos = await (await fetch(`${PUBLIC_GEOSERVER}/${WORKSPACE}/wfs?${q}`)).json();
  return (datos.features as { properties: Record<string, string | number>; geometry: { coordinates: number[] } }[])
    .filter((f) => f.properties.localidad && f.geometry)
    .map((f) => ({
      nombre: String(f.properties.localidad),
      departamento: String(f.properties.departamento ?? ""),
      provincia: String(f.properties.provincia ?? ""),
      cantidad: Number(f.properties.cant_proveedores),
      coordenada: f.geometry.coordinates,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

// Vista y capas compartibles por URL: ?zoom=&lat=&lng=&base=&capas=&localidad=
function leerUrl() {
  const q = new URLSearchParams(location.search);
  const num = (k: string, defecto: number) => (q.has(k) && !isNaN(Number(q.get(k))) ? Number(q.get(k)) : defecto);
  return {
    zoom: num("zoom", VISTA_INICIAL.zoom),
    lat: num("lat", VISTA_INICIAL.lat),
    lon: num("lng", VISTA_INICIAL.lon),
    base: [...MAPAS_BASE.map((b) => b.id), SIN_BASE].includes(q.get("base")!) ? q.get("base")! : BASE_INICIAL,
    capas: q.has("capas") ? q.get("capas")!.split(",").filter(Boolean) : null,
    localidades: q.get("localidad")?.split(",").filter(Boolean) ?? [],
    // Filtros de capas: un parámetro por atributo, con los valores elegidos (?tipo_persona=juridica)
    filtros: Object.fromEntries([...q.entries()].filter(([k]) => !CLAVES_URL.includes(k))),
  };
}

// Capas temáticas nacionales del catálogo de IDERA (scripts/actualizar-capas-idera.mjs), apagadas al inicio
function capasCatalogo(activas: string[] | null): CapaVisor[] {
  return catalogoIdera.capas.map((c) => {
    const visible = activas?.includes(c.id) ?? false;
    return {
      id: c.id,
      titulo: c.titulo,
      grupo: c.grupo,
      origen: "catalogo",
      visible,
      opacidad: 1,
      resumen: c.resumen,
      consultable: c.consultable,
      exportable: c.cors,
      leyenda: `${c.url}?service=WMS&version=1.3.0&request=GetLegendGraphic&format=image/png&layer=${encodeURIComponent(c.capa)}`,
      capa: new ImageLayer({
        visible,
        zIndex: Z.catalogo,
        // crossOrigin solo si el servicio lo permite: si no, la imagen no cargaría
        source: new ImageWMS({ url: c.url, params: { LAYERS: c.capa }, crossOrigin: c.cors ? "anonymous" : undefined }),
      }),
    };
  });
}

// Mapa, capas y overlays: se crean una vez, antes del primer render
function crearMapa() {
  const inicial = leerUrl();
  const nodoPopup = document.createElement("div");
  const nodoTexto = document.createElement("div");
  const bases: Record<string, TileLayer<XYZ>> = {};
  const resaltado = new VectorSource();
  const ubicacion = new VectorSource();
  const nodo: CapaVisor[] = CAPAS_NODO.map((c) => {
    const visible = inicial.capas ? inicial.capas.includes(corto(c.nombre)) : true;
    const todos = c.filtro?.opciones.map((o) => o.valor) ?? [];
    const enUrl = c.filtro && inicial.filtros[c.filtro.atributo]?.split(",").filter((v) => todos.includes(v));
    const filtro = c.filtro ? (enUrl ?? todos) : undefined;
    const localidades = c.filtroLocalidad ? inicial.localidades : undefined;
    return {
      id: c.nombre,
      titulo: c.titulo,
      grupo: c.grupo,
      origen: "nodo",
      visible,
      opacidad: 1,
      nodo: c,
      filtro,
      localidades,
      // Imagen única (no teselas): GeoServer no corta las etiquetas en los bordes
      capa: new ImageLayer({
        visible,
        zIndex: Z.superpuesta,
        source: new ImageWMS({
          url: `${PUBLIC_GEOSERVER}/wms`,
          params: { LAYERS: c.nombre, CQL_FILTER: cqlCapa(c, filtro, localidades) },
          serverType: "geoserver",
          crossOrigin: "anonymous",
        }),
      }),
    };
  });

  const catalogo = capasCatalogo(inicial.capas);

  const popup = new Overlay({
    element: nodoPopup,
    positioning: "bottom-center",
    offset: [0, -14],
    autoPan: { animation: { duration: 250 }, margin: MARGEN_FICHA },
  });
  const editor = new Overlay({ element: nodoTexto, positioning: "bottom-center", offset: [0, -8] });

  const mapa = new Map({
    controls: [],
    layers: [
      ...MAPAS_BASE.map((b) => {
        const capa = new TileLayer({
          visible: b.id === inicial.base,
          zIndex: Z.base,
          source: new XYZ({ url: b.url, attributions: b.atribucion, crossOrigin: "anonymous" }),
        });
        bases[b.id] = capa;
        return capa;
      }),
      ...nodo.map((c) => c.capa),
      ...catalogo.map((c) => c.capa),
      new VectorLayer({ source: ubicacion, style: estiloUbicacion, zIndex: Z.resaltado }),
      new VectorLayer({ source: resaltado, style: estiloResaltado, zIndex: Z.resaltado }),
    ],
    overlays: [popup, editor],
    view: new View({ center: fromLonLat([inicial.lon, inicial.lat]), zoom: inicial.zoom, maxZoom: 20 }),
  });

  return { mapa, nodo, catalogo, inicial, bases, popup, editor, resaltado, ubicacion, nodoPopup, nodoTexto };
}

export default function Visor() {
  usePreferenciasAccesibilidad();
  const raiz = useRef<HTMLDivElement>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const escalaRef = useRef<HTMLDivElement>(null);
  const [v] = useState(crearMapa);
  const { mapa, inicial, bases, popup, editor, resaltado, ubicacion } = v;
  const [capas, setCapas] = useState<CapaVisor[]>(() => [...v.nodo, ...v.catalogo]);
  const [base, setBase] = useState(inicial.base);
  const [panel, setPanel] = useState<Panel | null>(() => (window.innerWidth < 640 ? null : "capas"));
  const [zoom, setZoom] = useState(inicial.zoom);
  const [cursor, setCursor] = useState<number[] | null>(null);
  const [grilla, setGrilla] = useState<Graticule | null>(null);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [ubicando, setUbicando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  const herramientas = useHerramientas(mapa);

  // Consulta por clic
  const [consulta, setConsulta] = useState<Consulta | null>(null);
  const [geometrias, setGeometrias] = useState<(Geometry | undefined)[]>([]);
  const [indice, setIndice] = useState(0);
  const ultimaConsulta = useRef(0);

  // Los manejadores de eventos del mapa leen el estado actual por refs
  const capasRef = useRef(capas);
  const modoRef = useRef(herramientas.modo);
  useEffect(() => {
    capasRef.current = capas;
    modoRef.current = herramientas.modo;
  });

  // Creación del mapa (una sola vez)

  // El mapa se monta en el contenedor; la escala va en la barra inferior
  useEffect(() => {
    mapa.setTarget(contenedor.current!);
    const escala = new ScaleLine({ target: escalaRef.current!, minWidth: 80 });
    mapa.addControl(escala);

    // Extensión de cada capa del nodo, para "zoom a la capa"
    fetch(`${PUBLIC_GEOSERVER}/${WORKSPACE}/wms?service=WMS&request=GetCapabilities&version=1.3.0`)
      .then((r) => r.text())
      .then((xml) => {
        const extensiones: Record<string, Extent> = {};
        const recorrer = (c: { Name?: string; EX_GeographicBoundingBox?: Extent; Layer?: unknown[] }) => {
          if (c.Name && c.EX_GeographicBoundingBox) extensiones[corto(c.Name)] = c.EX_GeographicBoundingBox;
          (c.Layer as (typeof c)[] | undefined)?.forEach(recorrer);
        };
        recorrer(new WMSCapabilities().read(xml).Capability.Layer);
        setCapas((actuales) =>
          actuales.map((c) => {
            const e = extensiones[corto(c.id)];
            return c.origen === "nodo" && e ? { ...c, extension: transformExtent(e, "EPSG:4326", "EPSG:3857") } : c;
          }),
        );
      })
      .catch(() => {}); // sin extensión no se muestra el botón de zoom

    // Lista para el filtro por localidad; si el WFS no responde, el filtro no se muestra
    const fuente = CAPAS_NODO.find((c) => c.filtroLocalidad)?.filtroLocalidad;
    if (fuente) cargarLocalidades(fuente).then(setLocalidades).catch(() => {});

    return () => {
      mapa.removeControl(escala);
      mapa.setTarget(undefined);
    };
  }, [mapa]);


  // Eventos del mapa
  useEffect(() => {
    if (!mapa) return;
    const vista = mapa.getView();

    const alMover = mapa.on("moveend", () => {
      setZoom(vista.getZoom()!);
      escribirUrl();
    });

    const alPasar = mapa.on("pointermove", (e) => {
      if (e.dragging) return;
      setCursor(toLonLat(e.coordinate));
      const elemento = contenedor.current!;
      if (modoRef.current) {
        elemento.style.cursor = "crosshair";
        return;
      }
      const archivos = capasRef.current.filter((c) => c.origen === "archivo" && c.visible).map((c) => c.capa);
      const sobreDato =
        hayDatoEn(capasRef.current.filter((c) => c.origen !== "archivo"), e.pixel) ||
        mapa.hasFeatureAtPixel(e.pixel, { layerFilter: (l) => archivos.includes(l), hitTolerance: 5 });
      elemento.style.cursor = sobreDato ? "pointer" : "";
    });
    const alSalir = () => setCursor(null);
    mapa.getViewport()!.addEventListener("mouseleave", alSalir);

    const alClic = mapa.on("singleclick", async (e) => {
      if (modoRef.current) return; // la herramienta activa usa el clic
      if (!capasRef.current.some((c) => c.visible)) return;
      const id = ++ultimaConsulta.current;
      popup.setPosition(e.coordinate);
      setConsulta({ estado: "cargando" });
      setGeometrias([]);
      setIndice(0);
      try {
        const hallazgos = await consultar(mapa, capasRef.current, e.coordinate, e.pixel);
        if (id !== ultimaConsulta.current) return; // llegó una consulta más nueva
        setConsulta({ estado: "listo", resultados: hallazgos.map((h) => h.resultado) });
        setGeometrias(hallazgos.map((h) => h.geometria));
      } catch {
        if (id === ultimaConsulta.current) setConsulta({ estado: "error" });
      }
    });

    const alCambiarPantalla = () => setPantallaCompleta(document.fullscreenElement === raiz.current);
    document.addEventListener("fullscreenchange", alCambiarPantalla);

    return () => {
      mapa.un("moveend", alMover.listener);
      mapa.un("pointermove", alPasar.listener);
      mapa.un("singleclick", alClic.listener);
      mapa.getViewport()!.removeEventListener("mouseleave", alSalir);
      document.removeEventListener("fullscreenchange", alCambiarPantalla);
    };
    // escribirUrl solo lee refs y el estado del mapa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa]);

  // La URL refleja la vista, el mapa base y las capas activas del nodo
  function escribirUrl() {
    if (!mapa) return;
    const vista = mapa.getView();
    const [lon, lat] = toLonLat(vista.getCenter()!);
    const activa = Object.entries(bases).find(([, c]) => c.getVisible())?.[0] ?? SIN_BASE;
    const q = new URLSearchParams({
      zoom: vista.getZoom()!.toFixed(2).replace(/\.?0+$/, ""),
      lat: lat.toFixed(5),
      lng: lon.toFixed(5),
      base: activa,
      capas: capasRef.current
        .filter((c) => (c.origen === "nodo" || c.origen === "catalogo") && c.visible)
        .map((c) => corto(c.id))
        .join(","),
    });
    for (const c of capasRef.current) {
      const f = c.nodo?.filtro;
      if (f && c.filtro && c.filtro.length < f.opciones.length) q.set(f.atributo, c.filtro.join(","));
      if (c.localidades?.length) q.set("localidad", c.localidades.join(","));
    }
    history.replaceState(null, "", `${location.pathname}?${q}`);
  }
  useEffect(escribirUrl, [mapa, bases, base, capas]);

  // Resaltado y popup siguen al resultado que se está mirando
  useEffect(() => {
    resaltado.clear();
    const g = geometrias[indice];
    if (!g) return;
    const marca = new Feature(g);
    const grupo = consulta?.estado === "listo" ? consulta.resultados[indice]?.grupo : undefined;
    if (grupo) marca.set("color", colorDelTema(grupo));
    resaltado.addFeature(marca);
    if (g instanceof Point) popup.setPosition(g.getCoordinates());
  }, [geometrias, indice, popup, resaltado, consulta]);

  // Con los datos cargados la ficha crece: se vuelve a encuadrar para que no quede cortada
  useEffect(() => {
    if (consulta?.estado !== "listo") return;
    const cuadro = requestAnimationFrame(() => popup.panIntoView({ animation: { duration: 250 }, margin: MARGEN_FICHA }));
    return () => cancelAnimationFrame(cuadro);
  }, [consulta, indice, popup]);

  const cerrarConsulta = useCallback(() => {
    ultimaConsulta.current++;
    popup.setPosition(undefined);
    setConsulta(null);
    setGeometrias([]);
  }, [popup]);

  useEffect(() => {
    if (!consulta) return;
    const teclado = (e: KeyboardEvent) => e.key === "Escape" && cerrarConsulta();
    window.addEventListener("keydown", teclado);
    return () => window.removeEventListener("keydown", teclado);
  }, [consulta, cerrarConsulta]);

  useEffect(() => {
    editor.setPosition(herramientas.editorTexto?.coordenada);
  }, [editor, herramientas.editorTexto]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  // --- Acciones ---

  function cambiarCapa(id: string, cambios: Partial<Pick<CapaVisor, "visible" | "opacidad">>) {
    setCapas((actuales) =>
      actuales.map((c) => {
        if (c.id !== id) return c;
        if (cambios.visible !== undefined) c.capa.setVisible(cambios.visible);
        if (cambios.opacidad !== undefined) c.capa.setOpacity(cambios.opacidad);
        return { ...c, ...cambios };
      }),
    );
  }

  // El filtro se aplica en GeoServer: cambia la imagen y también lo que devuelve la consulta por clic
  function filtrarCapa(id: string, cambios: Partial<Pick<CapaVisor, "filtro" | "localidades">>) {
    const c = capas.find((x) => x.id === id);
    if (!c?.nodo) return;
    const nueva = { ...c, ...cambios };
    (c.capa.getSource() as ImageWMS).updateParams({ CQL_FILTER: cqlCapa(c.nodo, nueva.filtro, nueva.localidades) });
    setCapas((actuales) => actuales.map((x) => (x.id === id ? nueva : x)));
    // Al sumar localidades, el mapa va hacia ellas (los proveedores se ven al acercar)
    const agregadas = cambios.localidades?.filter((l) => !c.localidades?.includes(l)) ?? [];
    const puntos = localidades.filter((l) => agregadas.includes(l.nombre)).map((l) => l.coordenada);
    if (puntos.length) encuadrar(boundingExtent(puntos), 13);
  }

  function encuadrar(extension: Extent, maxZoom = 15) {
    const ancho = raiz.current!.clientWidth;
    const izquierda = panel && ancho >= 640 ? 440 : 24;
    mapa?.getView().fit(extension, { padding: [80, 80, 80, izquierda], maxZoom, duration: duracion() });
  }

  function agregarWms(w: CapaWms) {
    if (!mapa) return;
    const capa = new ImageLayer({
      zIndex: Z.superpuesta,
      // Sin crossOrigin: muchos servidores no envían CORS para las imágenes (la captura puede fallar)
      source: new ImageWMS({ url: w.url, params: { LAYERS: w.nombre } }),
    });
    mapa.addLayer(capa);
    setCapas((actuales) => [
      ...actuales,
      {
        id: `${w.url}#${w.nombre}`,
        titulo: w.titulo,
        grupo: "Capas agregadas",
        origen: "wms",
        exportable: false, // se pide sin crossOrigin para que cargue aunque el servidor no tenga CORS
        capa,
        visible: true,
        opacidad: 1,
        leyenda: w.leyenda,
        extension: w.extension && transformExtent(w.extension, "EPSG:4326", "EPSG:3857"),
      },
    ]);
  }

  function agregarArchivo(titulo: string, features: Feature[]) {
    if (!mapa) return;
    const color = COLORES_ARCHIVO[capas.filter((c) => c.origen === "archivo").length % COLORES_ARCHIVO.length];
    const fuente = new VectorSource({ features });
    const capa = new VectorLayer({
      source: fuente,
      zIndex: Z.superpuesta,
      style: new Style({
        fill: new Fill({ color: `${color}33` }),
        stroke: new Stroke({ color, width: 2 }),
        image: new Circle({ radius: 6, fill: new Fill({ color }), stroke: new Stroke({ color: "#fff", width: 1.5 }) }),
      }),
    });
    mapa.addLayer(capa);
    const extension = fuente.getExtent() ?? undefined;
    setCapas((actuales) => [
      ...actuales,
      { id: `archivo-${Date.now()}`, titulo, grupo: "Capas agregadas", origen: "archivo", capa, visible: true, opacidad: 1, color, extension },
    ]);
    if (extension) encuadrar(extension);
  }

  function quitarCapa(id: string) {
    const c = capas.find((x) => x.id === id);
    if (c) mapa?.removeLayer(c.capa);
    setCapas((actuales) => actuales.filter((x) => x.id !== id));
  }

  function elegirBase(id: string) {
    for (const [clave, capa] of Object.entries(bases)) capa.setVisible(clave === id);
    setBase(id);
  }

  function irA(l: Lugar) {
    mapa?.getView().animate({ center: fromLonLat([l.lon, l.lat]), zoom: 13, duration: duracion() * 2 });
  }

  function miUbicacion() {
    if (!navigator.geolocation) return setAviso("El navegador no permite obtener la ubicación.");
    setUbicando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUbicando(false);
        const { longitude, latitude, accuracy } = pos.coords;
        const centro = fromLonLat([longitude, latitude]);
        ubicacion.clear();
        ubicacion.addFeatures([
          new Feature(circular([longitude, latitude], accuracy, 64).transform("EPSG:4326", "EPSG:3857")),
          new Feature(new Point(centro)),
        ]);
        mapa?.getView().animate({ center: centro, zoom: 15, duration: duracion() * 2 });
      },
      () => {
        setUbicando(false);
        setAviso("No se pudo obtener tu ubicación. Revisá los permisos del navegador.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function alternarGrilla() {
    if (!mapa) return;
    if (grilla) {
      mapa.removeLayer(grilla);
      setGrilla(null);
      return;
    }
    const nueva = new Graticule({
      showLabels: true,
      wrapX: false,
      zIndex: Z.grilla,
      strokeStyle: new Stroke({ color: "rgba(31, 41, 51, 0.5)", width: 1, lineDash: [3, 4] }),
    });
    mapa.addLayer(nueva);
    setGrilla(nueva);
  }

  function alternarPantallaCompleta() {
    if (document.fullscreenElement) document.exitFullscreen();
    else raiz.current?.requestFullscreen();
  }

  async function exportar(accion: () => Promise<void>) {
    // Servicios sin CORS: el navegador no deja copiar sus imágenes a la captura
    const bloquean = capas.filter((c) => c.visible && c.exportable === false).map((c) => c.titulo);
    if (bloquean.length) {
      setAviso(`Para exportar, apagá ${bloquean.join(", ")}: el servicio no permite copiar sus imágenes.`);
      return;
    }
    try {
      await accion();
    } catch {
      setAviso("No se pudo exportar: alguna capa externa no permite usar sus imágenes. Quitala e intentá de nuevo.");
    }
  }

  const atribuciones = () =>
    (MAPAS_BASE.find((b) => b.id === base)?.atribucion ?? "").replace(/<[^>]+>/g, "");

  const contenidoPanel = {
    capas: (
      <PanelCapas
        capas={capas}
        localidades={localidades}
        onCambiar={cambiarCapa}
        onFiltrar={filtrarCapa}
        onZoom={(c) => c.extension && encuadrar(c.extension)}
        onQuitar={quitarCapa}
      />
    ),
    base: <PanelMapasBase base={base} onElegir={elegirBase} />,
    agregar: <PanelAgregar onAgregarWms={agregarWms} onAgregarArchivo={agregarArchivo} />,
    ayuda: <PanelAyuda />,
    accesibilidad: <PanelAccesibilidad />,
  };

  const baseActual = MAPAS_BASE.find((b) => b.id === base);

  return (
    <div ref={raiz} className="relative h-dvh w-full overflow-hidden bg-fondo text-texto">
      <div ref={contenedor} className="absolute inset-0" />

      <PanelLateral panel={panel} onPanel={setPanel} onLugar={irA}>
        {panel && contenidoPanel[panel]}
      </PanelLateral>

      <BarraHerramientas
        modo={herramientas.modo}
        onModo={(m) => {
          if (m) cerrarConsulta(); // una herramienta activa cierra la ficha de consulta
          herramientas.setModo(m);
        }}
        cantidad={herramientas.cantidad}
        grilla={grilla != null}
        onGrilla={alternarGrilla}
        pantallaCompleta={pantallaCompleta}
        onPantallaCompleta={alternarPantallaCompleta}
        onUbicacion={miUbicacion}
        ubicando={ubicando}
        onCaptura={() => mapa && exportar(() => capturaPng(mapa))}
        onImprimir={(titulo, orientacion) =>
          mapa
            ? exportar(() =>
                imprimirPdf(mapa, {
                  titulo,
                  orientacion,
                  atribuciones: atribuciones(),
                  leyenda: capas.filter((c) => c.visible).map((c) => c.titulo),
                }),
              )
            : Promise.resolve()
        }
        onBorrarTodo={herramientas.borrarTodo}
        onExportar={herramientas.exportarDibujos}
        ocultaEnMovil={panel !== null}
      />

      {/* Abajo a la derecha: zoom con nivel, como en el visor de IDERA */}
      <div className={`${tarjeta} absolute right-3 bottom-10 z-10 flex flex-col items-center p-1`}>
        <BotonIcono icono={Plus} etiqueta="Acercar" onClick={() => mapa?.getView().animate({ zoom: zoom + 1, duration: duracion() / 2 })} />
        <span className="py-0.5 text-sm font-semibold tabular-nums" aria-label={`Nivel de zoom ${Math.round(zoom)}`}>
          {Math.round(zoom)}
        </span>
        <BotonIcono icono={Minus} etiqueta="Alejar" onClick={() => mapa?.getView().animate({ zoom: zoom - 1, duration: duracion() / 2 })} />
      </div>

      {/* Abajo: escala, coordenadas del cursor y fuentes */}
      <div className="pointer-events-none absolute right-3 bottom-3 left-3 z-10 flex items-end justify-between gap-3 text-xs">
        <div className={`${tarjeta} pointer-events-auto flex items-center gap-3 px-2.5 py-1.5 shadow-sm`}>
          <div ref={escalaRef} className="escala" />
          <span className="min-w-[13rem] text-tenue tabular-nums max-sm:hidden">
            {cursor ? `Lat ${cursor[1].toFixed(5)}°  Lon ${cursor[0].toFixed(5)}°` : "Mové el cursor sobre el mapa"}
          </span>
        </div>
        {baseActual && (
          <div
            className="pointer-events-auto ml-auto rounded-md bg-fondo/85 px-2 py-0.5 text-[0.6875rem] text-tenue [&_a]:text-tenue"
            dangerouslySetInnerHTML={{ __html: baseActual.atribucion }}
          />
        )}
      </div>

      {aviso && (
        <div role="alert" className="absolute bottom-16 left-1/2 z-30 max-w-sm -translate-x-1/2 rounded-lg bg-tinta px-4 py-2.5 text-sm text-white shadow-lg">
          {aviso}
        </div>
      )}

      {consulta &&
        createPortal(
          <FichaConsulta consulta={consulta} indice={indice} onIndice={setIndice} onCerrar={cerrarConsulta} />,
          v.nodoPopup,
        )}

      {herramientas.editorTexto &&
        createPortal(
          <form
            className={`${tarjeta} flex gap-1.5 p-1.5`}
            onSubmit={(e) => {
              e.preventDefault();
              herramientas.confirmarTexto(new FormData(e.currentTarget).get("texto") as string);
            }}
          >
            <input
              name="texto"
              autoFocus
              placeholder="Escribí el texto"
              aria-label="Texto a ubicar en el mapa"
              className={`${campo} w-48`}
              onKeyDown={(e) => e.key === "Escape" && herramientas.confirmarTexto("")}
            />
            <button type="submit" className={botonPrimario}>
              Listo
            </button>
          </form>,
          v.nodoTexto,
        )}
    </div>
  );

}
