import type Map from "ol/Map";
import { getPointResolution, toLonLat } from "ol/proj";

// Une los canvas de todas las capas en una sola imagen (receta oficial de OpenLayers).
// Requiere que todas las fuentes se carguen con CORS.
export function imagenDelMapa(mapa: Map): Promise<HTMLCanvasElement> {
  return new Promise((resolver) => {
    mapa.once("rendercomplete", () => {
      const [ancho, alto] = mapa.getSize()!;
      const salida = document.createElement("canvas");
      salida.width = ancho;
      salida.height = alto;
      const ctx = salida.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, ancho, alto);
      mapa.getViewport()!.querySelectorAll<HTMLCanvasElement>(".ol-layer canvas, canvas.ol-layer").forEach((canvas) => {
        if (canvas.width === 0) return;
        const padre = canvas.parentElement as HTMLElement;
        ctx.globalAlpha = Number(padre.style.opacity || canvas.style.opacity || 1);
        // La transformación CSS del canvas lleva sus píxeles a los de la pantalla
        const m = canvas.style.transform.match(/^matrix\(([^)]*)\)$/);
        const [a, b, c, d, e, f] = m
          ? m[1].split(",").map(Number)
          : [parseFloat(canvas.style.width) / canvas.width, 0, 0, parseFloat(canvas.style.height) / canvas.height, 0, 0];
        ctx.setTransform(a, b, c, d, e, f);
        ctx.drawImage(canvas, 0, 0);
      });
      ctx.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      resolver(salida);
    });
    mapa.renderSync();
  });
}

function descargar(url: string, nombre: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
}

const fecha = () => new Date().toISOString().slice(0, 10);

export async function capturaPng(mapa: Map) {
  const canvas = await imagenDelMapa(mapa);
  descargar(canvas.toDataURL("image/png"), `mapa-ide-economia-${fecha()}.png`);
}

export function descargarTexto(texto: string, nombre: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  descargar(url, nombre);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Escala numérica aproximada en el centro del mapa (pantalla a 96 dpi)
export function escala(mapa: Map) {
  const vista = mapa.getView();
  const res = getPointResolution("EPSG:3857", vista.getResolution()!, vista.getCenter()!, "m");
  const valor = res * (96 / 0.0254);
  const redondeo = 10 ** Math.max(0, Math.floor(Math.log10(valor)) - 1);
  return `1:${(Math.round(valor / redondeo) * redondeo).toLocaleString("es-AR")}`;
}

type OpcionesPdf = { titulo: string; orientacion: "landscape" | "portrait"; atribuciones: string; leyenda: string[] };

// PDF A4 con título, mapa, escala, coordenadas del centro, leyenda y fuente
export async function imprimirPdf(mapa: Map, o: OpcionesPdf) {
  const [{ jsPDF }, canvas] = await Promise.all([import("jspdf"), imagenDelMapa(mapa)]);
  const pdf = new jsPDF({ orientation: o.orientacion, unit: "mm", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const m = 12;

  pdf.setFillColor(11, 93, 143);
  pdf.rect(0, 0, W, 4, "F");
  pdf.setFont("helvetica", "bold").setFontSize(15).setTextColor(31, 41, 51);
  pdf.text(o.titulo || "Mapa", m, m + 6);
  pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(97, 110, 124);
  pdf.text("IDE Ministerio de Economía · Provincia del Chubut", m, m + 11);
  pdf.text(new Date().toLocaleDateString("es-AR", { dateStyle: "long" }), W - m, m + 6, { align: "right" });

  // Mapa: ocupa el espacio disponible respetando la proporción
  const arriba = m + 16;
  const pie = 22;
  const maxW = W - 2 * m;
  const maxH = H - arriba - pie - m;
  const prop = canvas.width / canvas.height;
  const w = Math.min(maxW, maxH * prop);
  const h = w / prop;
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", m, arriba, w, h);
  pdf.setDrawColor(217, 222, 227).rect(m, arriba, w, h);

  const [lon, lat] = toLonLat(mapa.getView().getCenter()!);
  let y = arriba + h + 6;
  pdf.setFontSize(9).setTextColor(31, 41, 51);
  pdf.text(`Escala aprox. ${escala(mapa)}  ·  Centro ${lat.toFixed(4)}°, ${lon.toFixed(4)}°  ·  EPSG:3857`, m, y);
  if (o.leyenda.length) {
    y += 5;
    pdf.text(`Capas: ${o.leyenda.join(" · ")}`, m, y, { maxWidth: W - 2 * m });
  }
  pdf.setFontSize(7.5).setTextColor(97, 110, 124);
  pdf.text(`Fuentes: Ministerio de Economía del Chubut${o.atribuciones ? ` · ${o.atribuciones}` : ""}`, m, H - m + 2, {
    maxWidth: W - 2 * m,
  });

  pdf.save(`mapa-ide-economia-${fecha()}.pdf`);
}
