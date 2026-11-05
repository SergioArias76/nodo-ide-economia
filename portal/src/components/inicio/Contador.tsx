"use client";

import { useEffect, useRef, useState } from "react";

// Número que cuenta hasta su valor nuevo cuando cambia (el total del buscador). Explica el cambio: de
// 12.716 a 338 se ve que la búsqueda achicó el conjunto. Dura 500 ms con salida suave; con movimiento
// reducido salta directo al valor.
const DURACION = 500;
const salida = (t: number) => 1 - Math.pow(1 - t, 3);

export default function Contador({ valor }: { valor: number }) {
  const [mostrado, setMostrado] = useState(valor);
  const desde = useRef(valor);

  useEffect(() => {
    const inicio = desde.current;
    if (inicio === valor || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      desde.current = valor;
      const id = requestAnimationFrame(() => setMostrado(valor));
      return () => cancelAnimationFrame(id);
    }
    let cuadro = 0;
    const t0 = performance.now();
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - t0) / DURACION);
      const actual = Math.round(inicio + (valor - inicio) * salida(t));
      desde.current = actual;
      setMostrado(actual);
      if (t < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [valor]);

  return <>{mostrado.toLocaleString("es-AR")}</>;
}
