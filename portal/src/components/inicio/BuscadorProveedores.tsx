"use client";

import Link from "next/link";
import { ArrowRight, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ALTO, ANCHO, enRecuadro, proyectar } from "@/lib/proyeccion-chubut";
import type { Localidad, Opciones, Resultado, Rubro } from "@/lib/buscar-proveedores";
import Contador from "./Contador";

// Portada de inicio: "¿Qué proveedor del Estado buscás?". Se elige un rubro y/o una localidad y al
// instante se ve cuántos proveedores hay, dónde (círculos sobre el mapa del Chubut) y algunos nombres,
// con el acceso al visor ya filtrado. Los datos vienen de /api/buscar (resumen calculado en el servidor).

type Contorno = { trazado: string; caja: string };
type LugarElegido = { localidad: string; provincia: string };
type Sugerencia = { tipo: "rubro"; rubro: Rubro } | { tipo: "localidad"; localidad: Localidad };

const numero = (n: number) => n.toLocaleString("es-AR");
const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Los rubros del padrón vienen en mayúsculas: se muestran con mayúscula inicial
const legible = (s: string) => (s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s);
const nombreLugar = (l: { localidad: string; provincia: string }) => (l.provincia === "Chubut" ? l.localidad : `${l.localidad} (${l.provincia})`);

// Recuadro (?encuadre=oeste,sur,este,norte) que el visor encuadra a la derecha de su panel; un punto
// solo se agranda un poco para que quede a escala de ciudad
function vistaPara(puntos: { lon: number; lat: number }[]) {
  if (!puntos.length) return null;
  const lons = puntos.map((p) => p.lon), lats = puntos.map((p) => p.lat);
  const m = 0.03;
  return { encuadre: [Math.min(...lons) - m, Math.min(...lats) - m, Math.max(...lons) + m, Math.max(...lats) + m].map((n) => n.toFixed(4)).join(",") };
}

