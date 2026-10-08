"use client";

import { Moon, Sun } from "lucide-react";
import { elegirTema, useTema } from "@/lib/tema";

// Cambio de modo claro / oscuro en la cabecera del sitio (en el visor está en la barra de paneles)
export default function BotonTema() {
  const { oscuro } = useTema();
  const etiqueta = oscuro ? "Usar modo claro" : "Usar modo oscuro";
  const Icono = oscuro ? Sun : Moon;
  return (
    <button type="button" className="boton-tema" title={etiqueta} aria-label={etiqueta} onClick={() => elegirTema(oscuro ? "claro" : "oscuro")}>
      <Icono size={18} aria-hidden />
    </button>
  );
}
