// Capas de emergencias y alertas del visor: servicios públicos y gratuitos, sin clave, que permiten CORS
// (verificados en noviembre de 2026). Se superponen a los proveedores para ver qué infraestructura de
// suministro corre peligro o quién está cerca para asistir.

export const GRUPO_ALERTAS = "Emergencias y alertas";

// Alertas del SMN: las junta el portal (app/api/alertas) desde el feed CAP oficial; es una capa vectorial
export const ALERTAS_SMN = {
  id: "alertas_smn",
  titulo: "Alertas meteorológicas del SMN",
  resumen:
    "Alertas vigentes del Servicio Meteorológico Nacional (tormentas, viento, nieve, calor, etc.) que tocan el Chubut, con su nivel, vigencia y recomendaciones. Se actualiza cada 10 minutos. Licencia CC BY 4.0.",
  url: "/api/alertas",
};

// Colores de los niveles de alerta del SMN
export const COLORES_NIVEL: Record<string, string> = { Amarillo: "#e6b800", Naranja: "#ef7d1a", Rojo: "#d63a2f" };

const GWIS = "https://maps.effis.emergency.copernicus.eu/gwis";
const GLOFAS = "https://ows.globalfloods.eu/glofas-ows/ows.py";

export type CapaAlertaWms = { id: string; titulo: string; resumen: string; url: string; capa: string };

export const CAPAS_ALERTAS: CapaAlertaWms[] = [
  {
    id: "focos_de_calor",
    titulo: "Focos de calor (últimos 7 días)",
    resumen:
      "Puntos de calor detectados por satélite (VIIRS) en los últimos 7 días: posibles incendios activos. Copernicus, Sistema Mundial de Información sobre Incendios Forestales (GWIS).",
    url: GWIS,
    capa: "viirs.hs.week",
  },
  {
    id: "areas_quemadas",
    titulo: "Áreas quemadas (últimos 30 días)",
    resumen: "Superficie quemada detectada por satélite en los últimos 30 días. Copernicus GWIS.",
    url: GWIS,
    capa: "nrt.ba.month",
  },
  {
    id: "peligro_de_incendio",
    titulo: "Peligro de incendio (pronóstico del día)",
    resumen:
      "Índice meteorológico de peligro de incendio (FWI) del pronóstico del día: de muy bajo a extremo, según temperatura, humedad, viento y lluvia. Copernicus GWIS, modelo del ECMWF.",
    url: GWIS,
    capa: "ecmwf.fwi",
  },
  {
    id: "zonas_inundables",
    titulo: "Zonas inundables (crecida de 100 años)",
    resumen:
      "Áreas que se inundarían con una crecida de los ríos que ocurre, en promedio, una vez cada 100 años. Es un mapa de peligro, no un pronóstico. Copernicus, Sistema Mundial de Alerta de Inundaciones (GloFAS).",
    url: GLOFAS,
    capa: "FloodHazard100y",
  },
  {
    id: "pronostico_de_crecidas",
    titulo: "Pronóstico de crecidas (próximos 15 días)",
    resumen: "Cuencas con crecidas previstas en los próximos 15 días, según el pronóstico de Copernicus GloFAS.",
    url: GLOFAS,
    capa: "FloodSummary1_30",
  },
];

// Estos servicios dan la leyenda con WMS 1.1.1 (con 1.3.0 piden sld_version)
export const leyendaAlerta = (c: CapaAlertaWms) =>
  `${c.url}?service=WMS&version=1.1.1&request=GetLegendGraphic&format=image/png&layer=${encodeURIComponent(c.capa)}`;
