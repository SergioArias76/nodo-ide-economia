"use client";

import { useEffect, useState, type ReactNode } from "react";
import type Feature from "ol/Feature";
import type { Extent } from "ol/extent";
import { Point, Polygon, type Geometry } from "ol/geom";
import { extend } from "ol/extent";
import { getArea } from "ol/sphere";
import { toLonLat } from "ol/proj";
import {
  ArrowLeft, CircleDashed, Hash, LoaderCircle, MapPinned, PencilLine, Route, Shapes, Sigma, SquaresIntersect, Table, Trash2,
  TriangleAlert, type LucideIcon,
} from "lucide-react";
import {
  AREAS, DERIVADAS, MAXIMO, MAXIMO_DESTINOS, MODOS, OPERACIONES, PROCESOS, RELACIONES, aMapa, areaDeExtension, camposDe,
  columnasDe, compararInfluencia, contar, derivadas, distancias, esAnalizable, estadisticas, formatoDistancia, formatoDuracion, formatoNumero,
  influencia, nombreDe, obtener, superposicion,
  type AreaAnalisis, type CampoEntrada, type Derivada, type Entrada, type GFeatures, type ModoTransporte, type Operacion,
  type Proceso, type Relacion,
} from "./analisis";
import type { EstadoDatos } from "./PanelDatos";
import { Titulo, botonPrimario, botonSecundario, campo, reset } from "./ui";
import type { CapaVisor } from "./tipos";

const ICONOS: Record<Proceso, LucideIcon> = {
  conteo: Hash,
  estadisticas: Sigma,
  influencia: CircleDashed,
  superposicion: SquaresIntersect,
  distancias: Route,
  geometrias: Shapes,
};

const DIBUJOS = "dibujos";

type Props = {
  capas: CapaVisor[];
  dibujos: () => Feature[]; // puntos, líneas y polígonos dibujados con la barra de herramientas
  extensionMapa: () => Extent;
  // Pide al usuario un área (un polígono) o destinos (uno o más puntos) sobre el mapa; null si cancela
  capturar: (tipo: "Polygon" | "Point") => Promise<Geometry[] | null>;
  onBorrarMarca: (tipo: "Polygon" | "Point") => void;
  onResultado: (titulo: string, features: Feature[], proceso: Proceso) => void;
  onDatos: (d: EstadoDatos) => void;
};

type Estado =
  | { tipo: "inicial" }
  | { tipo: "corriendo"; mensaje: string }
  | { tipo: "error"; mensaje: string }
  | { tipo: "listo"; mensaje: ReactNode; numero?: number; aviso?: string };

function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-tenue">
      {etiqueta}
      {children}
    </label>
  );
}

const esperar = () => new Promise((r) => setTimeout(r, 30)); // deja pintar el mensaje antes de un cálculo largo
const num = (s: string) => Number(s.trim().replace(",", "."));
// En los nombres de los resultados encadenados no se repite "Resultado:"
const sinPrefijo = (t: string) => t.replace(/^Resultado: /, "");

// Filtros activos de una capa del nodo, para que se vea en el selector qué se va a analizar
function detalleFiltro(c?: CapaVisor) {
  if (!c?.nodo) return "";
  const partes: string[] = [];
  if (c.nodo.filtro && c.filtro && c.filtro.length < c.nodo.filtro.opciones.length)
    partes.push(c.nodo.filtro.opciones.filter((o) => c.filtro!.includes(o.valor)).map((o) => o.etiqueta.toLowerCase()).join(" y ") || "ninguno");
  if (c.rubros?.length) partes.push(c.rubros.length === 1 ? `rubro ${c.rubros[0].toLowerCase()}` : `${c.rubros.length} rubros`);
  if (c.localidades?.length) partes.push(c.localidades.length === 1 ? c.localidades[0] : `${c.localidades.length} localidades`);
  return partes.length ? ` (${partes.join(", ")})` : "";
}

