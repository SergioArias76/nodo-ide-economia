import { NextResponse } from "next/server";
import { leerAlertas } from "@/lib/alertas-smn";

// Alertas meteorológicas vigentes del SMN sobre el Chubut, en GeoJSON (EPSG:4326), para el visor.
//   GET /api/alertas → FeatureCollection con evento, nivel, vigencia, descripción y recomendaciones
export async function GET() {
  try {
    const alertas = await leerAlertas();
    return NextResponse.json(alertas, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (e) {
    console.error("alertas", e);
    return NextResponse.json({ error: "Las alertas del SMN no están disponibles en este momento." }, { status: 502 });
  }
}
