// Recuadro de la provincia del Chubut y su proyección a coordenadas de un SVG de ANCHO x ALTO: longitud y
// latitud lineales (EPSG:4326), con la longitud achicada por el coseno de la latitud media. La comparten el
// contorno (vista-chubut.ts), las imágenes WMS del mismo recuadro y los círculos del buscador de inicio.

export const OESTE = -72.5, ESTE = -63.3, NORTE = -41.75, SUR = -46.25;
const COS = Math.cos((44 * Math.PI) / 180);
export const ANCHO = 360;
const K = ANCHO / ((ESTE - OESTE) * COS);
export const ALTO = Math.round((NORTE - SUR) * K);

export const proyectar = (lon: number, lat: number): [number, number] => [(lon - OESTE) * COS * K, (NORTE - lat) * K];

export const enRecuadro = (lon: number, lat: number) => lon >= OESTE && lon <= ESTE && lat >= SUR && lat <= NORTE;
