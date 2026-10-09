"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import type Feature from "ol/Feature";
import type { Extent } from "ol/extent";
import { Point, Polygon, type Geometry } from "ol/geom";
import { getArea } from "ol/sphere";
import { toLonLat } from "ol/proj";
import {
  ArrowLeft, CircleDashed, Download, Hash, LoaderCircle, MapPinned, PencilLine, Route, Shapes, Sigma, SquaresIntersect,
  TriangleAlert, type LucideIcon,
} from "lucide-react";
import {
  AREAS, DERIVADAS, MAXIMO, MODOS, OPERACIONES, PROCESOS, RELACIONES, aMapa, areaDeExtension, camposDe, csv, derivadas,
  distancias, esAnalizable, estadisticas, formatoNumero, influencia, lineasDistancia, obtener, superposicion,
  type AreaAnalisis, type CampoEntrada, type Datos, type Derivada, type Distancia, type Entrada, type Fila,
  type ModoTransporte, type Operacion, type Proceso, type Relacion,
} from "./analisis";
import { descargarTexto } from "./exportar";
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
  // Pide al usuario un área o un punto sobre el mapa (null si cancela)
  capturar: (tipo: "Polygon" | "Point") => Promise<Geometry | null>;
  onResultado: (titulo: string, features: Feature[]) => void;
};

type Resultado =
  | { tipo: "capa"; titulo: string; cantidad: number }
  | { tipo: "conteo"; cantidad: number; capa: string }
  | { tipo: "tabla"; filas: Fila[]; campo: string; operacion: Operacion; agrupar: string | null }
  | { tipo: "distancias"; filas: Distancia[]; red: boolean };

type Estado =
  | { tipo: "inicial" }
  | { tipo: "corriendo"; mensaje: string }
  | { tipo: "error"; mensaje: string }
  | { tipo: "listo"; resultado: Resultado; aviso?: string };

function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-tenue">
      {etiqueta}
      {children}
    </label>
  );
}

const esperar = () => new Promise((r) => setTimeout(r, 30)); // deja pintar el mensaje antes de un cálculo largo

