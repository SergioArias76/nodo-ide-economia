import { NextResponse, type NextRequest } from "next/server";
import { ErrorDeDatos, guardar, listar, resumen, type Estado } from "@/lib/ubicaciones";

// Lista de proveedores de la pantalla de ubicación manual, con los totales del encabezado
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const estado: Estado = q.get("estado") === "manuales" ? "manuales" : q.get("estado") === "todos" ? "todos" : "pendientes";
  try {
    const [lista, totales] = await Promise.all([
      listar({ estado, texto: q.get("q") ?? "", localidad: q.get("localidad") ?? "", desde: Math.max(0, Number(q.get("desde")) || 0) }),
      resumen(),
    ]);
    return NextResponse.json({ ...lista, resumen: totales });
  } catch (e) {
    console.error("ubicaciones GET", e);
    return NextResponse.json({ error: "No se pudo leer la base de datos." }, { status: 500 });
  }
}

// Guarda la ubicación marcada en el mapa
export async function POST(request: NextRequest) {
  let datos: { cuit?: unknown; lon?: unknown; lat?: unknown; nota?: unknown };
  try {
    datos = await request.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }
  const nota = typeof datos.nota === "string" && datos.nota.trim() ? datos.nota.trim().slice(0, 500) : null;
  try {
    const proveedor = await guardar(String(datos.cuit ?? ""), Number(datos.lon), Number(datos.lat), nota);
    return NextResponse.json({ proveedor });
  } catch (e) {
    if (e instanceof ErrorDeDatos) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("ubicaciones POST", e);
    return NextResponse.json({ error: "No se pudo guardar la ubicación." }, { status: 500 });
  }
}
