import { connection } from "next/server";

export type RegistroCatalogo = {
  uuid: string;
  titulo: string;
  resumen: string;
};

type HitGeoNetwork = {
  _id: string;
  _source: {
    resourceTitleObject?: { default?: string };
    resourceAbstractObject?: { default?: string };
  };
};

// URL interna (red de Docker); no se expone al navegador.
const GEONETWORK_URL = process.env.GEONETWORK_URL ?? "http://localhost:8080/geonetwork";

/** Busca registros en el catálogo vía la API de búsqueda de GeoNetwork 4 (Elasticsearch). */
export async function buscarRegistros(texto: string, cantidad = 20): Promise<RegistroCatalogo[]> {
  await connection();

  const query = texto
    ? { multi_match: { query: texto, fields: ["resourceTitleObject.*", "resourceAbstractObject.*", "tag.*"] } }
    : { match_all: {} };

  const res = await fetch(`${GEONETWORK_URL}/srv/api/search/records/_search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      size: cantidad,
      query: { bool: { must: [query], filter: [{ term: { isTemplate: "n" } }] } },
      _source: ["resourceTitleObject", "resourceAbstractObject"],
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`GeoNetwork respondió ${res.status}`);

  const data: { hits: { hits: HitGeoNetwork[] } } = await res.json();
  return data.hits.hits.map((h) => ({
    uuid: h._id,
    titulo: h._source.resourceTitleObject?.default ?? "(sin título)",
    resumen: h._source.resourceAbstractObject?.default ?? "",
  }));
}