export default function PanelAnalisis({ capas, dibujos, extensionMapa, capturar, onResultado }: Props) {
  const id = useId();
  const [proceso, setProceso] = useState<Proceso | null>(null);
  const [estado, setEstado] = useState<Estado>({ tipo: "inicial" });

  // Parámetros (se conservan al cambiar de proceso, como en el geoportal del INDEC)
  const [entradaId, setEntradaId] = useState("");
  const [area, setArea] = useState<AreaAnalisis>("mapa");
  const [areaDibujada, setAreaDibujada] = useState<Polygon | null>(null);
  const [crearCapa, setCrearCapa] = useState(false);
  const [leidos, setLeidos] = useState<{ capa: string; campos: CampoEntrada[] } | null>(null);
  const [campoSel, setCampoSel] = useState("");
  const [operacion, setOperacion] = useState<Operacion>("suma");
  const [agrupar, setAgrupar] = useState("");
  const [distancia, setDistancia] = useState("500");
  const [unidad, setUnidad] = useState<"meters" | "kilometers">("meters");
  const [disolver, setDisolver] = useState(false);
  const [otraId, setOtraId] = useState("");
  const [relacion, setRelacion] = useState<Relacion>("interseccion");
  const [destinoTipo, setDestinoTipo] = useState<"mapa" | "coordenada">("mapa");
  const [destinoMapa, setDestinoMapa] = useState<number[] | null>(null);
  const [lon, setLon] = useState("");
  const [lat, setLat] = useState("");
  const [tipoDistancia, setTipoDistancia] = useState<"recta" | "red">("recta");
  const [modo, setModo] = useState<ModoTransporte>("auto");
  const [derivada, setDerivada] = useState<Derivada>("centroide");

  const hayDibujos = dibujos().length > 0;
  const entradas: Entrada[] = [
    ...capas.filter((c) => c.visible && esAnalizable(c)).map((c) => ({ id: c.id, titulo: c.titulo, capa: c })),
    ...(hayDibujos ? [{ id: DIBUJOS, titulo: "Mis dibujos", features: dibujos }] : []),
  ];
  const entrada = entradas.find((e) => e.id === entradaId) ?? entradas[0];
  const otras = entradas.filter((e) => e.id !== entrada?.id);
  const otra = otras.find((e) => e.id === otraId) ?? otras[0];
  const apagadas = capas.filter((c) => !c.visible && esAnalizable(c)).length;

  // Campos de la capa de entrada, para las estadísticas
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
  const campoElegido = numericos.find((c) => c.atributo === campoSel) ?? numericos[0];
  const operacionReal: Operacion = numericos.length ? operacion : "cuenta";

  async function dibujarArea() {
    const g = await capturar("Polygon");
    if (g instanceof Polygon) setAreaDibujada(g);
  }

  async function marcarDestino() {
    const g = await capturar("Point");
    if (g instanceof Point) setDestinoMapa(toLonLat(g.getCoordinates()));
  }

  function areaDeAnalisis(): Polygon | null {
    if (area === "mapa") return areaDeExtension(extensionMapa());
    if (area === "dibujo") return areaDibujada;
    return null;
  }

  async function datosDe(e: Entrada): Promise<Datos> {
    setEstado({ tipo: "corriendo", mensaje: `Obteniendo los datos de ${e.titulo}…` });
    return obtener(e, areaDeAnalisis());
  }

  async function ejecutar() {
    if (!proceso || !entrada) return;
    if (area === "dibujo" && !areaDibujada) return setEstado({ tipo: "error", mensaje: "Dibujá el área de análisis en el mapa." });
    try {
      const { features, truncado } = await datosDe(entrada);
      const avisos: string[] = [];
      if (truncado) avisos.push(`La capa tiene más de ${MAXIMO.toLocaleString("es-AR")} elementos en el área: se analizaron los primeros. Achicá el área para un resultado completo.`);
      const nombre = `${PROCESOS[proceso].nombre} · ${entrada.titulo}`;
      const listo = (resultado: Resultado) => setEstado({ tipo: "listo", resultado, aviso: avisos.join(" ") || undefined });
      const capa = (titulo: string, gf: Parameters<typeof aMapa>[0]) => {
        if (!gf.length) return setEstado({ tipo: "error", mensaje: "El proceso no dio elementos como resultado." });
        onResultado(titulo, aMapa(gf));
        listo({ tipo: "capa", titulo, cantidad: gf.length });
      };
      if (!features.length && proceso !== "superposicion")
        return setEstado({ tipo: "error", mensaje: `No hay elementos de ${entrada.titulo} en el área de análisis.` });

      setEstado({ tipo: "corriendo", mensaje: `Procesando ${features.length.toLocaleString("es-AR")} elementos…` });
      await esperar();

      switch (proceso) {
        case "conteo":
          if (crearCapa && features.length) onResultado(nombre, aMapa(features));
          return listo({ tipo: "conteo", cantidad: features.length, capa: entrada.titulo });

        case "estadisticas": {
          const campoAtr = operacionReal === "cuenta" ? null : (campoElegido?.atributo ?? null);
          const filas = estadisticas(features, campoAtr, operacionReal, agrupar || null);
          return listo({
            tipo: "tabla",
            filas,
            operacion: operacionReal,
            campo: campoAtr ? campoElegido!.etiqueta : "Elementos",
            agrupar: agrupar ? (campos?.find((c) => c.atributo === agrupar)?.etiqueta ?? agrupar) : null,
          });
        }

        case "influencia": {
          const d = Number(distancia.replace(",", "."));
          if (!(d > 0)) return setEstado({ tipo: "error", mensaje: "Indicá una distancia mayor que cero." });
          const areas = await influencia(features, d, unidad, disolver);
          return capa(`Área de influencia de ${distancia} ${unidad === "meters" ? "m" : "km"} · ${entrada.titulo}`, areas);
        }

        case "superposicion": {
          if (!otra) return setEstado({ tipo: "error", mensaje: "Hace falta una segunda capa activa para superponer." });
          const segunda = await datosDe(otra);
          if (segunda.truncado) avisos.push(`${otra.titulo} tiene más elementos de los que se pidieron: el resultado puede ser parcial.`);
          setEstado({ tipo: "corriendo", mensaje: "Superponiendo las capas…" });
          await esperar();
          const r = await superposicion(features, segunda.features, relacion, otra.titulo, entrada.titulo);
          return capa(`${RELACIONES[relacion]} · ${entrada.titulo} y ${otra.titulo}`, r);
        }

        case "distancias": {
          const destino =
            destinoTipo === "mapa" ? destinoMapa : [Number(lon.replace(",", ".")), Number(lat.replace(",", "."))];
          if (!destino || destino.some(isNaN) || Math.abs(destino[0]) > 180 || Math.abs(destino[1]) > 90)
            return setEstado({
              tipo: "error",
              mensaje: destinoTipo === "mapa" ? "Marcá el destino en el mapa." : "Revisá la longitud y la latitud del destino.",
            });
          const red = tipoDistancia === "red";
          const filas = await distancias(features, destino, tipoDistancia, modo, entrada.capa, (n) =>
            setEstado({ tipo: "corriendo", mensaje: `Calculando rutas: ${n} de ${features.length}…` }),
          );
          onResultado(`Distancias ${red ? `por red vial (${MODOS[modo].toLowerCase()})` : "en línea recta"} · ${entrada.titulo}`, aMapa(lineasDistancia(filas, destino)));
          return listo({ tipo: "distancias", filas, red });
        }

        case "geometrias":
          return capa(`${DERIVADAS[derivada]} · ${entrada.titulo}`, await derivadas(features, derivada));
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
        <p className="m-0 text-sm text-tenue">
          Herramientas para contar, medir y cruzar los datos de las capas activas. Los resultados se agregan como capas
          nuevas, que se pueden volver a analizar o descargar.
        </p>
        {entradas.length === 0 && (
          <p className="m-0 flex gap-2 rounded-lg border border-sol/60 bg-sol/15 p-2.5 text-sm text-texto">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Encendé una capa en el panel <b>Capas</b> para activar el análisis
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
      </div>
    );
  }

  const Icono = ICONOS[proceso];
  const corriendo = estado.tipo === "corriendo";
  const selectorCapa = (valor: string | undefined, cambiar: (v: string) => void, opciones: Entrada[]) => (
    <select className={campo} value={valor} onChange={(e) => cambiar(e.target.value)}>
      {opciones.map((e) => (
        <option key={e.id} value={e.id}>
          {e.titulo}
        </option>
      ))}
    </select>
  );

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => {
          setProceso(null);
          setEstado({ tipo: "inicial" });
        }}
        className={`${reset} inline-flex cursor-pointer items-center gap-1 self-start text-xs text-acento hover:underline`}
      >
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

          {proceso === "estadisticas" && (
            <>
              <Campo etiqueta="Operación">
                <select className={campo} value={operacionReal} onChange={(e) => setOperacion(e.target.value as Operacion)}>
                  {(Object.keys(OPERACIONES) as Operacion[])
                    .filter((o) => o === "cuenta" || numericos.length)
                    .map((o) => (
                      <option key={o} value={o}>
                        {OPERACIONES[o]}
                      </option>
                    ))}
                </select>
              </Campo>
              {operacionReal !== "cuenta" && (
                <Campo etiqueta="Campo a analizar">
                  <select className={campo} value={campoElegido?.atributo} onChange={(e) => setCampoSel(e.target.value)}>
                    {numericos.map((c) => (
                      <option key={c.atributo} value={c.atributo}>
                        {c.etiqueta}
                      </option>
                    ))}
                  </select>
                </Campo>
              )}
              <Campo etiqueta="Agrupar por">
                <select className={campo} value={agrupar} onChange={(e) => setAgrupar(e.target.value)} disabled={!campos}>
                  <option value="">Sin agrupar (total)</option>
                  {campos?.map((c) => (
                    <option key={c.atributo} value={c.atributo}>
                      {c.etiqueta}
                    </option>
                  ))}
                </select>
              </Campo>
              {campos === null && <p className="m-0 text-xs text-tenue">Leyendo los campos de la capa…</p>}
              {campos && !numericos.length && (
                <p className="m-0 text-xs text-tenue">La capa no tiene campos numéricos: solo se puede contar.</p>
              )}
            </>
          )}

          {proceso === "influencia" && (
            <>
              <div className="flex gap-2">
                <Campo etiqueta="Distancia">
                  <input
                    className={campo}
                    inputMode="decimal"
                    value={distancia}
                    onChange={(e) => setDistancia(e.target.value)}
                    aria-describedby={`${id}-unidad`}
                  />
                </Campo>
                <Campo etiqueta="Unidad">
                  <select id={`${id}-unidad`} className={campo} value={unidad} onChange={(e) => setUnidad(e.target.value as typeof unidad)}>
                    <option value="meters">Metros</option>
                    <option value="kilometers">Kilómetros</option>
                  </select>
                </Campo>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="m-0 size-4 accent-acento" checked={disolver} onChange={(e) => setDisolver(e.target.checked)} />
                Unir las áreas en una sola
              </label>
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
                  {(Object.keys(RELACIONES) as Relacion[]).map((r) => (
                    <option key={r} value={r}>
                      {RELACIONES[r]}
                    </option>
                  ))}
                </select>
              </Campo>
            </>
          )}

          {proceso === "distancias" && (
            <>
              <Campo etiqueta="Destino">
                <select className={campo} value={destinoTipo} onChange={(e) => setDestinoTipo(e.target.value as typeof destinoTipo)}>
                  <option value="mapa">Marcar en el mapa</option>
                  <option value="coordenada">Coordenada</option>
                </select>
              </Campo>
              {destinoTipo === "mapa" ? (
                <div className="flex items-center gap-2">
                  <button type="button" className={botonSecundario} onClick={marcarDestino} disabled={corriendo}>
                    <MapPinned className="size-4" aria-hidden /> {destinoMapa ? "Cambiar destino" : "Marcar destino"}
                  </button>
                  {destinoMapa && (
                    <span className="text-xs text-tenue tabular-nums">
                      {destinoMapa[1].toFixed(5)}°, {destinoMapa[0].toFixed(5)}°
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex gap-2">
                  <Campo etiqueta="Latitud">
                    <input className={campo} inputMode="decimal" placeholder="-43.2489" value={lat} onChange={(e) => setLat(e.target.value)} />
                  </Campo>
                  <Campo etiqueta="Longitud">
                    <input className={campo} inputMode="decimal" placeholder="-65.3051" value={lon} onChange={(e) => setLon(e.target.value)} />
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
                    {(Object.keys(MODOS) as ModoTransporte[]).map((m) => (
                      <option key={m} value={m}>
                        {MODOS[m]}
                      </option>
                    ))}
                  </select>
                </Campo>
              )}
            </>
          )}

          {proceso === "geometrias" && (
            <Campo etiqueta="Geometría derivada">
              <select className={campo} value={derivada} onChange={(e) => setDerivada(e.target.value as Derivada)}>
                {(Object.keys(DERIVADAS) as Derivada[]).map((d) => (
                  <option key={d} value={d}>
                    {DERIVADAS[d]}
                  </option>
                ))}
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
              {areaDibujada && <span className="text-xs text-tenue">{formatoNumero(getArea(areaDibujada) / 1e6)} km²</span>}
            </div>
          )}

          {proceso === "conteo" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="m-0 size-4 accent-acento" checked={crearCapa} onChange={(e) => setCrearCapa(e.target.checked)} />
              Crear una capa con los elementos contados
            </label>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              className={botonSecundario}
              onClick={() => {
                setProceso(null);
                setEstado({ tipo: "inicial" });
              }}
            >
              Cancelar
            </button>
            <button type="submit" className={botonPrimario} disabled={corriendo || (proceso === "superposicion" && !otra)}>
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
        {estado.tipo === "listo" && <VistaResultado resultado={estado.resultado} aviso={estado.aviso} />}
      </div>
    </div>
  );
}

const botonDescarga = `${reset} inline-flex cursor-pointer items-center gap-1 text-xs text-acento hover:underline`;

function VistaResultado({ resultado: r, aviso }: { resultado: Resultado; aviso?: string }) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-borde bg-superficie/60 p-2.5">
      <h3 className="m-0 text-xs font-semibold tracking-wide text-tenue uppercase">Resultado</h3>
      {r.tipo === "capa" && (
        <p className="m-0 text-sm">
          Se agregó la capa <b>{r.titulo}</b> con {r.cantidad.toLocaleString("es-AR")} {r.cantidad === 1 ? "elemento" : "elementos"}, en
          «Resultados de análisis» del panel Capas.
        </p>
      )}
      {r.tipo === "conteo" && (
        <p className="m-0 text-sm">
          <span className="block text-2xl font-semibold text-texto tabular-nums">{r.cantidad.toLocaleString("es-AR")}</span>
          {r.cantidad === 1 ? "elemento" : "elementos"} de {r.capa} en el área de análisis
        </p>
      )}
      {r.tipo === "tabla" && <TablaEstadisticas r={r} />}
      {r.tipo === "distancias" && <TablaDistancias r={r} />}
      {aviso && <p className="m-0 text-xs text-tenue">{aviso}</p>}
    </section>
  );
}

function TablaEstadisticas({ r }: { r: Extract<Resultado, { tipo: "tabla" }> }) {
  const titulo = r.operacion === "cuenta" ? "Cantidad" : `${OPERACIONES[r.operacion]} de ${r.campo}`;
  return (
    <>
      <div className="max-h-72 overflow-auto">
        <table className="w-full border-collapse text-[0.8125rem] leading-snug">
          <thead className="sticky top-0 bg-superficie text-left text-xs text-tenue">
            <tr>
              <th className="py-1 pr-2 font-medium">{r.agrupar ?? ""}</th>
              <th className="py-1 pr-2 text-right font-medium">{titulo}</th>
              {r.operacion !== "cuenta" && <th className="py-1 text-right font-medium">Elementos</th>}
            </tr>
          </thead>
          <tbody>
            {r.filas.map((f) => (
              <tr key={f.grupo} className="border-t border-borde/60">
                <td className="py-1 pr-2">{f.grupo}</td>
                <td className="py-1 pr-2 text-right font-medium tabular-nums">{formatoNumero(f.valor)}</td>
                {r.operacion !== "cuenta" && <td className="py-1 text-right text-tenue tabular-nums">{f.elementos.toLocaleString("es-AR")}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className={botonDescarga}
        onClick={() =>
          descargarTexto(
            csv([r.agrupar ?? "Grupo", titulo, "Elementos"], r.filas.map((f) => [f.grupo, f.valor, f.elementos])),
            "estadisticas-ide-economia.csv",
            "text/csv",
          )
        }
      >
        <Download className="size-3.5" aria-hidden /> Descargar tabla (CSV)
      </button>
    </>
  );
}

const VISIBLES = 50;

function TablaDistancias({ r }: { r: Extract<Resultado, { tipo: "distancias" }> }) {
  return (
    <>
      <p className="m-0 text-xs text-tenue">
        Ordenados del más cercano al más lejano{r.filas.length > VISIBLES ? `; se muestran los primeros ${VISIBLES}` : ""}. Las líneas
        quedaron como capa en «Resultados de análisis»{r.red ? " (unen cada elemento con el destino; la distancia es la del recorrido por calles y rutas)" : ""}.
      </p>
      <div className="max-h-72 overflow-auto">
        <table className="w-full border-collapse text-[0.8125rem] leading-snug">
          <thead className="sticky top-0 bg-superficie text-left text-xs text-tenue">
            <tr>
              <th className="py-1 pr-2 font-medium">Elemento</th>
              <th className="py-1 pr-2 text-right font-medium">Km</th>
              {r.red && <th className="py-1 text-right font-medium">Min</th>}
            </tr>
          </thead>
          <tbody>
            {r.filas.slice(0, VISIBLES).map((f, i) => (
              <tr key={i} className="border-t border-borde/60">
                <td className="py-1 pr-2">{f.nombre}</td>
                <td className="py-1 pr-2 text-right font-medium whitespace-nowrap tabular-nums">
                  {isNaN(f.km) ? "sin ruta" : formatoNumero(f.km, 1)}
                </td>
                {r.red && (
                  <td className="py-1 text-right whitespace-nowrap text-tenue tabular-nums">
                    {f.minutos == null ? "—" : formatoNumero(f.minutos, 0)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className={botonDescarga}
        onClick={() =>
          descargarTexto(
            csv(
              ["Elemento", "Distancia (km)", ...(r.red ? ["Tiempo (min)"] : []), "Longitud", "Latitud"],
              r.filas.map((f) => [
                f.nombre,
                Number(f.km.toFixed(3)),
                ...(r.red ? [f.minutos == null ? undefined : Math.round(f.minutos)] : []),
                f.origen[0],
                f.origen[1],
              ]),
            ),
            "distancias-ide-economia.csv",
            "text/csv",
          )
        }
      >
        <Download className="size-3.5" aria-hidden /> Descargar tabla (CSV)
      </button>
    </>
  );
}
