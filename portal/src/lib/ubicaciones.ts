// Datos de la pantalla interna de ubicación manual de proveedores (/ubicaciones). Solo del servidor (lo usan las
// rutas de app/api/ubicaciones):
// se conecta a PostGIS con el usuario ide_ubicaciones (postgis/initdb/30-ubicaciones.sh), que puede leer
// los proveedores sin mail ni teléfono y guardar correcciones de ubicación.
import { Pool } from "pg";

let pool: Pool | null = null;
function base() {
  if (!process.env.UBICACIONES_DB_URL) throw new Error("Falta UBICACIONES_DB_URL");
  pool ??= new Pool({ connectionString: process.env.UBICACIONES_DB_URL, max: 3 });
  return pool;
}

// Pendientes: ubicados solo por el centro de su localidad o de su provincia
export const PENDIENTES = ["localidad", "provincia"];
export type Estado = "pendientes" | "manuales" | "todos";

export type Proveedor = {
  id: number;
  cuit: string | null;
  entidad: string;
  tipo_persona: string | null;
  rubro: string | null;
  domicilio: string | null; // tal como figura en el padrón
  localidad: string | null;
  departamento: string | null;
  provincia: string | null;
  precision: string;
  fuente_geo: string | null;
  lon: number;
  lat: number;
  nota: string | null;
  actualizado_en: string | null; // de la corrección manual, si la hay
};

const COLUMNAS = `
  p.id, p.cuit, p.entidad, p.tipo_persona, p.rubro_principal AS rubro, d.domicilio_orig AS domicilio,
  d.localidad, d.departamento, d.provincia, d.precision, d.fuente_geo,
  ST_X(d.geom) AS lon, ST_Y(d.geom) AS lat,
  c.nota, c.actualizado_en`;
const DESDE = `
  FROM proveedores.proveedor p
  JOIN proveedores.domicilio d ON d.proveedor_id = p.id
  LEFT JOIN proveedores.domicilio_correccion c
    ON c.cuit = p.cuit AND c.domicilio_orig = coalesce(d.domicilio_orig, '') AND c.fuente_geo = 'manual'`;

export const POR_PAGINA = 50;

export async function listar(o: { estado: Estado; texto: string; localidad: string; desde: number }) {
  const condiciones: string[] = [];
  const valores: unknown[] = [];
  const v = (x: unknown) => `$${valores.push(x)}`;
  if (o.estado === "pendientes") condiciones.push(`d.precision = ANY(${v(PENDIENTES)})`);
  if (o.estado === "manuales") condiciones.push(`d.fuente_geo = 'manual'`);
  if (o.localidad) condiciones.push(`d.localidad = ${v(o.localidad)}`);
  const texto = o.texto.trim();
  if (texto) {
    const digitos = texto.replace(/\D/g, "");
    const palabras = `%${texto}%`;
    condiciones.push(
      `(p.entidad ILIKE ${v(palabras)} OR d.domicilio_orig ILIKE ${v(palabras)}` +
        (/^[\d\s-]+$/.test(texto) && digitos ? ` OR p.cuit LIKE ${v(`${digitos}%`)}` : "") +
        ")",
    );
  }
  const donde = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  const db = base();
  const [filas, total] = await Promise.all([
    db.query<Proveedor>(
      `SELECT ${COLUMNAS} ${DESDE} ${donde} ORDER BY d.provincia = 'Chubut' DESC, d.localidad, p.entidad LIMIT ${POR_PAGINA} OFFSET ${v(o.desde)}`,
      valores,
    ),
    db.query<{ n: number }>(`SELECT count(*)::int AS n ${DESDE} ${donde}`, valores.slice(0, -1)),
  ]);
  return { filas: filas.rows, total: total.rows[0].n };
}

// Totales del encabezado y localidades con pendientes (para el filtro)
export async function resumen() {
  const db = base();
  const [totales, localidades] = await Promise.all([
    db.query<{ pendientes: number; manuales: number; total: number }>(
      `SELECT count(*) FILTER (WHERE d.precision = ANY($1))::int AS pendientes,
              count(*) FILTER (WHERE d.fuente_geo = 'manual')::int AS manuales,
              count(*)::int AS total
       FROM proveedores.domicilio d`,
      [PENDIENTES],
    ),
    db.query<{ localidad: string; provincia: string; pendientes: number }>(
      `SELECT d.localidad, d.provincia, count(*)::int AS pendientes
       FROM proveedores.domicilio d
       WHERE d.precision = ANY($1) AND d.localidad IS NOT NULL
       GROUP BY 1, 2 ORDER BY d.provincia = 'Chubut' DESC, 3 DESC, 1`,
      [PENDIENTES],
    ),
  ]);
  return { ...totales.rows[0], localidades: localidades.rows };
}

// Argentina continental e islas, con margen: un punto afuera es un error de carga
const DENTRO = (lon: number, lat: number) => lon > -74 && lon < -53 && lat > -56 && lat < -21;

// Guarda la ubicación marcada a mano: queda como corrección (la carga del padrón la vuelve a aplicar
// mientras el domicilio no cambie) y se aplica en el momento al domicilio actual
export async function guardar(cuit: string, lon: number, lat: number, nota: string | null) {
  if (!/^\d{11}$/.test(cuit)) throw new ErrorDeDatos("CUIT inválido.");
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || !DENTRO(lon, lat)) throw new ErrorDeDatos("La ubicación está fuera de la Argentina.");
  const cliente = await base().connect();
  try {
    await cliente.query("BEGIN");
    const actual = await cliente.query<{ id: number; domicilio_orig: string | null }>(
      `SELECT p.id, d.domicilio_orig FROM proveedores.proveedor p JOIN proveedores.domicilio d ON d.proveedor_id = p.id WHERE p.cuit = $1`,
      [cuit],
    );
    if (!actual.rows.length) throw new ErrorDeDatos("No se encontró el proveedor.");
    const { id, domicilio_orig } = actual.rows[0];
    await cliente.query(
      `INSERT INTO proveedores.domicilio_correccion (cuit, domicilio_orig, precision, fuente_geo, geom, nota, actualizado_en)
       VALUES ($1, coalesce($2, ''), 'manual', 'manual', ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, now())
       ON CONFLICT (cuit) DO UPDATE SET
         domicilio_orig = EXCLUDED.domicilio_orig, calle = NULL, altura = NULL, localidad = NULL,
         departamento = NULL, provincia = NULL, precision = 'manual', fuente_geo = 'manual',
         geom = EXCLUDED.geom, nota = EXCLUDED.nota, actualizado_en = now()`,
      [cuit, domicilio_orig, lon, lat, nota],
    );
    await cliente.query(
      `UPDATE proveedores.domicilio SET precision = 'manual', fuente_geo = 'manual', geom = ST_SetSRID(ST_MakePoint($2, $3), 4326)
       WHERE proveedor_id = $1`,
      [id, lon, lat],
    );
    await cliente.query("COMMIT");
    const fila = await base().query<Proveedor>(`SELECT ${COLUMNAS} ${DESDE} WHERE p.id = $1`, [id]);
    return fila.rows[0];
  } catch (e) {
    await cliente.query("ROLLBACK");
    throw e;
  } finally {
    cliente.release();
  }
}

// Error de lo que mandó la pantalla (se le muestra el mensaje); cualquier otro es del servidor
export class ErrorDeDatos extends Error {}
