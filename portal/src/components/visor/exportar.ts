import type Map from "ol/Map";
import { getPointResolution, toLonLat } from "ol/proj";
import type { Resultado } from "./FichaConsulta";

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

type OpcionesPdf = {
  titulo: string;
  orientacion: "landscape" | "portrait";
  atribuciones: string;
  leyenda: string[];
  consultado?: Resultado; // ficha abierta (un proveedor buscado o consultado): se imprime debajo del mapa
  marca?: { coordenada: number[]; color: string }; // punto de la ficha: se destaca en la imagen del mapa
};

// Destaca el punto consultado sobre la imagen: halo, anillo y etiqueta con el nombre unida al punto.
// La marca del visor (un anillo chico) se pierde entre los íconos de la capa al pasar al papel.
function destacar(canvas: HTMLCanvasElement, [x, y]: number[], color: string, nombre: string) {
  const ctx = canvas.getContext("2d")!;
  // Medidas pensadas para una imagen de 700 px de ancho: se agrandan con la imagen para que en el papel
  // la marca y la etiqueta mantengan su tamaño
  const k = Math.max(1, canvas.width / 700);
  ctx.save();
  // El color del tema puede venir en cualquier formato CSS: la transparencia va por globalAlpha
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 30 * k, 0, 2 * Math.PI);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 8 * k;
  ctx.strokeStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, 17 * k, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.lineWidth = 4 * k;
  ctx.strokeStyle = color;
  ctx.stroke();

  // Etiqueta arriba del punto (abajo si no entra), dentro de los bordes de la imagen
  ctx.font = `bold ${15 * k}px Helvetica, Arial, sans-serif`;
  const texto = nombre.length > 60 ? `${nombre.slice(0, 57)}…` : nombre;
  const ancho = ctx.measureText(texto).width + 20 * k;
  const alto = 28 * k;
  const separacion = 44 * k;
  const arriba = y - separacion - alto >= 4;
  const ey = arriba ? y - separacion - alto : y + separacion;
  const ex = Math.min(Math.max(x - ancho / 2, 4), canvas.width - ancho - 4);
  ctx.lineWidth = 2.5 * k;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, arriba ? y - 21 * k : y + 21 * k);
  ctx.lineTo(x, arriba ? ey + alto : ey);
  ctx.stroke();
  ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
  ctx.shadowBlur = 6 * k;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(ex, ey, ancho, alto, 6 * k);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.stroke();
  ctx.fillStyle = "#13262e";
  ctx.textBaseline = "middle";
  ctx.fillText(texto, ex + 10 * k, ey + alto / 2 + k);
  ctx.restore();
}

// PDF A4 con título, mapa, escala, coordenadas del centro, leyenda, ficha consultada y fuente
export async function imprimirPdf(mapa: Map, o: OpcionesPdf) {
  // Con un punto consultado, la imagen se centra en él y después el visor vuelve a la vista que tenía
  const vista = mapa.getView();
  const vistaAntes = vista.getCenter();
  if (o.marca) vista.setCenter(o.marca.coordenada);
  const [{ jsPDF }, canvas] = await Promise.all([import("jspdf"), imagenDelMapa(mapa)]);
  if (o.marca && o.consultado) destacar(canvas, mapa.getPixelFromCoordinate(o.marca.coordenada), o.marca.color, o.consultado.titulo);
  const [lon, lat] = toLonLat(vista.getCenter()!);
  const escalaMapa = escala(mapa);
  if (o.marca) vista.setCenter(vistaAntes);

  const pdf = new jsPDF({ orientation: o.orientacion, unit: "mm", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const m = 12;

  // Las seis franjas del isotipo del Chubut, de sol a mar
  const franjas = [[255, 200, 21], [255, 177, 9], [255, 133, 64], [255, 104, 44], [88, 148, 167], [33, 112, 140]];
  franjas.forEach(([r, g, b], i) => pdf.setFillColor(r, g, b).rect((W / 6) * i, 0, W / 6 + 0.2, 3, "F"));
  pdf.setFont("helvetica", "bold").setFontSize(15).setTextColor(19, 38, 46);
  pdf.text(o.titulo || "Mapa", m, m + 6);
  pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(77, 100, 110);
  pdf.text("Ministerio de Economía · Gobierno del Chubut · IDE", m, m + 11);
  pdf.text(new Date().toLocaleDateString("es-AR", { dateStyle: "long" }), W - m, m + 6, { align: "right" });

  // La ficha consultada va en una columna a la derecha del mapa en la hoja apaisada y debajo en la vertical
  const arriba = m + 16;
  const lateral = o.consultado != null && o.orientacion === "landscape";
  const columna = lateral ? 70 : 0;
  const anchoFicha = lateral ? columna - 6 : W - 2 * m - 4;
  pdf.setFont("helvetica", "bold").setFontSize(10);
  const tituloFicha = o.consultado ? (pdf.splitTextToSize(o.consultado.titulo, anchoFicha) as string[]) : [];
  pdf.setFont("helvetica", "normal").setFontSize(9);
  const renglones = o.consultado
    ? o.consultado.campos.flatMap((c) =>
        pdf.splitTextToSize(`${c.etiqueta}: ${Array.isArray(c.valor) ? c.valor.join(", ") : c.valor}`, anchoFicha) as string[],
      )
    : [];
  const altoFicha = o.consultado ? tituloFicha.length * 4.5 + 5 + renglones.length * 4 : 0;

  // Mapa: ocupa el espacio disponible respetando la proporción
  const pie = 22 + (o.consultado && !lateral ? altoFicha + 6 : 0);
  const maxW = W - 2 * m - columna;
  const maxH = H - arriba - pie - m;
  const prop = canvas.width / canvas.height;
  const w = Math.min(maxW, maxH * prop);
  const h = w / prop;
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", m, arriba, w, h);
  pdf.setDrawColor(211, 222, 226).rect(m, arriba, w, h);

  let y = arriba + h + 6;
  pdf.setFontSize(9).setTextColor(19, 38, 46);
  pdf.text(`Escala aprox. ${escalaMapa}  ·  Centro ${lat.toFixed(4)}°, ${lon.toFixed(4)}°  ·  EPSG:3857`, m, y);
  if (o.leyenda.length) {
    y += 5;
    pdf.text(`Capas: ${o.leyenda.join(" · ")}`, m, y, { maxWidth: W - 2 * m });
  }
  if (o.consultado) {
    const fx = lateral ? m + w + 6 : m;
    const fy = lateral ? arriba + 4 : y + 9;
    pdf.setFillColor(255, 104, 44).rect(fx, fy - 3.6, 1.2, altoFicha, "F");
    pdf.setFont("helvetica", "bold").setFontSize(10).setTextColor(19, 38, 46);
    pdf.text(tituloFicha, fx + 4, fy);
    const yCapa = fy + tituloFicha.length * 4.5;
    pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(77, 100, 110);
    pdf.text(o.consultado.capa, fx + 4, yCapa);
    pdf.setFontSize(9).setTextColor(19, 38, 46);
    renglones.forEach((r, i) => pdf.text(r, fx + 4, yCapa + 5 + i * 4));
  }
  pdf.setFontSize(7.5).setTextColor(77, 100, 110);
  pdf.text(`Fuentes: Ministerio de Economía del Chubut${o.atribuciones ? ` · ${o.atribuciones}` : ""}`, m, H - m + 2, {
    maxWidth: W - 2 * m,
  });

  pdf.save(`mapa-ide-economia-${fecha()}.pdf`);
}
