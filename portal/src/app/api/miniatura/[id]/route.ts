import type { NextRequest } from "next/server";
import { CAPAS_NODO, WORKSPACE } from "@/lib/config";
import { imagenWms } from "@/lib/vista-chubut";
import idera from "@/lib/capas-idera.json";

// Miniaturas de la galería de inicio. El servidor pide cada imagen WMS una vez al organismo de origen,
// al tamaño en que se muestra, y la guarda en memoria: el navegador no descarga imágenes de 700 px de
// servidores nacionales sin caché en cada visita, y un servicio caído no demora la página. Solo atiende
// capas conocidas (las del nodo y las del catálogo IDERA), así que no es un proxy abierto.

const HORAS = 12;
const ESCALA = 1.2; // 432 px de ancho: alcanza para pantallas densas con la tarjeta de ~210 px
const ESPERA_MS = 8000;

type Entrada = { imagen: ArrayBuffer | null; vence: number };
const cache = new Map<string, Entrada>();

function origen(id: string): string | null {
  const propia = CAPAS_NODO.find((c) => c.nombre === `${WORKSPACE}:${id}`);
  if (propia) {
    const geoserver = process.env.GEOSERVER_URL ?? "http://localhost:8080/geoserver";
    return imagenWms(`${geoserver}/${WORKSPACE}/wms`, propia.nombre, ESCALA);
  }
  const externa = idera.capas.find((c) => c.id === id);
  return externa ? imagenWms(externa.url, externa.capa, ESCALA) : null;
}

async function descargar(url: string): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ESPERA_MS), cache: "no-store" });
    // Un WMS con error responde 200 con XML: solo vale si es una imagen
    if (!r.ok || !(r.headers.get("content-type") ?? "").startsWith("image/")) return null;
    return await r.arrayBuffer();
  } catch {
    return null;
  }
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/miniatura/[id]">) {
  const { id } = await ctx.params;
  const url = origen(id);
  if (!url) return new Response("Capa desconocida", { status: 404 });

  let entrada = cache.get(id);
  if (!entrada || entrada.vence < Date.now()) {
    const imagen = await descargar(url);
    // Un servicio caído se vuelve a probar a los 10 minutos, no en cada visita
    entrada = { imagen, vence: Date.now() + (imagen ? HORAS * 3600_000 : 600_000) };
    cache.set(id, entrada);
  }

  if (!entrada.imagen) {
    return new Response("El servicio de origen no responde", { status: 502, headers: { "Cache-Control": "public, max-age=600" } });
  }
  return new Response(entrada.imagen, {
    headers: { "Content-Type": "image/png", "Cache-Control": `public, max-age=${HORAS * 3600}` },
  });
}
