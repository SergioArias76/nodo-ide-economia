import type { Metadata } from "next";
import { Suspense } from "react";
import { buscarRegistros } from "@/lib/geonetwork";
import { PUBLIC_GEONETWORK } from "@/lib/config";

export const metadata: Metadata = { title: "Catálogo" };

async function Resultados({ searchParams }: { searchParams: PageProps<"/catalogo">["searchParams"] }) {
  const { q } = await searchParams;
  const texto = typeof q === "string" ? q : "";

  let registros;
  try {
    registros = await buscarRegistros(texto);
  } catch {
    return <p className="aviso">El catálogo no está disponible en este momento.</p>;
  }

  if (registros.length === 0) return <p>No se encontraron registros.</p>;

  return (
    <ul className="registros">
      {registros.map((r) => (
        <li key={r.uuid}>
          <a href={`${PUBLIC_GEONETWORK}/srv/spa/catalog.search#/metadata/${r.uuid}`}>{r.titulo}</a>
          <p>{r.resumen.slice(0, 280)}{r.resumen.length > 280 ? "…" : ""}</p>
        </li>
      ))}
    </ul>
  );
}

export default function Catalogo(props: PageProps<"/catalogo">) {
  return (
    <div className="contenido">
      <h1>Catálogo de metadatos</h1>
      <form className="buscador">
        <input name="q" type="search" placeholder="Buscar capas, servicios, palabras clave…" />
        <button type="submit">Buscar</button>
      </form>
      <Suspense fallback={<p className="cargando">Consultando catálogo…</p>}>
        <Resultados searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