export default function PanelAnalisis({ capas, dibujos, extensionMapa, capturar, onBorrarMarca, onResultado, onDatos }: Props) {
  const [proceso, setProceso] = useState<Proceso | null>(null);
  const [estado, setEstado] = useState<Estado>({ tipo: "inicial" });

  // Parámetros (se conservan al cambiar de proceso y de panel)
  const [entradaId, setEntradaId] = useState("");
  const [area, setArea] = useState<AreaAnalisis>("mapa");
  const [areaDibujada, setAreaDibujada] = useState<Polygon | null>(null);
  const [nuevaCapa, setNuevaCapa] = useState(false);
  const [leidos, setLeidos] = useState<{ capa: string; campos: CampoEntrada[] } | null>(null);
  const [campoSel, setCampoSel] = useState("");
  const [operacion, setOperacion] = useState<Operacion>("suma");
  const [sumarizar, setSumarizar] = useState("");
  const [distancia, setDistancia] = useState("");
  const [unidad, setUnidad] = useState<"meters" | "kilometers">("meters");
  const [comparaId, setComparaId] = useState(""); // área de influencia: capa a comparar ("" = ninguna)
  const [otraId, setOtraId] = useState("");
  const [relacion, setRelacion] = useState<Relacion>("interseccion");
  const [destinoTipo, setDestinoTipo] = useState<"puntos" | "coordenada">("puntos");
  const [destinos, setDestinos] = useState<number[][]>([]);
  const [lon, setLon] = useState("");
  const [lat, setLat] = useState("");
  const [tipoDistancia, setTipoDistancia] = useState<"recta" | "red">("recta");
  const [modo, setModo] = useState<ModoTransporte>("auto");
  const [derivada, setDerivada] = useState<Derivada>("centroide");

  const hayDibujos = dibujos().length > 0;
  const entradas: Entrada[] = [
    ...capas.filter((c) => c.visible && esAnalizable(c)).map((c) => ({ id: c.id, titulo: c.titulo, capa: c })),
    ...(hayDibujos ? [{ id: DIBUJOS, titulo: "Dibujos del mapa", features: dibujos }] : []),
  ];
  const entrada = entradas.find((e) => e.id === entradaId) ?? entradas[0];
  const otras = entradas.filter((e) => e.id !== entrada?.id);
  const otra = otras.find((e) => e.id === otraId) ?? otras[0];
  const compara = otras.find((e) => e.id === comparaId);
  const apagadas = capas.filter((c) => !c.visible && esAnalizable(c)).length;

  // Campos de la capa de entrada (tipos reales del servicio), para las estadísticas
  const claveEntrada = entrada?.id;
  useEffect(() => {
    if (proceso !== "estadisticas" || !entrada) return;
    let vigente = true;
    camposDe(entrada)
      .then((cs) => vigente && setLeidos({ capa: entrada.id, campos: cs }))
      .catch(() => vigente && setLeidos({ capa: entrada.id, campos: [] }));
    return () => {
      vigente = false;
    };
    // entrada cambia de identidad en cada render; alcanza con su id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proceso, claveEntrada]);

  const campos = leidos?.capa === claveEntrada ? leidos.campos : null; // null: todavía se están leyendo
  const numericos = campos?.filter((c) => c.numerico) ?? [];
  // "Cantidad de elementos" (sin campo) sirve para contar; las demás operaciones necesitan un campo numérico
  const CANTIDAD = "__cantidad";
  const operacionReal: Operacion = numericos.length ? operacion : "cuenta";
  const campoElegido =
    campoSel === CANTIDAD && operacionReal === "cuenta" ? null : (numericos.find((c) => c.atributo === campoSel) ?? (operacionReal === "cuenta" && !numericos.length ? null : numericos[0]));

  const destinoCoordenada = [num(lon), num(lat)];
  const coordenadaValida =
    lon.trim() !== "" && lat.trim() !== "" && !destinoCoordenada.some(isNaN) && Math.abs(destinoCoordenada[0]) <= 180 && Math.abs(destinoCoordenada[1]) <= 90;

  // Como en el INDEC, "Ejecutar" se habilita cuando están todos los parámetros obligatorios
  const faltante = (() => {
    if (!entrada) return "Elegí la capa de entrada.";
    if (area === "dibujo" && !areaDibujada) return "Dibujá el área de análisis.";
    if (proceso === "estadisticas" && !campos) return "Leyendo los campos de la capa…";
    if (proceso === "influencia" && !(num(distancia) > 0)) return "Indicá la distancia del área de influencia.";
    if (proceso === "superposicion" && !otra) return "Hace falta una segunda capa activa para superponer.";
    if (proceso === "distancias" && destinoTipo === "puntos" && !destinos.length) return "Marcá el destino en el mapa.";
    if (proceso === "distancias" && destinoTipo === "coordenada" && !coordenadaValida) return "Indicá la longitud y la latitud del destino.";
    return null;
  })();

  async function dibujarArea() {
    const g = await capturar("Polygon");
    if (g?.[0] instanceof Polygon) setAreaDibujada(g[0]);
  }

  async function marcarDestinos() {
    const g = await capturar("Point");
    if (g) setDestinos(g.filter((p): p is Point => p instanceof Point).map((p) => toLonLat(p.getCoordinates())));
  }

  const areaDeAnalisis = (): Polygon | null =>
    area === "mapa" ? areaDeExtension(extensionMapa()) : area === "dibujo" ? areaDibujada : null;

  async function ejecutar() {
    if (!proceso || !entrada || faltante) return;
    const tituloEntrada = sinPrefijo(entrada.titulo) + detalleFiltro(entrada.capa);
    const nombre = (detalle = "") => `${PROCESOS[proceso].nombre}${detalle} - ${tituloEntrada}`;
    const recorte = areaDeAnalisis();
    const pedir = async (e: Entrada) => {
      setEstado({ tipo: "corriendo", mensaje: `Obteniendo los datos de ${e.titulo}…` });
      return obtener(e, recorte);
    };
    const avisoTope = (truncado: boolean, titulo: string) =>
      truncado ? `${titulo} tiene más de ${MAXIMO.toLocaleString("es-AR")} elementos en el área: se procesaron los primeros. Achicá el área para un resultado completo.` : undefined;
    const capa = (titulo: string, gf: GFeatures, aviso?: string) => {
      if (!gf.length) return setEstado({ tipo: "error", mensaje: "El proceso no dio elementos como resultado." });
      onResultado(titulo, aMapa(gf), proceso);
      setEstado({
        tipo: "listo",
        aviso,
        mensaje: (
          <>
            Se agregó la capa <b>Resultado: {titulo}</b> con {gf.length.toLocaleString("es-AR")} {gf.length === 1 ? "elemento" : "elementos"}. Está
            en el panel Capas, con su tabla de atributos y su descarga.
          </>
        ),
      });
    };

    try {
      if (proceso === "conteo") {
        setEstado({ tipo: "corriendo", mensaje: "Contando elementos…" });
        const n = await contar(entrada, recorte);
        let aviso: string | undefined;
        if (nuevaCapa && n > 0) {
          const { features, truncado } = await pedir(entrada);
          onResultado(nombre(), aMapa(features), proceso);
          aviso = avisoTope(truncado, entrada.titulo);
        }
        return setEstado({
          tipo: "listo",
          numero: n,
          aviso,
          mensaje: (
            <>
              {n === 1 ? "elemento" : "elementos"} de {tituloEntrada} {area === "capa" ? "en toda la capa" : "en el área de análisis"}
              {nuevaCapa && n > 0 && <>. Se agregó la capa con el resultado.</>}
            </>
          ),
        });
      }

      const { features, truncado } = await pedir(entrada);
      const aviso = avisoTope(truncado, entrada.titulo);
      if (!features.length) return setEstado({ tipo: "error", mensaje: `No hay elementos de ${tituloEntrada} en el área de análisis.` });
      setEstado({ tipo: "corriendo", mensaje: `Procesando ${features.length.toLocaleString("es-AR")} elementos…` });
      await esperar();

      switch (proceso) {
        case "estadisticas": {
          const c = campoElegido;
          const sum = sumarizar ? campos?.find((x) => x.atributo === sumarizar) : undefined;
          const filas = estadisticas(features, c?.atributo ?? null, operacionReal, sum ?? null);
          const valor = c ? `${OPERACIONES[operacionReal]} de ${c.etiqueta}` : "Cantidad de elementos";
          onDatos({
            estado: "listo",
            tabla: {
              titulo: `Resultado: ${nombre()}`,
              subtitulo: `${valor}${sum ? ` por ${sum.etiqueta.toLowerCase()}` : ""} · ${AREAS.find((a) => a.valor === area)!.etiqueta}`,
              columnas: [
                { clave: "grupo", etiqueta: sum?.etiqueta ?? "" },
                { clave: "valor", etiqueta: valor, numerico: true },
                ...(c ? [{ clave: "elementos", etiqueta: "Elementos con dato", numerico: true }] : []),
              ],
              // de mayor a menor (en el panel se puede ordenar por cualquier columna)
              filas: filas
                .sort((a, b) => (isNaN(b.valor) ? -1 : isNaN(a.valor) ? 1 : b.valor - a.valor))
                .map((f) => ({ ...f, valor: isNaN(f.valor) ? null : Number(f.valor.toFixed(4)) })),
              archivo: `estadisticas ${entrada.titulo}`,
              aviso,
            },
          });
          const total = filas.length === 1 && !sum ? filas[0] : null;
          return setEstado({
            tipo: "listo",
            numero: total ? total.valor : undefined,
            aviso,
            mensaje: total ? (
              <>{valor.toLowerCase()} en {features.length.toLocaleString("es-AR")} elementos. La tabla está en el panel de datos.</>
            ) : (
              <>{filas.length.toLocaleString("es-AR")} grupos por {sum!.etiqueta.toLowerCase()}. La tabla está en el panel de datos, a la derecha.</>
            ),
          });
        }

        case "influencia": {
          const d = num(distancia);
          const radio = `${d.toLocaleString("es-AR")} ${unidad === "meters" ? "m" : "km"}`;
          const areas = await influencia(features, d, unidad);
          if (!compara) return capa(nombre(` de ${radio}`), areas, aviso);

          // Comparación con otra capa: se pide en el área de análisis ampliada hasta cubrir las áreas de influencia
          const capaAreas = aMapa(areas);
          let zona: Polygon | null = null;
          if (recorte) {
            const e = recorte.getExtent().slice();
            capaAreas.forEach((f) => extend(e, f.getGeometry()!.getExtent()));
            zona = areaDeExtension(e);
          }
          setEstado({ tipo: "corriendo", mensaje: `Obteniendo los datos de ${compara.titulo}…` });
          const segunda = await obtener(compara, zona);
          const tituloCompara = sinPrefijo(compara.titulo) + detalleFiltro(compara.capa);
          setEstado({ tipo: "corriendo", mensaje: `Comparando ${segunda.features.length.toLocaleString("es-AR")} elementos con las áreas…` });
          await esperar();
          const { porArea, cercanos } = await compararInfluencia(features, areas, segunda.features, (n) =>
            setEstado({ tipo: "corriendo", mensaje: `Comparando: ${n.toLocaleString("es-AR")} de ${segunda.features.length.toLocaleString("es-AR")}…` }),
          );
          const nombres = features.map((f) => nombreDe(f.properties, entrada.capa));

          // Capas de resultado: las áreas con la cantidad de elementos dentro, y los elementos que quedan dentro
          onResultado(
            nombre(` de ${radio}`),
            aMapa(areas.map((a, j) => ({ ...a, properties: { ...a.properties, capa_comparada: tituloCompara, cantidad_dentro: porArea[j] } }))),
            proceso,
          );
          const dentro = segunda.features.flatMap((f, i) =>
            cercanos[i].dentro
              ? [{ ...f, properties: { ...f.properties, mas_cercano: nombres[cercanos[i].indice], distancia: formatoDistancia(cercanos[i].metros) } }]
              : [],
          );
          if (dentro.length) onResultado(`${tituloCompara} a menos de ${radio} de ${tituloEntrada}`, aMapa(dentro), "superposicion");

          // Tablas: por elemento de entrada y por elemento comparado
          const [columnasEntrada, columnasCompara] = await Promise.all([columnasDe(entrada), columnasDe(compara)]);
          const etiquetaDentro = `${sinPrefijo(compara.titulo)} a menos de ${radio}`;
          const ordenAreas = features.map((_, j) => j).sort((a, b) => porArea[b] - porArea[a]);
          const ordenCompara = segunda.features.map((_, i) => i).sort((a, b) => cercanos[a].metros - cercanos[b].metros);
          const geomEntrada = aMapa(features).map((f) => f.getGeometry());
          const geomCompara = aMapa(segunda.features).map((f) => f.getGeometry());
          onDatos({
            estado: "listo",
            tabla: {
              titulo: `Resultado: ${nombre(` de ${radio}`)} comparada con ${tituloCompara}`,
              pestana: `Por ${sinPrefijo(entrada.titulo).toLowerCase()}`,
              subtitulo: `Cantidad de ${tituloCompara} dentro de cada área de influencia`,
              columnas: [
                // la cantidad primero: con nombres largos sigue a la vista en el panel angosto
                { clave: "_dentro", etiqueta: etiquetaDentro, numerico: true },
                { clave: "_nombre", etiqueta: sinPrefijo(entrada.titulo) },
                // sin repetir el atributo que ya se muestra como nombre
                ...columnasEntrada.filter((c) => !features.some((f) => f.properties?.[c.clave] != null && String(f.properties[c.clave]) === nombreDe(f.properties, entrada.capa))),
              ],
              filas: ordenAreas.map((j) => ({ ...features[j].properties, _nombre: nombres[j], _dentro: porArea[j] })),
              geometrias: ordenAreas.map((j) => geomEntrada[j]),
              archivo: `influencia ${entrada.titulo} con ${compara.titulo}`,
              aviso,
            },
            otras: [
              {
                titulo: tituloCompara,
                pestana: sinPrefijo(compara.titulo),
                subtitulo: `Cada elemento con el más cercano de ${tituloEntrada} (distancia en línea recta)`,
                columnas: [
                  { clave: "_dentro", etiqueta: `A menos de ${radio}` },
                  { clave: "_cercano", etiqueta: `${sinPrefijo(entrada.titulo)} más cercano` },
                  { clave: "_metros", etiqueta: "Distancia", numerico: true, formato: (v) => formatoDistancia(Number(v)) },
                  ...columnasCompara,
                ],
                filas: ordenCompara.map((i) => ({
                  ...segunda.features[i].properties,
                  _dentro: cercanos[i].dentro ? "Sí" : "No",
                  _cercano: nombres[cercanos[i].indice] ?? "",
                  _metros: Math.round(cercanos[i].metros),
                })),
                geometrias: ordenCompara.map((i) => geomCompara[i]),
                archivo: `${compara.titulo} cerca de ${entrada.titulo}`,
                aviso: avisoTope(segunda.truncado, compara.titulo),
              },
            ],
          });

          const total = segunda.features.length;
          const sinNinguno = porArea.filter((n) => n === 0).length;
          return setEstado({
            tipo: "listo",
            numero: dentro.length,
            aviso: [aviso, avisoTope(segunda.truncado, compara.titulo)].filter(Boolean).join(" ") || undefined,
            mensaje: (
              <>
                de {total.toLocaleString("es-AR")} {tituloCompara} ({total ? formatoNumero((dentro.length / total) * 100, 0) : 0} %) quedan a
                menos de {radio} de {tituloEntrada}. {sinNinguno.toLocaleString("es-AR")} de {features.length.toLocaleString("es-AR")}{" "}
                {sinNinguno === 1 ? "no tiene" : "no tienen"} ninguno dentro de su área. El detalle está en el panel de datos y en las capas de resultado.
              </>
            ),
          });
        }

        case "superposicion": {
          const segunda = await pedir(otra!);
          setEstado({ tipo: "corriendo", mensaje: "Superponiendo las capas…" });
          await esperar();
          const r = await superposicion(features, segunda.features, relacion, entrada.titulo, otra!.titulo, (n) =>
            setEstado({ tipo: "corriendo", mensaje: `Superponiendo: ${n.toLocaleString("es-AR")} de ${features.length.toLocaleString("es-AR")} elementos…` }),
          );
          const avisos = [aviso, avisoTope(segunda.truncado, otra!.titulo)].filter(Boolean).join(" ") || undefined;
          return capa(`${RELACIONES[relacion]} con ${sinPrefijo(otra!.titulo) + detalleFiltro(otra!.capa)} - ${tituloEntrada}`, r, avisos);
        }

        case "distancias": {
          const puntos = destinoTipo === "puntos" ? destinos : [destinoCoordenada];
          const red = tipoDistancia === "red";
          const filas = await distancias(features, puntos, tipoDistancia, modo, (n) =>
            setEstado({ tipo: "corriendo", mensaje: `Calculando rutas: ${n.toLocaleString("es-AR")} de ${features.length.toLocaleString("es-AR")}…` }),
          );
          const varios = puntos.length > 1;
          const columnas = await columnasDe(entrada);
          const lineas: GFeatures = filas.map((f) => ({
            type: "Feature",
            geometry: { type: "LineString", coordinates: [f.punto, puntos[f.destino]] },
            properties: {
              nombre: nombreDe(features[f.origen].properties, entrada.capa),
              ...(varios && { destino: `Destino ${f.destino + 1}` }),
              distancia: formatoDistancia(f.metros),
              ...(red && { duracion: formatoDuracion(f.segundos) }),
            },
          }));
          const titulo = nombre(red ? ` por red vial (${MODOS[modo].toLowerCase()})` : " en línea recta");
          onResultado(titulo, aMapa(lineas), proceso);
          const geometrias = aMapa(features).map((f) => f.getGeometry());
          onDatos({
            estado: "listo",
            tabla: {
              titulo: `Resultado: ${titulo}`,
              subtitulo: red ? "Distancia y duración del recorrido por calles y rutas (OSRM, datos de OpenStreetMap)" : "Distancia en línea recta",
              columnas: [
                { clave: "_distancia", etiqueta: "Distancia", numerico: true, formato: (v) => formatoDistancia(Number(v)) },
                ...(red ? [{ clave: "_duracion", etiqueta: "Duración", numerico: true, formato: (v: unknown) => formatoDuracion(Number(v)) }] : []),
                ...(varios ? [{ clave: "_destino", etiqueta: "Destino" }] : []),
                ...columnas,
              ],
              filas: filas.map((f) => ({
                ...features[f.origen].properties,
                _distancia: isNaN(f.metros) ? null : Math.round(f.metros),
                _duracion: f.segundos == null ? null : Math.round(f.segundos),
                _destino: `Destino ${f.destino + 1}`,
              })),
              geometrias: filas.map((f) => geometrias[f.origen]),
              archivo: `distancias ${entrada.titulo}`,
              aviso,
            },
          });
          return setEstado({
            tipo: "listo",
            aviso,
            mensaje: (
              <>
                Distancias de {features.length.toLocaleString("es-AR")} elementos{varios ? ` a ${puntos.length} destinos` : ""}. La tabla está en el
                panel de datos y las líneas, en la capa <b>Resultado: {titulo}</b>.
              </>
            ),
          });
        }

        case "geometrias":
          return capa(nombre(` (${DERIVADAS[derivada].toLowerCase()})`), await derivadas(features, derivada), aviso);
      }
    } catch (e) {
      setEstado({ tipo: "error", mensaje: e instanceof Error ? e.message : "No se pudo completar el análisis." });
    }
  }

  // --- Vista ---

  if (!proceso) {
    return (
      <div className="flex flex-col gap-3">
        <Titulo>Análisis geográfico</Titulo>
        {entradas.length === 0 && (
          <p className="m-0 flex gap-2 rounded-lg border border-sol/60 bg-sol/15 p-2.5 text-sm text-texto">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Es necesario agregar capas al mapa para activar el análisis geográfico: encendé una en el panel <b>Capas</b>
              {apagadas ? ` (hay ${apagadas} que se pueden analizar)` : ""}, agregá un archivo o dibujá en el mapa.
            </span>
          </p>
        )}
        <ul className="m-0 grid list-none grid-cols-1 gap-1.5 p-0">
          {(Object.keys(PROCESOS) as Proceso[]).map((p) => {
            const Icono = ICONOS[p];
            return (
              <li key={p}>
                <button
                  type="button"
                  disabled={entradas.length === 0}
                  onClick={() => {
                    setProceso(p);
                    setEstado({ tipo: "inicial" });
                  }}
                  className={
                    `${reset} flex w-full cursor-pointer items-start gap-3 rounded-lg border border-borde p-2.5 text-left transition-colors ` +
                    "hover:border-acento/60 hover:bg-superficie focus-visible:outline-2 focus-visible:outline-acento disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
                  }
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-acento/12 text-acento">
                    <Icono className="size-[1.125rem]" strokeWidth={2} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-texto">{PROCESOS[p].nombre}</span>
                    <span className="block text-xs leading-snug text-tenue">{PROCESOS[p].ayuda}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="m-0 text-xs text-tenue">
          Se analizan las capas encendidas, con los filtros que tengan en el panel Capas (por ejemplo, proveedores de un rubro), además
          de los archivos agregados, los dibujos y los resultados anteriores.
        </p>
      </div>
    );
  }

  const Icono = ICONOS[proceso];
  const corriendo = estado.tipo === "corriendo";
  const volver = () => {
    setProceso(null);
    setEstado({ tipo: "inicial" });
  };
  const selectorCapa = (valor: string | undefined, cambiar: (v: string) => void, opciones: Entrada[]) => (
    <select className={campo} value={valor} onChange={(e) => cambiar(e.target.value)}>
      {opciones.map((e) => (
        <option key={e.id} value={e.id}>
          {e.titulo + detalleFiltro(e.capa)}
        </option>
      ))}
    </select>
  );
  const opciones = <T extends string>(valores: Record<T, string>) =>
    (Object.keys(valores) as T[]).map((v) => (
      <option key={v} value={v}>
        {valores[v]}
      </option>
    ));

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={volver} className={`${reset} inline-flex cursor-pointer items-center gap-1 self-start text-xs text-acento hover:underline`}>
        <ArrowLeft className="size-3.5" aria-hidden /> Análisis geográfico
      </button>
      <div className="flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-acento/12 text-acento">
          <Icono className="size-[1.125rem]" strokeWidth={2} aria-hidden />
        </span>
        <div>
          <h2 className="m-0 text-base leading-tight font-semibold text-texto">{PROCESOS[proceso].nombre}</h2>
          <p className="m-0 text-xs text-tenue">{PROCESOS[proceso].ayuda}</p>
        </div>
      </div>

      {entradas.length === 0 ? (
        <p className="m-0 text-sm text-tenue">No quedan capas activas para analizar. Encendé una en el panel Capas.</p>
      ) : (
        <form
          className="flex flex-col gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            ejecutar();
          }}
        >
          <Campo etiqueta="Capa de entrada">{selectorCapa(entrada?.id, setEntradaId, entradas)}</Campo>

          {proceso === "conteo" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="m-0 size-4 accent-acento" checked={nuevaCapa} onChange={(e) => setNuevaCapa(e.target.checked)} />
              Crear nueva capa con el resultado
            </label>
          )}

          {proceso === "estadisticas" && (
            <>
              <Campo etiqueta="Campo a analizar">
                <select className={campo} value={campoElegido?.atributo ?? CANTIDAD} onChange={(e) => setCampoSel(e.target.value)} disabled={!campos}>
                  {!campos && <option value="">Leyendo los campos…</option>}
                  {campos && operacionReal === "cuenta" && <option value={CANTIDAD}>Cantidad de elementos</option>}
                  {numericos.map((c) => (
                    <option key={c.atributo} value={c.atributo}>
                      {c.etiqueta}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta="Operación de agregación">
                <select className={campo} value={operacionReal} onChange={(e) => setOperacion(e.target.value as Operacion)}>
                  {numericos.length || !campos ? opciones(OPERACIONES) : <option value="cuenta">Cuenta</option>}
                </select>
              </Campo>
              <Campo etiqueta="Sumarizar por otro campo">
                <select className={campo} value={sumarizar} onChange={(e) => setSumarizar(e.target.value)} disabled={!campos}>
                  <option value="">Ninguno</option>
                  {campos?.map((c) => (
                    <option key={c.atributo} value={c.atributo}>
                      {c.etiqueta}
                    </option>
                  ))}
                </select>
              </Campo>
            </>
          )}

          {proceso === "influencia" && (
            <>
              <div className="flex gap-2">
                <Campo etiqueta="Distancia de área de influencia">
                  <input className={campo} inputMode="decimal" placeholder="500" value={distancia} onChange={(e) => setDistancia(e.target.value)} />
                </Campo>
                <Campo etiqueta="Unidad de distancia">
                  <select className={campo} value={unidad} onChange={(e) => setUnidad(e.target.value as typeof unidad)}>
                    <option value="meters">Metros</option>
                    <option value="kilometers">Kilómetros</option>
                  </select>
                </Campo>
              </div>
              <Campo etiqueta="Comparar con otra capa">
                <select className={campo} value={compara?.id ?? ""} onChange={(e) => setComparaId(e.target.value)}>
                  <option value="">Ninguna</option>
                  {otras.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.titulo + detalleFiltro(e.capa)}
                    </option>
                  ))}
                </select>
              </Campo>
              <p className="m-0 -mt-1 text-xs text-tenue">
                {compara
                  ? `Cuenta los elementos de ${sinPrefijo(compara.titulo)} que quedan dentro de cada área y, para cada uno, el más cercano de la capa de entrada.`
                  : "Por ejemplo: edificios de salud comparados con proveedores filtrados por el rubro «Cuidador a domicilio»."}
              </p>
            </>
          )}

          {proceso === "superposicion" && (
            <>
              <Campo etiqueta="Capa de superposición">
                {otras.length ? (
                  selectorCapa(otra?.id, setOtraId, otras)
                ) : (
                  <span className="text-sm font-normal text-texto">Encendé una segunda capa o generá un área de influencia.</span>
                )}
              </Campo>
              <Campo etiqueta="Relación espacial">
                <select className={campo} value={relacion} onChange={(e) => setRelacion(e.target.value as Relacion)}>
                  {opciones(RELACIONES)}
                </select>
              </Campo>
            </>
          )}

          {proceso === "distancias" && (
            <>
              <Campo etiqueta="Destino">
                <select className={campo} value={destinoTipo} onChange={(e) => setDestinoTipo(e.target.value as typeof destinoTipo)}>
                  <option value="puntos">Dibujar puntos</option>
                  <option value="coordenada">Coordenada</option>
                </select>
              </Campo>
              {destinoTipo === "puntos" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className={botonSecundario} onClick={marcarDestinos} disabled={corriendo}>
                    <MapPinned className="size-4" aria-hidden /> {destinos.length ? "Volver a marcar" : "Marcar en el mapa"}
                  </button>
                  {destinos.length > 0 && (
                    <>
                      <span className="text-xs text-tenue">
                        {destinos.length === 1 ? `${destinos[0][1].toFixed(5)}°, ${destinos[0][0].toFixed(5)}°` : `${destinos.length} destinos`}
                      </span>
                      <button
                        type="button"
                        aria-label="Borrar destinos"
                        title="Borrar destinos"
                        onClick={() => (setDestinos([]), onBorrarMarca("Point"))}
                        className={`${reset} cursor-pointer text-tenue hover:text-texto`}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </>
                  )}
                  <span className="w-full text-xs text-tenue">Podés marcar hasta {MAXIMO_DESTINOS} destinos.</span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Campo etiqueta="Coordenada - Longitud">
                    <input className={campo} inputMode="decimal" placeholder="-65.1023" value={lon} onChange={(e) => setLon(e.target.value)} />
                  </Campo>
                  <Campo etiqueta="Coordenada - Latitud">
                    <input className={campo} inputMode="decimal" placeholder="-43.3002" value={lat} onChange={(e) => setLat(e.target.value)} />
                  </Campo>
                </div>
              )}
              <Campo etiqueta="Tipo de distancia">
                <select className={campo} value={tipoDistancia} onChange={(e) => setTipoDistancia(e.target.value as typeof tipoDistancia)}>
                  <option value="recta">Línea recta</option>
                  <option value="red">Por red vial</option>
                </select>
              </Campo>
              {tipoDistancia === "red" && (
                <Campo etiqueta="Modo de transporte">
                  <select className={campo} value={modo} onChange={(e) => setModo(e.target.value as ModoTransporte)}>
                    {opciones(MODOS)}
                  </select>
                </Campo>
              )}
            </>
          )}

          {proceso === "geometrias" && (
            <Campo etiqueta="Tipo de geometría derivada">
              <select className={campo} value={derivada} onChange={(e) => setDerivada(e.target.value as Derivada)}>
                {opciones(DERIVADAS)}
              </select>
            </Campo>
          )}

          <Campo etiqueta="Área de análisis">
            <select className={campo} value={area} onChange={(e) => setArea(e.target.value as AreaAnalisis)}>
              {AREAS.map((a) => (
                <option key={a.valor} value={a.valor}>
                  {a.etiqueta}
                </option>
              ))}
            </select>
          </Campo>
          {area === "dibujo" && (
            <div className="flex items-center gap-2">
              <button type="button" className={botonSecundario} onClick={dibujarArea} disabled={corriendo}>
                <PencilLine className="size-4" aria-hidden /> {areaDibujada ? "Volver a dibujar" : "Dibujar en el mapa"}
              </button>
              {areaDibujada && (
                <>
                  <span className="text-xs text-tenue">{formatoNumero(getArea(areaDibujada) / 1e6)} km²</span>
                  <button
                    type="button"
                    aria-label="Borrar área"
                    title="Borrar área"
                    onClick={() => (setAreaDibujada(null), onBorrarMarca("Polygon"))}
                    className={`${reset} cursor-pointer text-tenue hover:text-texto`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </>
              )}
            </div>
          )}

          {faltante && <p className="m-0 text-xs text-tenue">{faltante}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={botonSecundario} onClick={volver}>
              Cancelar
            </button>
            <button type="submit" className={botonPrimario} disabled={corriendo || faltante != null}>
              {corriendo && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              Ejecutar
            </button>
          </div>
        </form>
      )}

      <div aria-live="polite">
        {estado.tipo === "corriendo" && <p className="m-0 text-sm text-tenue">{estado.mensaje}</p>}
        {estado.tipo === "error" && (
          <p role="alert" className="m-0 flex gap-2 rounded-lg border border-meseta/50 bg-meseta/10 p-2.5 text-sm text-texto">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-meseta" aria-hidden />
            {estado.mensaje}
          </p>
        )}
        {estado.tipo === "listo" && (
          <section className="flex flex-col gap-1.5 rounded-lg border border-borde bg-superficie/60 p-2.5 text-sm">
            <h3 className="m-0 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-tenue uppercase">
              <Table className="size-3.5" aria-hidden /> Resultado
            </h3>
            {estado.numero != null && <span className="text-2xl leading-none font-semibold text-texto tabular-nums">{formatoNumero(estado.numero)}</span>}
            <p className="m-0">{estado.mensaje}</p>
            {estado.aviso && <p className="m-0 text-xs text-tenue">{estado.aviso}</p>}
          </section>
        )}
      </div>
    </div>
  );
}
