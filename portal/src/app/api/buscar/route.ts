import { NextResponse, type NextRequest } from "next/server";
import { buscar, leerOpciones } from "@/lib/buscar-proveedores";

// Buscador de inicio.
//   GET /api/buscar                              → listas de rubros y localidades (para sugerir) y el total
//   GET /api/buscar?rubro=X&localidad=Y&provincia=Z → resumen de los proveedores que cumplen los filtros
// Rubro y localidad tienen que existir en las listas publicadas; si no, 400.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  try {
    const opciones = await leerOpciones();
    const rubroPedido = q.get("rubro");
    const localidadPedida = q.get("localidad");

    if (!rubroPedido && !localidadPedida) {
      return NextResponse.json(opciones, { headers: { "Cache-Control": "public, max-age=600" } });
    }

    const rubro = rubroPedido ? (opciones.rubros.find((r) => r.rubro === rubroPedido)?.rubro ?? undefined) : null;
    const provincia = q.get("provincia") ?? "Chubut";
    const localidad = localidadPedida
      ? (opciones.localidades.find((l) => l.localidad === localidadPedida && l.provincia === provincia) ?? undefined)
      : null;
    if (rubro === undefined || localidad === undefined) {
      return NextResponse.json({ error: "Rubro o localidad desconocidos." }, { status: 400 });
    }

    const resultado = await buscar(rubro, localidad);
    return NextResponse.json(resultado, { headers: { "Cache-Control": "public, max-age=600" } });
  } catch (e) {
    console.error("buscar", e);
    return NextResponse.json({ error: "El buscador no está disponible en este momento." }, { status: 502 });
  }
}
