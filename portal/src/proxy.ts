import { NextResponse, type NextRequest } from "next/server";

// La pantalla de ubicación manual (/ubicaciones) y su API piden usuario y contraseña (UBICACIONES_USUARIO y
// UBICACIONES_PASSWORD del .env). Además, nginx no la sirve por el túnel de Cloudflare.
export function proxy(request: NextRequest) {
  const usuario = process.env.UBICACIONES_USUARIO;
  const clave = process.env.UBICACIONES_PASSWORD;
  if (!usuario || !clave) return new NextResponse("La pantalla de ubicaciones no está configurada.", { status: 503 });
  const [tipo, datos] = (request.headers.get("authorization") ?? "").split(" ");
  if (tipo === "Basic" && datos) {
    const texto = atob(datos);
    const i = texto.indexOf(":");
    if (i > 0 && iguales(texto.slice(0, i), usuario) && iguales(texto.slice(i + 1), clave)) return NextResponse.next();
  }
  return new NextResponse("Hace falta usuario y contraseña.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Ubicaciones de proveedores", charset="UTF-8"' },
  });
}

// Comparación de tiempo constante: no revela cuántos caracteres coinciden
function iguales(a: string, b: string) {
  let diferencia = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diferencia |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diferencia === 0;
}

export const config = { matcher: ["/ubicaciones/:path*", "/api/ubicaciones/:path*"] };
