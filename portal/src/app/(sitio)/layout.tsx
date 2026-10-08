import Link from "next/link";
import BotonTema from "@/components/BotonTema";

// Cabecera y pie de las páginas del sitio. El visor ocupa la pantalla completa y no los usa.
export default function SitioLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="cabecera">
        <Link href="/" className="marca">
          IDE Economía <span>Chubut</span>
        </Link>
        <nav>
          <Link href="/visor">Visor</Link>
          <Link href="/catalogo">Catálogo</Link>
          <BotonTema />
        </nav>
      </header>
      <main>{children}</main>
      <footer className="pie">
        Ministerio de Economía · Provincia del Chubut · Área de Sistemas de Información y Transparencia
      </footer>
    </>
  );
}
