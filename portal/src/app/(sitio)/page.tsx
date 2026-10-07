import Link from "next/link";
import { SERVICIOS } from "@/lib/config";

export default function Inicio() {
  return (
    <div className="contenido">
      <section>
        <h1>Infraestructura de Datos Espaciales del Ministerio de Economía</h1>
        <p>
          Información geográfica del Ministerio publicada mediante servicios estándar OGC, documentada con
          metadatos según el perfil IDERA y disponible para su integración con la IDE provincial.
        </p>
        <div className="acciones">
          <Link href="/visor" className="boton">Abrir visor</Link>
          <Link href="/catalogo" className="boton secundario">Buscar en el catálogo</Link>
        </div>
      </section>

      <section>
        <h2>Servicios</h2>
        <table>
          <tbody>
            {SERVICIOS.map((s) => (
              <tr key={s.tipo}>
                <th>{s.tipo}</th>
                <td><a href={s.url}><code>{s.url}</code></a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
