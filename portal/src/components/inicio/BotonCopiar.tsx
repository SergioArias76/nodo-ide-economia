"use client";

import { useState } from "react";

// Copia la dirección completa de un servicio (con el dominio del sitio) para pegarla en un SIG
export default function BotonCopiar({ ruta }: { ruta: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(new URL(ruta, location.origin).href);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso para el portapapeles: queda el enlace para copiarlo a mano
    }
  }

  return (
    <button type="button" className="copiar" onClick={copiar} aria-live="polite">
      {copiado ? "Copiada" : "Copiar"}
    </button>
  );
}
