import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import Galeria, { type CapaGaleria } from "@/components/inicio/Galeria";
import BuscadorProveedores from "@/components/inicio/BuscadorProveedores";
import BotonCopiar from "@/components/inicio/BotonCopiar";
import { CAPAS_NODO, NODO, SERVICIOS } from "@/lib/config";
import { CONTORNO_CHUBUT } from "@/lib/vista-chubut";
import idera from "@/lib/capas-idera.json";

// Página de presentación del nodo. Sigue el "Contenido recomendado para geoportales" de IDERA
// (identidad, descripción, accesos, datos, términos de uso y contacto) con el sistema visual del
// Registro de Proveedores (proveedores.chubut.gob.ar). Los íconos son de la Biblioteca de Íconos de la
// Provincia (public/marca/iconos).


// Los botones de la portada llevan al visor y al catálogo; los accesos no los repiten
const ACCESOS = [
  { href: "#servicios", titulo: "Servicios web", texto: "WMS, WFS, WMTS y CSW para usar las capas en QGIS, ArcGIS u otro SIG.", icono: "servicios", externo: false },
  { href: "/ayuda", titulo: "Guía de uso", texto: "Cómo usar el visor, buscar en el catálogo y descargar los datos.", icono: "ayuda", externo: false },
  { href: "https://proveedores.chubut.gob.ar/", titulo: "Registro de Proveedores", texto: "Inscribite o actualizá tus datos para contratar con el Estado provincial.", icono: "registro", externo: true },
];

// Capas de IDERA que muestran algo sobre el Chubut y cuyos servicios suelen responder. La galería es una
// muestra: las 76 están en el visor
const DESTACADAS = [
  "asentamientos-humanos-de-la-republica-argentina-bahra",
  "red-vial-rutas-provinciales",
  "establecimiento-educativo",
  "edificio-de-salud",
  "central-electrica",
  "linea-de-transmision-electrica",
  "yacimiento-hidrocarburifero-cuencas-de-shale-gas",
  "corriente-de-agua-lineas-perenne",
  "unidad-geologica",
  "departamento",
  "areas-protegidas-nacionales",
];

const ASUNTOS = [
  { titulo: "Hacer una consulta", asunto: `Consulta sobre el ${NODO.nombre}` },
  { titulo: "Reportar un error en los datos", asunto: `Error en los datos del ${NODO.nombre}` },
  { titulo: "Pedir una capa", asunto: `Pedido de capa al ${NODO.nombre}` },
];

// El ícono se pinta con el color del texto (máscara CSS), así sigue al tema
function Icono({ icono }: { icono: string }) {
  return (
    <span className="icono">
      <span className="icono-marca" style={{ maskImage: `url(/marca/iconos/${icono}.svg)` }} aria-hidden />
    </span>
  );
}

