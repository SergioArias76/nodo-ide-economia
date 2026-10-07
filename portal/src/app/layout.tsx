import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "IDE Economía Chubut", template: "%s · IDE Economía Chubut" },
  description:
    "Nodo de Infraestructura de Datos Espaciales del Ministerio de Economía de la Provincia del Chubut.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es">
      <body>
        <header className="cabecera">
          <Link href="/" className="marca">
            IDE Economía <span>Chubut</span>
          </Link>
          <nav>
            <Link href="/visor">Visor</Link>
            <Link href="/catalogo">Catálogo</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="pie">
          Ministerio de Economía · Provincia del Chubut · Área de Sistemas de Información y Transparencia
        </footer>
      </body>
    </html>
  );
}
