import Link from "next/link";
import BotonTema from "@/components/BotonTema";
import { NODO, SERVICIOS } from "@/lib/config";

// Firma oficial del Ministerio (isotipo + nombre en Rubik), como en el Registro de Proveedores
function Firma() {
  return (
    <>
      <img src="/marca/isotipo.svg" alt="" width={42} height={42} />
      <span className="firma">
        {NODO.organismo}
        <small>Gobierno del Chubut</small>
      </span>
    </>
  );
}

// Cabecera y pie de las páginas del sitio. El visor ocupa la pantalla completa y no los usa.
export default function SitioLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="cabecera">
        <Link href="/" className="marca">
          <Firma />
          <span className="nodo">
            {NODO.nombre}
            <small>{NODO.oficina}</small>
          </span>
        </Link>
        <nav>
          <Link href="/visor">Visor</Link>
          <Link href="/catalogo">Catálogo</Link>
          <Link href="/ayuda">Ayuda</Link>
          <BotonTema />
          <Link href="/visor" className="boton-cabecera">Abrir el visor</Link>
        </nav>
      </header>
      <main>{children}</main>
      <footer className="pie">
        <div className="ancho pie-columnas">
          <div>
            <span className="marca"><Firma /></span>
            <p className="pie-nombre">{NODO.nombre}</p>
            <p>Información georreferenciada de proveedores del Estado provincial.</p>
          </div>
          <div>
            <p className="pie-titulo">El nodo</p>
            <ul>
              <li><Link href="/visor">Visor de mapas</Link></li>
              <li><Link href="/catalogo">Catálogo de metadatos</Link></li>
              <li><Link href="/ayuda">Guía de uso</Link></li>
              <li><Link href="/#terminos">Términos de uso</Link></li>
            </ul>
          </div>
          <div>
            <p className="pie-titulo">Servicios</p>
            <ul>
              {SERVICIOS.map((s) => (
                <li key={s.tipo}><a href={s.url}>{s.tipo}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <p className="pie-titulo">Institucional</p>
            <ul>
              <li>{NODO.area}</li>
              <li>{NODO.oficina}</li>
              <li>{NODO.subsecretaria}</li>
              <li><a href="https://proveedores.chubut.gob.ar/">Registro de Proveedores</a></li>
              <li><a href="https://www.chubut.gob.ar/">chubut.gob.ar</a></li>
            </ul>
          </div>
        </div>
        <div className="pie-legal">
          {NODO.organismo} — {NODO.jurisdiccion}
        </div>
      </footer>
    </>
  );
}
