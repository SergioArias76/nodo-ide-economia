import type { Metadata } from "next";
import Link from "next/link";
import { PUBLIC_GEOSERVER, SERVICIOS, WORKSPACE } from "@/lib/config";

export const metadata: Metadata = { title: "Guía de uso" };

const WMS = `${PUBLIC_GEOSERVER}/${WORKSPACE}/wms`;
const WFS = `${PUBLIC_GEOSERVER}/${WORKSPACE}/wfs`;

export default function Ayuda() {
  const csw = SERVICIOS.find((s) => s.tipo === "CSW")!.url.split("?")[0];

  return (
    <div className="contenido guia">
      <section>
        <h1>Guía de uso</h1>
        <p>
          Cómo consultar los datos del nodo, desde el navegador o desde un software SIG. Las direcciones de
          los servicios empiezan con la dirección de este sitio: si la ves como <code>/geoserver/…</code>,
          anteponé el dominio (por ejemplo, <code>https://<em>dominio-del-nodo</em>{WMS}</code>).
        </p>
        <nav className="indice" aria-label="Secciones">
          <a href="#visor">Visor de mapas</a>
          <a href="#catalogo">Catálogo</a>
          <a href="#qgis">QGIS</a>
          <a href="#arcgis">ArcGIS</a>
          <a href="#descargas">Descargas</a>
        </nav>
      </section>

      <section id="visor">
        <h2>Visor de mapas</h2>
        <p>Para empezar:</p>
        <ol>
          <li>Abrí el <Link href="/visor">visor</Link>. El panel <strong>Capas</strong> muestra las del nodo agrupadas por tema.</li>
          <li>Buscá una localidad del Chubut o el CUIT de un proveedor en el buscador de arriba.</li>
          <li>Hacé clic sobre un punto del mapa para ver sus datos.</li>
          <li>En la capa de proveedores podés filtrar por tipo de persona, localidad y rubro.</li>
        </ol>
        <p>Si ya usás SIG:</p>
        <ul>
          <li><strong>Agregar capas:</strong> servicios WMS de otros organismos o archivos GeoJSON, KML, GPX y Shapefile.</li>
          <li><strong>Análisis geográfico:</strong> contar o sumar datos en un área, áreas de influencia, cruces de capas y distancias.</li>
          <li><strong>Medir, dibujar e imprimir:</strong> los dibujos se descargan en GeoJSON y la impresión genera un PDF A4.</li>
          <li><strong>Compartir:</strong> la dirección de la página guarda la vista y las capas activas.</li>
        </ul>
        <p>Dentro del visor, el botón <strong>Ayuda</strong> describe cada herramienta.</p>
      </section>

      <section id="catalogo">
        <h2>Catálogo de metadatos</h2>
        <p>
          En el <Link href="/catalogo">catálogo</Link>, buscá por palabra clave (por ejemplo, «proveedores»).
          Cada ficha indica el responsable del dato, cuándo se actualizó, su sistema de referencia y los
          servicios que lo publican. Sigue el perfil de metadatos de IDERA (ISO 19115/19139).
        </p>
        <p>
          Otros catálogos pueden cosechar este con el servicio CSW: <code>{csw}</code>.
        </p>
      </section>

      <section id="qgis">
        <h2>Conectar desde QGIS</h2>
        <ol>
          <li>Menú <strong>Capa → Administrador de fuentes de datos</strong> (Ctrl+L).</li>
          <li>Elegí <strong>WMS/WMTS</strong> para ver mapas o <strong>WFS / OGC API - Features</strong> para trabajar con los datos.</li>
          <li><strong>Nueva</strong>: poné un nombre (por ejemplo, «Nodo IDE Economía Chubut») y la dirección:
            <ul>
              <li>WMS: <code>{WMS}</code></li>
              <li>WFS: <code>{WFS}</code></li>
            </ul>
          </li>
          <li><strong>Conectar</strong>, elegí la capa y <strong>Añadir</strong>.</li>
        </ol>
        <p>Con WFS tenés la tabla de atributos y podés exportar la capa con <em>Exportar → Guardar objetos como</em>.</p>
      </section>

      <section id="arcgis">
        <h2>Conectar desde ArcGIS Pro</h2>
        <ol>
          <li>Pestaña <strong>Insertar → Conexiones → Servidor → Nuevo servidor WMS</strong> (o <strong>WFS</strong>).</li>
          <li>Pegá la dirección del servicio y aceptá.</li>
          <li>La conexión aparece en el panel <strong>Catálogo</strong>, en <em>Servidores</em>: arrastrá la capa al mapa.</li>
        </ol>
      </section>

      <section id="descargas">
        <h2>Descargas</h2>
        <p>El WFS entrega cada capa en distintos formatos. Ejemplos con la capa de proveedores:</p>
        <ul>
          <li>GeoJSON: <a href={`${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${WORKSPACE}:proveedores_radicacion&outputFormat=application/json`}><code>…&amp;outputFormat=application/json</code></a></li>
          <li>CSV: <a href={`${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${WORKSPACE}:proveedores_radicacion&outputFormat=csv`}><code>…&amp;outputFormat=csv</code></a></li>
          <li>Shapefile: <a href={`${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${WORKSPACE}:proveedores_radicacion&outputFormat=SHAPE-ZIP`}><code>…&amp;outputFormat=SHAPE-ZIP</code></a></li>
        </ul>
        <p>
          Al usar los datos, citá la fuente según los <Link href="/#terminos">términos de uso</Link>.
        </p>
      </section>
    </div>
  );
}