export default function BuscadorProveedores({ encabezado, contorno }: { encabezado: ReactNode; contorno: Contorno }) {
  const [opciones, setOpciones] = useState<Opciones | null>(null);
  const [rubro, setRubro] = useState<string | null>(null);
  const [lugar, setLugar] = useState<LugarElegido | null>(null);
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Primer segundo y medio después de que llegan los datos: los círculos entran escalonados (solo esa vez)
  const [entrada, setEntrada] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const idLista = useId();

  const pedido = useRef<AbortController | null>(null);

  // Aplica los filtros: actualiza la dirección (para compartir la búsqueda) y pide el resumen
  function aplicar(nuevoRubro: string | null, nuevoLugar: LugarElegido | null) {
    setRubro(nuevoRubro);
    setLugar(nuevoLugar);
    const q = new URLSearchParams();
    if (nuevoRubro) q.set("rubro", nuevoRubro);
    if (nuevoLugar) {
      q.set("localidad", nuevoLugar.localidad);
      if (nuevoLugar.provincia !== "Chubut") q.set("provincia", nuevoLugar.provincia);
    }
    history.replaceState(null, "", q.size ? `?${q}` : location.pathname);
    pedido.current?.abort();
    setError(null);
    if (!nuevoRubro && !nuevoLugar) {
      setResultado(null);
      setCargando(false);
      return;
    }
    const control = new AbortController();
    pedido.current = control;
    setCargando(true);
    fetch(`/api/buscar?${q}`, { signal: control.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Resultado) => setResultado(d))
      .catch((e) => {
        if (e?.name !== "AbortError") setError("No se pudo completar la búsqueda. Probá de nuevo en un momento.");
      })
      .finally(() => {
        if (!control.signal.aborted) setCargando(false);
      });
  }

  // Listas para sugerir y, cuando llegan, los filtros que traiga la dirección (?rubro=&localidad=&provincia=)
  useEffect(() => {
    fetch("/api/buscar")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Opciones) => {
        setOpciones(d);
        setEntrada(true);
        setTimeout(() => setEntrada(false), 1500);
        const q = new URLSearchParams(location.search);
        const r = q.get("rubro");
        const l = q.get("localidad");
        if (r || l) aplicar(r, l ? { localidad: l, provincia: q.get("provincia") ?? "Chubut" } : null);
      })
      .catch(() => setError("El buscador no está disponible en este momento."));
    return () => pedido.current?.abort();
  }, []);

  const sugerencias = useMemo<Sugerencia[]>(() => {
    if (!opciones || !texto.trim()) return [];
    const palabras = plano(texto).split(/\s+/).filter(Boolean);
    const coincide = (s: string) => {
      const p = plano(s);
      return palabras.every((w) => p.includes(w));
    };
    const rubros = opciones.rubros.filter((r) => coincide(r.rubro)).slice(0, 6);
    const lugares = opciones.localidades
      .filter((l) => coincide(`${l.localidad} ${l.provincia}`))
      .sort((a, b) => Number(b.provincia === "Chubut") - Number(a.provincia === "Chubut") || b.n - a.n)
      .slice(0, 4);
    return [...lugares.map((l) => ({ tipo: "localidad" as const, localidad: l })), ...rubros.map((r) => ({ tipo: "rubro" as const, rubro: r }))];
  }, [opciones, texto]);

  function elegir(s: Sugerencia) {
    if (s.tipo === "rubro") aplicar(s.rubro.rubro, lugar);
    else aplicar(rubro, { localidad: s.localidad.localidad, provincia: s.localidad.provincia });
    setTexto("");
    setAbierto(false);
    campo.current?.focus();
  }

  function teclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && sugerencias.length) {
      e.preventDefault();
      setAbierto(true);
      setActivo((a) => (a + 1) % sugerencias.length);
    } else if (e.key === "ArrowUp" && sugerencias.length) {
      e.preventDefault();
      setActivo((a) => (a - 1 + sugerencias.length) % sugerencias.length);
    } else if (e.key === "Enter" && abierto && sugerencias[activo]) {
      e.preventDefault();
      elegir(sugerencias[activo]);
    } else if (e.key === "Escape") {
      setAbierto(false);
    } else if (e.key === "Backspace" && !texto) {
      // Borrar con el campo vacío quita el último filtro, como en una lista de etiquetas
      if (lugar) aplicar(rubro, null);
      else if (rubro) aplicar(null, null);
    }
  }

  // Atajos: rubros con más proveedores y las localidades más grandes del Chubut
  const atajos = useMemo(() => {
    if (!opciones) return [];
    const rubros: Sugerencia[] = opciones.rubros
      .filter((r) => r.rubro !== rubro && r.rubro.length <= 24)
      .slice(0, 3)
      .map((r) => ({ tipo: "rubro", rubro: r }));
    const lugares: Sugerencia[] = opciones.localidades
      .filter((l) => l.provincia === "Chubut" && l.localidad !== lugar?.localidad)
      .slice(0, 3)
      .map((l) => ({ tipo: "localidad", localidad: l }));
    return [...rubros, ...lugares];
  }, [opciones, rubro, lugar]);

  // Círculos del mapa: localidades del Chubut con su cantidad (total o del resultado)
  const puntos = useMemo(() => {
    if (!opciones) return [];
    const cantidades = resultado
      ? new Map(resultado.localidades.map((l) => [`${l.localidad}|${l.provincia}`, l.n]))
      : new Map(opciones.localidades.map((l) => [`${l.localidad}|${l.provincia}`, l.n]));
    const lista = opciones.localidades
      .filter((l) => l.provincia === "Chubut" && enRecuadro(l.lon, l.lat))
      .map((l) => {
        const [x, y] = proyectar(l.lon, l.lat);
        return { clave: `${l.localidad}|${l.provincia}`, localidad: l.localidad, n: cantidades.get(`${l.localidad}|${l.provincia}`) ?? 0, x, y };
      });
    const maximo = Math.max(1, ...lista.map((p) => p.n));
    const orden = new Map(
      opciones.localidades
        .filter((l) => l.provincia === "Chubut")
        .map((l, i) => [`${l.localidad}|${l.provincia}`, i]),
    );
    return lista.map((p) => ({ ...p, r: p.n ? 2.5 + 20 * Math.sqrt(p.n / maximo) : 0, orden: orden.get(p.clave) ?? 0 }));
  }, [opciones, resultado]);
  const rotulos = new Set(puntos.filter((p) => p.n).sort((a, b) => b.n - a.n).slice(0, 4).map((p) => p.clave));

  const chubut = opciones?.localidades.filter((l) => l.provincia === "Chubut") ?? [];
  const total = resultado ? resultado.total : opciones?.total;
  const localidadesConDatos = resultado ? resultado.localidades.length : chubut.length;

  // Al visor, con los filtros y la vista sobre lo buscado: la localidad elegida o, con un rubro, las
  // localidades del Chubut donde hay resultados (si no hay ninguna en el Chubut, todas)
  const coordenadas = new Map(opciones?.localidades.map((l) => [`${l.localidad}|${l.provincia}`, l]) ?? []);
  const lugaresResultado = (resultado?.localidades ?? []).map((l) => coordenadas.get(`${l.localidad}|${l.provincia}`)).filter((l) => l != null);
  const enChubut = lugaresResultado.filter((l) => l.provincia === "Chubut");
  const vista = lugar
    ? vistaPara([coordenadas.get(`${lugar.localidad}|${lugar.provincia}`)].filter((l) => l != null))
    : resultado
      ? vistaPara(enChubut.length ? enChubut : lugaresResultado)
      : null;
  const enlaceVisor = (extra?: Record<string, string>) => {
    // Con una búsqueda, solo la capa de proveedores, que es la que se filtra (los círculos de "Proveedores
    // por localidad" cuentan a todos los proveedores y confundirían)
    const q = new URLSearchParams({ capas: rubro || lugar ? "proveedores_radicacion" : "proveedores_radicacion,proveedores_por_localidad" });
    if (rubro) q.set("rubro", rubro);
    // Mismo nombre que usa el visor: con la provincia si no es del Chubut
    if (lugar) q.set("localidad", nombreLugar(lugar));
    const v = extra ?? vista;
    if (v) for (const [k, valor] of Object.entries(v)) q.set(k, valor);
    return `/visor?${q}`;
  };

  const desglose: { etiqueta: string; n: number }[] = resultado
    ? lugar
      ? resultado.rubros.map((r) => ({ etiqueta: legible(r.rubro), n: r.n }))
      : resultado.localidades.slice(0, 5).map((l) => ({ etiqueta: nombreLugar(l), n: l.n }))
    : chubut.slice(0, 5).map((l) => ({ etiqueta: l.localidad, n: l.n }));
  const maxDesglose = Math.max(1, ...desglose.map((d) => d.n));

  return (
    <div className="ancho portada-grilla">
      <div className="buscador-columna">
        {encabezado}

        <div className="busqueda" role="search">
          <label htmlFor={`${idLista}-campo`} className="busqueda-pregunta">¿Qué proveedor del Estado buscás?</label>
          <div className={`busqueda-caja${abierto && sugerencias.length ? " abierta" : ""}`}>
            <Search className="busqueda-lupa" aria-hidden />
            {rubro && (
              <button type="button" className="ficha" onClick={() => aplicar(null, lugar)} aria-label={`Quitar el rubro ${legible(rubro)}`}>
                {legible(rubro)} <X aria-hidden />
              </button>
            )}
            {lugar && (
              <button type="button" className="ficha lugar" onClick={() => aplicar(rubro, null)} aria-label={`Quitar la localidad ${nombreLugar(lugar)}`}>
                {nombreLugar(lugar)} <X aria-hidden />
              </button>
            )}
            <input
              ref={campo}
              id={`${idLista}-campo`}
              role="combobox"
              aria-expanded={abierto && sugerencias.length > 0}
              aria-controls={`${idLista}-lista`}
              aria-autocomplete="list"
              aria-activedescendant={abierto && sugerencias[activo] ? `${idLista}-${activo}` : undefined}
              autoComplete="off"
              placeholder={rubro || lugar ? "Sumá un rubro o una localidad…" : "Un rubro o una localidad: construcción, Trelew…"}
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setAbierto(true);
                setActivo(0);
              }}
              onFocus={() => setAbierto(true)}
              onBlur={() => setTimeout(() => setAbierto(false), 120)}
              onKeyDown={teclado}
            />
          </div>
          {abierto && sugerencias.length > 0 && (
            <ul id={`${idLista}-lista`} role="listbox" className="sugerencias">
              {sugerencias.map((s, i) => (
                <li
                  key={s.tipo === "rubro" ? `r-${s.rubro.rubro}` : `l-${s.localidad.localidad}-${s.localidad.provincia}`}
                  id={`${idLista}-${i}`}
                  role="option"
                  aria-selected={i === activo}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => elegir(s)}
                  onMouseEnter={() => setActivo(i)}
                >
                  <span>{s.tipo === "rubro" ? legible(s.rubro.rubro) : nombreLugar(s.localidad)}</span>
                  <small>
                    {s.tipo === "rubro" ? "Rubro" : "Localidad"} · {numero(s.tipo === "rubro" ? s.rubro.n : s.localidad.n)}
                  </small>
                </li>
              ))}
            </ul>
          )}
          {atajos.length > 0 && (
            <div className="atajos">
              <span>Probá con</span>
              {atajos.map((a) => (
                <button key={a.tipo === "rubro" ? a.rubro.rubro : a.localidad.localidad} type="button" onClick={() => elegir(a)}>
                  {a.tipo === "rubro" ? legible(a.rubro.rubro) : a.localidad.localidad}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="resumen" aria-live="polite" data-cargando={cargando}>
          {error ? (
            <p className="resumen-error">{error}</p>
          ) : (
            <>
              <p className="resumen-total">
                <strong>{total == null ? "–" : <Contador valor={total} />}</strong>
                {resultado
                  ? ` ${total === 1 ? "proveedor" : "proveedores"} en ${
                      lugar ? nombreLugar(lugar) : `${numero(localidadesConDatos)} ${localidadesConDatos === 1 ? "localidad" : "localidades"}`
                    }`
                  : ` proveedores en el mapa, ${numero(chubut.reduce((s, l) => s + l.n, 0))} en ${numero(chubut.length)} localidades del Chubut`}
              </p>
              {resultado && resultado.total > 0 && (
                <p className="resumen-tipos">
                  {numero(resultado.juridicas)} personas jurídicas · {numero(resultado.fisicas)} personas físicas
                </p>
              )}
              {resultado?.total === 0 && <p>No hay proveedores con esos filtros. Quitá alguno para ampliar la búsqueda.</p>}
              <Link href={enlaceVisor()} className="boton">
                {resultado ? "Ver estos proveedores en el visor" : "Abrir el visor"} <ArrowRight aria-hidden />
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="mapa-portada">
        <p className="mapa-titulo">
          {resultado ? (lugar ? `Rubros en ${nombreLugar(lugar)}` : "Dónde están") : "Proveedores por localidad del Chubut"}
        </p>
        <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="mapa-buscador" data-entrada={entrada || undefined} role="img" aria-label="Mapa del Chubut con la cantidad de proveedores por localidad">
          <path d={contorno.trazado} className="mapa-contorno" />
          {puntos.map((p) => (
            <circle
              key={p.clave}
              cx={p.x}
              cy={p.y}
              r={p.r}
              className={lugar?.localidad === p.localidad ? "elegido" : undefined}
              style={{ "--i": Math.min(p.orden, 24) } as React.CSSProperties}
            >
              <title>{`${p.localidad}: ${numero(p.n)}`}</title>
            </circle>
          ))}
          {puntos
            .filter((p) => rotulos.has(p.clave))
            .map((p) => (
              <text key={p.clave} x={p.x} y={p.y - p.r - 3} textAnchor="middle">
                {p.localidad}
              </text>
            ))}
        </svg>
        {desglose.length > 0 && (
          <ul className="desglose">
            {desglose.map((d, i) => (
              <li key={d.etiqueta} style={{ "--i": i } as React.CSSProperties}>
                <span className="desglose-nombre">{d.etiqueta}</span>
                <span className="desglose-barra" style={{ inlineSize: `${(100 * d.n) / maxDesglose}%` }} aria-hidden />
                <span className="desglose-n">{numero(d.n)}</span>
              </li>
            ))}
          </ul>
        )}
        {resultado && resultado.ejemplos.length > 0 && (
          <div className="ejemplos">
            <p>Algunos proveedores</p>
            <ul key={`${rubro}|${lugar?.localidad}`}>
              {resultado.ejemplos.map((e, i) => (
                <li key={`${e.entidad}-${e.localidad}`} style={{ "--i": i } as React.CSSProperties}>
                  {e.cuit ? (
                    // Abre el visor en el proveedor, resaltado y con su ficha
                    <Link href={enlaceVisor({ cuit: e.cuit })} title="Ver en el visor">
                      {e.entidad}
                    </Link>
                  ) : (
                    e.entidad
                  )}{" "}
                  <small>{e.localidad}</small>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
