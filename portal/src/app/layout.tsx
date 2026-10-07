import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "IDE Economía Chubut", template: "%s · IDE Economía Chubut" },
  description:
    "Nodo de Infraestructura de Datos Espaciales del Ministerio de Economía de la Provincia del Chubut.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
