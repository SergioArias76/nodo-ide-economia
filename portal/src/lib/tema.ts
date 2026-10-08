"use client";

import { useEffect, useState } from "react";
import { CLAVE_TEMA as CLAVE } from "./tema-script";

// Tema del portal: el del sistema o uno elegido, como atributo data-tema en <html> (globals.css).
// La elección se guarda en el navegador; lib/tema-script.ts la aplica antes de pintar.
export type Tema = "sistema" | "claro" | "oscuro";

const EVENTO = "cambio-tema";

function leer(): Tema {
  const t = document.documentElement.dataset.tema;
  return t === "claro" || t === "oscuro" ? t : "sistema";
}

const sistemaOscuro = () => matchMedia("(prefers-color-scheme: dark)").matches;

export function elegirTema(t: Tema) {
  const html = document.documentElement;
  if (t === "sistema") delete html.dataset.tema;
  else html.dataset.tema = t;
  try {
    if (t === "sistema") localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, t);
  } catch {}
  window.dispatchEvent(new Event(EVENTO));
}

// Tema elegido y si lo que se ve es oscuro; se actualiza al cambiarlo desde otro control o en el sistema
export function useTema() {
  const [estado, setEstado] = useState<{ tema: Tema; oscuro: boolean }>({ tema: "sistema", oscuro: false });
  useEffect(() => {
    const medio = matchMedia("(prefers-color-scheme: dark)");
    const actualizar = () => {
      const tema = leer();
      setEstado({ tema, oscuro: tema === "oscuro" || (tema === "sistema" && sistemaOscuro()) });
    };
    actualizar();
    window.addEventListener(EVENTO, actualizar);
    medio.addEventListener("change", actualizar);
    return () => {
      window.removeEventListener(EVENTO, actualizar);
      medio.removeEventListener("change", actualizar);
    };
  }, []);
  return estado;
}
