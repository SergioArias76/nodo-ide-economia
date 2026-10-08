import type { Metadata } from "next";
import localFont from "next/font/local";
import { Rubik } from "next/font/google";
import { SCRIPT_TEMA } from "@/lib/tema-script";
import "./globals.css";

// Tipografías de la identidad del Gobierno del Chubut: Public Sans para la interfaz, Rubik para el logotipo
const publicSans = localFont({
  src: [
    { path: "../fonts/PublicSans-Regular.ttf", weight: "400" },
    { path: "../fonts/PublicSans-Medium.ttf", weight: "500" },
    { path: "../fonts/PublicSans-SemiBold.ttf", weight: "600" },
    { path: "../fonts/PublicSans-Bold.ttf", weight: "700" },
  ],
  variable: "--font-public-sans",
  display: "swap",
});

const rubik = Rubik({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-rubik", display: "swap" });

export const metadata: Metadata = {
  title: { default: "IDE Economía Chubut", template: "%s · IDE Economía Chubut" },
  description:
    "Nodo de Infraestructura de Datos Espaciales del Ministerio de Economía de la Provincia del Chubut.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: SCRIPT_TEMA agrega data-tema antes de hidratar
    <html lang="es" className={`${publicSans.variable} ${rubik.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