export default function Inicio() {
  const propias = CAPAS_NODO;
  const capas: CapaGaleria[] = [
    // El visor identifica las capas del nodo por su nombre sin el espacio de trabajo
    ...propias.map((c) => {
      const id = c.nombre.split(":").pop()!;
      return { id, titulo: c.titulo, tema: c.grupo, propia: true, imagen: `/api/miniatura/${id}` };
    }),
    // Las miniaturas pasan por /api/miniatura, que las guarda en caché (los WMS nacionales no tienen)
    ...DESTACADAS.flatMap((id) => idera.capas.filter((c) => c.id === id))
      .map((c) => ({ id: c.id, titulo: c.titulo, tema: c.grupo, propia: false, imagen: `/api/miniatura/${c.id}` })),
  ];
  const totalCapas = CAPAS_NODO.length + idera.capas.length;

  return (
    <div className="inicio">
      {/* 1. Identidad institucional y buscador: la portada responde "¿qué proveedor buscás?" */}
      <section className="portada">
        <BuscadorProveedores
          contorno={CONTORNO_CHUBUT}
          encabezado={
            <>
              <h1>Información Georreferenciada de Proveedores del Estado</h1>
              <p className="red">
                {NODO.oficina} · {NODO.subsecretaria}. Forma parte de la red de{" "}
                <a href="https://www.idera.gob.ar/">IDERA</a>.
              </p>
            </>
          }
        />
      </section>

      {/* 3. Accesos directos */}
      <nav className="ancho accesos" aria-label="Accesos directos">
        {ACCESOS.map((a) => {
          const contenido = (
            <>
              <Icono icono={a.icono} />
              <span>
                <strong>{a.titulo}</strong>
                {a.texto}
              </span>
              <span className="flecha"><ArrowUpRight aria-hidden /></span>
            </>
          );
          return a.externo ? (
            <a key={a.href} href={a.href} className="tarjeta-acceso">{contenido}</a>
          ) : (
            <Link key={a.href} href={a.href} className="tarjeta-acceso">{contenido}</Link>
          );
        })}
      </nav>

      {/* 2. Descripción */}
      <section id="que-es" className="ancho">
        <h2>¿Qué es este nodo?</h2>
        <p>
          La plataforma con la que la {NODO.oficina} publica dónde están los proveedores del Estado provincial,
          con datos del Registro de Proveedores y del SIAFyC, en servicios estándar y con metadatos IDERA.
        </p>
      </section>

      {/* 4. Datos y temáticas */}
      <section id="datos" className="ancho">
        <h2>Capas destacadas</h2>
        <p>
          Las capas del nodo y una selección de las {idera.capas.length} capas de referencia de los organismos que
          integran IDERA. El nodo no duplica la cartografía básica: la toma de quienes la producen.
        </p>
        <Galeria capas={capas} contorno={CONTORNO_CHUBUT} />
        <p className="ver-todas">
          <Link href="/visor">Ver las {totalCapas} capas en el visor</Link>
        </p>
      </section>

      {/* 3. Servicios web */}
      <section id="servicios" className="ancho">
        <h2>Servicios web geoespaciales</h2>
        <p>
          Para usar las capas en QGIS, ArcGIS u otro SIG, copiá la dirección del servicio y agregala como
          conexión (<Link href="/ayuda#qgis">paso a paso</Link>).
        </p>
        <table className="servicios">
          <tbody>
            {SERVICIOS.map((s) => (
              <tr key={s.tipo}>
                <th>
                  {s.tipo}
                  <span>{s.nombre}</span>
                </th>
                <td>
                  {s.uso}
                  <a href={s.url}><code>{s.url}</code></a>
                </td>
                <td className="accion"><BotonCopiar ruta={s.url} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 5. Términos de uso y 6. Contacto */}
      <section className="ancho dos-tarjetas">
        <div id="terminos" className="tarjeta bloque">
          <h2>Términos de uso</h2>
          <p>
            Los datos son abiertos y se publican con la licencia{" "}
            <a href={NODO.licencia.url}>{NODO.licencia.nombre}</a>: se pueden copiar, redistribuir y
            transformar, también con fines comerciales, citando la fuente así:
          </p>
          <blockquote className="cita">
            Fuente: {NODO.nombre}, {NODO.oficina}, {NODO.organismo} de la {NODO.jurisdiccion}.
          </blockquote>
          <p>
            La información se publica tal como surge de los registros administrativos que la originan. Cada
            punto indica con qué precisión se ubicó y no tiene valor legal: ante cualquier diferencia vale el
            registro de origen.
          </p>
        </div>
        <div id="contacto" className="tarjeta bloque">
          <h2>Contacto</h2>
          <p>
            <strong>{NODO.area}</strong>
            <br />
            {NODO.oficina}
            <br />
            {NODO.subsecretaria}
            <br />
            {NODO.organismo}, {NODO.jurisdiccion}
          </p>
          {NODO.correo && <p><a href={`mailto:${NODO.correo}`}>{NODO.correo}</a></p>}
          {NODO.telefono && <p>Tel. <a href={NODO.telefonoEnlace}>{NODO.telefono}</a> · {NODO.horario}</p>}
          {NODO.direccion && <p>{NODO.direccion}</p>}
          {NODO.correo ? (
            <ul className="asuntos">
              {ASUNTOS.map((a) => (
                <li key={a.titulo}>
                  <a href={`mailto:${NODO.correo}?subject=${encodeURIComponent(a.asunto)}`}>{a.titulo}</a>
                </li>
              ))}
            </ul>
          ) : (
            <p>Pronto habilitaremos un canal para consultas, reportes de errores y pedidos de capas.</p>
          )}
        </div>
      </section>
    </div>
  );
}
