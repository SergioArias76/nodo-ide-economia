"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Galería de capas de la página de inicio: una selección de capas que se ven bien sobre el Chubut, cada
// una con su miniatura real (WMS GetMap sobre la provincia). Abre el visor con esa capa prendida. Si el
// servicio de origen no responde, la tarjeta no se muestra: la galería nunca enseña un recuadro vacío.

export type CapaGaleria = { id: string; titulo: string; tema: string; propia: boolean; imagen: string };

type Contorno = { trazado: string; caja: string };

export default function Galeria({ capas, contorno }: { capas: CapaGaleria[]; contorno: Contorno }) {
  const [rotas, setRotas] = useState<Set<string>>(() => new Set());
  const marcarRota = (id: string) => setRotas((r) => new Set(r).add(id));

  return (
    <ul className="galeria">
      {capas
        .filter((c) => !rotas.has(c.id))
        .map((c) => (
          <li key={c.id}>
            <Link href={`/visor?capas=${encodeURIComponent(c.id)}`} className="miniatura">
              <Vista imagen={c.imagen} contorno={contorno} onRota={() => marcarRota(c.id)} />
              <span className="pie-capa">
                <strong>{c.titulo}</strong>
                <span>{c.propia ? "Este nodo" : c.tema}</span>
              </span>
            </Link>
          </li>
        ))}
    </ul>
  );
}

// Miniatura: contorno de la provincia y, encima, la imagen WMS, que aparece con un fundido al llegar.
// Sin onRota muestra un aviso en lugar de la imagen (portada); con onRota avisa para ocultar la tarjeta.
// prioridad: es la imagen principal de la página (se pide primero, sin carga diferida)
export function Vista({ imagen, contorno, onRota, prioridad = false }: { imagen: string; contorno: Contorno; onRota?: () => void; prioridad?: boolean }) {
  const [, , ancho, alto] = contorno.caja.split(" ").map(Number);
  const [estado, setEstado] = useState<"cargando" | "lista" | "rota">("cargando");
  const img = useRef<HTMLImageElement>(null);
  const fallo = () => {
    setEstado("rota");
    onRota?.();
  };
  // Si la imagen terminó antes de hidratar, React no vio sus eventos
  useEffect(() => {
    const i = img.current;
    if (i?.complete) {
      if (i.naturalWidth === 0) fallo();
      else setEstado("lista");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, []);

  return (
    <span className="vista">
      <svg viewBox={contorno.caja} aria-hidden>
        <path d={contorno.trazado} />
      </svg>
      {estado === "rota" ? (
        <span className="sin-vista">El servicio de origen no responde</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- imagen WMS de otro servidor
        <img
          ref={img}
          src={imagen}
          alt=""
          width={ancho}
          height={alto}
          loading={prioridad ? "eager" : "lazy"}
          fetchPriority={prioridad ? "high" : "auto"}
          data-lista={prioridad || estado === "lista"}
          onLoad={() => setEstado("lista")}
          onError={fallo}
        />
      )}
    </span>
  );
}
